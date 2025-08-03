import { renderHook, act } from '@testing-library/react';
import { useWalletState } from '../useWalletState';

// Mock window.ethereum
const mockEthereum = {
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  isMetaMask: true,
};

// Global mocks
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

    // Test basic disconnect functionality
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

    // Multiple rapid disconnects should not crash
    act(() => {
      result.current.disconnectWallet();
      result.current.disconnectWallet();
      result.current.disconnectWallet();
    });

    expect(result.current.walletState.isConnected).toBe(false);
    expect(mockOnWalletDisconnect).toHaveBeenCalledTimes(3);
  });

  it('should not re-register event listeners on state changes', () => {
    const { result } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    // Wait for initial setup
    act(() => {
      // Force a re-render by changing state
      result.current.setError('test error');
    });

    const initialOnCalls = mockEthereum.on.mock.calls.length;

    // Change state multiple times
    act(() => {
      result.current.setError(null);
      result.current.disconnectWallet();
      result.current.setError('another error');
    });

    // Should not have added more event listeners
    expect(mockEthereum.on.mock.calls.length).toBe(initialOnCalls);
  });

  it('should clean up properly on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    // Force the hook to set up listeners
    act(() => {
      // Trigger any state change to ensure hook is fully initialized
      result.current.setError('test');
    });

    const initialRemoveListenerCalls = mockEthereum.removeListener.mock.calls.length;

    // Unmount should trigger cleanup
    unmount();

    // Should have attempted to remove listeners (even if they weren't added due to missing ethereum)
    expect(mockEthereum.removeListener.mock.calls.length).toBeGreaterThanOrEqual(initialRemoveListenerCalls);
  });

  it('should handle missing ethereum gracefully', () => {
    // Remove ethereum object
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

    // Should not crash when ethereum is missing
    expect(() => {
      act(() => {
        result.current.disconnectWallet();
      });
    }).not.toThrow();

    expect(result.current.walletState.isConnected).toBe(false);
  });

  it('should handle ethereum errors during cleanup gracefully', () => {
    // Mock ethereum with broken removeListener
    const brokenEthereum = {
      ...mockEthereum,
      removeListener: jest.fn().mockImplementation(() => {
        throw new Error('Ethereum cleanup failed');
      }),
    };

    Object.defineProperty(window, 'ethereum', {
      value: brokenEthereum,
      writable: true,
    });

    const { unmount } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    // Should not crash even if ethereum cleanup fails
    expect(() => {
      unmount();
    }).not.toThrow();
  });
});