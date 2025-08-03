import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarketMaker } from '../MarketMaker';
import { defaultConfig } from '../../../app/config';
import { WalletConnectionState } from '../../wallet/WalletConnection';

// Mock HyperliquidService
jest.mock('../../../app/services/hyperliquid/compatibility', () => ({
  HyperliquidService: jest.fn().mockImplementation(() => ({
    setWalletConnectionState: jest.fn(),
    initializeWallet: jest.fn().mockResolvedValue(undefined),
    checkWalletStatus: jest.fn().mockReturnValue({
      ready: false,
      message: 'Browser wallet is not connected',
      details: 'Please connect your browser wallet (MetaMask, etc.) to continue'
    }),
    getAvailableCoins: jest.fn().mockResolvedValue(['BTC', 'ETH']),
  }))
}));

// Mock MarketMakerStrategy
jest.mock('../../../app/services/marketMakerStrategy', () => ({
  MarketMakerStrategy: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
  }))
}));

// Mock wallet connection component
jest.mock('../../wallet/WalletConnection', () => ({
  WalletConnection: ({ onWalletConnect, onWalletDisconnect }: {
    onWalletConnect: (state: WalletConnectionState) => void;
    onWalletDisconnect: () => void;
  }) => (
    <div data-testid="wallet-connection">
      <button
        data-testid="connect-wallet"
        onClick={() => onWalletConnect({
          isConnected: true,
          address: '0x1234567890123456789012345678901234567890',
          provider: 'metamask',
          chainId: 42161
        })}
      >
        Connect Wallet
      </button>
      <button
        data-testid="disconnect-wallet"
        onClick={() => onWalletDisconnect()}
      >
        Disconnect Wallet
      </button>
    </div>
  ),
  WalletConnectionState: {} as any
}));

