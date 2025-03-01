import { HyperliquidService } from "./hyperliquidService";
import {
  analyzeCandles,
  detectCandlestickPatterns,
  generateSignals,
  analyzeVolumeProfile,
} from "../utils/technicalAnalysis";
import { Config } from "../config";

export class MarketMakerStrategy {
  private hyperliquidService: HyperliquidService;
  private config: Config;
  private isRunning: boolean = false;
  private activeOrders: Map<string, any[]> = new Map();
  private lastPrices: Map<string, number> = new Map();
  private updateIntervalId: NodeJS.Timeout | null = null;
  private orderRefreshIntervalId: NodeJS.Timeout | null = null;
  private lastAnalysisTime: Map<string, number> = new Map();
  private cachedAnalysis: Map<string, any> = new Map();
  private cachedPatterns: Map<string, string[]> = new Map();
  private cachedVolumeProfile: Map<string, any> = new Map();
  private orderIds: Map<string, string[]> = new Map();
  private lastOrderUpdate: Map<string, number> = new Map();

  constructor(hyperliquidService: HyperliquidService, config: Config) {
    this.hyperliquidService = hyperliquidService;
    this.config = config;
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

      // Set up interval for regular market analysis (less frequent)
      this.updateIntervalId = setInterval(
        () => this.performMarketAnalysis(),
        this.config.updateInterval * 10
      );

      // Set up interval for high-frequency order updates
      this.orderRefreshIntervalId = setInterval(
        () => this.updateOrders(),
        this.config.orderRefreshRate
      );

      console.log("Market maker strategy started successfully");
    } catch (error) {
      console.error("Error starting market maker strategy:", error);
      this.isRunning = false;
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
      throw error;
    }
  }

  // Perform market analysis (less frequent than order updates)
  private async performMarketAnalysis(): Promise<void> {
    try {
      const startTime = Date.now();

      // Get available coins from the API to ensure we only process valid coins
      const availableCoins = await this.hyperliquidService.getAvailableCoins();
      const validTradingPairs = this.config.tradingPairs.filter(pair =>
        availableCoins.includes(pair)
      );

      for (const coin of validTradingPairs) {
        // Get candles for technical analysis
        const candles = await this.hyperliquidService.getCandles(coin, 100);

        if (candles.length === 0) {
          console.log(`No candle data for ${coin}, skipping analysis`);
          continue;
        }

        // Perform technical analysis
        const analysis = analyzeCandles(candles);
        const patterns = detectCandlestickPatterns(candles);
        const volumeProfile = analyzeVolumeProfile(
          candles,
          this.config.orderLevels * 2
        );

        // Cache the results
        this.cachedAnalysis.set(coin, analysis);
        this.cachedPatterns.set(coin, patterns);
        this.cachedVolumeProfile.set(coin, volumeProfile);
        this.lastAnalysisTime.set(coin, Date.now());

        console.log(`Market analysis completed for ${coin}`);
      }

      const executionTime = Date.now() - startTime;
      console.log(`Market analysis completed in ${executionTime}ms`);
    } catch (error) {
      console.error("Error performing market analysis:", error);
    }
  }

  // Update orders based on current market conditions (high frequency)
  private async updateOrders(): Promise<void> {
    try {
      const startTime = Date.now();

      // Get available coins from the API to ensure we only process valid coins
      const availableCoins = await this.hyperliquidService.getAvailableCoins();
      const validTradingPairs = this.config.tradingPairs.filter(pair =>
        availableCoins.includes(pair)
      );

      for (const coin of validTradingPairs) {
        // Skip if we've updated orders for this coin very recently
        const lastUpdate = this.lastOrderUpdate.get(coin) || 0;
        if (Date.now() - lastUpdate < this.config.orderRefreshRate * 0.8) {
          continue;
        }

        // Get current order book
        const orderBook = await this.hyperliquidService.getOrderBook(coin);

        if (!orderBook || !orderBook.bids || !orderBook.asks) {
          console.log(`Invalid order book format for ${coin}, skipping update`);
          continue;
        }

        // Calculate mid price
        const bestBid = parseFloat(orderBook.bids[0]?.p || "0");
        const bestAsk = parseFloat(orderBook.asks[0]?.p || "0");

        // Skip if we don't have valid bid/ask prices
        if (bestBid === 0 || bestAsk === 0) {
          console.log(`Invalid bid/ask prices for ${coin}, skipping update`);
          continue;
        }

        const midPrice = (bestBid + bestAsk) / 2;
        this.lastPrices.set(coin, midPrice);

        // Get cached analysis results
        const analysis = this.cachedAnalysis.get(coin);
        const patterns = this.cachedPatterns.get(coin) || [];
        const volumeProfile = this.cachedVolumeProfile.get(coin);

        // Skip if we don't have analysis data
        if (!analysis || !volumeProfile) {
          console.log(`No analysis data for ${coin}, skipping order update`);
          continue;
        }

        // Generate trading signal
        const signal = generateSignals(analysis, patterns);

        // Cancel existing orders for this coin
        if (typeof this.hyperliquidService.cancelAllOrders === "function") {
          await this.hyperliquidService.cancelAllOrders(coin);
        }

        // Calculate base spread based on volatility and signal
        const baseSpread = this.calculateDynamicSpread(
          coin,
          analysis,
          signal.confidence
        );

        // Place multiple orders at different price levels
        await this.placeMultiLevelOrders(
          coin,
          midPrice,
          baseSpread,
          volumeProfile,
          signal
        );

        // Update last order update time
        this.lastOrderUpdate.set(coin, Date.now());
      }

      const executionTime = Date.now() - startTime;
      if (executionTime > this.config.orderRefreshRate * 0.8) {
        console.warn(
          `Order update execution time (${executionTime}ms) is approaching the refresh rate (${this.config.orderRefreshRate}ms)`
        );
      }
    } catch (error) {
      console.error("Error updating orders:", error);
    }
  }

  // Place multiple orders at different price levels
  private async placeMultiLevelOrders(
    coin: string,
    midPrice: number,
    baseSpread: number,
    volumeProfile: any,
    signal: any
  ): Promise<void> {
    try {
      const orderPromises: Promise<any>[] = [];
      const highVolumeLevels = volumeProfile.highVolumeLevels || [];
      const vwap = volumeProfile.volumeWeightedAvgPrice || midPrice;

      // Determine if we should skew orders based on signal
      // Increase skew factor for stronger signals to be more responsive
      const signalSkew =
        signal.signal === "buy"
          ? Math.min(0.5, 0.3 + signal.confidence / 200) // Up to 0.5 for strong buy signals
          : signal.signal === "sell"
          ? Math.max(-0.5, -0.3 - signal.confidence / 200) // Down to -0.5 for strong sell signals
          : 0;

      // NEW: Check for breakout/breakdown in price action
      const isBreakout = signal.reasons.some((r: string) =>
        r.includes("breakout")
      );
      const isBreakdown = signal.reasons.some((r: string) =>
        r.includes("breakdown")
      );

      // NEW: Check for strong momentum
      const hasStrongMomentum = signal.reasons.some((r: string) =>
        r.includes("momentum")
      );

      // Calculate base order size
      const baseOrderSize = await this.calculateOrderSize(
        coin,
        midPrice,
        signal
      );
      if (baseOrderSize <= 0) {
        console.log(`Invalid order size for ${coin}, skipping order placement`);
        return;
      }

      // Get minimum order size for this coin
      const minOrderSize = this.hyperliquidService.getMinimumSize(coin);
      console.log(`Minimum order size for ${coin}: ${minOrderSize}`);

      // NEW: Determine order level distribution based on market conditions
      let orderLevels = this.config.orderLevels;
      let orderSpacing = this.config.orderSpacing;

      // During breakouts/breakdowns, concentrate orders closer to market price
      if (isBreakout || isBreakdown || hasStrongMomentum) {
        // Reduce number of levels and tighten spacing during strong directional moves
        orderLevels = Math.max(2, Math.floor(orderLevels * 0.7));
        orderSpacing = orderSpacing * 0.8;
        console.log(
          `Detected strong directional move for ${coin}, concentrating orders closer to market`
        );
      }

      // Place orders at multiple levels
      for (let i = 0; i < orderLevels; i++) {
        // Calculate spread for this level (increases with distance from mid price)
        const levelMultiplier = 1 + i * orderSpacing;

        // Calculate buy price - adjust based on volume profile if enabled
        let buySpread = baseSpread * levelMultiplier;
        let buyPrice = midPrice * (1 - buySpread / 100);

        // Adjust buy price towards high volume levels if enabled
        if (this.config.volumeBasedPricing && highVolumeLevels.length > i) {
          const volumeLevel = highVolumeLevels[i].price;
          // Weight between VWAP-based price and volume-based price
          if (volumeLevel < vwap) {
            // Increase weight during breakouts for more aggressive entries
            const weight =
              (this.config.aggressiveness / 10) * (isBreakout ? 1.3 : 1.0);
            buyPrice = buyPrice * (1 - weight) + volumeLevel * weight;
          }
        }

        // Adjust for signal skew (more buy orders if bullish)
        const buySkewMultiplier =
          1 + (signalSkew * (orderLevels - i)) / orderLevels;

        // Calculate sell price - adjust based on volume profile if enabled
        let sellSpread = baseSpread * levelMultiplier;
        let sellPrice = midPrice * (1 + sellSpread / 100);

        // Adjust sell price towards high volume levels if enabled
        if (
          this.config.volumeBasedPricing &&
          highVolumeLevels.length > i + orderLevels
        ) {
          const volumeLevel = highVolumeLevels[i + orderLevels].price;
          // Weight between VWAP-based price and volume-based price
          if (volumeLevel > vwap) {
            // Increase weight during breakdowns for more aggressive entries
            const weight =
              (this.config.aggressiveness / 10) * (isBreakdown ? 1.3 : 1.0);
            sellPrice = sellPrice * (1 - weight) + volumeLevel * weight;
          }
        }

        // Adjust for signal skew (more sell orders if bearish)
        const sellSkewMultiplier =
          1 - (signalSkew * (orderLevels - i)) / orderLevels;

        // NEW: Adjust size distribution based on market conditions
        let sizeMultiplier;

        if (isBreakout || isBreakdown || hasStrongMomentum) {
          // During strong directional moves, concentrate more size in first few levels
          sizeMultiplier = 1 - i * 0.25; // Steeper reduction (25% per level vs 15%)
        } else {
          // Normal market conditions
          sizeMultiplier = 1 - i * 0.15; // Standard 15% reduction per level
        }

        // Apply signal-based size adjustments
        let buySize = baseOrderSize * sizeMultiplier * buySkewMultiplier;
        let sellSize = baseOrderSize * sizeMultiplier * sellSkewMultiplier;

        // Ensure sizes meet minimum requirements
        if (buySize < minOrderSize) {
          // If calculated size is too small, either use minimum size or skip
          if (i < 2) {
            // Only use minimum size for the first 2 levels
            buySize = minOrderSize;
          } else {
            buySize = 0; // Skip this order
          }
        }

        if (sellSize < minOrderSize) {
          // If calculated size is too small, either use minimum size or skip
          if (i < 2) {
            // Only use minimum size for the first 2 levels
            sellSize = minOrderSize;
          } else {
            sellSize = 0; // Skip this order
          }
        }

        // Place buy order if size is valid
        if (buySize >= minOrderSize) {
          orderPromises.push(
            this.hyperliquidService.placeLimitOrder(
              coin,
              "buy",
              buyPrice,
              buySize
            )
          );
        }

        // Place sell order if size is valid
        if (sellSize >= minOrderSize) {
          orderPromises.push(
            this.hyperliquidService.placeLimitOrder(
              coin,
              "sell",
              sellPrice,
              sellSize
            )
          );
        }
      }

      // Wait for all orders to be placed
      await Promise.all(orderPromises);
      console.log(`Placed ${orderPromises.length} orders for ${coin}`);
    } catch (error) {
      console.error(`Error placing multi-level orders for ${coin}:`, error);
    }
  }

  // Calculate dynamic spread based on market conditions
  private calculateDynamicSpread(
    coin: string,
    analysis: any,
    signalConfidence: number
  ): number {
    // Start with the base spread from config
    let spread = (this.config.maxSpread + this.config.minSpread) / 2;

    // Adjust based on RSI (higher RSI = higher sell spread, lower RSI = higher buy spread)
    if (analysis.rsi !== null) {
      if (analysis.rsi > 70) {
        // Market might be overbought, increase spread for protection
        spread += 0.2; // Increased from 0.1 for more responsiveness
      } else if (analysis.rsi < 30) {
        // Market might be oversold, increase spread for protection
        spread += 0.2; // Increased from 0.1 for more responsiveness
      }
    }

    // Adjust based on Bollinger Bands width (volatility)
    if (
      analysis.bollingerBands.upper !== null &&
      analysis.bollingerBands.lower !== null &&
      analysis.bollingerBands.middle !== null
    ) {
      const bbWidth =
        (analysis.bollingerBands.upper - analysis.bollingerBands.lower) /
        analysis.bollingerBands.middle;

      // Higher volatility = wider spread
      spread += bbWidth * 0.7; // Increased from 0.5 for more responsiveness to volatility
    }

    // NEW: Adjust based on short-term EMAs
    if (
      analysis.ema &&
      analysis.ema.veryShort !== null &&
      analysis.ema.short !== null
    ) {
      const emaDiff =
        Math.abs(analysis.ema.veryShort - analysis.ema.short) /
        analysis.ema.short;

      // If EMAs are diverging rapidly, increase spread to account for short-term volatility
      if (emaDiff > 0.005) {
        // 0.5% difference
        spread += emaDiff * 10; // Add up to 5% to spread for significant EMA divergence
      }
    }

    // NEW: Adjust based on momentum
    if (analysis.momentum !== null) {
      const absMomentum = Math.abs(analysis.momentum);

      // Higher momentum (in either direction) = slightly tighter spreads to capture movement
      if (absMomentum > 3.0) {
        spread -= 0.1; // Reduce spread slightly to capture momentum
      } else if (absMomentum < 0.5) {
        // Very low momentum = wider spreads due to potential range-bound conditions
        spread += 0.1;
      }
    }

    // NEW: Adjust for breakouts/breakdowns
    if (
      analysis.priceAction &&
      (analysis.priceAction.isBreakout || analysis.priceAction.isBreakdown)
    ) {
      // During breakouts/breakdowns, reduce spread to capture the move
      spread -= 0.15;
    }

    // Adjust based on signal confidence
    spread -= signalConfidence / 150; // Increased from 200 for more responsiveness to strong signals

    // Adjust based on aggressiveness setting
    spread *= (10 - this.config.aggressiveness) / 10;

    // Ensure spread is within configured limits
    spread = Math.max(
      this.config.minSpread,
      Math.min(this.config.maxSpread, spread)
    );

    return spread;
  }

  // Calculate order size based on account balance, risk, and signal
  private async calculateOrderSize(
    coin: string,
    price: number,
    signal: any
  ): Promise<number> {
    try {
      console.log(`
=== STRATEGY ORDER SIZE CALCULATION ===
Coin: ${coin}
Price: $${price}
Risk Percentage: ${this.config.riskPercentage}%
Leverage: ${this.config.leverage}x
Signal: ${signal.signal || "neutral"} (Confidence: ${signal.confidence || 0}%)
`);

      // Base size calculation with leverage
      const baseSize = parseFloat(
        await this.hyperliquidService.calculateOrderSize(
          coin,
          price,
          this.config.riskPercentage,
          this.config.leverage // Pass leverage from config
        )
      );

      // Adjust size based on signal confidence and direction
      let adjustedSize = baseSize;
      let signalAdjustment = 1;

      if (signal.signal === "buy") {
        // Increase buy size, decrease sell size
        signalAdjustment = 1 + signal.confidence / 100;
        adjustedSize *= signalAdjustment;
      } else if (signal.signal === "sell") {
        // Decrease buy size, increase sell size
        signalAdjustment = 1 - signal.confidence / 100;
        adjustedSize *= signalAdjustment;
      }

      // Adjust based on aggressiveness setting
      const aggressivenessMultiplier = 1 + this.config.aggressiveness / 20;
      adjustedSize *= aggressivenessMultiplier;

      // Get minimum order size for this coin
      const minSize = this.hyperliquidService.getMinimumSize(coin);

      // Ensure minimum order size
      const finalSize = Math.max(minSize, adjustedSize);

      console.log(`
Base Size: ${baseSize} ${coin}
Signal Adjustment: ${signalAdjustment.toFixed(2)}x
Aggressiveness Adjustment: ${aggressivenessMultiplier.toFixed(2)}x
Adjusted Size: ${adjustedSize} ${coin}
Minimum Size: ${minSize} ${coin}
Final Size: ${finalSize} ${coin}
USD Value: $${(finalSize * price).toFixed(2)}
=================================================
`);

      return finalSize;
    } catch (error) {
      console.error("Error calculating order size:", error);
      return 0;
    }
  }

  // Get current strategy status
  getStatus(): {
    isRunning: boolean;
    activePairs: string[];
    lastPrices: Map<string, number>;
    orderCount: number;
  } {
    // Count total active orders
    let orderCount = 0;
    this.activeOrders.forEach(orders => {
      orderCount += orders.length;
    });

    return {
      isRunning: this.isRunning,
      activePairs: this.config.tradingPairs,
      lastPrices: this.lastPrices,
      orderCount: orderCount,
    };
  }
}
