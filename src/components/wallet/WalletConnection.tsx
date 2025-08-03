"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Wallet, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type WalletProvider = "metamask" | "walletconnect" | "coinbase" | "privatekey";

export interface WalletConnectionState {
  isConnected: boolean;
  address: string | null;
  provider: WalletProvider | null;
  chainId: number | null;
}

interface WalletConnectionProps {
  onWalletConnect: (state: WalletConnectionState) => void;
  onWalletDisconnect: () => void;
  className?: string;
}

export function WalletConnection({
  onWalletConnect,
  onWalletDisconnect,
  className = "",
}: WalletConnectionProps) {
  const [walletState, setWalletState] = useState<WalletConnectionState>({
    isConnected: false,
    address: null,
    provider: null,
    chainId: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for existing wallet connections on component mount
  useEffect(() => {
    checkExistingConnections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for account changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          handleDisconnect();
        } else if (accounts[0] !== walletState.address) {
          // Account changed, update the state
          const newState: WalletConnectionState = {
            ...walletState,
            address: accounts[0],
            isConnected: true,
          };
          setWalletState(newState);
          onWalletConnect(newState);
        }
      };

      const handleChainChanged = (chainId: string) => {
        const newState: WalletConnectionState = {
          ...walletState,
          chainId: parseInt(chainId, 16),
        };
        setWalletState(newState);
        if (walletState.isConnected) {
          onWalletConnect(newState);
        }
      };

      const handleDisconnect = () => {
        const disconnectedState: WalletConnectionState = {
          isConnected: false,
          address: null,
          provider: null,
          chainId: null,
        };
        setWalletState(disconnectedState);
        onWalletDisconnect();
        setError(null);
      };

      window.ethereum.on?.("accountsChanged", handleAccountsChanged as (...args: unknown[]) => void);
      window.ethereum.on?.("chainChanged", handleChainChanged as (...args: unknown[]) => void);
      window.ethereum.on?.("disconnect", handleDisconnect as (...args: unknown[]) => void);

      return () => {
        window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged as (...args: unknown[]) => void);
        window.ethereum?.removeListener?.("chainChanged", handleChainChanged as (...args: unknown[]) => void);
        window.ethereum?.removeListener?.("disconnect", handleDisconnect as (...args: unknown[]) => void);
      };
    }
  }, [walletState, onWalletConnect, onWalletDisconnect]);

  const checkExistingConnections = async () => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
        const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
        
        if (accounts.length > 0) {
          const connectedState: WalletConnectionState = {
            isConnected: true,
            address: accounts[0],
            provider: "metamask",
            chainId: parseInt(chainId, 16),
          };
          setWalletState(connectedState);
          onWalletConnect(connectedState);
        }
      } catch (error) {
        console.error("Error checking existing connections:", error);
      }
    }
  };

  const connectWallet = useCallback(async (provider: WalletProvider) => {
    setIsConnecting(true);
    setError(null);

    try {
      if (provider === "metamask") {
        if (typeof window !== "undefined" && window.ethereum) {
          // Request account access
          const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
          }) as string[];
          const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
          
          if (accounts.length > 0) {
            const connectedState: WalletConnectionState = {
              isConnected: true,
              address: accounts[0],
              provider: "metamask",
              chainId: parseInt(chainId, 16),
            };
            setWalletState(connectedState);
            onWalletConnect(connectedState);
          }
        } else {
          setError("MetaMask is not installed. Please install MetaMask to continue.");
          window.open("https://metamask.io/download/", "_blank");
        }
      } else if (provider === "coinbase") {
        // For Coinbase Wallet
        if (typeof window !== "undefined" && (window as { ethereum?: { isCoinbaseWallet?: boolean; request: (args: { method: string }) => Promise<unknown> } }).ethereum?.isCoinbaseWallet) {
          const coinbaseEthereum = (window as { ethereum: { request: (args: { method: string }) => Promise<unknown> } }).ethereum;
          const accounts = await coinbaseEthereum.request({
            method: "eth_requestAccounts",
          }) as string[];
          const chainId = await coinbaseEthereum.request({ method: "eth_chainId" }) as string;
          
          if (accounts.length > 0) {
            const connectedState: WalletConnectionState = {
              isConnected: true,
              address: accounts[0],
              provider: "coinbase",
              chainId: parseInt(chainId, 16),
            };
            setWalletState(connectedState);
            onWalletConnect(connectedState);
          }
        } else {
          setError("Coinbase Wallet is not installed.");
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      setError(err.message || "Failed to connect wallet");
      console.error("Wallet connection error:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [onWalletConnect]);

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

  const copyAddress = useCallback((address: string) => {
    navigator.clipboard.writeText(address);
  }, []);

  const openEtherscan = useCallback((address: string) => {
    window.open(`https://etherscan.io/address/${address}`, "_blank");
  }, []);

  const getProviderName = (provider: WalletProvider | null) => {
    switch (provider) {
      case "metamask": return "MetaMask";
      case "coinbase": return "Coinbase Wallet";
      case "walletconnect": return "WalletConnect";
      case "privatekey": return "Private Key";
      default: return "Unknown";
    }
  };

  const getChainName = (chainId: number | null) => {
    switch (chainId) {
      case 1: return "Ethereum Mainnet";
      case 42161: return "Arbitrum One";
      case 421614: return "Arbitrum Sepolia";
      default: return chainId ? `Chain ${chainId}` : "Unknown";
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Wallet Connection
        </CardTitle>
        <CardDescription>
          Connect your wallet to Hyperliquid for trading. Choose from supported wallet providers below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <Badge variant={walletState.isConnected ? "default" : "secondary"}>
            {walletState.isConnected ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected to {getProviderName(walletState.provider)}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                Not Connected
              </>
            )}
          </Badge>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Wallet Connection Buttons */}
        {!walletState.isConnected ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => connectWallet("metamask")}
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4 mr-2" />
                )}
                {typeof window !== "undefined" && window.ethereum
                  ? "Connect MetaMask"
                  : "Install MetaMask"}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => connectWallet("coinbase")}
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4 mr-2" />
                )}
                Connect Coinbase Wallet
              </Button>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Connect your wallet to start trading on Hyperliquid
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={disconnectWallet}
              className="w-full"
            >
              Disconnect Wallet
            </Button>
          </div>
        )}

        {/* Connected Wallet Information */}
        {walletState.isConnected && walletState.address && (
          <div className="space-y-2">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Connected Address</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {walletState.address}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {getProviderName(walletState.provider)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {getChainName(walletState.chainId)}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyAddress(walletState.address!)}
                    title="Copy address"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEtherscan(walletState.address!)}
                    title="View on Etherscan"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {walletState.chainId && walletState.chainId !== 42161 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Hyperliquid operates on Arbitrum One (Chain ID: 42161). Please switch your wallet to the correct network for optimal performance.
                </AlertDescription>
              </Alert>
            )}

            {walletState.isConnected && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-800">
                    Wallet connected successfully! You can now configure and start trading.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Security Notice */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Security Notice</p>
              <p>
                Your private key is used locally to sign transactions and is never sent to our servers. 
                Keep your private key secure and never share it with anyone.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Type declarations for wallet providers
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
    };
  }
}