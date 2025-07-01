import {
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from "@nktkas/hyperliquid";
import { Candle } from "../../utils/technicalAnalysis";
import {
  OrderBook,
  HyperliquidCandle,
  Trade,
  Subscription,
  MidPriceData,
  OrderBookLevelData,
  Metadata,
  ClearinghouseState,
} from "./types";
import { RateLimiter } from "./rateLimiter";
import { retryWithBackoff, getIntervalInSeconds } from "./utils";
import { Config } from "../../config";

export class MarketDataService {
  private infoClient: InfoClient;
  private subscriptionClient: SubscriptionClient;
  private wsTransport: WebSocketTransport;
  private config: Config;
  private rateLimiter: RateLimiter;

  // Caching properties
  private candleCache: Map<string, Candle[]> = new Map();
  private orderBookCache: Map<string, OrderBook> = new Map();
  private tradeCache: Map<string, Trade[]> = new Map();
  private activeSubscriptions: Map<string, Subscription> = new Map();
  private availableCoinsCache: string[] = [];
  private metadata: Metadata | null = null;
  private lastMetaFetch = 0;

  // Throttling properties for WebSocket events
  private lastOrderBookUpdate: Map<string, number> = new Map();
  private lastTradeUpdate: Map<string, number> = new Map();
  private lastMidPriceUpdate: number = 0;
  private orderBookThrottleMs: number = 5000; // Only update order book every 5 seconds
  private tradeThrottleMs: number = 10000; // Only update trades every 10 seconds
  private midPriceThrottleMs: number = 3000; // Only update mid prices every 3 seconds

  constructor(
    infoClient: InfoClient,
    subscriptionClient: SubscriptionClient,
    wsTransport: WebSocketTransport,
    config: Config,
    rateLimiter: RateLimiter
  ) {
    this.infoClient = infoClient;
    this.subscriptionClient = subscriptionClient;
    this.wsTransport = wsTransport;
    this.config = config;
    this.rateLimiter = rateLimiter;

    // Initialize metadata in the background
    this.initializeMetadata();
  }

  /**
   * Initialize WebSocket connections for real-time data
   */
  async initializeWebSockets(coins: string[]): Promise<void> {
    try {
      // Add a delay before initializing WebSockets to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Limit the number of coins to subscribe to
      const maxCoinsToSubscribe = 5; // Limit to 5 coins to reduce load
      const coinsToSubscribe = coins.slice(0, maxCoinsToSubscribe);

      if (coins.length > maxCoinsToSubscribe) {
        console.warn(
          `Limiting WebSocket subscriptions to ${maxCoinsToSubscribe} coins to reduce API load`
        );
      }

      // Subscribe to all mid prices
      try {
        const allMidsSub = await this.subscriptionClient.allMids(
          (data: MidPriceData) => {
            // Throttle mid price updates
            const now = Date.now();
            if (now - this.lastMidPriceUpdate < this.midPriceThrottleMs) {
              return; // Skip this update if it's too soon after the last one
            }
            this.lastMidPriceUpdate = now;

            // Process mid price updates
            console.log("Mid prices updated:", data);
          }
        );
        this.activeSubscriptions.set("allMids", allMidsSub as Subscription);
      } catch (error) {
        console.warn("Failed to subscribe to all mids:", error);
        // Continue with other subscriptions even if this one fails
      }

      // Add a delay between subscriptions to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Subscribe to order book and trades for each coin
      for (const coin of coinsToSubscribe) {
        // Add a small delay between coin subscriptions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          // Subscribe to order book
          const bookSub = await this.subscriptionClient.l2Book(
            { coin },
            (data: OrderBookLevelData) => {
              // Throttle order book updates
              const now = Date.now();
              const lastUpdate = this.lastOrderBookUpdate.get(coin) || 0;
              if (now - lastUpdate < this.orderBookThrottleMs) {
                return; // Skip this update if it's too soon after the last one
              }
              this.lastOrderBookUpdate.set(coin, now);

              // Format the data before caching it
              // The WebSocket data format is different from the REST API
              let formattedData: OrderBook = { bids: [], asks: [] };

              // Handle the SDK Book type
              if (
                data &&
                data.levels &&
                Array.isArray(data.levels) &&
                data.levels.length >= 2
              ) {
                formattedData = {
                  bids: Array.isArray(data.levels[0])
                    ? data.levels[0].map(item => ({
                        p: (item.px || "0").toString(),
                        s: (item.sz || "0").toString(),
                      }))
                    : [],
                  asks: Array.isArray(data.levels[1])
                    ? data.levels[1].map(item => ({
                        p: (item.px || "0").toString(),
                        s: (item.sz || "0").toString(),
                      }))
                    : [],
                };
              } else {
                console.warn(
                  `Received unexpected order book format for ${coin}:`,
                  data
                );
              }

              // Ensure bids and asks are sorted correctly and have valid values
              if (formattedData.bids && formattedData.bids.length > 0) {
                // Filter out any entries with invalid prices
                formattedData.bids = formattedData.bids
                  .filter(item => parseFloat(item.p) > 0)
                  .sort((a, b) => parseFloat(b.p) - parseFloat(a.p));
              }

              if (formattedData.asks && formattedData.asks.length > 0) {
                // Filter out any entries with invalid prices
                formattedData.asks = formattedData.asks
                  .filter(item => parseFloat(item.p) > 0)
                  .sort((a, b) => parseFloat(a.p) - parseFloat(b.p));
              }

              // Only update cache if we have valid data
              if (
                formattedData.bids.length > 0 &&
                formattedData.asks.length > 0
              ) {
                this.orderBookCache.set(coin, formattedData);
                console.log(
                  `Order book updated for ${coin} with ${formattedData.bids.length} bids and ${formattedData.asks.length} asks`
                );
              } else {
                console.warn(
                  `Skipping order book update for ${coin} due to empty bids or asks`
                );
              }

              // Update last order book update time
              this.lastOrderBookUpdate.set(coin, now);
            }
          );
          this.activeSubscriptions.set(`book_${coin}`, bookSub as Subscription);

          // Subscribe to trades
          const tradesSub = await this.subscriptionClient.trades(
            { coin },
            (data: Trade[]) => {
              // Throttle trade updates
              const now = Date.now();
              const lastUpdate = this.lastTradeUpdate.get(coin) || 0;
              if (now - lastUpdate < this.tradeThrottleMs) {
                return; // Skip this update if it's too soon after the last one
              }
              this.lastTradeUpdate.set(coin, now);

              // Update trades cache
              if (Array.isArray(data) && data.length > 0) {
                const existingTrades = this.tradeCache.get(coin) || [];
                const updatedTrades = [...existingTrades, ...data];

                // Keep only the last 1000 trades to avoid memory issues
                const maxTrades = 1000;
                if (updatedTrades.length > maxTrades) {
                  updatedTrades.splice(0, updatedTrades.length - maxTrades);
                }

                this.tradeCache.set(coin, updatedTrades);
                console.log(
                  `Trades updated for ${coin}: ${data.length} new trades`
                );
              }
            }
          );
          this.activeSubscriptions.set(
            `trades_${coin}`,
            tradesSub as Subscription
          );

          console.log(`WebSocket subscriptions initialized for ${coin}`);
        } catch (error) {
          console.error(`Failed to initialize WebSocket for ${coin}:`, error);
          // Continue with other coins even if this one fails
        }
      }

      console.log(
        `WebSocket initialization complete for ${coinsToSubscribe.length} coins`
      );
    } catch (error) {
      console.error("Error initializing WebSockets:", error);
      // Don't throw here - allow the service to continue without WebSockets
    }
  }

  /**
   * Close all WebSocket connections
   */
  async closeWebSockets(): Promise<void> {
    try {
      console.log("Closing WebSocket connections...");

      // Unsubscribe from all active subscriptions
      for (const [name, subscription] of this.activeSubscriptions) {
        try {
          if (subscription && typeof subscription.unsubscribe === "function") {
            subscription.unsubscribe();
          }
          console.log(`Unsubscribed from ${name}`);
        } catch (error) {
          console.warn(`Error unsubscribing from ${name}:`, error);
        }
      }

      // Clear all subscriptions
      this.activeSubscriptions.clear();

      console.log("All WebSocket connections closed");
    } catch (error) {
      console.error("Error closing WebSockets:", error);
    }
  }

  /**
   * Get available coins for trading
   */
  async getAvailableCoins(): Promise<string[]> {
    // Return from cache if available and recent
    if (this.availableCoinsCache.length > 0) {
      return this.availableCoinsCache;
    }

    try {
      // Get metadata which contains the universe of tradeable assets
      const meta = await this.getMetadata();

      if (!meta || !meta.universe) {
        console.warn("Metadata not available, using fallback coins");
        const fallbackCoins = ["BTC", "ETH", "SOL"];
        this.availableCoinsCache = fallbackCoins;
        return fallbackCoins;
      }

      // Extract coin names from the universe
      const coins = meta.universe
        .filter(asset => asset.name && typeof asset.name === "string")
        .map(asset => asset.name)
        .filter((name: string) => name.length > 0);

      // Cache the result
      this.availableCoinsCache = coins;

      console.log(`Found ${coins.length} available coins:`, coins.slice(0, 10));

      return coins;
    } catch (error) {
      console.error("Error fetching available coins:", error);

      // Return a minimal set of coins if everything fails
      const fallbackCoins = ["BTC", "ETH", "SOL"];
      this.availableCoinsCache = fallbackCoins;
      return fallbackCoins;
    }
  }

  /**
   * Get candle data for a specific coin
   */
  async getCandles(coin: string, limit: number = 100): Promise<Candle[]> {
    if (!coin) {
      throw new Error("Coin is required");
    }

    // Try to get from cache first
    const cachedCandles = this.candleCache.get(coin);
    if (cachedCandles && cachedCandles.length > 0) {
      return cachedCandles.slice(-limit);
    }

    // If not in cache, fetch from API
    return this.rateLimiter.enqueueRequest(async () => {
      return retryWithBackoff(async () => {
        try {
          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "candleSnapshot",
              req: {
                coin: coin,
                interval: "1h",
                startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
                endTime: Date.now(),
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }

          const rawCandles: HyperliquidCandle[] = await response.json();

          if (!Array.isArray(rawCandles)) {
            throw new Error("Invalid response format");
          }

          // Convert to our internal format with proper Candle interface
          const candles: Candle[] = rawCandles.map(
            (candle: HyperliquidCandle) => ({
              t: candle.t, // open time
              T: candle.t + getIntervalInSeconds("1h") * 1000, // close time (add interval duration)
              s: coin, // symbol
              i: "1h", // interval
              o: parseFloat(candle.o), // open price
              c: parseFloat(candle.c), // close price
              h: parseFloat(candle.h), // high price
              l: parseFloat(candle.l), // low price
              v: parseFloat(candle.v), // volume
              n: 0, // number of trades (not available from API)
            })
          );

          // Update cache
          this.candleCache.set(coin, candles);

          return candles.slice(-limit);
        } catch (error) {
          console.error(`Error fetching candles for ${coin}:`, error);
          throw error;
        }
      });
    });
  }

  /**
   * Get order book for a specific coin
   */
  async getOrderBook(coin: string): Promise<OrderBook> {
    if (!coin) {
      throw new Error("Coin is required");
    }

    // Try to get from cache first if it's not too old
    const cachedOrderBook = this.orderBookCache.get(coin);
    if (cachedOrderBook) {
      return cachedOrderBook;
    }

    // If not in cache or too old, fetch from API
    return this.rateLimiter.enqueueRequest(async () => {
      return retryWithBackoff(async () => {
        try {
          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "l2Book",
              coin: coin,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }

          const data = await response.json();
          let formattedData: OrderBook = { bids: [], asks: [] };

          // Handle different possible response formats
          if (data && Array.isArray(data.levels) && data.levels.length >= 2) {
            formattedData = {
              bids: Array.isArray(data.levels[0])
                ? data.levels[0].map(
                    (item: {
                      px?: string;
                      p?: string;
                      sz?: string;
                      s?: string;
                    }) => ({
                      p: (item.px || item.p || "0").toString(),
                      s: (item.sz || item.s || "0").toString(),
                    })
                  )
                : [],
              asks: Array.isArray(data.levels[1])
                ? data.levels[1].map(
                    (item: {
                      px?: string;
                      p?: string;
                      sz?: string;
                      s?: string;
                    }) => ({
                      p: (item.px || item.p || "0").toString(),
                      s: (item.sz || item.s || "0").toString(),
                    })
                  )
                : [],
            };
          }

          // Ensure bids and asks are sorted correctly
          if (formattedData.bids && formattedData.bids.length > 0) {
            formattedData.bids = formattedData.bids
              .filter(item => parseFloat(item.p) > 0)
              .sort((a, b) => parseFloat(b.p) - parseFloat(a.p));
          }

          if (formattedData.asks && formattedData.asks.length > 0) {
            formattedData.asks = formattedData.asks
              .filter(item => parseFloat(item.p) > 0)
              .sort((a, b) => parseFloat(a.p) - parseFloat(b.p));
          }

          // Update cache
          this.orderBookCache.set(coin, formattedData);

          return formattedData;
        } catch (error) {
          console.error(`Error fetching order book for ${coin}:`, error);
          throw error;
        }
      });
    });
  }

  /**
   * Get recent trades for a specific coin
   */
  async getTrades(coin: string, limit: number = 100): Promise<Trade[]> {
    // Try to get from cache first
    const cachedTrades = this.tradeCache.get(coin);
    if (cachedTrades && cachedTrades.length > 0) {
      return cachedTrades.slice(-limit);
    }

    // If not in cache, fetch from API
    return this.rateLimiter.enqueueRequest(async () => {
      try {
        const response = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "trades",
            req: {
              coin: coin,
              limit: limit,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Invalid response format");
        }

        // Update cache
        this.tradeCache.set(coin, data);

        return data.slice(-limit);
      } catch (error) {
        console.error(`Error fetching trades for ${coin}:`, error);
        return [];
      }
    });
  }

  /**
   * Initialize metadata in the background
   */
  private async initializeMetadata(): Promise<void> {
    try {
      console.log("Initializing metadata in the background...");
      await this.fetchMetadata();
      console.log("Background metadata initialization complete");
    } catch (error) {
      console.error("Background metadata initialization failed:", error);
      console.log("Will retry fetching metadata when needed");
    }
  }

  /**
   * Fetch metadata from the API
   */
  private async fetchMetadata(): Promise<void> {
    try {
      console.log("Fetching metadata from Hyperliquid API...");
      this.metadata = await this.infoClient.meta();
      this.lastMetaFetch = Date.now();
      console.log("Metadata fetched successfully");
    } catch (error) {
      console.error("Error fetching metadata:", error);

      // Use fallback metadata with hardcoded values that match the SDK type
      this.metadata = {
        universe: [
          { name: "BTC", szDecimals: 4, maxLeverage: 100, marginTableId: 0 },
          { name: "ETH", szDecimals: 3, maxLeverage: 100, marginTableId: 1 },
          { name: "SOL", szDecimals: 1, maxLeverage: 100, marginTableId: 2 },
        ],
        marginTables: [],
      };
      this.lastMetaFetch = Date.now();
      console.log("Using fallback metadata");
    }
  }

  /**
   * Get metadata, fetching it if necessary
   */
  async getMetadata(): Promise<Metadata> {
    const metadataMaxAge = 3600000; // 1 hour

    if (!this.metadata || Date.now() - this.lastMetaFetch > metadataMaxAge) {
      try {
        await this.fetchMetadata();
      } catch (error) {
        console.error("Error refreshing metadata:", error);
        // Continue with existing metadata if available
        if (!this.metadata) {
          throw error;
        }
      }
    }

    return this.metadata!;
  }

  /**
   * Get the asset ID for a given coin
   * @param coin The coin symbol
   * @returns The asset ID, or -1 if not found
   */
  async getAssetIdByCoin(coin: string): Promise<number> {
    try {
      // Validate coin parameter
      if (!coin) {
        console.error(
          "Cannot get asset ID: coin parameter is undefined or null"
        );
        return -1;
      }

      // Normalize coin to uppercase
      const normalizedCoin = coin.toUpperCase();

      // First check if we have a common asset ID for this coin
      // Import the commonAssetIds from utils
      const { commonAssetIds } = await import("./utils");

      // Check if the coin exists in the common asset IDs
      if (commonAssetIds && commonAssetIds[normalizedCoin] !== undefined) {
        console.log(
          `Using common asset ID for ${normalizedCoin}: ${commonAssetIds[normalizedCoin]}`
        );
        return commonAssetIds[normalizedCoin];
      }

      // If not found in common assets, get metadata which contains the universe of assets
      const meta = await this.getMetadata();

      if (!meta || !meta.universe) {
        console.warn(
          `Metadata or universe not available for ${normalizedCoin}`
        );
        return -1;
      }

      // Find the asset with the matching name (case insensitive)
      const assetIndex = meta.universe.findIndex(
        asset => asset.name && asset.name.toUpperCase() === normalizedCoin
      );

      if (assetIndex === -1) {
        console.warn(`Asset ${normalizedCoin} not found in metadata`);
        return -1;
      }

      // In Hyperliquid, the asset ID is typically the index in the universe array
      return assetIndex;
    } catch (error) {
      console.error(`Error getting asset ID for ${coin}:`, error);
      return -1;
    }
  }

  /**
   * Get clearinghouse state for a user
   * @param address The user's address
   * @returns The clearinghouse state
   */
  async getClearinghouseState(
    address: string
  ): Promise<ClearinghouseState | null> {
    try {
      // Ensure the address is properly formatted
      const formattedAddress = address.startsWith("0x")
        ? (address as `0x${string}`)
        : (`0x${address}` as `0x${string}`);

      // Use the public client to get the clearinghouse state
      const clearinghouseState = await this.infoClient.clearinghouseState({
        user: formattedAddress,
      });

      return clearinghouseState;
    } catch (error) {
      console.error(`Error getting clearinghouse state for ${address}:`, error);
      return null;
    }
  }
}
