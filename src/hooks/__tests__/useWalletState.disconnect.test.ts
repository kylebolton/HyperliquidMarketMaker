import { renderHook, act } from '@testing-library/react';
import { useWalletState } from '../useWalletState';

// Mock window.ethereum
const mockEthereum = {
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  isMetaMask: true,
};

Object.defineProperty(window, 'ethereum', {
  value: mockEthereum,
  writable: true,
});

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

describe('useWalletState - Disconnect Safety Tests', () => {
  let mockOnWalletConnect: jest.Mock;
  let mockOnWalletDisconnect: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnWalletConnect = jest.fn();
    mockOnWalletDisconnect = jest.fn();
    
    mockEthereum.request.mockClear();
    mockEthereum.on.mockClear();
    mockEthereum.removeListener.mockClear();
  });

  it('should handle disconnect without crashing', () => {
    const { result } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    act(() => {
      result.current.disconnectWallet();
    });

    expect(result.current.walletState.isConnected).toBe(false);
    expect(result.current.walletState.address).toBeNull();
    expect(result.current.walletState.provider).toBeNull();
    expect(result.current.walletState.chainId).toBeNull();
    expect(mockOnWalletDisconnect).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple rapid disconnects safely', () => {
    const { result } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    act(() => {
      result.current.disconnectWallet();
      result.current.disconnectWallet();
      result.current.disconnectWallet();
    });

    expect(result.current.walletState.isConnected).toBe(false);
    expect(mockOnWalletDisconnect).toHaveBeenCalledTimes(3);
  });

  it('should clean up properly on unmount', () => {
    const { unmount } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    expect(() => unmount()).not.toThrow();
  });

  it('should handle missing ethereum gracefully', () => {
    Object.defineProperty(window, 'ethereum', {
      value: undefined,
      writable: true,
    });

    const { result } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    expect(() => {
      act(() => {
        result.current.disconnectWallet();
      });
    }).not.toThrow();

    expect(result.current.walletState.isConnected).toBe(false);
  });
});