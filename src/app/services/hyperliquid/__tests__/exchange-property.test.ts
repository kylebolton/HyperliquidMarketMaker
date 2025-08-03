/**
 * Simple test to verify exchange property is properly initialized
 * This test focuses on the core wallet initialization issue
 */

import { HyperliquidService } from '../compatibility';
import { defaultConfig } from '@/app/config';

// Mock the external dependencies
jest.mock('@nktkas/hyperliquid', () => ({
  HttpTransport: jest.fn(() => ({ test: 'transport' })),
  WebSocketTransport: jest.fn(() => ({ test: 'ws' })),
  InfoClient: jest.fn(() => ({ test: 'info' })),
  SubscriptionClient: jest.fn(() => ({ test: 'subscription' })),
  ExchangeClient: jest.fn((config) => ({
    // Mock ExchangeClient with essential trading methods
    order: jest.fn(),
    cancel: jest.fn(),
    cancelByCloid: jest.fn(),
    _config: config,
    _isExchangeClient: true
  }))
}));

describe('HyperliquidService Exchange Property Fix', () => {
  let service: HyperliquidService;

  beforeEach(() => {
    service = new HyperliquidService(defaultConfig);
  });

  it('should have exchange property accessible', () => {
    // Before initialization, exchange should be null
    expect(service.exchange).toBeNull();
  });

  it('should set exchange property after wallet initialization', async () => {
    const mockWalletState = {
      isConnected: true,
      address: '0x123456789abcdef123456789abcdef123456789a',
      provider: 'metamask' as const,
      chainId: 42161
    };

    await service.initializeWallet(mockWalletState);

    // Exchange should now be available
    expect(service.exchange).toBeDefined();
    expect(service.exchange).not.toBeNull();
  });

  it('should have walletClient property set after initialization', async () => {
    const mockWalletState = {
      isConnected: true,
      address: '0x123456789abcdef123456789abcdef123456789a',
      provider: 'metamask' as const,
      chainId: 42161
    };

    await service.initializeWallet(mockWalletState);

    // walletClient should be available
    expect(service.walletClient).toBeDefined();
    expect(service.walletClient).not.toBeNull();
  });

  it('should have walletClient and exchange reference the same object', async () => {
    const mockWalletState = {
      isConnected: true,
      address: '0x123456789abcdef123456789abcdef123456789a',
      provider: 'metamask' as const,
      chainId: 42161
    };

    await service.initializeWallet(mockWalletState);

    // In the new architecture, they should be the same
    expect(service.exchange).toBe(service.walletClient);
  });

  it('should detect exchange methods on the client', async () => {
    const mockWalletState = {
      isConnected: true,
      address: '0x123456789abcdef123456789abcdef123456789a',
      provider: 'metamask' as const,
      chainId: 42161
    };

    await service.initializeWallet(mockWalletState);

    const exchange = service.exchange as Record<string, unknown>;
    
    // Should have trading methods
    expect(typeof exchange.order).toBe('function');
    expect(typeof exchange.cancel).toBe('function');
    expect(typeof exchange.cancelByCloid).toBe('function');
  });
});