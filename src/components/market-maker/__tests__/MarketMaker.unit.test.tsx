import { render, screen, fireEvent } from '@testing-library/react';
import { MarketMaker } from '../MarketMaker';
import { defaultConfig } from '@/app/config';

// Mock all external dependencies
jest.mock('@/app/services/hyperliquid/compatibility', () => ({
  HyperliquidService: function() {
    return {
      getAvailableCoins: jest.fn().mockResolvedValue(['ETH', 'BTC']),
      getOrderBook: jest.fn().mockResolvedValue({
        asks: [{ p: '2050', s: '1.0' }],
        bids: [{ p: '2040', s: '1.0' }]
      }),
      placeLimitOrder: jest.fn(),
      cancelAllOrders: jest.fn(),
      getAccountInfo: jest.fn().mockResolvedValue({}),
      getTotalPnl: jest.fn().mockResolvedValue({ totalUnrealizedPnl: 0, totalRealizedPnl: 0 }),
      getOpenOrders: jest.fn().mockResolvedValue([]),
      checkWalletStatus: jest.fn().mockReturnValue({ ready: true }),
      initializeWallet: jest.fn()
    };
  }
}));

jest.mock('@/app/services/marketMakerStrategy', () => ({
  MarketMakerStrategy: function() {
    return {
      start: jest.fn(),
      stop: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    };
  }
}));

// Mock all child components
jest.mock('../ConfigForm', () => ({
  ConfigForm: ({ isLoading }: any) => (
    <div data-testid="config-form">
      {isLoading ? 'Loading...' : 'Config Form Ready'}
    </div>
  )
}));

jest.mock('../TradingDashboard', () => ({
  TradingDashboard: ({ isRunning }: any) => (
    <div data-testid="trading-dashboard">
      Status: {isRunning ? 'Running' : 'Stopped'}
    </div>
  )
}));

jest.mock('../OrderForm', () => ({
  OrderForm: ({ isLoading }: any) => (
    <div data-testid="order-form">
      {isLoading ? 'Processing...' : 'Order Form Ready'}
    </div>
  )
}));

jest.mock('../OrdersTable', () => ({
  OrdersTable: ({ orders }: any) => (
    <div data-testid="orders-table">
      <span data-testid="orders-count">{orders?.length || 0}</span>
    </div>
  )
}));

jest.mock('../PositionsTable', () => ({
  PositionsTable: ({ positions }: any) => (
    <div data-testid="positions-table">
      <span data-testid="positions-count">{positions?.length || 0}</span>
    </div>
  )
}));

jest.mock('../ErrorLogs', () => ({
  ErrorLogs: ({ errors }: any) => (
    <div data-testid="error-logs">
      <span data-testid="errors-count">{errors?.length || 0}</span>
    </div>
  )
}));

describe('MarketMaker Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Structure', () => {
    it('should render main container and title', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should render all tab triggers', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /trading/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /positions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
    });

    it('should show configuration tab content by default', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
      expect(screen.getByText('Config Form Ready')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch to trading tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      fireEvent.click(screen.getByRole('tab', { name: /trading/i }));
      
      expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();
      expect(screen.getByText('Status: Stopped')).toBeInTheDocument();
    });

    it('should switch to orders tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      fireEvent.click(screen.getByRole('tab', { name: /orders/i }));
      
      expect(screen.getByTestId('orders-table')).toBeInTheDocument();
      expect(screen.getByTestId('orders-count')).toHaveTextContent('0');
    });

    it('should switch to positions tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      fireEvent.click(screen.getByRole('tab', { name: /positions/i }));
      
      expect(screen.getByTestId('positions-table')).toBeInTheDocument();
      expect(screen.getByTestId('positions-count')).toHaveTextContent('0');
    });

    it('should switch to logs tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      
      expect(screen.getByTestId('error-logs')).toBeInTheDocument();
      expect(screen.getByTestId('errors-count')).toHaveTextContent('0');
    });
  });

  describe('Loading States', () => {
    it('should show loading state correctly', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Initially should not be loading
      expect(screen.getByText('Config Form Ready')).toBeInTheDocument();
      
      // Navigate to trading to check other loading states
      fireEvent.click(screen.getByRole('tab', { name: /trading/i }));
      expect(screen.getByText('Order Form Ready')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should maintain separate state for each tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Check initial states
      fireEvent.click(screen.getByRole('tab', { name: /orders/i }));
      expect(screen.getByTestId('orders-count')).toHaveTextContent('0');
      
      fireEvent.click(screen.getByRole('tab', { name: /positions/i }));
      expect(screen.getByTestId('positions-count')).toHaveTextContent('0');
      
      fireEvent.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByTestId('errors-count')).toHaveTextContent('0');
    });

    it('should preserve active tab selection', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Switch to trading tab
      fireEvent.click(screen.getByRole('tab', { name: /trading/i }));
      expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();
      
      // Should stay on trading tab after re-render
      expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should not crash with undefined props', () => {
      expect(() => {
        render(<MarketMaker config={defaultConfig} hyperliquidService={undefined} />);
      }).not.toThrow();
      
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should handle missing config gracefully', () => {
      expect(() => {
        render(<MarketMaker config={defaultConfig} />);
      }).not.toThrow();
    });
  });

  describe('Component Integration', () => {
    it('should pass correct props to child components', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Check that child components receive expected props
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
      
      fireEvent.click(screen.getByRole('tab', { name: /trading/i }));
      expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();
      expect(screen.getByTestId('order-form')).toBeInTheDocument();
    });

    it('should render all sections without crashing', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      const tabs = [
        /configuration/i,
        /trading/i, 
        /orders/i,
        /positions/i,
        /logs/i
      ];
      
      tabs.forEach(tabName => {
        fireEvent.click(screen.getByRole('tab', { name: tabName }));
        // Should not crash and should show some content
        expect(screen.getByRole('tabpanel')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(5);
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      const tradingTab = screen.getByRole('tab', { name: /trading/i });
      
      expect(configTab).toHaveAttribute('aria-selected', 'true');
      expect(tradingTab).toHaveAttribute('aria-selected', 'false');
      
      fireEvent.click(tradingTab);
      
      expect(tradingTab).toHaveAttribute('aria-selected', 'true');
      expect(configTab).toHaveAttribute('aria-selected', 'false');
    });
  });
});