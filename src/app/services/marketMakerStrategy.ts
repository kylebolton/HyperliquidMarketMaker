import { HyperliquidService } from "./hyperliquid/compatibility";
import {
  analyzeCandles,
  detectCandlestickPatterns,
  analyzeVolumeProfile,
  AnalysisResult,
} from "../utils/technicalAnalysis";
import {
  analyzeMarketConditions,
  determineOptimalPriceLevels,
  determineOptimalOrderSizes,
  MarketCondition,
} from "../utils/marketAnalysis";
import { Config } from "../config";
import EventEmitter from "events";

// Define interfaces for order and analysis data
interface Order {
  coin: string;
  side: string;
  price: string;
  size: string;
  orderId: string;
  timestamp: number;
  [key: string]: unknown;
}

interface VolumeProfile {
  highVolumeLevels: { price: number; volume: number }[];
  volumeWeightedAvgPrice: number;
}

// Define the strategy configuration interface
export interface MarketMakerConfig {
  coins: string[];
  spreadPercentage: number;
  orderSizeUsd: number;
  maxOrdersPerSide: number;
  priceDeviationThreshold: number;
  updateIntervalMs: number;
  enableMomentumStrategy: boolean;
  momentumLookbackPeriods: number;
  momentumThreshold: number;
  riskPercentage: number;
}

export class MarketMakerStrategy {
  private hyperliquidService: HyperliquidService;
  private config: Config;
  private isRunning: boolean = false;
  private activeOrders: Map<string, Order[]> = new Map();
  private lastPrices: Map<string, number> = new Map();
  private updateIntervalId: NodeJS.Timeout | null = null;
  private orderRefreshIntervalId: NodeJS.Timeout | null = null;
  private lastAnalysisTime: Map<string, number> = new Map();
  private cachedAnalysis: Map<string, AnalysisResult> = new Map();
  private cachedPatterns: Map<string, string[]> = new Map();
  private cachedVolumeProfile: Map<string, VolumeProfile> = new Map();
  private orderIds: Map<string, string[]> = new Map();
  private lastOrderUpdate: Map<string, number> = new Map();
  private eventEmitter: EventEmitter = new EventEmitter();
  // Add new properties for enhanced market analysis
  private marketConditions: Map<string, MarketCondition> = new Map();
  private emaHistory: Map<
    string,
    { short: number[]; medium: number[]; long: number[] }
  > = new Map();
  private rsiHistory: Map<string, number[]> = new Map();
  private volatilityMetrics: Map<string, number> = new Map();

  constructor(hyperliquidService: HyperliquidService, config: Config) {
    this.hyperliquidService = hyperliquidService;
    this.config = config;
  }

