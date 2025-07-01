import {
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from "@nktkas/hyperliquid";
import { Candle } from "../../utils/technicalAnalysis";
import { OrderBook, HyperliquidCandle } from "./types";
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
  private tradeCache: Map<string, any[]> = new Map();
  private activeSubscriptions: Map<string, any> = new Map();
  private availableCoinsCache: string[] = [];
  private metadata: any = null;
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
        const allMidsSub = await this.subscriptionClient.allMids((data: any) => {
          // Throttle mid price updates
          const now = Date.now();
          if (now - this.lastMidPriceUpdate < this.midPriceThrottleMs) {
            return; // Skip this update if it's too soon after the last one
          }
          this.lastMidPriceUpdate = now;

          // Process mid price updates
          console.log("Mid prices updated:", data);
        });
        this.activeSubscriptions.set("allMids", allMidsSub);
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
            (data: any) => {
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

              // Handle different possible data formats
              if (data && data.levels && Array.isArray(data.levels)) {
                // Format: { coin, time, levels: [bids, asks] }
                formattedData = {
                  bids: Array.isArray(data.levels[0])
                    ? data.levels[0].map((item: any) => ({
                        p: (item.px || item.p || "0").toString(),
                        s: (item.sz || item.s || "0").toString(),
                      }))
                    : [],
                  asks: Array.isArray(data.levels[1])
                    ? data.levels[1].map((item: any) => ({
                        p: (item.px || item.p || "0").toString(),
                        s: (item.sz || item.s || "0").toString(),
                      }))
                    : [],
                };
              } else if (data && data.asks && data.bids) {
                // Data is already in the right format
                formattedData = {
                  bids: Array.isArray(data.bids)
                    ? data.bids.map((item: any) => ({
                        p: (item.px || item.p || "0").toString(),
                        s: (item.sz || item.s || "0").toString(),
                      }))
                    : [],
                  asks: Array.isArray(data.asks)
                    ? data.asks.map((item: any) => ({
                        p: (item.px || item.p || "0").toString(),
                        s: (item.sz || item.s || "0").toString(),
                      }))
                    : [],
                };
              } else if (Array.isArray(data) && data.length >= 2) {
                // Format similar to REST API - [bids, asks]
                formattedData = {
                  bids: Array.isArray(data[0])
                    ? data[0].map((item: any) => ({
                        p: (item.px || item.p || "0").toString(),
                        s: (item.sz || item.s || "0").toString(),
                      }))
                    : [],
                  asks: Array.isArray(data[1])
                    ? data[1].map((item: any) => ({
                        p: (item.px || item.p || "0").toString(),
                        s: (item.sz || item.s || "0").toString(),
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
            }
          );
          this.activeSubscriptions.set(`book:${coin}`, bookSub);

          // Subscribe to trades
          const tradesSub = await this.subscriptionClient.trades(
            { coin },
            (data: any) => {
              // Throttle trade updates
              const now = Date.now();
              const lastUpdate = this.lastTradeUpdate.get(coin) || 0;
              if (now - lastUpdate < this.tradeThrottleMs) {
                return; // Skip this update if it's too soon after the last one
              }
              this.lastTradeUpdate.set(coin, now);

              const trades = this.tradeCache.get(coin) || [];
              this.tradeCache.set(coin, [...trades, ...data].slice(-100)); // Keep last 100 trades
              console.log(`Trades updated for ${coin}`);
            }
          );
          this.activeSubscriptions.set(`trades:${coin}`, tradesSub);
        } catch (error) {
          console.warn(`Failed to subscribe to ${coin} data:`, error);
          // Continue with other coins even if this one fails
        }
      }

      console.log(
        `WebSocket subscriptions initialized for ${coinsToSubscribe.length} coins`
      );
    } catch (error) {
      console.error("Error initializing WebSockets:", error);
      throw error;
    }
  }

  /**
   * Close all WebSocket connections
   */
  async closeWebSockets(): Promise<void> {
    try {
      console.log("Closing WebSocket connections...");

      // Close each active subscription
      for (const [key, subscription] of this.activeSubscriptions.entries()) {
        try {
          if (subscription && typeof subscription.close === "function") {
            await subscription.close();
            console.log(`Closed subscription: ${key}`);
          }
        } catch (error) {
          console.warn(`Error closing subscription ${key}:`, error);
        }
      }

      this.activeSubscriptions.clear();
      console.log("All WebSocket connections closed");
    } catch (error) {
      console.error("Error closing WebSockets:", error);
    }
  }

  /**
   * Get available coins from the API
   */
  async getAvailableCoins(): Promise<string[]> {
    try {
      // Use cache if available and not expired (5 minutes)
      if (
        this.availableCoinsCache.length > 0 &&
        Date.now() - this.lastMetaFetch < 300000
      ) {
        return this.availableCoinsCache;
      }

      // Make direct API call
      const response = await this.rateLimiter.enqueueRequest(async () => {
        return retryWithBackoff(async () => {
          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "meta",
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          if (!data || !data.universe || !Array.isArray(data.universe)) {
            throw new Error("Invalid response format from API");
          }

          return data;
        }, 4);
      });

      // Extract coin names from the response
      this.availableCoinsCache = response.universe
        .filter(
          (item: any) =>
            item && typeof item.name === "string" && item.name.length > 0
        )
        .map((item: any) => item.name.toUpperCase());

      this.lastMetaFetch = Date.now();
      return this.availableCoinsCache;
    } catch (error) {
      console.error("Error fetching available coins:", error);
      return this.availableCoinsCache.length > 0
        ? this.availableCoinsCache
        : [];
    }
  }

  /**
   * Get candles for a specific coin
   */
  async getCandles(coin: string, limit: number = 100): Promise<Candle[]> {
    try {
      // Try to get from cache first
      const cachedCandles = this.candleCache.get(coin);
      if (cachedCandles && cachedCandles.length >= limit) {
        return cachedCandles.slice(-limit);
      }

      // Calculate time range for candles
      const endTime = Math.floor(Date.now());
      const startTime =
        endTime -
        limit * getIntervalInSeconds(this.config.candleInterval) * 1000;

      // Fetch candles from API using the correct POST endpoint format
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "candleSnapshot",
          req: {
            coin: coin,
            interval: this.config.candleInterval,
            startTime: startTime,
            endTime: endTime,
          },
        }),
      });

      // Check if response is ok
      if (!response.ok) {
        console.error(
          `Error fetching candles for ${coin}: HTTP ${response.status}`
        );
        return [];
      }

      // Get the response text first to check if it's empty
      const responseText = await response.text();
      if (!responseText || responseText.trim() === "") {
        console.warn(`Empty response when fetching candles for ${coin}`);
        return [];
      }

      // Parse the JSON
      const data = JSON.parse(responseText);

      // Convert the API response to our Candle format
      const candles: Candle[] = (data as HyperliquidCandle[]).map(
        (item: HyperliquidCandle) => ({
          t: item.t, // open time
          T: item.t + getIntervalInSeconds(this.config.candleInterval) * 1000, // close time
          s: coin, // symbol
          i: this.config.candleInterval, // interval
          o: parseFloat(item.o), // open price
          c: parseFloat(item.c), // close price
          h: parseFloat(item.h), // high price
          l: parseFloat(item.l), // low price
          v: parseFloat(item.v), // volume
          n: 0, // number of trades (not available from API)
        })
      );

      // Update cache
      this.candleCache.set(coin, candles);

      return candles;
    } catch (error) {
      console.error(`Error fetching candles for ${coin}:`, error);
      return [];
    }
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
                ? data.levels[0].map((item: any) => ({
                    p: (item.px || item.p || "0").toString(),
                    s: (item.sz || item.s || "0").toString(),
                  }))
                : [],
              asks: Array.isArray(data.levels[1])
                ? data.levels[1].map((item: any) => ({
                    p: (item.px || item.p || "0").toString(),
                    s: (item.sz || item.s || "0").toString(),
                  }))
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
  async getTrades(coin: string, limit: number = 100): Promise<any[]> {
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

      // Use fallback metadata with hardcoded values
      this.metadata = {
        universe: [
          { name: "BTC", assetId: 0, stepSize: "0.0001", tickSize: "0.1" },
          { name: "ETH", assetId: 1, stepSize: "0.001", tickSize: "0.01" },
          { name: "SOL", assetId: 2, stepSize: "0.01", tickSize: "0.001" },
        ],
      };
      this.lastMetaFetch = Date.now();
      console.log("Using fallback metadata");
    }
  }

  /**
   * Get metadata, fetching it if necessary
   */
  async getMetadata(): Promise<any> {
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

    return this.metadata;
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
      const asset = meta.universe.find(
        (a: any) => a.name && a.name.toUpperCase() === normalizedCoin
      );

      if (!asset) {
        console.warn(`Asset ${normalizedCoin} not found in metadata`);
        return -1;
      }

      // Validate that assetId is a number
      if (
        asset.assetId === undefined ||
        asset.assetId === null ||
        isNaN(asset.assetId)
      ) {
        console.error(
          `Invalid asset ID format for ${normalizedCoin}: ${asset.assetId}`
        );
        return -1;
      }

      return asset.assetId;
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
  async getClearinghouseState(address: string): Promise<any> {
    try {
      // Ensure the address is properly formatted
      const formattedAddress = address.startsWith("0x")
        ? (address as `0x${string}`)
        : (`0x${address}` as `0x${string}`);

      // Use the public client to get the clearinghouse state
      const clearinghouseState = await this.publicClient.clearinghouseState({
        user: formattedAddress,
      });

      return clearinghouseState;
    } catch (error) {
      console.error(`Error getting clearinghouse state for ${address}:`, error);
      return null;
    }
  }
}
