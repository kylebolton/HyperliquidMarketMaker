import { renderHook, act } from '@testing-library/react';
import { useWalletState } from '../useWalletState';

// Mock window.ethereum
const mockEthereum = {
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  isMetaMask: true,
  isCoinbaseWallet: false,
};

describe('useWalletState', () => {
  const mockOnWalletConnect = jest.fn();
  const mockOnWalletDisconnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = mockEthereum;
    
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    // Mock timers for testing
    jest.useFakeTimers();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).ethereum;
    jest.useRealTimers();
  });

  describe('Initial state', () => {
    it('initializes with correct default values', () => {
      const { result } = renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      expect(result.current.walletState).toEqual({
        isConnected: false,
        address: null,
        provider: null,
        chainId: null,
      });
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Wallet connection', () => {
    beforeEach(() => {
      mockEthereum.request.mockImplementation((args: { method: string }) => {
        if (args.method === 'eth_requestAccounts') {
          return Promise.resolve(['0x1234567890abcdef1234567890abcdef12345678']);
        }
        if (args.method === 'eth_chainId') {
          return Promise.resolve('0xa4b1'); // Arbitrum One
        }
        return Promise.resolve([]);
      });
    });

    it('connects to MetaMask successfully', async () => {
      const { result } = renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      // Set mounted state
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      await act(async () => {
        await result.current.connectWallet('metamask');
      });

      expect(mockOnWalletConnect).toHaveBeenCalledWith({
        isConnected: true,
        address: '0x1234567890abcdef1234567890abcdef12345678',
        provider: 'metamask',
        chainId: 42161,
      });

      expect(result.current.walletState.isConnected).toBe(true);
    });

    it('handles connection errors', async () => {
      mockEthereum.request.mockRejectedValue(new Error('User rejected request'));

      const { result } = renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      // Set mounted state
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      await act(async () => {
        await result.current.connectWallet('metamask');
      });

      expect(result.current.error).toBe('User rejected request');
      expect(mockOnWalletConnect).not.toHaveBeenCalled();
    });

    it('shows error when MetaMask is not installed', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).ethereum;

      const { result } = renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      // Set mounted state
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      await act(async () => {
        await result.current.connectWallet('metamask');
      });

      expect(result.current.error).toBe('MetaMask is not installed. Please install MetaMask to continue.');
    });
  });

  describe('Wallet disconnection', () => {
    it('disconnects wallet successfully', async () => {
      const { result } = renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      // Set mounted state
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      await act(async () => {
        result.current.disconnectWallet();
      });

      expect(mockOnWalletDisconnect).toHaveBeenCalled();
      expect(result.current.walletState).toEqual({
        isConnected: false,
        address: null,
        provider: null,
        chainId: null,
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe('Utility functions', () => {
    it('copies address to clipboard', async () => {
      const { result } = renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      // Set mounted state
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      const testAddress = '0x1234567890abcdef1234567890abcdef12345678';

      await act(async () => {
        result.current.copyAddress(testAddress);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testAddress);
    });

    it('opens etherscan when window is available', async () => {
      const mockOpen = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).open = mockOpen;

      const { result } = renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      // Set mounted state
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      const testAddress = '0x1234567890abcdef1234567890abcdef12345678';

      await act(async () => {
        result.current.openEtherscan(testAddress);
      });

      expect(mockOpen).toHaveBeenCalledWith(`https://etherscan.io/address/${testAddress}`, '_blank');
    });
  });

  describe('Hydration safety', () => {
    it('handles undefined window gracefully', async () => {
      const originalWindow = global.window;
      // @ts-expect-error - Deleting window for testing
      delete global.window;

      renderHook(() =>
        useWalletState({
          onWalletConnect: mockOnWalletConnect,
          onWalletDisconnect: mockOnWalletDisconnect,
        })
      );

      // Should not crash when window is undefined
      expect(true).toBe(true);

      global.window = originalWindow;
    });
  });
});