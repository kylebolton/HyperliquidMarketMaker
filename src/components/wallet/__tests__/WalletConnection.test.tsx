import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletConnection } from '../WalletConnection';

// Mock window.ethereum
const mockEthereum = {
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  isMetaMask: true,
  isCoinbaseWallet: false,
};

describe('WalletConnection', () => {
  const mockOnWalletConnect = jest.fn();
  const mockOnWalletDisconnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.ethereum
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = mockEthereum;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).ethereum;
  });

  it('renders wallet connection component', () => {
    render(
      <WalletConnection
        onWalletConnect={mockOnWalletConnect}
        onWalletDisconnect={mockOnWalletDisconnect}
      />
    );

    expect(screen.getByText('Wallet Connection')).toBeInTheDocument();
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
  });

  it('connects to MetaMask when button is clicked', async () => {
    const mockAccounts = ['0x1234567890123456789012345678901234567890'];
    const mockChainId = '0xa4b1'; // Arbitrum One

    mockEthereum.request.mockImplementation((args: { method: string }) => {
      if (args.method === 'eth_requestAccounts') {
        return Promise.resolve(mockAccounts);
      }
      if (args.method === 'eth_chainId') {
        return Promise.resolve(mockChainId);
      }
      return Promise.resolve([]);
    });

    render(
      <WalletConnection
        onWalletConnect={mockOnWalletConnect}
        onWalletDisconnect={mockOnWalletDisconnect}
      />
    );

    const connectButton = screen.getByText('Connect MetaMask');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mockOnWalletConnect).toHaveBeenCalledWith({
        isConnected: true,
        address: mockAccounts[0],
        provider: 'metamask',
        chainId: 42161, // Arbitrum One chain ID in decimal
      });
    });
  });

  it('shows connected state when wallet is connected', () => {
    const mockAccounts = ['0x1234567890123456789012345678901234567890'];
    const mockChainId = '0xa4b1';

    mockEthereum.request.mockImplementation((args: { method: string }) => {
      if (args.method === 'eth_accounts') {
        return Promise.resolve(mockAccounts);
      }
      if (args.method === 'eth_chainId') {
        return Promise.resolve(mockChainId);
      }
      return Promise.resolve([]);
    });

    render(
      <WalletConnection
        onWalletConnect={mockOnWalletConnect}
        onWalletDisconnect={mockOnWalletDisconnect}
      />
    );

    // The component should check for existing connections on mount
    waitFor(() => {
      expect(screen.getByText('Connected to MetaMask')).toBeInTheDocument();
    });
  });

  it('handles connection errors gracefully', async () => {
    mockEthereum.request.mockRejectedValue(new Error('User rejected request'));

    render(
      <WalletConnection
        onWalletConnect={mockOnWalletConnect}
        onWalletDisconnect={mockOnWalletDisconnect}
      />
    );

    const connectButton = screen.getByText('Connect MetaMask');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('User rejected request')).toBeInTheDocument();
    });

    expect(mockOnWalletConnect).not.toHaveBeenCalled();
  });

  it('shows disconnect button when wallet is connected', async () => {
    const mockAccounts = ['0x1234567890123456789012345678901234567890'];
    const mockChainId = '0xa4b1';

    mockEthereum.request.mockImplementation((args: { method: string }) => {
      if (args.method === 'eth_requestAccounts') {
        return Promise.resolve(mockAccounts);
      }
      if (args.method === 'eth_chainId') {
        return Promise.resolve(mockChainId);
      }
      return Promise.resolve([]);
    });

    render(
      <WalletConnection
        onWalletConnect={mockOnWalletConnect}
        onWalletDisconnect={mockOnWalletDisconnect}
      />
    );

    const connectButton = screen.getByText('Connect MetaMask');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Disconnect Wallet')).toBeInTheDocument();
    });
  });

  it('calls onWalletDisconnect when disconnect button is clicked', async () => {
    const mockAccounts = ['0x1234567890123456789012345678901234567890'];
    const mockChainId = '0xa4b1';

    mockEthereum.request.mockImplementation((args: { method: string }) => {
      if (args.method === 'eth_requestAccounts') {
        return Promise.resolve(mockAccounts);
      }
      if (args.method === 'eth_chainId') {
        return Promise.resolve(mockChainId);
      }
      return Promise.resolve([]);
    });

    render(
      <WalletConnection
        onWalletConnect={mockOnWalletConnect}
        onWalletDisconnect={mockOnWalletDisconnect}
      />
    );

    // First connect
    const connectButton = screen.getByText('Connect MetaMask');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Disconnect Wallet')).toBeInTheDocument();
    });

    // Then disconnect
    const disconnectButton = screen.getByText('Disconnect Wallet');
    fireEvent.click(disconnectButton);

    expect(mockOnWalletDisconnect).toHaveBeenCalled();
  });

  it('shows install MetaMask when ethereum is not available', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).ethereum;

    render(
      <WalletConnection
        onWalletConnect={mockOnWalletConnect}
        onWalletDisconnect={mockOnWalletDisconnect}
      />
    );

    expect(screen.getByText('Install MetaMask')).toBeInTheDocument();
  });
});