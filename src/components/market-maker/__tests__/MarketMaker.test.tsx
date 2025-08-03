import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketMaker } from '../MarketMaker';
import { Config, defaultConfig } from '@/app/config';
import { HyperliquidService } from '@/app/services/hyperliquid/compatibility';
import { WalletConnectionState } from '@/components/wallet/WalletConnection';

// Mock the HyperliquidService
jest.mock('@/app/services/hyperliquid/compatibility', () => ({
  HyperliquidService: jest.fn().mockImplementation(() => ({
    getAvailableCoins: jest.fn(),
    getOrderBook: jest.fn(),
    placeLimitOrder: jest.fn(),
    cancelAllOrders: jest.fn(),
    getAccountInfo: jest.fn(),
    getTotalPnl: jest.fn(),
    getOpenOrders: jest.fn(),
    checkWalletStatus: jest.fn(),
    initializeWallet: jest.fn()
  }))
}));

jest.mock('@/app/services/marketMakerStrategy', () => ({
  MarketMakerStrategy: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }))
}));

// Mock child components to focus on MarketMaker logic
jest.mock('../ConfigForm', () => ({
  ConfigForm: ({ onSubmit, isLoading }: any) => (
    <div data-testid="config-form">
      <button 
        data-testid="config-submit"
        disabled={isLoading}
        onClick={() => onSubmit(defaultConfig)}
      >
        Submit Config
      </button>
    </div>
  )
}));

jest.mock('../TradingDashboard', () => ({
  TradingDashboard: ({ startMarketMaker, stopMarketMaker, isRunning }: any) => (
    <div data-testid="trading-dashboard">
      <button 
        data-testid="start-button"
        onClick={startMarketMaker}
        disabled={isRunning}
      >
        Start Market Maker
      </button>
      <button 
        data-testid="stop-button"
        onClick={stopMarketMaker}
        disabled={!isRunning}
      >
        Stop Market Maker
      </button>
      <div data-testid="running-status">{isRunning ? 'Running' : 'Stopped'}</div>
    </div>
  )
}));

jest.mock('../OrderForm', () => ({
  OrderForm: ({ onSubmit, isLoading }: any) => (
    <div data-testid="order-form">
      <button 
        data-testid="order-submit"
        disabled={isLoading}
        onClick={() => onSubmit({
          coin: 'ETH',
          orderCount: 5,
          startPrice: 2000,
          endPrice: 2100,
          sizePerOrder: 0.1,
          side: 'buy'
        })}
      >
        Submit Order
      </button>
    </div>
  )
}));

jest.mock('../OrdersTable', () => ({
  OrdersTable: ({ orders, cancelOrder, cancelAllOrders, clearOrderHistory }: any) => (
    <div data-testid="orders-table">
      <div data-testid="orders-count">{orders.length}</div>
      <button data-testid="cancel-all" onClick={cancelAllOrders}>Cancel All</button>
      <button data-testid="clear-history" onClick={clearOrderHistory}>Clear History</button>
      {orders.map((order: any) => (
        <div key={order.id} data-testid={`order-${order.id}`}>
          <span>{order.coin} {order.side} {order.price}</span>
          <button onClick={() => cancelOrder(order)}>Cancel</button>
        </div>
      ))}
    </div>
  )
}));

jest.mock('../PositionsTable', () => ({
  PositionsTable: ({ positions }: any) => (
    <div data-testid="positions-table">
      <div data-testid="positions-count">{positions.length}</div>
    </div>
  )
}));

jest.mock('../ErrorLogs', () => ({
  ErrorLogs: ({ errors, clearErrors }: any) => (
    <div data-testid="error-logs">
      <div data-testid="errors-count">{errors.length}</div>
      <button data-testid="clear-errors" onClick={clearErrors}>Clear Errors</button>
      {errors.map((error: any) => (
        <div key={error.id} data-testid={`error-${error.id}`}>
          {error.message}
        </div>
      ))}
    </div>
  )
}));

// Mock timers
jest.useFakeTimers();

