import { render, screen, waitFor } from '@testing-library/react';
import { MarketMaker } from '../MarketMaker';
import { Config, defaultConfig } from '@/app/config';
import { HyperliquidService } from '@/app/services/hyperliquid/compatibility';

// Only mock the external services, not the UI components
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
    initializeWallet: jest.fn(),
  })),
}));

jest.mock('@/app/services/marketMakerStrategy', () => ({
  MarketMakerStrategy: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  })),
}));

// Mock Web3 wallet functionality to avoid browser dependencies
Object.defineProperty(window, 'ethereum', {
  value: {
    isMetaMask: true,
    request: jest.fn(),
  },
  writable: true,
});

describe('MarketMaker Integration (Real Components)', () => {
  let mockHyperliquidService: jest.Mocked<HyperliquidService>;
  let mockConfig: Config;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHyperliquidService = {
      getAvailableCoins: jest.fn().mockResolvedValue(['ETH', 'BTC', 'SOL']),
      getOrderBook: jest.fn().mockResolvedValue({
        asks: [{ p: '2050', s: '1.0' }],
        bids: [{ p: '2040', s: '1.0' }],
      }),
      placeLimitOrder: jest.fn().mockResolvedValue({ id: 'test-order-1' }),
      cancelAllOrders: jest.fn().mockResolvedValue(true),
      getAccountInfo: jest.fn().mockResolvedValue({
        crossMarginSummary: {
          accountValue: '10000',
          freeCollateral: '5000',
        },
      }),
      getTotalPnl: jest.fn().mockResolvedValue({
        totalUnrealizedPnl: 100,
        totalRealizedPnl: 50,
        positions: [],
      }),
      getOpenOrders: jest.fn().mockResolvedValue([]),
      checkWalletStatus: jest.fn().mockReturnValue({ ready: true }),
      initializeWallet: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<HyperliquidService>;

    mockConfig = {
      ...defaultConfig,
      walletAddress: '0x123...',
    };
  });

  describe('Basic Functionality', () => {
    it('should render without crashing', () => {
      render(<MarketMaker config={mockConfig} />);
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should render real components with actual content', () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      // Should show real ConfigForm content
      expect(screen.getAllByText('Configuration')).toHaveLength(2); // Tab + Card title
      expect(screen.getByText('Configure your market maker settings')).toBeInTheDocument();
      
      // Should have all tabs
      expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /trading/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /positions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
    });
  });

  describe('Service Integration', () => {
    it('should initialize HyperliquidService when none provided', async () => {
      const MockedHyperliquidService = HyperliquidService as jest.MockedClass<typeof HyperliquidService>;
      MockedHyperliquidService.mockClear();

      render(<MarketMaker config={mockConfig} />);
      
      await waitFor(() => {
        expect(HyperliquidService).toHaveBeenCalledWith(mockConfig);
      });
    });

    it('should fetch available coins with real service', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });
    });

    it('should handle service errors gracefully', async () => {
      mockHyperliquidService.getAvailableCoins.mockRejectedValue(new Error('Service error'));
      
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });

      // Component should remain stable
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });

  describe('Real Component Content', () => {
    it('should show real configuration form fields', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Real ConfigForm should have actual form fields
      expect(screen.getByLabelText(/trading amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max spread/i)).toBeInTheDocument();
      expect(screen.getByText(/save configuration/i)).toBeInTheDocument();
    });

    it('should display wallet connection component', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Real ConfigForm includes WalletConnection
      expect(screen.getByText('Wallet Connection')).toBeInTheDocument();
      expect(screen.getByText(/connect your wallet to hyperliquid/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors without crashing', () => {
      const MockedHyperliquidService = HyperliquidService as jest.MockedClass<typeof HyperliquidService>;
      MockedHyperliquidService.mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      expect(() => {
        render(<MarketMaker config={mockConfig} />);
      }).not.toThrow();
      
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('should have proper accessibility structure', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Should have proper ARIA structure
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(5);
      
      // Active tab should be properly marked
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      expect(configTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should render form elements with proper labels', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Real form should have proper labeling
      const tradingAmountInput = screen.getByLabelText(/trading amount/i);
      expect(tradingAmountInput).toHaveAttribute('type', 'number');
      
      const maxSpreadInput = screen.getByLabelText(/max spread/i);
      expect(maxSpreadInput).toHaveAttribute('type', 'number');
    });
  });
});