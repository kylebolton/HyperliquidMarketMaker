import { useState, useCallback, useEffect, useRef } from 'react';
import { WalletConnectionState, WalletProvider } from '@/components/wallet/WalletConnection';

interface WalletStateConfig {
  onWalletConnect: (state: WalletConnectionState) => void;
  onWalletDisconnect: () => void;
}

interface WalletDetectionState {
  hasMetaMask: boolean;
  hasCoinbaseWallet: boolean;
  isDetecting: boolean;
}

/**
 * Custom hook for managing wallet connection state in a hydration-safe way.
 * Handles wallet detection, connection management, and event listeners
 * specifically optimized for Hyperliquid trading applications.
 */
export function useWalletState({ onWalletConnect, onWalletDisconnect }: WalletStateConfig) {
  const [walletState, setWalletState] = useState<WalletConnectionState>({
    isConnected: false,
    address: null,
    provider: null,
    chainId: null,
  });
  
  const [detection, setDetection] = useState<WalletDetectionState>({
    hasMetaMask: false,
    hasCoinbaseWallet: false,
    isDetecting: true,
  });
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  // Refs to track cleanup functions and prevent duplicate calls
  const cleanupRef = useRef<(() => void) | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedExistingConnections = useRef(false);

  // Initialize mounting state and cleanup
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      // Cleanup event listeners when component unmounts
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      // Clear detection interval
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, []);

  // Wallet detection logic - optimized to prevent constant re-renders
  useEffect(() => {
    if (!isMounted) return;

    const detectWallets = () => {
      if (typeof window === 'undefined') {
        setDetection(prev => ({ ...prev, isDetecting: false }));
        return;
      }

      const hasMetaMask = !!(window.ethereum?.isMetaMask);
      const hasCoinbaseWallet = !!(window as { ethereum?: { isCoinbaseWallet?: boolean } }).ethereum?.isCoinbaseWallet;
      
      // Only update if values actually changed to prevent unnecessary re-renders
      setDetection(prev => {
        if (prev.hasMetaMask === hasMetaMask && 
            prev.hasCoinbaseWallet === hasCoinbaseWallet && 
            !prev.isDetecting) {
          return prev; // No change, return same object to prevent re-render
        }
        return {
          hasMetaMask,
          hasCoinbaseWallet,
          isDetecting: false,
        };
      });
    };

    // Initial detection
    detectWallets();

    // Only set up periodic detection if no wallets detected initially
    // Once wallets are detected, stop the interval to prevent unnecessary re-renders
    const hasWallets = !!(window.ethereum?.isMetaMask) || !!(window as { ethereum?: { isCoinbaseWallet?: boolean } }).ethereum?.isCoinbaseWallet;
    
    if (!hasWallets) {
      // Reduced frequency - only check every 30 seconds for wallet installation
      detectionIntervalRef.current = setInterval(() => {
        detectWallets();
        // Stop polling once wallets are detected
        const stillNoWallets = !(window.ethereum?.isMetaMask) && !(window as { ethereum?: { isCoinbaseWallet?: boolean } }).ethereum?.isCoinbaseWallet;
        if (!stillNoWallets && detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
          detectionIntervalRef.current = null;
        }
      }, 30000);
    }

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [isMounted]);

  // Check for existing connections - optimized to run only once
  const checkExistingConnections = useCallback(async () => {
    if (!isMounted || typeof window === 'undefined' || !window.ethereum || hasCheckedExistingConnections.current) {
      return;
    }

    hasCheckedExistingConnections.current = true;

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
      
      if (accounts.length > 0) {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
        
        // Determine provider type
        const provider: WalletProvider = window.ethereum.isMetaMask 
          ? 'metamask' 
          : (window as { ethereum?: { isCoinbaseWallet?: boolean } }).ethereum?.isCoinbaseWallet 
            ? 'coinbase' 
            : 'metamask'; // Default fallback
            
        const connectedState: WalletConnectionState = {
          isConnected: true,
          address: accounts[0],
          provider,
          chainId: parseInt(chainId, 16),
        };
        
        setWalletState(connectedState);
        onWalletConnect(connectedState);
      }
    } catch (error) {
      console.error('Error checking existing connections:', error);
      setError('Failed to check existing wallet connections');
    }
  }, [isMounted, onWalletConnect]);

  // Set up wallet event listeners
  useEffect(() => {
    if (!isMounted || typeof window === 'undefined' || !window.ethereum) {
      return;
    }

    const handleAccountsChanged = (accounts: string[]) => {
      setWalletState(prevState => {
        if (accounts.length === 0) {
          // Handle disconnect
          const disconnectedState: WalletConnectionState = {
            isConnected: false,
            address: null,
            provider: null,
            chainId: null,
          };
          onWalletDisconnect();
          setError(null);
          return disconnectedState;
        } else if (accounts[0] !== prevState.address) {
          // Account changed
          const newState: WalletConnectionState = {
            ...prevState,
            address: accounts[0],
            isConnected: true,
          };
          onWalletConnect(newState);
          setError(null);
          return newState;
        }
        return prevState;
      });
    };

    const handleChainChanged = (chainId: string) => {
      setWalletState(prevState => {
        const newState: WalletConnectionState = {
          ...prevState,
          chainId: parseInt(chainId, 16),
        };
        if (prevState.isConnected) {
          onWalletConnect(newState);
        }
        return newState;
      });
    };

    const handleDisconnect = () => {
      setWalletState(() => {
        const disconnectedState: WalletConnectionState = {
          isConnected: false,
          address: null,
          provider: null,
          chainId: null,
        };
        onWalletDisconnect();
        setError(null);
        return disconnectedState;
      });
    };

    // Add event listeners only once
    const ethereum = window.ethereum;
    ethereum.on?.('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void);
    ethereum.on?.('chainChanged', handleChainChanged as (...args: unknown[]) => void);
    ethereum.on?.('disconnect', handleDisconnect as (...args: unknown[]) => void);

    // Store cleanup function
    const cleanup = () => {
      try {
        ethereum?.removeListener?.('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void);
        ethereum?.removeListener?.('chainChanged', handleChainChanged as (...args: unknown[]) => void);
        ethereum?.removeListener?.('disconnect', handleDisconnect as (...args: unknown[]) => void);
      } catch (error) {
        console.warn('Error cleaning up wallet event listeners:', error);
      }
    };

    cleanupRef.current = cleanup;
    return cleanup;
  }, [isMounted, onWalletConnect, onWalletDisconnect]);

  // Connect wallet function
  const connectWallet = useCallback(async (provider: WalletProvider) => {
    if (!isMounted) return;
    
    setIsConnecting(true);
    setError(null);

    try {
      if (provider === 'metamask') {
        if (typeof window !== 'undefined' && window.ethereum) {
          const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts',
          }) as string[];
          const chainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
          
          if (accounts.length > 0) {
            const connectedState: WalletConnectionState = {
              isConnected: true,
              address: accounts[0],
              provider: 'metamask',
              chainId: parseInt(chainId, 16),
            };
            setWalletState(connectedState);
            onWalletConnect(connectedState);
          }
        } else {
          setError('MetaMask is not installed. Please install MetaMask to continue.');
          if (typeof window !== 'undefined') {
            window.open('https://metamask.io/download/', '_blank');
          }
        }
      } else if (provider === 'coinbase') {
        if (typeof window !== 'undefined' && (window as { ethereum?: { isCoinbaseWallet?: boolean; request: (args: { method: string }) => Promise<unknown> } }).ethereum?.isCoinbaseWallet) {
          const coinbaseEthereum = (window as { ethereum: { request: (args: { method: string }) => Promise<unknown> } }).ethereum;
          const accounts = await coinbaseEthereum.request({
            method: 'eth_requestAccounts',
          }) as string[];
          const chainId = await coinbaseEthereum.request({ method: 'eth_chainId' }) as string;
          
          if (accounts.length > 0) {
            const connectedState: WalletConnectionState = {
              isConnected: true,
              address: accounts[0],
              provider: 'coinbase',
              chainId: parseInt(chainId, 16),
            };
            setWalletState(connectedState);
            onWalletConnect(connectedState);
          }
        } else {
          setError('Coinbase Wallet is not installed.');
          if (typeof window !== 'undefined') {
            window.open('https://www.coinbase.com/wallet', '_blank');
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      setError(err.message || 'Failed to connect wallet');
      console.error('Wallet connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [isMounted, onWalletConnect]);

  // Disconnect wallet function
  const disconnectWallet = useCallback(() => {
    const disconnectedState: WalletConnectionState = {
      isConnected: false,
      address: null,
      provider: null,
      chainId: null,
    };
    setWalletState(disconnectedState);
    onWalletDisconnect();
    setError(null);
  }, [onWalletDisconnect]);

  // Utility functions
  const copyAddress = useCallback((address: string) => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(address).catch(console.error);
    }
  }, []);

  const openEtherscan = useCallback((address: string) => {
    if (typeof window !== 'undefined') {
      window.open(`https://etherscan.io/address/${address}`, '_blank');
    }
  }, []);

  return {
    walletState,
    detection,
    isConnecting,
    error,
    isMounted,
    connectWallet,
    disconnectWallet,
    checkExistingConnections,
    copyAddress,
    openEtherscan,
    setError,
  };
}