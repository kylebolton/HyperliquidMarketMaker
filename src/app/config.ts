export interface Config {
  // Wallet configuration
  walletAddress?: string; // Wallet address for account identification (optional)
  // Trading configuration
  tradingPairs: string[];
  tradingAmount: number; // Amount in USD
  maxSpread: number; // Maximum spread percentage to place orders
  minSpread: number; // Minimum spread percentage to place orders
  updateInterval: number; // Update interval in milliseconds
  candleInterval: string; // Candle interval for technical analysis
  leverage: number; // Leverage to use
  riskPercentage: number; // percentage of account balance to risk per trade
  orderLevels: number; // Number of order levels to place on each side
  orderSpacing: number; // Spacing between order levels in percentage
  volumeBasedPricing: boolean; // Whether to use volume-based pricing
  aggressiveness: number; // How aggressive to be with order placement (0-10)
  orderRefreshRate: number; // How often to refresh orders in milliseconds
  // New configuration options for enhanced trading
  enableAutomaticPricing: boolean; // Whether to use automatic price determination
  enableAutomaticSizing: boolean; // Whether to use automatic size determination
  useMarketIndicators: boolean; // Whether to use market indicators for trading decisions
  rsiPeriod: number; // Period for RSI calculation
  emaPeriods: { short: number; medium: number; long: number }; // Periods for EMA calculations
  volatilityWindow: number; // Window for volatility calculation
  maxPositionSize: number; // Maximum position size as percentage of account balance
  simultaneousPairs: boolean; // Whether to trade multiple pairs simultaneously
  // Fee configuration
  feeRecipient: string; // Address to receive trading fees
  feeBasisPoints: number; // Fee in basis points (e.g., 2 for 0.02%)
}

// Default configuration
export const defaultConfig: Config = {
  walletAddress: "", // Your wallet address (optional)
  tradingPairs: ["BTC", "ETH"], // Trading pairs
  tradingAmount: 100, // Amount in USD per order
  maxSpread: 0.5, // 0.5% maximum spread
  minSpread: 0.1, // 0.1% minimum spread
  updateInterval: 100, // 100ms update interval (reduced for high-frequency trading)
  candleInterval: "1m", // 1 minute candles
  leverage: 1, // 1x leverage
  riskPercentage: 1, // 1% of account balance per trade
  orderLevels: 5, // Place 5 orders on each side
  orderSpacing: 0.05, // 0.05% spacing between orders
  volumeBasedPricing: true, // Use volume-based pricing
  aggressiveness: 7, // Fairly aggressive (0-10 scale)
  orderRefreshRate: 500, // Refresh orders every 500ms
  // New configuration options with default values
  enableAutomaticPricing: true, // Enable automatic price determination
  enableAutomaticSizing: true, // Enable automatic size determination
  useMarketIndicators: true, // Use market indicators for trading decisions
  rsiPeriod: 14, // 14-period RSI
  emaPeriods: { short: 9, medium: 21, long: 50 }, // EMA periods
  volatilityWindow: 20, // 20-period volatility window
  maxPositionSize: 10, // Maximum position size as 10% of account balance
  simultaneousPairs: true, // Enable trading multiple pairs simultaneously
  // Fee configuration
  feeRecipient: "0x0e7FCDC85f296004Bc235cc86cfA69da2c39324a", // Address to receive trading fees
  feeBasisPoints: 2, // 2 basis points (0.02%) fee per trade
};
