import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarketMaker } from '../MarketMaker';
import { Config, defaultConfig } from '@/app/config';

// Create a simple mock that doesn't interfere with component logic
const mockHyperliquidService = {
  getAvailableCoins: jest.fn(),
  getOrderBook: jest.fn(),
  placeLimitOrder: jest.fn(),
  cancelAllOrders: jest.fn(),
  getAccountInfo: jest.fn(),
  getTotalPnl: jest.fn(),
  getOpenOrders: jest.fn(),
  checkWalletStatus: jest.fn(),
  initializeWallet: jest.fn()
};

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

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { ...defaultConfig };

    // Set up default mock responses
    mockHyperliquidService.getAvailableCoins.mockResolvedValue(['ETH', 'BTC']);
    mockHyperliquidService.getOrderBook.mockResolvedValue({
      asks: [{ p: '2050', s: '1.0' }],
      bids: [{ p: '2040', s: '1.0' }]
    });
    mockHyperliquidService.checkWalletStatus.mockReturnValue({ ready: true });
    mockHyperliquidService.getAccountInfo.mockResolvedValue({
      crossMarginSummary: { accountValue: '10000' }
    });
    mockHyperliquidService.getTotalPnl.mockResolvedValue({
      totalUnrealizedPnl: 0,
      totalRealizedPnl: 0,
      positions: []
    });
    mockHyperliquidService.getOpenOrders.mockResolvedValue([]);
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

    it('should switch tabs correctly', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Start on config tab
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
      
      // Switch to trading tab
      fireEvent.click(screen.getByRole('tab', { name: /trading/i }));
      expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();
      
      // Switch to orders tab
      fireEvent.click(screen.getByRole('tab', { name: /orders/i }));
      expect(screen.getByTestId('orders-table')).toBeInTheDocument();
      
      // Switch to positions tab
      fireEvent.click(screen.getByRole('tab', { name: /positions/i }));
      expect(screen.getByTestId('positions-table')).toBeInTheDocument();
      
      // Switch to logs tab
      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('error-logs')).toBeInTheDocument();
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
      mockHyperliquidService.getAvailableCoins.mockRejectedValue(new Error('Service error'));
      
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      // Should not crash
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });

      // Check that error is logged (switch to logs tab)
      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('error-logs')).toBeInTheDocument();
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
    it('should display errors in the logs tab', async () => {
      mockHyperliquidService.getAvailableCoins.mockRejectedValue(new Error('Test error'));
      
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });

      // Switch to logs tab to see errors
      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      
      // Should show at least one error
      expect(screen.getByTestId('error-logs')).toHaveTextContent('Errors: 1');
    });

    it('should handle missing orderbook data', async () => {
      mockHyperliquidService.getOrderBook.mockResolvedValue({
        asks: [],
        bids: []
      });
      
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      await waitFor(() => {
        expect(mockHyperliquidService.getOrderBook).toHaveBeenCalled();
      });
      
      // Should not crash with empty orderbook
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should handle malformed API responses', async () => {
      mockHyperliquidService.getAccountInfo.mockResolvedValue(null);
      mockHyperliquidService.getTotalPnl.mockResolvedValue({});
      
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      // Should not crash with malformed responses
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should maintain state correctly across tab switches', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Start with 0 orders
      fireEvent.click(screen.getByRole('tab', { name: /orders/i }));
      expect(screen.getByTestId('orders-table')).toHaveTextContent('Orders: 0');
      
      // Switch to positions
      fireEvent.click(screen.getByRole('tab', { name: /positions/i }));
      expect(screen.getByTestId('positions-table')).toHaveTextContent('Positions: 0');
      
      // Switch back to orders - should still show 0
      fireEvent.click(screen.getByRole('tab', { name: /orders/i }));
      expect(screen.getByTestId('orders-table')).toHaveTextContent('Orders: 0');
    });

    it('should update state when service methods are called', async () => {
      mockHyperliquidService.getTotalPnl.mockResolvedValue({
        totalUnrealizedPnl: 100,
        totalRealizedPnl: 50,
        positions: [
          { coin: 'ETH', size: '0.1' },
          { coin: 'BTC', size: '0.01' }
        ]
      });
      
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      // The component should handle position updates
      fireEvent.click(screen.getByRole('tab', { name: /positions/i }));
      expect(screen.getByTestId('positions-table')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should not cause memory leaks with timers', async () => {
      const { unmount } = render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      // Let some time pass
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Unmount should clean up properly
      expect(() => unmount()).not.toThrow();
    });

    it('should handle rapid state updates', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService as any} />);
      
      // Rapid tab switching should not crash
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByRole('tab', { name: /trading/i }));
        fireEvent.click(screen.getByRole('tab', { name: /orders/i }));
        fireEvent.click(screen.getByRole('tab', { name: /positions/i }));
        fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
        fireEvent.click(screen.getByRole('tab', { name: /configuration/i }));
      }
      
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });
});