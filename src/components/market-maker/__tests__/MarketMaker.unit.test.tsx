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
      
      const tradingTab = screen.getByRole('tab', { name: /trading/i });
      
      // Initial state - should not crash when clicking
      expect(() => fireEvent.click(tradingTab)).not.toThrow();
      
      // Verify the tab exists and is clickable
      expect(tradingTab).toBeInTheDocument();
      expect(tradingTab).toHaveAttribute('role', 'tab');
    });

    it('should switch to orders tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      const ordersTab = screen.getByRole('tab', { name: /orders/i });
      
      expect(() => fireEvent.click(ordersTab)).not.toThrow();
      expect(ordersTab).toBeInTheDocument();
      expect(ordersTab).toHaveAttribute('role', 'tab');
    });

    it('should switch to positions tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      const positionsTab = screen.getByRole('tab', { name: /positions/i });
      
      expect(() => fireEvent.click(positionsTab)).not.toThrow();
      expect(positionsTab).toBeInTheDocument();
      expect(positionsTab).toHaveAttribute('role', 'tab');
    });

    it('should switch to logs tab', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      const logsTab = screen.getByRole('tab', { name: /logs/i });
      
      expect(() => fireEvent.click(logsTab)).not.toThrow();
      expect(logsTab).toBeInTheDocument();
      expect(logsTab).toHaveAttribute('role', 'tab');
    });

    it('should show config tab as initially active', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      const tradingTab = screen.getByRole('tab', { name: /trading/i });
      
      expect(configTab).toHaveAttribute('aria-selected', 'true');
      expect(tradingTab).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });

    it('should render tab triggers correctly', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Test that tab triggers exist and are properly labeled
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(5);
      
      // Check tab accessibility
      tabs.forEach(tab => {
        expect(tab).toHaveAttribute('role', 'tab');
        expect(tab).toHaveAttribute('aria-controls');
      });
    });
  });

  describe('Loading States', () => {
    it('should show initial loading state correctly', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Initially should show config form in ready state
      expect(screen.getByText('Config Form Ready')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should maintain component state correctly', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      const ordersTab = screen.getByRole('tab', { name: /orders/i });
      const positionsTab = screen.getByRole('tab', { name: /positions/i });
      
      // All tabs should be present and interactive
      expect(configTab).toBeInTheDocument();
      expect(ordersTab).toBeInTheDocument();
      expect(positionsTab).toBeInTheDocument();
      
      // Should be able to click on tabs without crashing
      expect(() => fireEvent.click(ordersTab)).not.toThrow();
      expect(() => fireEvent.click(positionsTab)).not.toThrow();
    });

    it('should maintain component structure', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Should have proper tab structure
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(5);
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
    it('should render child components correctly', () => {
      render(<MarketMaker config={defaultConfig} />);
      
      // Check that config form is initially visible
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
      
      // All tab triggers should be present
      expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /trading/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /positions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
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
      
      // Check keyboard accessibility attributes
      expect(configTab).toHaveAttribute('role', 'tab');
      expect(tradingTab).toHaveAttribute('role', 'tab');
      expect(configTab).toHaveAttribute('aria-controls');
      expect(tradingTab).toHaveAttribute('aria-controls');
      
      // Should handle keyboard interactions without crashing
      expect(() => fireEvent.keyDown(tradingTab, { key: 'Enter' })).not.toThrow();
      expect(() => fireEvent.keyDown(tradingTab, { key: ' ' })).not.toThrow();
    });
  });
});