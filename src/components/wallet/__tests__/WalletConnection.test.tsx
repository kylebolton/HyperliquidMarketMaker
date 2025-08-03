import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletConnection, WalletConnectionState } from '../WalletConnection';

// Mock the wallet hook
jest.mock('@/hooks/useWalletState', () => ({
  useWalletState: jest.fn(),
}));

import { useWalletState } from '@/hooks/useWalletState';

const mockUseWalletState = useWalletState as jest.MockedFunction<typeof useWalletState>;

// Extend the global Window interface for tests

describe('WalletConnection', () => {
  const mockOnWalletConnect = jest.fn();
  const mockOnWalletDisconnect = jest.fn();
  const mockConnectWallet = jest.fn();
  const mockDisconnectWallet = jest.fn();
  const mockCheckExistingConnections = jest.fn();
  const mockCopyAddress = jest.fn();
  const mockOpenEtherscan = jest.fn();

  const defaultWalletState: WalletConnectionState = {
    isConnected: false,
    address: null,
    provider: null,
    chainId: null,
  };

  const defaultDetection = {
    hasMetaMask: false,
    hasCoinbaseWallet: false,
    isDetecting: false,
  };

  beforeEach(() => {
    mockUseWalletState.mockReturnValue({
      walletState: defaultWalletState,
      detection: defaultDetection,
      isConnecting: false,
      error: null,
      isMounted: true,
      connectWallet: mockConnectWallet,
      disconnectWallet: mockDisconnectWallet,
      checkExistingConnections: mockCheckExistingConnections,
      copyAddress: mockCopyAddress,
      openEtherscan: mockOpenEtherscan,
      setError: jest.fn(),
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete window.ethereum;
  });

  describe('Initial render', () => {
    it('renders without crashing', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Wallet Connection')).toBeInTheDocument();
    });

    it('shows loading state when not mounted or detecting', () => {
      mockUseWalletState.mockReturnValue({
        walletState: defaultWalletState,
        detection: { ...defaultDetection, isDetecting: true },
        isConnecting: false,
        error: null,
        isMounted: false,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });

      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Loading wallet options...')).toBeInTheDocument();
    });

    it('shows not connected status when wallet is not connected', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Not Connected')).toBeInTheDocument();
    });
  });

  describe('Wallet detection', () => {
    it('shows Install MetaMask when MetaMask is not detected', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Install MetaMask')).toBeInTheDocument();
    });

    it('shows Connect MetaMask when MetaMask is detected', () => {
      mockUseWalletState.mockReturnValue({
        walletState: defaultWalletState,
        detection: { ...defaultDetection, hasMetaMask: true },
        isConnecting: false,
        error: null,
        isMounted: true,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });

      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
    });

    it('shows Connect Coinbase Wallet when Coinbase Wallet is detected', () => {
      mockUseWalletState.mockReturnValue({
        walletState: defaultWalletState,
        detection: { ...defaultDetection, hasCoinbaseWallet: true },
        isConnecting: false,
        error: null,
        isMounted: true,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });

      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Connect Coinbase Wallet')).toBeInTheDocument();
    });
  });

  describe('Wallet connection', () => {
    it('calls connectWallet when MetaMask button is clicked', async () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      const metamaskButton = screen.getByText('Install MetaMask');
      fireEvent.click(metamaskButton);
      
      await waitFor(() => {
        expect(mockConnectWallet).toHaveBeenCalledWith('metamask');
      });
    });

    it('calls connectWallet when Coinbase button is clicked', async () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      const coinbaseButton = screen.getByText('Install Coinbase Wallet');
      fireEvent.click(coinbaseButton);
      
      await waitFor(() => {
        expect(mockConnectWallet).toHaveBeenCalledWith('coinbase');
      });
    });

    it('shows loading state when connecting', () => {
      mockUseWalletState.mockReturnValue({
        walletState: defaultWalletState,
        detection: defaultDetection,
        isConnecting: true,
        error: null,
        isMounted: true,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });

      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      // Should show loading spinner in buttons
      expect(screen.getByText('Install MetaMask')).toBeInTheDocument();
      expect(screen.getByText('Install Coinbase Wallet')).toBeInTheDocument();
      // Check that buttons are disabled when connecting
      const buttons = screen.getAllByRole('button');
      expect(buttons.every(button => button.hasAttribute('disabled'))).toBe(true);
    });
  });

  describe('Connected state', () => {
    const connectedWalletState: WalletConnectionState = {
      isConnected: true,
      address: '0x1234567890abcdef1234567890abcdef12345678',
      provider: 'metamask',
      chainId: 42161,
    };

    beforeEach(() => {
      mockUseWalletState.mockReturnValue({
        walletState: connectedWalletState,
        detection: defaultDetection,
        isConnecting: false,
        error: null,
        isMounted: true,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });
    });

    it('shows connected status', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Connected to MetaMask')).toBeInTheDocument();
    });

    it('displays wallet address', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText(connectedWalletState.address!)).toBeInTheDocument();
    });

    it('shows disconnect button', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Disconnect Wallet')).toBeInTheDocument();
    });

    it('calls disconnectWallet when disconnect button is clicked', async () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      const disconnectButton = screen.getByText('Disconnect Wallet');
      fireEvent.click(disconnectButton);
      
      await waitFor(() => {
        expect(mockDisconnectWallet).toHaveBeenCalled();
      });
    });

    it('shows success message', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText(/Wallet connected successfully/)).toBeInTheDocument();
    });

    it('shows chain information', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Arbitrum One')).toBeInTheDocument();
    });
  });

  describe('Wrong network warning', () => {
    it('shows warning when connected to wrong network', () => {
      const wrongNetworkState: WalletConnectionState = {
        isConnected: true,
        address: '0x1234567890abcdef1234567890abcdef12345678',
        provider: 'metamask',
        chainId: 1, // Ethereum mainnet instead of Arbitrum
      };

      mockUseWalletState.mockReturnValue({
        walletState: wrongNetworkState,
        detection: defaultDetection,
        isConnecting: false,
        error: null,
        isMounted: true,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });

      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText(/Hyperliquid operates on Arbitrum One/)).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('displays error message when present', () => {
      mockUseWalletState.mockReturnValue({
        walletState: defaultWalletState,
        detection: defaultDetection,
        isConnecting: false,
        error: 'Connection failed',
        isMounted: true,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });

      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  describe('Utility functions', () => {
    const connectedWalletState: WalletConnectionState = {
      isConnected: true,
      address: '0x1234567890abcdef1234567890abcdef12345678',
      provider: 'metamask',
      chainId: 42161,
    };

    beforeEach(() => {
      mockUseWalletState.mockReturnValue({
        walletState: connectedWalletState,
        detection: defaultDetection,
        isConnecting: false,
        error: null,
        isMounted: true,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });
    });

    it('calls copyAddress when copy button is clicked', async () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      const copyButton = screen.getByTitle('Copy address');
      fireEvent.click(copyButton);
      
      await waitFor(() => {
        expect(mockCopyAddress).toHaveBeenCalledWith(connectedWalletState.address);
      });
    });

    it('calls openEtherscan when etherscan button is clicked', async () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      const etherscanButton = screen.getByTitle('View on Etherscan');
      fireEvent.click(etherscanButton);
      
      await waitFor(() => {
        expect(mockOpenEtherscan).toHaveBeenCalledWith(connectedWalletState.address);
      });
    });
  });

  describe('Hydration safety', () => {
    it('handles unmounted state gracefully', () => {
      mockUseWalletState.mockReturnValue({
        walletState: defaultWalletState,
        detection: { ...defaultDetection, isDetecting: true },
        isConnecting: false,
        error: null,
        isMounted: false,
        connectWallet: mockConnectWallet,
        disconnectWallet: mockDisconnectWallet,
        checkExistingConnections: mockCheckExistingConnections,
        copyAddress: mockCopyAddress,
        openEtherscan: mockOpenEtherscan,
        setError: jest.fn(),
      });

      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      // Should show loading state instead of wallet buttons
      expect(screen.getByText('Loading wallet options...')).toBeInTheDocument();
      expect(screen.queryByText('Install MetaMask')).not.toBeInTheDocument();
    });

    it('calls checkExistingConnections when mounted and detection complete', () => {
      render(
        <WalletConnection
          onWalletConnect={mockOnWalletConnect}
          onWalletDisconnect={mockOnWalletDisconnect}
        />
      );
      
      // Should call checkExistingConnections on mount
      expect(mockCheckExistingConnections).toHaveBeenCalled();
    });
  });
});