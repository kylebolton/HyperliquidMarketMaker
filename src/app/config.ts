export interface Config {
  apiKey: string;
  apiSecret: string;
  walletAddress: string;
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
}

// Default configuration
export const defaultConfig: Config = {
  apiKey: "", // Your API key
  apiSecret: "", // Your API secret
  walletAddress: "", // Your wallet address
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
};