  // Add event listener methods
  public on(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  public off(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  // Helper method to safely emit errors
  private emitError(errorMessage: string | Error): void {
    // Ensure errorMessage is a string
    const errorStr =
      typeof errorMessage === "string"
        ? errorMessage
        : errorMessage?.message || String(errorMessage) || "Unknown error";

    this.eventEmitter.emit("error", errorStr);
  }

  // Start the market maker strategy
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Market maker strategy is already running");
      return;
    }

    try {
      console.log("Starting market maker strategy...");
      this.isRunning = true;

      // Get available coins from the API
      const availableCoins = await this.hyperliquidService.getAvailableCoins();
      console.log("Available coins:", availableCoins);

      // Filter trading pairs to only include available coins
      const validTradingPairs = this.config.tradingPairs.filter(pair =>
        availableCoins.includes(pair)
      );

      if (validTradingPairs.length === 0) {
        console.warn(
          "No valid trading pairs found. Please check your configuration."
        );
        console.warn("Available coins:", availableCoins);
        console.warn("Configured pairs:", this.config.tradingPairs);
        this.isRunning = false;
        return;
      }

      console.log("Valid trading pairs:", validTradingPairs);

      // Initialize WebSockets for real-time data with valid pairs if the method exists
      if (typeof this.hyperliquidService.initializeWebSockets === "function") {
        await this.hyperliquidService.initializeWebSockets(validTradingPairs);
      } else {
        console.log(
          "WebSocket initialization not available, continuing without real-time updates"
        );
      }

      // Initial market analysis
      await this.performMarketAnalysis();

      // Initial update of orders
      await this.updateOrders();

      // Set up interval for regular market analysis
      const marketAnalysisInterval = this.config.updateInterval * 10;
      console.log(
        `Setting market analysis interval to ${marketAnalysisInterval}ms`
      );
      this.updateIntervalId = setInterval(
        () => this.performMarketAnalysis(),
        marketAnalysisInterval
      );

      // Set up interval for order updates
      const orderRefreshInterval = this.config.orderRefreshRate;
      console.log(
        `Setting order refresh interval to ${orderRefreshInterval}ms`
      );
      this.orderRefreshIntervalId = setInterval(
        () => this.updateOrders(),
        orderRefreshInterval
      );

      console.log("Market maker strategy started successfully");
    } catch (error) {
      console.error("Error starting market maker strategy:", error);
      this.isRunning = false;
      this.emitError(`Error starting market maker strategy: ${error}`);
      throw error;
    }
  }

