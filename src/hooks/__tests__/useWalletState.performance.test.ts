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

describe('useWalletState - Performance Tests', () => {
  let mockOnWalletConnect: jest.Mock;
  let mockOnWalletDisconnect: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockOnWalletConnect = jest.fn();
    mockOnWalletDisconnect = jest.fn();
    
    mockEthereum.request.mockClear();
    mockEthereum.on.mockClear();
    mockEthereum.removeListener.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not cause excessive re-renders from detection interval', () => {
    const { result } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    // Track initial render count
    const initialWalletState = result.current.walletState;
    const initialDetection = result.current.detection;

    // Fast forward 30 seconds to see if detection interval causes re-renders
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    // State should be stable (not constantly changing due to detection)
    expect(result.current.walletState).toBe(initialWalletState);
    expect(result.current.detection).toBe(initialDetection);
  });

  it('should only check existing connections once', () => {
    const { result } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    // Advance timers and trigger multiple potential checks
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    const initialRequestCalls = mockEthereum.request.mock.calls.length;

    // Multiple state changes should not trigger additional connection checks
    act(() => {
      result.current.setError('test error');
      result.current.setError(null);
      jest.advanceTimersByTime(5000);
    });

    // Should not have made additional eth_accounts requests
    expect(mockEthereum.request.mock.calls.length).toBe(initialRequestCalls);
  });

  it('should stop detection interval once wallets are detected', () => {
    // Mock ethereum with MetaMask detected
    Object.defineProperty(window, 'ethereum', {
      value: { ...mockEthereum, isMetaMask: true },
      writable: true,
    });

    renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    // Since MetaMask is detected, no interval should be set up
    // Fast forward and verify no periodic detection calls
    act(() => {
      jest.advanceTimersByTime(60000); // 1 minute
    });

    // Should have minimal calls (only initial detection)
    expect(jest.getTimerCount()).toBe(0); // No active timers
  });

  it('should handle rapid state changes without performance degradation', () => {
    const { result } = renderHook(() =>
      useWalletState({
        onWalletConnect: mockOnWalletConnect,
        onWalletDisconnect: mockOnWalletDisconnect,
      })
    );

    const startTime = performance.now();

    // Simulate rapid user interactions
    act(() => {
      for (let i = 0; i < 100; i++) {
        result.current.setError(`Error ${i}`);
        result.current.setError(null);
        result.current.disconnectWallet();
      }
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Should complete quickly (less than 100ms for 100 operations)
    expect(duration).toBeLessThan(100);
    
    // Final state should be stable
    expect(result.current.walletState.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });
});