describe('MarketMaker Wallet Connection Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show wallet connection component when wallet is not connected', () => {
    render(<MarketMaker config={defaultConfig} />);
    
    // Switch to trading tab
    fireEvent.click(screen.getByText('Trading'));
    
    // Should show wallet connection component
    expect(screen.getByTestId('wallet-connection')).toBeInTheDocument();
  });

  it('should handle wallet connection correctly', async () => {
    const mockService = {
      setWalletConnectionState: jest.fn(),
      initializeWallet: jest.fn().mockResolvedValue(undefined),
      checkWalletStatus: jest.fn().mockReturnValue({
        ready: false,
        message: 'Browser wallet is not connected'
      }),
      getAvailableCoins: jest.fn().mockResolvedValue(['BTC', 'ETH']),
    };

    const { HyperliquidService } = require('../../../app/services/hyperliquid/compatibility');
    HyperliquidService.mockImplementation(() => mockService);

    render(<MarketMaker config={defaultConfig} />);
    
    // Switch to trading tab
    fireEvent.click(screen.getByText('Trading'));
    
    // Verify wallet connection component is initially shown
    expect(screen.getByTestId('wallet-connection')).toBeInTheDocument();
    
    // Connect wallet
    fireEvent.click(screen.getByTestId('connect-wallet'));
    
    // Wait for state updates and check if service is called
    await waitFor(() => {
      expect(mockService.setWalletConnectionState).toHaveBeenCalledWith({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        provider: 'metamask',
        chainId: 42161
      });
    });
  });

  it('should handle wallet disconnection correctly', async () => {
    const mockService = {
      setWalletConnectionState: jest.fn(),
      initializeWallet: jest.fn().mockResolvedValue(undefined),
      checkWalletStatus: jest.fn().mockReturnValue({
        ready: false,
        message: 'Browser wallet is not connected'
      }),
      getAvailableCoins: jest.fn().mockResolvedValue(['BTC', 'ETH']),
    };

    const { HyperliquidService } = require('../../../app/services/hyperliquid/compatibility');
    HyperliquidService.mockImplementation(() => mockService);

    render(<MarketMaker config={defaultConfig} />);
    
    // Switch to trading tab
    fireEvent.click(screen.getByText('Trading'));
    
    // Connect wallet first
    fireEvent.click(screen.getByTestId('connect-wallet'));
    
    // Verify connection was called
    await waitFor(() => {
      expect(mockService.setWalletConnectionState).toHaveBeenCalledWith({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        provider: 'metamask',
        chainId: 42161
      });
    });
    
    // Disconnect wallet
    fireEvent.click(screen.getByTestId('disconnect-wallet'));
    
    // Verify disconnection was called
    await waitFor(() => {
      expect(mockService.setWalletConnectionState).toHaveBeenCalledWith(null);
    });
  });

  it('should prevent starting market maker without wallet connection', async () => {
    const mockService = {
      setWalletConnectionState: jest.fn(),
      initializeWallet: jest.fn().mockResolvedValue(undefined),
      checkWalletStatus: jest.fn().mockReturnValue({
        ready: false,
        message: 'Browser wallet is not connected'
      }),
      getAvailableCoins: jest.fn().mockResolvedValue(['BTC', 'ETH']),
    };

    const { HyperliquidService } = require('../../../app/services/hyperliquid/compatibility');
    HyperliquidService.mockImplementation(() => mockService);

    render(<MarketMaker config={defaultConfig} />);
    
    // Switch to trading tab
    fireEvent.click(screen.getByText('Trading'));
    
    // Try to start market maker without connecting wallet
    const startButton = screen.getByText('Start Market Maker');
    fireEvent.click(startButton);
    
    // Should show error about wallet not being connected
    await waitFor(() => {
      expect(screen.getByText(/Wallet not connected/)).toBeInTheDocument();
    });
  });

  it('should allow starting market maker after wallet connection', async () => {
    const mockService = {
      setWalletConnectionState: jest.fn(),
      initializeWallet: jest.fn().mockResolvedValue(undefined),
      checkWalletStatus: jest.fn()
        .mockReturnValueOnce({
          ready: false,
          message: 'Browser wallet is not connected'
        })
        .mockReturnValue({
          ready: true,
          message: 'Exchange client is ready'
        }),
      getAvailableCoins: jest.fn().mockResolvedValue(['BTC', 'ETH']),
      getAccountInfo: jest.fn().mockResolvedValue({ crossMarginSummary: {} }),
      getTotalPnl: jest.fn().mockResolvedValue({ 
        success: true, 
        totalUnrealizedPnl: 0, 
        totalRealizedPnl: 0, 
        positions: [] 
      }),
      getOpenOrders: jest.fn().mockResolvedValue([]),
    };

    const { HyperliquidService } = require('../../../app/services/hyperliquid/compatibility');
    HyperliquidService.mockImplementation(() => mockService);

    render(<MarketMaker config={defaultConfig} />);
    
    // Switch to trading tab
    fireEvent.click(screen.getByText('Trading'));
    
    // Connect wallet
    fireEvent.click(screen.getByTestId('connect-wallet'));
    
    // Wait for wallet connection
    await waitFor(() => {
      expect(screen.queryByTestId('wallet-connection')).not.toBeInTheDocument();
    });
    
    // Now try to start market maker
    const startButton = screen.getByText('Start Market Maker');
    fireEvent.click(startButton);
    
    // Should not show wallet connection error
    await waitFor(() => {
      expect(screen.queryByText(/Wallet not connected/)).not.toBeInTheDocument();
    });
    
    // Should have called initializeWallet
    expect(mockService.initializeWallet).toHaveBeenCalledWith({
      isConnected: true,
      address: '0x1234567890123456789012345678901234567890',
      provider: 'metamask',
      chainId: 42161
    });
  });

  it('should update service with wallet state when wallet connects', async () => {
    const mockService = {
      setWalletConnectionState: jest.fn(),
      initializeWallet: jest.fn().mockResolvedValue(undefined),
      checkWalletStatus: jest.fn().mockReturnValue({
        ready: false,
        message: 'Browser wallet is not connected'
      }),
      getAvailableCoins: jest.fn().mockResolvedValue(['BTC', 'ETH']),
    };

    const { HyperliquidService } = require('../../../app/services/hyperliquid/compatibility');
    HyperliquidService.mockImplementation(() => mockService);

    render(<MarketMaker config={defaultConfig} />);
    
    // Switch to trading tab
    fireEvent.click(screen.getByText('Trading'));
    
    // Connect wallet
    fireEvent.click(screen.getByTestId('connect-wallet'));
    
    // Should have called setWalletConnectionState
    await waitFor(() => {
      expect(mockService.setWalletConnectionState).toHaveBeenCalledWith({
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        provider: 'metamask',
        chainId: 42161
      });
    });
  });
});