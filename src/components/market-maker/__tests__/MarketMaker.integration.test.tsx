import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarketMaker } from '../MarketMaker';
import { Config, defaultConfig } from '@/app/config';

// Mock the HyperliquidService to avoid module parsing issues
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

// Mock the MarketMakerStrategy
jest.mock('@/app/services/marketMakerStrategy', () => ({
  MarketMakerStrategy: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }))
}));


// Mock child components to avoid external dependencies
jest.mock('../ConfigForm', () => ({
  ConfigForm: () => <div data-testid="config-form">Config Form</div>
}));

jest.mock('../TradingDashboard', () => ({
  TradingDashboard: () => <div data-testid="trading-dashboard">Trading Dashboard</div>
}));

jest.mock('../OrderForm', () => ({
  OrderForm: () => <div data-testid="order-form">Order Form</div>
}));

jest.mock('../OrdersTable', () => ({
  OrdersTable: ({ orders }: any) => (
    <div data-testid="orders-table">
      Orders: {orders.length}
    </div>
  )
}));

jest.mock('../PositionsTable', () => ({
  PositionsTable: ({ positions }: any) => (
    <div data-testid="positions-table">
      Positions: {positions.length}
    </div>
  )
}));

jest.mock('../ErrorLogs', () => ({
  ErrorLogs: ({ errors }: any) => (
    <div data-testid="error-logs">
      Errors: {errors.length}
    </div>
  )
}));

describe('MarketMaker Integration Tests', () => {
  let mockConfig: Config;
  let mockHyperliquidService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { ...defaultConfig };

    // Create a mock service instance with proper methods
    mockHyperliquidService = {
      getAvailableCoins: jest.fn().mockResolvedValue(['ETH', 'BTC']),
      getOrderBook: jest.fn().mockResolvedValue({
        asks: [{ p: '2050', s: '1.0' }],
        bids: [{ p: '2040', s: '1.0' }]
      }),
      checkWalletStatus: jest.fn().mockReturnValue({ ready: true }),
      getAccountInfo: jest.fn().mockResolvedValue({
        crossMarginSummary: { accountValue: '10000' }
      }),
      getTotalPnl: jest.fn().mockResolvedValue({
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        positions: []
      }),
      getOpenOrders: jest.fn().mockResolvedValue([]),
      placeLimitOrder: jest.fn(),
      cancelAllOrders: jest.fn(),
      initializeWallet: jest.fn()
    };
  });

  describe('Basic Functionality', () => {
    it('should render all main components', () => {
      render(<MarketMaker config={mockConfig} />);
      
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /trading/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /positions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
    });

    it('should handle tab interactions correctly', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // All tabs should be present and clickable
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      const tradingTab = screen.getByRole('tab', { name: /trading/i });
      const ordersTab = screen.getByRole('tab', { name: /orders/i });
      const positionsTab = screen.getByRole('tab', { name: /positions/i });
      const logsTab = screen.getByRole('tab', { name: /logs/i });
      
      // Config form should be initially visible
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
      
      // All tabs should be clickable without errors
      expect(() => fireEvent.click(tradingTab)).not.toThrow();
      expect(() => fireEvent.click(ordersTab)).not.toThrow();
      expect(() => fireEvent.click(positionsTab)).not.toThrow();
      expect(() => fireEvent.click(logsTab)).not.toThrow();
      expect(() => fireEvent.click(configTab)).not.toThrow();
      
      // All tabs should have proper accessibility attributes
      [configTab, tradingTab, ordersTab, positionsTab, logsTab].forEach(tab => {
        expect(tab).toHaveAttribute('role', 'tab');
        expect(tab).toHaveAttribute('aria-controls');
      });
    });
  });

  describe('Service Integration', () => {
    it('should call getAvailableCoins when service is provided', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });
    });

    it('should handle service errors gracefully', async () => {
      const errorService = {
        ...mockHyperliquidService,
        getAvailableCoins: jest.fn().mockRejectedValue(new Error('Service error'))
      };
      
      render(<MarketMaker config={mockConfig} hyperliquidService={errorService as any} />);
      
      // Should not crash
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(errorService.getAvailableCoins).toHaveBeenCalled();
      });

      // Component should remain stable after service errors
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should update market price when coin selection changes', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });

      // Should call getOrderBook for the selected coin
      await waitFor(() => {
        expect(mockHyperliquidService.getOrderBook).toHaveBeenCalledWith('ETH');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const errorService = {
        ...mockHyperliquidService,
        getAvailableCoins: jest.fn().mockRejectedValue(new Error('Test error'))
      };
      
      render(<MarketMaker config={mockConfig} hyperliquidService={errorService as any} />);
      
      await waitFor(() => {
        expect(errorService.getAvailableCoins).toHaveBeenCalled();
      });

      // Component should not crash when there are service errors
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should handle missing orderbook data', async () => {
      const emptyOrderBookService = {
        ...mockHyperliquidService,
        getOrderBook: jest.fn().mockResolvedValue({
          asks: [],
          bids: []
        })
      };
      
      render(<MarketMaker config={mockConfig} hyperliquidService={emptyOrderBookService as any} />);
      
      await waitFor(() => {
        expect(emptyOrderBookService.getOrderBook).toHaveBeenCalled();
      });
      
      // Should not crash with empty orderbook
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should handle malformed API responses', async () => {
      const malformedService = {
        ...mockHyperliquidService,
        getAccountInfo: jest.fn().mockResolvedValue(null),
        getTotalPnl: jest.fn().mockResolvedValue({})
      };
      
      render(<MarketMaker config={mockConfig} hyperliquidService={malformedService as any} />);
      
      // Should not crash with malformed responses
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should maintain component state correctly', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Component should initialize with correct default state
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });

    it('should handle service interactions', async () => {
      const positionService = {
        ...mockHyperliquidService,
        getTotalPnl: jest.fn().mockResolvedValue({
          totalUnrealizedPnl: 100,
          totalRealizedPnl: 50,
          positions: [
            { coin: 'ETH', size: '0.1' },
            { coin: 'BTC', size: '0.01' }
          ]
        })
      };
      
      render(<MarketMaker config={mockConfig} hyperliquidService={positionService as any} />);
      
      // Component should render successfully with services
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should unmount cleanly', () => {
      const { unmount } = render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      // Unmount should clean up properly without throwing
      expect(() => unmount()).not.toThrow();
    });

    it('should handle component lifecycle correctly', () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      // Component should render successfully
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });
});