  // Stop the market maker strategy
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log("Market maker strategy is not running");
      return;
    }

    try {
      console.log("Stopping market maker strategy...");

      // Clear the update intervals
      if (this.updateIntervalId) {
        clearInterval(this.updateIntervalId);
        this.updateIntervalId = null;
      }

      if (this.orderRefreshIntervalId) {
        clearInterval(this.orderRefreshIntervalId);
        this.orderRefreshIntervalId = null;
      }

      // Cancel all active orders if the method exists
      if (typeof this.hyperliquidService.cancelAllOrders === "function") {
        for (const coin of this.config.tradingPairs) {
          await this.hyperliquidService.cancelAllOrders(coin);
        }
      } else {
        console.log("Cancel all orders method not available");
      }

      // Close WebSocket connections if the method exists
      if (typeof this.hyperliquidService.closeWebSockets === "function") {
        await this.hyperliquidService.closeWebSockets();
      } else {
        console.log("Close WebSockets method not available");
      }

      this.isRunning = false;
      console.log("Market maker strategy stopped successfully");
    } catch (error) {
      console.error("Error stopping market maker strategy:", error);
      this.emitError(`Error stopping market maker strategy: ${error}`);
      throw error;
    }
  }

  // Perform market analysis for all trading pairs
  private async performMarketAnalysis(): Promise<void> {
    try {
      const validPairs = this.config.tradingPairs.filter(
        pair => pair && pair.trim().length > 0
      );

      for (const coin of validPairs) {
        await this.analyzeCoin(coin);
      }
    } catch (error) {
      console.error("Error performing market analysis:", error);
      this.emitError(`Error performing market analysis: ${error}`);
    }
  }

  // Analyze a specific coin
  private async analyzeCoin(coin: string): Promise<void> {
    try {
      console.log(`Analyzing ${coin}...`);

      // Get candle data
      const candles = await this.hyperliquidService.getCandles(coin, 100);
      if (!candles || candles.length === 0) {
        console.warn(`No candle data available for ${coin}`);
        return;
      }

      // Perform technical analysis
      const analysis = analyzeCandles(candles);
      this.cachedAnalysis.set(coin, analysis);

      // Detect candlestick patterns
      const patterns = detectCandlestickPatterns(candles);
      this.cachedPatterns.set(coin, patterns);

      // Analyze volume profile
      const volumeProfile = analyzeVolumeProfile(candles);
      this.cachedVolumeProfile.set(coin, volumeProfile);

      // Determine market conditions
      const currentPrice = candles[candles.length - 1].c;
      const marketCondition = analyzeMarketConditions(
        candles,
        currentPrice,
        this.emaHistory.get(coin) || { short: [], medium: [], long: [] }
      );
      this.marketConditions.set(coin, marketCondition);

      // Update EMA history
      if (analysis.ema.veryShort !== null && analysis.ema.short !== null) {
        const emaHistory = this.emaHistory.get(coin) || {
          short: [],
          medium: [],
          long: [],
        };
        emaHistory.short.push(analysis.ema.short);
        if (emaHistory.short.length > 50) emaHistory.short.shift();

        if (analysis.sma.medium !== null) {
          emaHistory.medium.push(analysis.sma.medium);
          if (emaHistory.medium.length > 50) emaHistory.medium.shift();
        }

        if (analysis.sma.long !== null) {
          emaHistory.long.push(analysis.sma.long);
          if (emaHistory.long.length > 50) emaHistory.long.shift();
        }

        this.emaHistory.set(coin, emaHistory);
      }

      // Update RSI history
      if (analysis.rsi !== null) {
        const rsiHistory = this.rsiHistory.get(coin) || [];
        rsiHistory.push(analysis.rsi);
        if (rsiHistory.length > 14) rsiHistory.shift();
        this.rsiHistory.set(coin, rsiHistory);
      }

      // Calculate volatility metrics
      if (candles.length >= 2) {
        const prices = candles.map(c => c.c);
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
          returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        const volatility =
          Math.sqrt(
            returns.reduce((sum, r) => sum + r * r, 0) / returns.length
          ) * Math.sqrt(24); // Annualized volatility for hourly data
        this.volatilityMetrics.set(coin, volatility);
      }

      // Store current price
      if (candles.length > 0) {
        this.lastPrices.set(coin, candles[candles.length - 1].c);
      }

      // Update last analysis time
      this.lastAnalysisTime.set(coin, Date.now());

      console.log(`Analysis complete for ${coin}`);
    } catch (error) {
      console.error(`Error analyzing ${coin}:`, error);
      this.emitError(`Error analyzing ${coin}: ${error}`);
    }
  }

  // Update orders for all coins
  private async updateOrders(): Promise<void> {
    try {
      const validPairs = this.config.tradingPairs.filter(
        pair => pair && pair.trim().length > 0
      );

      for (const coin of validPairs) {
        await this.updateOrdersForCoin(coin);
      }
    } catch (error) {
      console.error("Error updating orders:", error);
      this.emitError(`Error updating orders: ${error}`);
    }
  }

  // Update orders for a specific coin
  private async updateOrdersForCoin(coin: string): Promise<void> {
    try {
      // Get current mid price
      const midPrice = this.lastPrices.get(coin);
      if (!midPrice || midPrice <= 0) {
        console.log(`No valid price data for ${coin}, skipping update`);
        return;
      }

      // Get market condition
      let marketCondition = this.marketConditions.get(coin);

      // If we don't have market condition or it's too old, perform a quick analysis
      const now = Date.now();
      const lastAnalysisTime = this.lastAnalysisTime.get(coin) || 0;
      const analysisAge = now - lastAnalysisTime;
      const maxAnalysisAge = this.config.updateInterval * 5; // 5x update interval

      if (!marketCondition || analysisAge > maxAnalysisAge) {
        await this.analyzeCoin(coin);
        marketCondition = this.marketConditions.get(coin);

        if (!marketCondition) {
          console.log(`No market condition data for ${coin}, skipping update`);
          return;
        }
      }

      // Cancel existing orders if needed
      await this.cancelExistingOrdersIfNeeded(coin, midPrice);

      // Get existing orders to avoid duplicates
      const openOrders = await this.hyperliquidService.getOpenOrders();
      const existingOrders = (openOrders as Order[]).filter(
        (order: Order) => order.coin === coin
      );

      // Count existing buy and sell orders
      const existingBuyOrders = existingOrders.filter(
        (order: Order) => order.side === "B"
      );
      const existingSellOrders = existingOrders.filter(
        (order: Order) => order.side === "A"
      );

      // Determine if we need to place new orders
      const targetOrdersPerSide = this.config.orderLevels;
      const needsNewBuyOrders = existingBuyOrders.length < targetOrdersPerSide;
      const needsNewSellOrders =
        existingSellOrders.length < targetOrdersPerSide;

      if (!needsNewBuyOrders && !needsNewSellOrders) {
        return; // We have enough orders on both sides
      }

      // Calculate base spread
      const baseSpread = this.calculateDynamicSpread(coin, marketCondition);

      // Determine optimal price levels
      const { buyPrices, sellPrices } = determineOptimalPriceLevels(
        midPrice,
        marketCondition,
        baseSpread,
        targetOrdersPerSide,
        this.config.orderSpacing
      );

      // Validate price levels
      if (
        !buyPrices ||
        !sellPrices ||
        buyPrices.length === 0 ||
        sellPrices.length === 0
      ) {
        console.error(`Failed to determine price levels for ${coin}`);
        return;
      }

      // Calculate base order size
      const baseOrderSize = await this.calculateBaseOrderSize(coin, midPrice);

      // Validate base order size
      if (isNaN(baseOrderSize) || baseOrderSize <= 0) {
        console.error(`Invalid base order size for ${coin}: ${baseOrderSize}`);
        return;
      }

      // Determine optimal order sizes
      const { buySizes, sellSizes } = determineOptimalOrderSizes(
        baseOrderSize,
        marketCondition,
        targetOrdersPerSide,
        this.config.maxPositionSize
      );

      // Validate order sizes
      if (
        !buySizes ||
        !sellSizes ||
        buySizes.length === 0 ||
        sellSizes.length === 0
      ) {
        console.error(`Failed to determine order sizes for ${coin}`);
        return;
      }

      // Place buy orders if needed
      if (needsNewBuyOrders) {
        for (let i = 0; i < buyPrices.length; i++) {
          // Skip if we already have enough buy orders
          if (existingBuyOrders.length + i >= targetOrdersPerSide) {
            break;
          }

          const price = buyPrices[i];
          const size = buySizes[i];

          // Additional validation
          if (isNaN(price) || price <= 0) {
            console.error(`Invalid buy price for ${coin}: ${price}`);
            continue;
          }

          if (isNaN(size) || size <= 0) {
            console.error(`Invalid buy size for ${coin}: ${size}`);
            continue;
          }

          // Check if price is too far from market price
          const priceDeviation = Math.abs(price - midPrice) / midPrice;
          if (priceDeviation > 0.5) {
            console.error(
              `Buy price ${price} for ${coin} is too far from mid price ${midPrice}`
            );
            continue;
          }

          // Check if we already have an order at this price
          const hasExistingOrder = existingBuyOrders.some(
            (order: Order) =>
              Math.abs(parseFloat(order.price) - price) / price < 0.001
          );

          if (!hasExistingOrder) {
            await this.placeSingleOrder(coin, "B", price, size);
          }
        }
      }

      // Place sell orders if needed
      if (needsNewSellOrders) {
        for (let i = 0; i < sellPrices.length; i++) {
          // Skip if we already have enough sell orders
          if (existingSellOrders.length + i >= targetOrdersPerSide) {
            break;
          }

          const price = sellPrices[i];
          const size = sellSizes[i];

          // Additional validation
          if (isNaN(price) || price <= 0) {
            console.error(`Invalid sell price for ${coin}: ${price}`);
            continue;
          }

          if (isNaN(size) || size <= 0) {
            console.error(`Invalid sell size for ${coin}: ${size}`);
            continue;
          }

          // Check if price is too far from market price
          const priceDeviation = Math.abs(price - midPrice) / midPrice;
          if (priceDeviation > 0.5) {
            console.error(
              `Sell price ${price} for ${coin} is too far from mid price ${midPrice}`
            );
            continue;
          }

          // Check if we already have an order at this price
          const hasExistingOrder = existingSellOrders.some(
            (order: Order) =>
              Math.abs(parseFloat(order.price) - price) / price < 0.001
          );

          if (!hasExistingOrder) {
            await this.placeSingleOrder(coin, "A", price, size);
          }
        }
      }

      // Update last order update time
      this.lastOrderUpdate.set(coin, Date.now());
    } catch (error) {
      console.error(`Error updating orders for ${coin}:`, error);
      this.emitError(`Failed to update orders for ${coin}: ${error}`);
    }
  }

  // Place a single order
  private async placeSingleOrder(
    coin: string,
    side: "B" | "A",
    price: number,
    size: number
  ): Promise<void> {
    try {
      // Validate price and size
      if (price <= 0) {
        console.error(`Invalid price for ${coin}: ${price} (must be positive)`);
        return;
      }

      if (size <= 0) {
        console.error(`Invalid size for ${coin}: ${size} (must be positive)`);
        return;
      }

      // Get current market price to validate against
      const marketPrice = this.lastPrices.get(coin);
      if (marketPrice) {
        // Check if price is too far from market price (95% limit)
        const deviation = Math.abs(price - marketPrice) / marketPrice;
        if (deviation > 0.95) {
          console.error(
            `Price ${price} for ${coin} is too far from market price ${marketPrice} (${(
              deviation * 100
            ).toFixed(2)}% deviation)`
          );
          return;
        }
      }

      // Format size according to exchange requirements
      const minSize = this.hyperliquidService.getMinimumSize(coin);
      const baseSize = Math.max(size, minSize);

      console.log(
        `Placing ${
          side === "B" ? "buy" : "sell"
        } order for ${coin} at ${price} with size ${baseSize}`
      );

      // Place the order - service will handle price and size formatting internally
      const response = await this.hyperliquidService.placeLimitOrder(
        coin,
        side,
        price, // Pass the original price, the service will format it
        baseSize,
        false // Not reduce-only
      );

      // Store the order ID
      if (response.success && response.orderId) {
        const orderIds = this.orderIds.get(coin) || [];
        orderIds.push(response.orderId.toString());
        this.orderIds.set(coin, orderIds);
      }
    } catch (error) {
      console.error(
        `Error placing ${side === "B" ? "buy" : "sell"} order for ${coin}:`,
        error
      );
      this.emitError(`Failed to place order for ${coin}: ${error}`);
    }
  }

  // Cancel existing orders if needed
  private async cancelExistingOrdersIfNeeded(
    coin: string,
    currentPrice: number
  ): Promise<void> {
    try {
      // Get market condition
      const marketCondition = this.marketConditions.get(coin);
      if (!marketCondition) {
        return; // No market condition data, skip cancellation
      }

      // Get existing orders for this coin
      const openOrders = await this.hyperliquidService.getOpenOrders();
      const coinOrders = (openOrders as Order[]).filter(
        (order: Order) => order.coin === coin
      );

      if (coinOrders.length === 0) {
        return; // No orders to cancel
      }

      // Calculate price thresholds based on volatility
      const volatilityFactor = 1 + marketCondition.volatility;
      const upperThreshold =
        currentPrice * (1 + this.config.maxSpread * volatilityFactor);
      const lowerThreshold =
        currentPrice * (1 - this.config.maxSpread * volatilityFactor);

      // Check if any orders are outside the threshold
      const ordersToCancel = coinOrders.filter((order: Order) => {
        const orderPrice = parseFloat(order.price);
        return orderPrice > upperThreshold || orderPrice < lowerThreshold;
      });

      // Also cancel orders if market sentiment has changed significantly
      const lastSentiment = this.marketConditions.get(coin)?.sentiment;
      if (
        (lastSentiment &&
          lastSentiment !== marketCondition.sentiment &&
          lastSentiment === "bullish" &&
          marketCondition.sentiment === "bearish") ||
        (lastSentiment === "bearish" && marketCondition.sentiment === "bullish")
      ) {
        console.log(
          `Cancelling all orders for ${coin} due to significant sentiment change from ${lastSentiment} to ${marketCondition.sentiment}`
        );
        await this.hyperliquidService.cancelAllOrders(coin);
        this.orderIds.set(coin, []);
        return;
      }

      if (ordersToCancel.length > 0) {
        console.log(
          `Cancelling ${ordersToCancel.length} orders for ${coin} due to price movement`
        );
        await this.hyperliquidService.cancelAllOrders(coin);
        this.orderIds.set(coin, []);
      }
    } catch (error) {
      console.error(`Error cancelling orders for ${coin}:`, error);
      this.emitError(`Error cancelling orders for ${coin}: ${error}`);
    }
  }

  // Calculate dynamic spread based on market conditions
  private calculateDynamicSpread(
    coin: string,
    marketCondition: MarketCondition
  ): number {
    // Start with base spread from config
    let spread = (this.config.maxSpread + this.config.minSpread) / 2;

    // Adjust based on volatility
    spread *= 1 + marketCondition.volatility;

    // Adjust based on Bollinger Band width
    const bandWidth = marketCondition.technicalSignals.bollingerBands.width;
    if (bandWidth !== null) {
      // Wider bands = wider spread
      spread *= 1 + bandWidth / 100;
    }

    // Adjust based on market sentiment
    if (marketCondition.sentiment === "bullish") {
      spread *= 0.9; // Tighter spread in bullish market
    } else if (marketCondition.sentiment === "bearish") {
      spread *= 1.1; // Wider spread in bearish market
    }

    // Ensure spread is within configured limits
    spread = Math.max(
      this.config.minSpread,
      Math.min(this.config.maxSpread, spread)
    );

    return spread;
  }

  // Calculate base order size
  private async calculateBaseOrderSize(
    coin: string,
    price: number
  ): Promise<number> {
    try {
      // Get account information
      const accountInfo = await this.hyperliquidService.getAccountInfo();
      const accountSummary = accountInfo.crossMarginSummary as
        | { accountValue?: string }
        | undefined;
      const accountBalance = parseFloat(accountSummary?.accountValue || "0");

      if (accountBalance <= 0) {
        console.warn(
          "Account balance is zero or negative, using minimum order size"
        );
        return this.hyperliquidService.getMinimumSize(coin);
      }

      // Calculate base size based on risk percentage and account balance
      const riskAmount = accountBalance * (this.config.riskPercentage / 100);

      // Adjust for leverage
      const leveragedRiskAmount = riskAmount * this.config.leverage;

      // Calculate base order size in USD
      const baseOrderSizeUsd = leveragedRiskAmount / this.config.orderLevels;

      // Convert to coin units
      const baseOrderSize = baseOrderSizeUsd / price;

      // Ensure minimum size
      const minSize = this.hyperliquidService.getMinimumSize(coin);
      return Math.max(baseOrderSize, minSize);
    } catch (error) {
      console.error(`Error calculating order size for ${coin}:`, error);
      this.emitError(`Error calculating order size for ${coin}: ${error}`);
      return this.hyperliquidService.getMinimumSize(coin);
    }
  }

  // Get current strategy status
  getStatus(): {
    isRunning: boolean;
    activePairs: string[];
    lastPrices: Map<string, number>;
    orderCount: number;
  } {
    const orderCount = Array.from(this.orderIds.values()).reduce(
      (total, orders) => total + orders.length,
      0
    );

    return {
      isRunning: this.isRunning,
      activePairs: this.config.tradingPairs,
      lastPrices: new Map(this.lastPrices),
      orderCount,
    };
  }
}
