import { render, screen, fireEvent, act } from '@testing-library/react';
import { MarketMaker } from '../MarketMaker';
import { defaultConfig } from '@/app/config';
import { HyperliquidService } from '@/app/services/hyperliquid/compatibility';

// Minimal mocking for debugging
jest.mock('@/app/services/hyperliquid/compatibility', () => ({
  HyperliquidService: jest.fn().mockImplementation(() => ({
    getAvailableCoins: jest.fn().mockResolvedValue(['ETH']),
    getOrderBook: jest.fn().mockResolvedValue({
      asks: [{ p: '2050', s: '1.0' }],
      bids: [{ p: '2040', s: '1.0' }],
    }),
    checkWalletStatus: jest.fn().mockReturnValue({ ready: true }),
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

describe('MarketMaker Tab Debugging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should debug tab switching behavior', async () => {
    render(<MarketMaker config={defaultConfig} />);
    
    // Check initial state
    const configTab = screen.getByRole('tab', { name: /configuration/i });
    const tradingTab = screen.getByRole('tab', { name: /trading/i });
    
    console.log('Initial config tab aria-selected:', configTab.getAttribute('aria-selected'));
    console.log('Initial trading tab aria-selected:', tradingTab.getAttribute('aria-selected'));
    
    // Try clicking the trading tab
    act(() => {
      fireEvent.click(tradingTab);
    });
    
    console.log('After click config tab aria-selected:', configTab.getAttribute('aria-selected'));
    console.log('After click trading tab aria-selected:', tradingTab.getAttribute('aria-selected'));
    
    // Check if the tab content changes
    const activePanel = screen.getByRole('tabpanel');
    console.log('Active panel content:', activePanel.textContent);
  });

  it('should check actual component text content', () => {
    render(<MarketMaker config={defaultConfig} />);
    
    // Debug what text is actually in the component
    const configTab = screen.getByRole('tab', { name: /configuration/i });
    expect(configTab).toBeInTheDocument();
    
    // Check for ConfigForm content more specifically
    expect(screen.getByText('Configure your market maker settings')).toBeInTheDocument();
    
    // Check both instances of "Configuration" exist
    const configElements = screen.getAllByText('Configuration');
    expect(configElements).toHaveLength(2); // Tab title and card title
  });
});