describe('MarketMaker Component', () => {
  let mockHyperliquidService: jest.Mocked<HyperliquidService>;
  let mockConfig: Config;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock HyperliquidService
    mockHyperliquidService = {
      getAvailableCoins: jest.fn().mockResolvedValue(['ETH', 'BTC', 'SOL']),
      getOrderBook: jest.fn().mockResolvedValue({
        asks: [{ p: '2050', s: '1.0' }],
        bids: [{ p: '2040', s: '1.0' }]
      }),
      placeLimitOrder: jest.fn().mockResolvedValue({ id: 'test-order-1' }),
      cancelAllOrders: jest.fn().mockResolvedValue(true),
      getAccountInfo: jest.fn().mockResolvedValue({
        crossMarginSummary: {
          accountValue: '10000',
          freeCollateral: '5000'
        }
      }),
      getTotalPnl: jest.fn().mockResolvedValue({
        totalUnrealizedPnl: 100,
        totalRealizedPnl: 50,
        positions: []
      }),
      getOpenOrders: jest.fn().mockResolvedValue([]),
      checkWalletStatus: jest.fn().mockReturnValue({ ready: true }),
      initializeWallet: jest.fn().mockResolvedValue(true)
    } as any;

    mockConfig = {
      ...defaultConfig,
      walletAddress: '0x123...'
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      render(<MarketMaker config={mockConfig} />);
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should render all tabs', () => {
      render(<MarketMaker config={mockConfig} />);
      
      expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /trading/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /positions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
    });

    it('should start with configuration tab active', () => {
      render(<MarketMaker config={mockConfig} />);
      
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch between tabs correctly', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Switch to trading tab
      await user.click(screen.getByRole('tab', { name: /trading/i }));
      expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();

      // Switch to orders tab
      await user.click(screen.getByRole('tab', { name: /orders/i }));
      expect(screen.getByTestId('orders-table')).toBeInTheDocument();

      // Switch to positions tab
      await user.click(screen.getByRole('tab', { name: /positions/i }));
      expect(screen.getByTestId('positions-table')).toBeInTheDocument();

      // Switch to logs tab
      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('error-logs')).toBeInTheDocument();
    });
  });

  describe('Service Initialization', () => {
    it('should fetch available coins when hyperliquid service is provided', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });
    });

    it('should handle missing hyperliquid service gracefully', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Should not crash and should render
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should handle coin fetching errors', async () => {
      mockHyperliquidService.getAvailableCoins.mockRejectedValue(new Error('Network error'));
      
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });

      // Switch to logs to see error
      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('1');
    });
  });

  describe('Market Maker Operations', () => {
    it('should start market maker successfully', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Navigate to trading tab
      await user.click(screen.getByRole('tab', { name: /trading/i }));
      
      // Start market maker
      await user.click(screen.getByTestId('start-button'));

      await waitFor(() => {
        expect(screen.getByTestId('running-status')).toHaveTextContent('Running');
      });
    });

    it('should stop market maker successfully', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Navigate to trading tab
      await user.click(screen.getByRole('tab', { name: /trading/i }));
      
      // Start then stop market maker
      await user.click(screen.getByTestId('start-button'));
      
      await waitFor(() => {
        expect(screen.getByTestId('running-status')).toHaveTextContent('Running');
      });

      await user.click(screen.getByTestId('stop-button'));

      await waitFor(() => {
        expect(screen.getByTestId('running-status')).toHaveTextContent('Stopped');
      });
    });

    it('should handle start market maker errors', async () => {
      mockHyperliquidService.checkWalletStatus.mockReturnValue({ 
        ready: false, 
        message: 'Wallet not connected' 
      });

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('start-button'));

      // Check for error in logs
      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('1');
    });
  });

  describe('Order Management', () => {
    it('should place orders successfully', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('order-submit'));

      expect(mockHyperliquidService.placeLimitOrder).toHaveBeenCalledTimes(5);

      // Check orders table
      await user.click(screen.getByRole('tab', { name: /orders/i }));
      expect(screen.getByTestId('orders-count')).toHaveTextContent('5');
    });

    it('should handle order placement errors', async () => {
      mockHyperliquidService.placeLimitOrder.mockRejectedValue(new Error('Order failed'));

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('order-submit'));

      await waitFor(() => {
        expect(mockHyperliquidService.placeLimitOrder).toHaveBeenCalled();
      });

      // Check for errors
      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(parseInt(screen.getByTestId('errors-count').textContent || '0')).toBeGreaterThan(0);
    });

    it('should cancel all orders', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Place some orders first
      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('order-submit'));

      await waitFor(() => {
        expect(mockHyperliquidService.placeLimitOrder).toHaveBeenCalled();
      });

      // Cancel all orders
      await user.click(screen.getByRole('tab', { name: /orders/i }));
      await user.click(screen.getByTestId('cancel-all'));

      expect(mockHyperliquidService.cancelAllOrders).toHaveBeenCalled();
    });

    it('should clear order history', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Place some orders first
      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('order-submit'));

      await user.click(screen.getByRole('tab', { name: /orders/i }));
      
      // Should have orders
      expect(screen.getByTestId('orders-count')).toHaveTextContent('5');

      // Clear history (should only clear non-pending/placed orders)
      await user.click(screen.getByTestId('clear-history'));

      // Orders should remain since they're in "placed" status
      expect(screen.getByTestId('orders-count')).toHaveTextContent('5');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration and switch to trading tab', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} />);

      await user.click(screen.getByTestId('config-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();
      });
    });

    it('should handle configuration errors', async () => {
      // Mock HyperliquidService constructor to throw
      const MockHyperliquidService = HyperliquidService as jest.MockedClass<typeof HyperliquidService>;
      MockHyperliquidService.mockImplementation(() => {
        throw new Error('Service initialization failed');
      });

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} />);

      await user.click(screen.getByTestId('config-submit'));

      // Check for error in logs
      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('1');
    });
  });

  describe('Price Updates', () => {
    it('should fetch market price when coin changes', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await waitFor(() => {
        expect(mockHyperliquidService.getOrderBook).toHaveBeenCalledWith('ETH');
      });
    });

    it('should handle price fetching errors gracefully', async () => {
      mockHyperliquidService.getOrderBook.mockRejectedValue(new Error('Price fetch failed'));

      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await waitFor(() => {
        expect(mockHyperliquidService.getOrderBook).toHaveBeenCalled();
      });

      // Should not crash and should show error in logs
      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('1');
    });
  });

  describe('Data Refresh', () => {
    it('should set up data refresh interval when market maker starts', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('start-button'));

      // Fast forward time to trigger refresh
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockHyperliquidService.getAccountInfo).toHaveBeenCalled();
        expect(mockHyperliquidService.getTotalPnl).toHaveBeenCalled();
        expect(mockHyperliquidService.getOpenOrders).toHaveBeenCalled();
      });
    });

    it('should clear intervals when market maker stops', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('start-button'));
      
      await waitFor(() => {
        expect(screen.getByTestId('running-status')).toHaveTextContent('Running');
      });

      await user.click(screen.getByTestId('stop-button'));

      // Verify intervals are cleared by checking that no more calls are made after stop
      const initialCalls = mockHyperliquidService.getAccountInfo.mock.calls.length;
      
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should not have made additional calls
      expect(mockHyperliquidService.getAccountInfo.mock.calls.length).toBe(initialCalls);
    });
  });

  describe('Error Handling', () => {
    it('should categorize errors correctly', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Trigger different types of errors
      mockHyperliquidService.placeLimitOrder.mockRejectedValueOnce(new Error('network error'));
      
      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('order-submit'));

      await waitFor(() => {
        expect(mockHyperliquidService.placeLimitOrder).toHaveBeenCalled();
      });

      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(parseInt(screen.getByTestId('errors-count').textContent || '0')).toBeGreaterThan(0);
    });

    it('should clear errors', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Create an error
      mockHyperliquidService.getAvailableCoins.mockRejectedValueOnce(new Error('Test error'));
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });

      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('1');

      await user.click(screen.getByTestId('clear-errors'));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('0');
    });

    it('should auto-remove non-critical errors after timeout', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Trigger a warning (non-critical) error
      mockHyperliquidService.getOrderBook.mockRejectedValueOnce(new Error('Price fetch failed'));
      
      await waitFor(() => {
        expect(mockHyperliquidService.getOrderBook).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('1');

      // Fast forward time to trigger auto-removal
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(screen.getByTestId('errors-count')).toHaveTextContent('0');
    });
  });

  describe('Integration Edge Cases', () => {
    it('should handle undefined market price calculations', async () => {
      mockHyperliquidService.getOrderBook.mockResolvedValue({
        asks: [],
        bids: []
      });

      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await waitFor(() => {
        expect(mockHyperliquidService.getOrderBook).toHaveBeenCalled();
      });

      // Should not crash with empty orderbook
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should handle malformed API responses', async () => {
      mockHyperliquidService.getAccountInfo.mockResolvedValue(null as any);
      mockHyperliquidService.getTotalPnl.mockResolvedValue({} as any);

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      await user.click(screen.getByRole('tab', { name: /trading/i }));
      await user.click(screen.getByTestId('start-button'));

      // Fast forward to trigger data refresh
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should handle malformed responses gracefully
      expect(screen.getByTestId('running-status')).toHaveTextContent('Running');
    });
  });
});