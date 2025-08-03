import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('MarketMaker Component (Real Components)', () => {
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

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<MarketMaker config={mockConfig} />);
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });

    it('should render all main tabs', () => {
      render(<MarketMaker config={mockConfig} />);
      
      expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /trading/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /positions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
    });

    it('should start with configuration tab active', () => {
      render(<MarketMaker config={mockConfig} />);
      
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      expect(configTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Service Initialization', () => {
    it('should initialize HyperliquidService when none is provided', async () => {
      const MockedHyperliquidService = HyperliquidService as jest.MockedClass<typeof HyperliquidService>;
      MockedHyperliquidService.mockClear();

      render(<MarketMaker config={mockConfig} />);
      
      await waitFor(() => {
        expect(HyperliquidService).toHaveBeenCalledWith(mockConfig);
      });
    });

    it('should not reinitialize service when one is provided', () => {
      const MockedHyperliquidService = HyperliquidService as jest.MockedClass<typeof HyperliquidService>;
      MockedHyperliquidService.mockClear();

      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      expect(HyperliquidService).not.toHaveBeenCalled();
    });

    it('should fetch available coins when service is initialized', async () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      await waitFor(() => {
        expect(mockHyperliquidService.getAvailableCoins).toHaveBeenCalled();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should have all required tabs present', () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Check that all tabs are present
      expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /trading/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /positions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
    });

    it('should show configuration content by default', () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);

      // Configuration tab should be active by default
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      expect(configTab).toHaveAttribute('aria-selected', 'true');
      
      // Should show config form content
      expect(screen.getByText('Configure your market maker settings')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle service initialization errors gracefully', () => {
      const MockedHyperliquidService = HyperliquidService as jest.MockedClass<typeof HyperliquidService>;
      MockedHyperliquidService.mockImplementation(() => {
        throw new Error('Failed to initialize service');
      });

      expect(() => {
        render(<MarketMaker config={mockConfig} />);
      }).not.toThrow();
      
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
    });
  });

  describe('Real Component Integration', () => {
    it('should render real ConfigForm component', () => {
      render(<MarketMaker config={mockConfig} />);
      
      // Check for real ConfigForm elements without ambiguous text
      expect(screen.getByText('Configure your market maker settings')).toBeInTheDocument();
      expect(screen.getByText('Wallet Connection')).toBeInTheDocument();
    });

    it('should render configuration form fields', () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      // Check for actual form fields
      expect(screen.getByLabelText(/trading amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max spread/i)).toBeInTheDocument();
      expect(screen.getByText('Save Configuration')).toBeInTheDocument();
    });

    it('should show wallet connection component', () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      expect(screen.getByText('Wallet Connection')).toBeInTheDocument();
      expect(screen.getByText(/connect your wallet to hyperliquid/i)).toBeInTheDocument();
    });
  });

  describe('Component Stability', () => {
    it('should remain stable during normal operations', () => {
      render(<MarketMaker config={mockConfig} hyperliquidService={mockHyperliquidService} />);
      
      // Component should render without issues
      expect(screen.getByText('Hyperliquid Market Maker')).toBeInTheDocument();
      
      // Tabs should be present and functional
      const configTab = screen.getByRole('tab', { name: /configuration/i });
      expect(configTab).toHaveAttribute('aria-selected', 'true');
      
      // Should show expected content
      expect(screen.getByText('Configure your market maker settings')).toBeInTheDocument();
    });
  });
});