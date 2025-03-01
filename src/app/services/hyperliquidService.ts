import {
  HttpTransport,
  WebSocketTransport,
  PublicClient,
  WalletClient,
  EventClient,
} from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { Config } from "../config";
import { Candle } from "../utils/technicalAnalysis";

// Improve the retryWithBackoff function
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 500,
  maxDelay: number = 5000
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;
  let lastError: any = null;

  const retryableErrorPatterns = [
    "Failed to fetch",
    "ERR_INSUFFICIENT_RESOURCES",
    "timed out",
    "timeout",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "network error",
    "Network Error",
    "socket hang up",
    "HTTP error 429", // Rate limiting
    "HTTP error 422", // Unprocessable Entity - API format issues
    "HTTP error 500", // Server error
    "HTTP error 502", // Bad gateway
    "HTTP error 503", // Service unavailable
    "HTTP error 504", // Gateway timeout
  ];

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      retries++;

      // Check if we've reached max retries
      if (retries >= maxRetries) {
        console.error(`Max retries (${maxRetries}) reached. Giving up.`);
        throw error;
      }

      // Check if it's a retryable error
      const errorMessage = error.message || "Unknown error";
      const isRetryable = retryableErrorPatterns.some(pattern =>
        errorMessage.includes(pattern)
      );

      if (!isRetryable) {
        console.error(`Non-retryable error: ${errorMessage}`);
        throw error;
      }

      // Special handling for rate limit errors - use longer delays
      const isRateLimit = errorMessage.includes("HTTP error 429");
      const isFormatError = errorMessage.includes("HTTP error 422");

      // Calculate delay with exponential backoff and jitter
      if (isRateLimit) {
        // For rate limit errors, use much longer delays
        delay = Math.min(delay * 3, 30000); // Up to 30 seconds for rate limit errors
      } else if (isFormatError) {
        // For format errors, use moderate delays
        delay = Math.min(delay * 2, 15000); // Up to 15 seconds for format errors
      } else {
        delay = Math.min(delay * 1.5, maxDelay);
      }

      // Add some randomness to prevent all retries happening simultaneously
      const jitter = Math.random() * 200;
      const actualDelay = delay + jitter;

      const retryMessage = `API call failed (attempt ${retries}/${maxRetries}), retrying in ${Math.round(
        actualDelay
      )}ms. Error: ${errorMessage}`;
      console.log(retryMessage);

      // Create a new error with retry information to propagate to UI
      const retryError = new Error(
        `${errorMessage} - RETRYING_API_CALL - ${retryMessage}`
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
  }
}

// Default szDecimals values for common coins
const defaultSzDecimals: Record<string, number> = {
  BTC: 3, // 0.001 BTC
  ETH: 2, // 0.01 ETH
  SOL: 0, // 1 SOL
  AVAX: 1, // 0.1 AVAX
  ARB: 0, // 1 ARB
  OP: 0, // 1 OP
  DOGE: 0, // 1 DOGE
  LINK: 1, // 0.1 LINK
  MATIC: 0, // 1 MATIC
  DOT: 1, // 0.1 DOT
  UNI: 1, // 0.1 UNI
  AAVE: 1, // 0.1 AAVE
  ATOM: 1, // 0.1 ATOM
  LTC: 2, // 0.01 LTC
  XRP: 0, // 1 XRP
};

// Define interfaces to match the Hyperliquid API types
interface HyperliquidCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

// Define order book interfaces
interface OrderBookEntry {
  p: string; // price
  s: string; // size
}

interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export class HyperliquidService {
  private httpTransport: HttpTransport;
  private wsTransport: WebSocketTransport;
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private eventClient: EventClient;
  private config: Config;
  private candleCache: Map<string, Candle[]> = new Map();
  private orderBookCache: Map<string, any> = new Map();
  private tradeCache: Map<string, any[]> = new Map();
  private activeSubscriptions: Map<string, any> = new Map();
  private availableCoinsCache: string[] = [];
  private lastMetaFetch = 0;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  private rateLimitWindowMs = 60000; // 1 minute window
  private maxRequestsPerWindow = 10; // Maximum requests per window
  private requestTimestamps: number[] = [];
  private szDecimalsCache: Map<string, number> = new Map();

  constructor(config: Config) {
    this.config = config;
    this.httpTransport = new HttpTransport();
    this.wsTransport = new WebSocketTransport();
    this.publicClient = new PublicClient({ transport: this.httpTransport });
    this.eventClient = new EventClient({ transport: this.wsTransport });

    // Don't initialize wallet client in constructor at all
    // It will be initialized on-demand when needed
  }

  // Separate method to initialize wallet client that can be called later
  public initializeWalletClient(apiSecret: string): void {
    try {
      // If apiSecret is empty or not provided, just log a warning and return
      if (!apiSecret || apiSecret.trim() === "") {
        console.warn("API secret not provided. Wallet client not initialized.");
        return;
      }

      // Remove 0x prefix if it exists
      let privateKey = apiSecret;
      if (privateKey.startsWith("0x")) {
        privateKey = privateKey.slice(2);
      }

      // Add 0x prefix back for the privateKeyToAccount function
      const formattedSecret = `0x${privateKey}` as `0x${string}`;

      const account = privateKeyToAccount(formattedSecret);
      this.walletClient = new WalletClient({
        wallet: account,
        transport: this.httpTransport,
      });

      console.log("Wallet client initialized successfully");
    } catch (error) {
      console.error("Error initializing wallet client:", error);
      throw error;
    }
  }

  // Helper method to check if wallet is initialized
  private ensureWalletInitialized(): void {
    if (!this.walletClient) {
      if (!this.config.apiSecret || this.config.apiSecret.trim() === "") {
        throw new Error(
          "API secret not configured. Please provide a valid API secret."
        );
      }

      // Validate API secret format before initializing
      let privateKey = this.config.apiSecret;
      if (privateKey.startsWith("0x")) {
        privateKey = privateKey.slice(2);
      }

      // Ensure the key is 64 characters (32 bytes)
      if (privateKey.length !== 64) {
        throw new Error(
          "API secret must be a 32-byte hex string (64 characters without 0x prefix)"
        );
      }

      // Try to initialize wallet client with current config
      this.initializeWalletClient(this.config.apiSecret);
    }
  }

  // Initialize WebSocket connections for real-time data
  async initializeWebSockets(coins: string[]): Promise<void> {
    try {
      // Subscribe to all mid prices
      const allMidsSub = await this.eventClient.allMids((data: any) => {
        // Process mid price updates
        console.log("Mid prices updated:", data);
      });
      this.activeSubscriptions.set("allMids", allMidsSub);

      // Subscribe to order book and trades for each coin
      for (const coin of coins) {
        // Subscribe to order book
        const bookSub = await this.eventClient.l2Book({ coin }, (data: any) => {
          // Format the data before caching it
          // The WebSocket data format is different from the REST API
          let formattedData: OrderBook = { bids: [], asks: [] };

          // Handle the new format with 'levels' array
          if (
            data &&
            data.coin &&
            data.time &&
            data.levels &&
            Array.isArray(data.levels)
          ) {
            // New format: {coin: 'BTC', time: timestamp, levels: [bids, asks]}
            const levels = data.levels;
            if (Array.isArray(levels) && levels.length >= 2) {
              formattedData = {
                bids: Array.isArray(levels[0])
                  ? levels[0].map((item: any) => ({
                      p: (item.px || item.p || "0").toString(),
                      s: (item.sz || item.s || "0").toString(),
                    }))
                  : [],
                asks: Array.isArray(levels[1])
                  ? levels[1].map((item: any) => ({
                      p: (item.px || item.p || "0").toString(),
                      s: (item.sz || item.s || "0").toString(),
                    }))
                  : [],
              };
            } else {
              console.warn(`Unexpected levels format for ${coin}:`, levels);
            }
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
          if (formattedData.bids.length > 0 && formattedData.asks.length > 0) {
            this.orderBookCache.set(coin, formattedData);
            console.log(
              `Order book updated for ${coin} with ${formattedData.bids.length} bids and ${formattedData.asks.length} asks`
            );
          } else {
            console.warn(
              `Skipping order book update for ${coin} due to empty bids or asks`
            );
          }
        });
        this.activeSubscriptions.set(`book:${coin}`, bookSub);

        // Subscribe to trades
        const tradesSub = await this.eventClient.trades(
          { coin },
          (data: any) => {
            const trades = this.tradeCache.get(coin) || [];
            this.tradeCache.set(coin, [...trades, ...data].slice(-100)); // Keep last 100 trades
            console.log(`Trades updated for ${coin}`);
          }
        );
        this.activeSubscriptions.set(`trades:${coin}`, tradesSub);

        // Subscribe to candles
        const candleSub = await this.eventClient.candle(
          {
            coin,
            interval: this.config.candleInterval,
          },
          (data: HyperliquidCandle) => {
            const candles = this.candleCache.get(coin) || [];
            // Convert Hyperliquid candle to our Candle format
            const convertedCandle: Candle = {
              t: data.t,
              T: data.t + this.getIntervalInSeconds(this.config.candleInterval),
              s: coin,
              i: this.config.candleInterval,
              o: parseFloat(data.o),
              h: parseFloat(data.h),
              l: parseFloat(data.l),
              c: parseFloat(data.c),
              v: parseFloat(data.v),
              n: 0,
            };

            // Check if we need to update the last candle or add a new one
            if (
              candles.length > 0 &&
              candles[candles.length - 1].t === convertedCandle.t
            ) {
              candles[candles.length - 1] = convertedCandle;
            } else {
              candles.push(convertedCandle);
            }
            // Keep only the last 200 candles
            this.candleCache.set(coin, candles.slice(-200));
            console.log(`Candle updated for ${coin}`);
          }
        );
        this.activeSubscriptions.set(`candle:${coin}`, candleSub);
      }

      // Only subscribe to user-specific events if wallet client is ALREADY initialized
      // Don't try to initialize it here
      if (
        this.walletClient &&
        this.config.walletAddress &&
        this.config.walletAddress.trim() !== ""
      ) {
        // Format wallet address if needed
        const formattedAddress = this.config.walletAddress.startsWith("0x")
          ? (this.config.walletAddress as `0x${string}`)
          : (`0x${this.config.walletAddress}` as `0x${string}`);

        // Subscribe to user fills
        const fillsSub = await this.eventClient.userFills(
          {
            user: formattedAddress,
          },
          (data: any) => {
            console.log("User fills updated:", data);
          }
        );
        this.activeSubscriptions.set("userFills", fillsSub);

        // Subscribe to order updates
        const ordersSub = await this.eventClient.orderUpdates(
          { user: formattedAddress },
          (data: any) => {
            console.log("Order updates:", data);
          }
        );
        this.activeSubscriptions.set("orderUpdates", ordersSub);
      } else {
        console.log(
          "Skipping user event subscriptions - wallet not initialized or address not provided"
        );
      }
    } catch (error) {
      console.error("Error initializing WebSockets:", error);
      throw error;
    }
  }

  // Helper method to convert interval string to seconds
  private getIntervalInSeconds(interval: string): number {
    const value = parseInt(interval.slice(0, -1));
    const unit = interval.slice(-1).toLowerCase();

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 60 * 60;
      case "d":
        return value * 24 * 60 * 60;
      case "w":
        return value * 7 * 24 * 60 * 60;
      default:
        return 60; // Default to 1 minute
    }
  }

  // Close all WebSocket connections
  async closeWebSockets(): Promise<void> {
    try {
      for (const [key, subscription] of this.activeSubscriptions.entries()) {
        await subscription.unsubscribe();
        console.log(`Unsubscribed from ${key}`);
      }
      this.activeSubscriptions.clear();
    } catch (error) {
      console.error("Error closing WebSockets:", error);
    }
  }

  // Add this method to handle rate limiting
  private async enqueueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    // Clean up old timestamps (older than the window)
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.rateLimitWindowMs
    );

    // Check if we're at the rate limit
    if (this.requestTimestamps.length >= this.maxRequestsPerWindow) {
      // Calculate how long to wait until we can make another request
      const oldestTimestamp = this.requestTimestamps[0];
      const timeToWait = this.rateLimitWindowMs - (now - oldestTimestamp) + 100; // Add 100ms buffer

      console.log(
        `Rate limit reached. Waiting ${timeToWait}ms before next request.`
      );
      await new Promise(resolve => setTimeout(resolve, timeToWait));

      // Recursively call this method after waiting
      return this.enqueueRequest(requestFn);
    }

    // Add current timestamp to the list
    this.requestTimestamps.push(now);

    // Execute the request
    return requestFn();
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    // Wait until we have capacity to make more requests
    const waitUntilCapacity = async () => {
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        timestamp => now - timestamp < this.rateLimitWindowMs
      );

      if (this.requestTimestamps.length >= this.maxRequestsPerWindow) {
        // Calculate time to wait until we can make another request
        const oldestRequest = Math.min(...this.requestTimestamps);
        const timeToWait = this.rateLimitWindowMs - (now - oldestRequest) + 100; // Add 100ms buffer

        await new Promise(resolve => setTimeout(resolve, timeToWait));
        return waitUntilCapacity();
      }

      return;
    };

    try {
      while (this.requestQueue.length > 0) {
        await waitUntilCapacity();

        const request = this.requestQueue.shift();
        if (request) {
          this.requestTimestamps.push(Date.now());
          await request();
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Modify the getAvailableCoins method to use the rate limiter
  async getAvailableCoins(): Promise<string[]> {
    try {
      // Default list of common coins to use if API is unavailable
      const defaultCoins = ["BTC", "ETH", "SOL", "AVAX", "ARB", "OP"];

      // Use cached data if it's less than 30 minutes old (increased from 15 minutes)
      const now = Date.now();
      if (
        this.availableCoinsCache &&
        this.availableCoinsCache.length > 0 &&
        now - this.lastMetaFetch < 30 * 60 * 1000
      ) {
        console.log("Using cached coin list:", this.availableCoinsCache);
        return this.availableCoinsCache;
      }

      // If we've had a recent rate limit error, use cached data or default coins
      // Increase the cooldown period to 5 minutes to avoid hitting rate limits repeatedly
      if (now - this.lastMetaFetch < 5 * 60 * 1000) {
        console.log("Recent API request, using cached or default coins");

        // If we have cached data, use it even if it's older
        if (this.availableCoinsCache && this.availableCoinsCache.length > 0) {
          console.log("Using cached coin list:", this.availableCoinsCache);
          return this.availableCoinsCache;
        }

        // Otherwise use default coins
        console.log("Using default coin list:", defaultCoins);
        // Store default coins in cache to avoid repeated API calls
        this.availableCoinsCache = defaultCoins;
        return defaultCoins;
      }

      // Use the rate limiter for the API request
      return this.enqueueRequest(async () => {
        try {
          console.log("Fetching available coins");

          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Add a cache-busting parameter to avoid browser cache
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            body: JSON.stringify({
              type: "meta",
            }),
          });

          // Update the last fetch time regardless of success to implement rate limiting
          this.lastMetaFetch = now;

          if (response.status === 429) {
            console.warn("Rate limited (429), using cached or default coins");

            // If we have cached data, use it
            if (
              this.availableCoinsCache &&
              this.availableCoinsCache.length > 0
            ) {
              return this.availableCoinsCache;
            }

            // Otherwise use default coins
            return defaultCoins;
          }

          if (!response.ok) {
            console.error(`Error fetching meta data: HTTP ${response.status}`);
            // If we have cached data, use it
            if (
              this.availableCoinsCache &&
              this.availableCoinsCache.length > 0
            ) {
              return this.availableCoinsCache;
            }
            return defaultCoins;
          }

          const data = await response.json();

          // Extract coin names from the universe array and also cache szDecimals
          if (data && data.universe && Array.isArray(data.universe)) {
            this.availableCoinsCache = data.universe.map((item: any) => {
              // Cache szDecimals for each coin
              if (item.name && typeof item.szDecimals === "number") {
                this.szDecimalsCache.set(item.name, item.szDecimals);
              }
              return item.name;
            });

            console.log(
              "Successfully fetched coin list:",
              this.availableCoinsCache
            );
            return this.availableCoinsCache;
          }

          // If we got a response but couldn't parse it, use default coins
          console.warn("Invalid response format from API, using default coins");

          // If we have cached data, use it
          if (this.availableCoinsCache && this.availableCoinsCache.length > 0) {
            return this.availableCoinsCache;
          }

          // Store default coins in cache
          this.availableCoinsCache = defaultCoins;
          return defaultCoins;
        } catch (error) {
          console.error("Error fetching available coins:", error);

          // If we have cached data, use it
          if (this.availableCoinsCache && this.availableCoinsCache.length > 0) {
            return this.availableCoinsCache;
          }

          // Store default coins in cache
          this.availableCoinsCache = defaultCoins;
          return defaultCoins;
        }
      });
    } catch (error) {
      console.error("Error in getAvailableCoins:", error);

      // Default coins to use when API is unavailable
      const defaultCoins = ["BTC", "ETH", "SOL", "AVAX", "ARB", "OP"];

      // If we have cached data, use it
      if (this.availableCoinsCache && this.availableCoinsCache.length > 0) {
        console.log(
          "Using cached coin list due to error:",
          this.availableCoinsCache
        );
        return this.availableCoinsCache;
      }

      // Store default coins in cache
      this.availableCoinsCache = defaultCoins;
      return defaultCoins;
    }
  }

  // Get candles for a specific coin
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
        limit * this.getIntervalInSeconds(this.config.candleInterval) * 1000;

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

      // Handle the case where data is directly an array of candle objects
      // (which appears to be the actual API response format)
      if (Array.isArray(data) && data.length > 0 && !Array.isArray(data[0])) {
        // Convert to our Candle format
        const convertedCandles: Candle[] = data.map((candle: any) => ({
          t: candle.t,
          T:
            candle.t +
            this.getIntervalInSeconds(this.config.candleInterval) * 1000,
          s: coin,
          i: this.config.candleInterval,
          o: parseFloat(candle.o),
          h: parseFloat(candle.h),
          l: parseFloat(candle.l),
          c: parseFloat(candle.c),
          v: parseFloat(candle.v),
          n: 0,
        }));

        // Update cache
        this.candleCache.set(coin, convertedCandles);
        return convertedCandles;
      }

      // Handle the nested array format (if the API ever returns this format)
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
        // The API returns an array of arrays, with the inner array containing the candles
        const candleData = data[0];

        // Convert to our Candle format
        const convertedCandles: Candle[] = candleData.map((candle: any) => ({
          t: candle.t,
          T:
            candle.T ||
            candle.t +
              this.getIntervalInSeconds(this.config.candleInterval) * 1000,
          s: candle.s || coin,
          i: candle.i || this.config.candleInterval,
          o: parseFloat(candle.o),
          h: parseFloat(candle.h),
          l: parseFloat(candle.l),
          c: parseFloat(candle.c),
          v: parseFloat(candle.v),
          n: candle.n || 0,
        }));

        // Update cache
        this.candleCache.set(coin, convertedCandles);
        return convertedCandles;
      }

      console.error(`Unexpected candle data format for ${coin}:`, data);
      return [];
    } catch (error) {
      console.error(`Error fetching candles for ${coin}:`, error);
      return [];
    }
  }

  // Modify the getOrderBook method to use the correct API call format
  async getOrderBook(coin: string): Promise<OrderBook> {
    if (!coin) {
      throw new Error("Invalid coin: coin parameter is undefined or null");
    }

    // Check cache first with a longer TTL (10 seconds)
    const cacheKey = `orderbook_${coin.toUpperCase()}`;
    const cachedData = this.orderBookCache.get(cacheKey);
    const now = Date.now();

    // Use cached data if it's less than 10 seconds old
    if (
      cachedData &&
      cachedData.timestamp &&
      now - cachedData.timestamp < 10000
    ) {
      console.log(
        `Using cached order book for ${coin}, age: ${
          now - cachedData.timestamp
        }ms`
      );
      return cachedData.data;
    }

    return this.enqueueRequest(async () => {
      return retryWithBackoff(async () => {
        try {
          // Instead of using numeric ID, use the actual coin name
          const coinName = coin.toUpperCase();

          // Use direct fetch instead of SDK client since orderBook might not be available in the current SDK version
          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "l2Book",
              req: { coin: coinName },
            }),
          });

          if (!response.ok) {
            const errorText = await response
              .text()
              .catch(() => "No error details available");
            throw new Error(`HTTP error ${response.status}: ${errorText}`);
          }

          const data = await response.json();

          // Check if the response has the expected structure
          if (!data) {
            throw new Error(`Invalid response data for ${coin} order book`);
          }

          // Format the response to match the expected structure
          let formattedData: OrderBook = { bids: [], asks: [] };

          // Handle the format with 'levels' array
          if (data && data.levels && Array.isArray(data.levels)) {
            const levels = data.levels;
            if (Array.isArray(levels) && levels.length >= 2) {
              formattedData = {
                bids: Array.isArray(levels[0])
                  ? levels[0].map((item: any) => ({
                      p: (item.px || item.p || "0").toString(),
                      s: (item.sz || item.s || "0").toString(),
                    }))
                  : [],
                asks: Array.isArray(levels[1])
                  ? levels[1].map((item: any) => ({
                      p: (item.px || item.p || "0").toString(),
                      s: (item.sz || item.s || "0").toString(),
                    }))
                  : [],
              };
            }
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

          // Cache the result with timestamp
          this.orderBookCache.set(cacheKey, {
            data: formattedData,
            timestamp: Date.now(),
          });

          return formattedData;
        } catch (error) {
          console.error(`Error fetching order book for ${coin}:`, error);

          // If we have cached data, return it as a fallback even if it's older
          const cachedData = this.orderBookCache.get(cacheKey);
          if (cachedData && cachedData.data) {
            console.log(
              `Using stale cached order book for ${coin} due to API error`
            );
            return cachedData.data;
          }

          throw error;
        }
      });
    });
  }

  // Get recent trades for a specific coin
  async getTrades(coin: string, limit: number = 100): Promise<any[]> {
    try {
      // Try to get from cache first
      const cachedTrades = this.tradeCache.get(coin);
      if (cachedTrades && cachedTrades.length > 0) {
        return cachedTrades.slice(-limit);
      }

      // Fetch trades from API using custom fetch since the SDK might not have the method
      const response = await fetch(
        `https://api.hyperliquid.xyz/info/trades?coin=${coin}&limit=${limit}`
      );
      const data = await response.json();

      // Update cache
      this.tradeCache.set(coin, data);
      return data;
    } catch (error) {
      console.error(`Error fetching trades for ${coin}:`, error);
      return [];
    }
  }

  // Place a limit order
  async placeLimitOrder(
    coin: string,
    side: "buy" | "sell",
    price: number,
    size: number
  ): Promise<any> {
    // Ensure wallet is initialized before proceeding
    this.ensureWalletInitialized();

    try {
      // Validate inputs
      if (price <= 0) {
        console.error(`Invalid price for ${coin} ${side} order: ${price}`);
        return { success: false, message: "Invalid price" };
      }

      if (size <= 0) {
        console.error(`Invalid size for ${coin} ${side} order: ${size}`);
        return { success: false, message: "Invalid size" };
      }

      // Get szDecimals for the coin
      const szDecimals = await this.getSzDecimals(coin);

      // Convert coin string to coin ID number
      const coinId = this.getCoinId(coin);

      console.log(`
=== PLACING ${side.toUpperCase()} ORDER FOR ${coin.toUpperCase()} ===
Original Size: ${size} ${coin}
Original Price: $${price}
Original USD Value: $${(size * price).toFixed(2)}
`);

      // Format price according to Hyperliquid requirements
      const formattedPrice = this.formatPriceForCoin(price, coin);

      // First, ensure the size meets minimum requirements
      let minSize = this.getMinimumSize(coin);
      if (size < minSize) {
        console.error(
          `Size too small for ${coin}: ${size}, minimum is ${minSize}`
        );
        return {
          success: false,
          message: `Size must be at least ${minSize} for ${coin}`,
        };
      }

      // Special handling for ETH - ensure size is a multiple of 0.01
      let roundedSize;
      let formattedSize;

      if (coin.toUpperCase() === "ETH") {
        // For ETH, ensure size is a multiple of 0.01 (minimum size)
        roundedSize = Math.floor(size * 100) / 100;
        // Always use 2 decimal places for ETH size
        formattedSize = roundedSize.toFixed(2);
      } else {
        // For other coins, use szDecimals
        const multiplier = Math.pow(10, szDecimals);
        roundedSize = Math.floor(size * multiplier) / multiplier;
        formattedSize = roundedSize.toFixed(szDecimals);
      }

      console.log(`
Formatted Price: ${formattedPrice}
Rounded Size: ${roundedSize} ${coin}
Formatted Size: ${formattedSize} ${coin}
Final USD Value: $${(
        parseFloat(formattedPrice) * parseFloat(formattedSize)
      ).toFixed(2)}
`);

      // Validate minimum order value (price * size)
      const orderValue = parseFloat(formattedPrice) * parseFloat(formattedSize);
      if (orderValue < 10) {
        console.error(
          `Order value too small: $${orderValue.toFixed(2)}, minimum is $10`
        );
        return { success: false, message: "Order value must be at least $10" };
      }

      if (!this.walletClient) {
        console.error("Wallet client not initialized");
        return { success: false, message: "Wallet client not initialized" };
      }

      // Use @ts-ignore to bypass type checking since the SDK types might be outdated
      // @ts-ignore
      const result = await this.walletClient.order({
        orders: [
          {
            a: coinId, // Asset as number ID
            b: side === "buy", // Buy order if true, sell if false
            p: formattedPrice, // Price as string
            s: formattedSize, // Size as string
            r: false, // Not reduce-only
            t: {
              limit: {
                tif: "Gtc", // Good-til-cancelled
              },
            },
          },
        ],
        grouping: "na", // No grouping
      });

      console.log(`Order placed successfully for ${coin}:`, result);
      return { success: true, result };
    } catch (error) {
      console.error(`Error placing ${side} order for ${coin}:`, error);
      return { success: false, error: String(error) };
    }
  }

  // Helper method to convert coin symbol to coin ID
  private getCoinId(coin: string): number {
    // Check if coin is undefined or null
    if (!coin) {
      console.error("getCoinId called with undefined or null coin");
      throw new Error("Invalid coin: coin parameter is undefined or null");
    }

    // This is a simplified mapping - you may need to fetch the actual mapping from the API
    const coinMap: Record<string, number> = {
      BTC: 0,
      ETH: 1,
      SOL: 2,
      AVAX: 3,
      ARB: 4,
      OP: 5,
      DOGE: 6,
      MATIC: 7,
      LINK: 8,
      DOT: 9,
      ADA: 10,
      ATOM: 11,
      UNI: 12,
      AAVE: 13,
      XRP: 14,
      LTC: 15,
      BCH: 16,
      ETC: 17,
      FIL: 18,
      NEAR: 19,
      // Add more mappings as needed
    };

    try {
      const id = coinMap[coin.toUpperCase()];
      if (id === undefined) {
        // If we don't have a mapping, log a warning and try to use a fallback method
        console.warn(
          `Unknown coin ID for ${coin}, attempting to fetch from API`
        );

        // Try to determine the ID based on the position in the available coins list
        // This is a fallback and may not always work correctly
        const availableCoins = this.availableCoinsCache;
        if (availableCoins && availableCoins.length > 0) {
          const index = availableCoins.findIndex(
            c => c && c.toUpperCase() === coin.toUpperCase()
          );

          if (index !== -1) {
            console.log(`Found ${coin} at index ${index} in available coins`);
            return index;
          }
        }

        throw new Error(`Unknown coin: ${coin}`);
      }

      return id;
    } catch (error) {
      console.error(`Error in getCoinId for coin ${coin}:`, error);
      throw error;
    }
  }

  // Cancel all open orders for a specific coin
  async cancelAllOrders(coin: string): Promise<any> {
    // Ensure wallet is initialized before proceeding
    this.ensureWalletInitialized();

    try {
      // Format wallet address if needed
      const formattedAddress = this.config.walletAddress?.startsWith("0x")
        ? (this.config.walletAddress as `0x${string}`)
        : (`0x${this.config.walletAddress}` as `0x${string}`);

      // Get open orders
      const openOrders = await this.publicClient.openOrders({
        user: formattedAddress,
      });

      // Filter orders for the specific coin
      const ordersToCancel = openOrders
        .filter(order => order.coin === coin)
        .map(order => order.oid);

      if (ordersToCancel.length === 0) {
        console.log(`No orders to cancel for ${coin}`);
        return { success: true, message: "No orders to cancel" };
      }

      console.log(`Cancelling ${ordersToCancel.length} orders for ${coin}`);

      // Use the SDK directly with any to bypass type checking
      // The SDK types might be outdated or incomplete
      if (this.walletClient) {
        try {
          // Use the correct API call format with this.walletClient.order
          // Use type assertion to bypass type checking for the order parameters
          const orderParams = {
            cancels: ordersToCancel.map(oid => ({
              coin,
              oid,
            })),
            grouping: "na", // No grouping
          };

          // @ts-ignore - Bypass type checking for the cancel operation
          const result = await this.walletClient.order(orderParams as any);

          console.log(`Successfully cancelled orders for ${coin}:`, result);
          return { success: true, result };
        } catch (sdkError) {
          console.error("Error using SDK to cancel orders:", sdkError);
          // Return a simplified error response
          return {
            success: false,
            error: String(sdkError),
            message: "Failed to cancel orders using SDK",
          };
        }
      } else {
        console.warn("Wallet client not initialized, cannot cancel orders");
        return {
          success: false,
          message: "Wallet client not initialized",
        };
      }
    } catch (error) {
      console.error(`Error cancelling orders for ${coin}:`, error);
      return { success: false, error: String(error) };
    }
  }

  // Get account information
  async getAccountInfo(): Promise<any> {
    if (!this.config.walletAddress) {
      throw new Error("Wallet address not configured");
    }

    return retryWithBackoff(async () => {
      // Format wallet address if needed
      const formattedAddress = this.config.walletAddress.startsWith("0x")
        ? (this.config.walletAddress as `0x${string}`)
        : (`0x${this.config.walletAddress}` as `0x${string}`);

      try {
        const userState = await this.publicClient.clearinghouseState({
          user: formattedAddress,
        });
        return userState;
      } catch (error) {
        console.error("Error fetching account info:", error);
        throw error;
      }
    });
  }

  // Get user's open orders
  async getOpenOrders(): Promise<any[]> {
    if (!this.config.walletAddress) {
      throw new Error("Wallet address not configured");
    }

    return retryWithBackoff(async () => {
      try {
        // Format wallet address if needed
        const formattedAddress = this.config.walletAddress.startsWith("0x")
          ? (this.config.walletAddress as `0x${string}`)
          : (`0x${this.config.walletAddress}` as `0x${string}`);

        const userState = await this.publicClient.clearinghouseState({
          user: formattedAddress,
        });

        // Extract open orders from user state
        const openOrders = userState.assetPositions
          .flatMap((position: any) => position.orders || [])
          .filter((order: any) => order.status === "open");

        return openOrders;
      } catch (error) {
        console.error("Error fetching open orders:", error);
        throw error;
      }
    });
  }

  // Get user's active positions
  async getActivePositions(): Promise<any[]> {
    if (!this.config.walletAddress) {
      throw new Error("Wallet address not configured");
    }

    return retryWithBackoff(async () => {
      try {
        // Format wallet address if needed
        const formattedAddress = this.config.walletAddress.startsWith("0x")
          ? (this.config.walletAddress as `0x${string}`)
          : (`0x${this.config.walletAddress}` as `0x${string}`);

        const userState = await this.publicClient.clearinghouseState({
          user: formattedAddress,
        });

        // Extract active positions from user state
        const activePositions = userState.assetPositions.filter(
          (position: any) =>
            position.position && parseFloat(position.position.szi) !== 0
        );

        // Enhance position data with additional information
        const enhancedPositions = await Promise.all(
          activePositions.map(async (position: any) => {
            const coin = position.name;
            const currentPrice = await this.getCurrentPrice(coin);
            const entryPrice = parseFloat(position.position.entryPx);
            const size = parseFloat(position.position.szi);
            const side = size > 0 ? "long" : "short";
            const absSize = Math.abs(size);

            // Calculate unrealized PNL
            let unrealizedPnl = 0;
            if (side === "long") {
              unrealizedPnl = absSize * (currentPrice - entryPrice);
            } else {
              unrealizedPnl = absSize * (entryPrice - currentPrice);
            }

            // Calculate percentage PNL
            const pnlPercentage =
              (unrealizedPnl / (entryPrice * absSize)) * 100;

            return {
              ...position,
              currentPrice,
              side,
              absSize,
              unrealizedPnl,
              pnlPercentage,
            };
          })
        );

        return enhancedPositions;
      } catch (error) {
        console.error("Error fetching active positions:", error);
        throw error;
      }
    });
  }

  // Get current price for a coin
  async getCurrentPrice(coin: string): Promise<number> {
    return retryWithBackoff(async () => {
      try {
        if (!coin) {
          throw new Error("Invalid coin: coin parameter is undefined or null");
        }

        const orderBook = await this.getOrderBook(coin);

        // Check if we have a valid order book with asks
        if (!orderBook) {
          throw new Error(`Failed to get order book for ${coin}`);
        }

        if (!orderBook.asks || orderBook.asks.length === 0) {
          // If no asks are available, try to use bids instead
          if (orderBook.bids && orderBook.bids.length > 0) {
            return parseFloat(orderBook.bids[0].p);
          }
          throw new Error(`No price data available for ${coin}`);
        }

        return parseFloat(orderBook.asks[0].p);
      } catch (error) {
        console.error(`Error getting current price for ${coin}:`, error);
        throw error;
      }
    });
  }

  // Get total PNL across all positions
  async getTotalPnl(): Promise<{
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    positions: any[];
  }> {
    try {
      const positions = await this.getActivePositions();

      // Calculate total unrealized PNL
      const totalUnrealizedPnl = positions.reduce(
        (total, position) => total + position.unrealizedPnl,
        0
      );

      // Get account info for realized PNL
      const accountInfo = await this.getAccountInfo();
      const totalRealizedPnl = parseFloat(
        accountInfo.crossMarginSummary.totalRealizedPnl || "0"
      );

      return {
        totalUnrealizedPnl,
        totalRealizedPnl,
        positions,
      };
    } catch (error) {
      console.error("Error calculating total PNL:", error);
      return {
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        positions: [],
      };
    }
  }

  // Calculate optimal order size based on account balance and risk parameters
  async calculateOrderSize(
    coin: string,
    price: number,
    riskPercentage: number = 1,
    leverage: number = 1 // Add leverage parameter
  ): Promise<string> {
    try {
      const accountInfo = await this.getAccountInfo();
      const usdBalance = parseFloat(
        accountInfo.crossMarginSummary.accountValue
      );

      // Calculate order size based on risk percentage and leverage
      const riskAmount = (usdBalance * riskPercentage) / 100;

      // Apply leverage to the order size - ensure it's at least 1x
      const effectiveLeverage = Math.max(1, leverage);
      const leveragedRiskAmount = riskAmount * effectiveLeverage;

      // Calculate raw order size
      const rawOrderSize = leveragedRiskAmount / price;

      // Get minimum size for this coin
      const minSize = this.getMinimumSize(coin);

      // Ensure order size meets minimum requirements
      const finalOrderSize = Math.max(minSize, rawOrderSize);

      // Format to appropriate precision
      const orderSize = finalOrderSize.toFixed(8);

      // Enhanced logging with more details
      console.log(`
=== ORDER SIZE CALCULATION FOR ${coin.toUpperCase()} ===
Account Value: $${usdBalance.toFixed(2)}
Risk Percentage: ${riskPercentage}%
Risk Amount: $${riskAmount.toFixed(2)}
Leverage: ${effectiveLeverage}x
Leveraged Risk Amount: $${leveragedRiskAmount.toFixed(2)}
Current Price: $${price.toFixed(2)}
Raw Order Size: ${rawOrderSize.toFixed(8)} ${coin}
Minimum Size: ${minSize} ${coin}
Final Order Size: ${orderSize} ${coin}
USD Value: $${(parseFloat(orderSize) * price).toFixed(2)}
=================================================`);

      return orderSize;
    } catch (error) {
      console.error("Error calculating order size:", error);
      return "0";
    }
  }

  // Get the number of decimal places for size (szDecimals) for a specific coin
  async getSzDecimals(coin: string): Promise<number> {
    try {
      // Check cache first
      if (this.szDecimalsCache.has(coin)) {
        return (
          this.szDecimalsCache.get(coin) ||
          defaultSzDecimals[coin.toUpperCase()] ||
          2
        );
      }

      // Check if we've had a recent rate limit error
      const now = Date.now();
      if (now - this.lastMetaFetch < 30 * 1000) {
        console.log(
          `Using default szDecimals for ${coin} due to recent rate limit`
        );
        const defaultValue = defaultSzDecimals[coin.toUpperCase()] || 2;
        this.szDecimalsCache.set(coin, defaultValue);
        return defaultValue;
      }

      // Use the rate limiter for the API request
      return this.enqueueRequest(async () => {
        try {
          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            body: JSON.stringify({
              type: "meta",
            }),
          });

          // Update the last fetch time regardless of success
          this.lastMetaFetch = now;

          if (response.status === 429) {
            console.warn(
              `Rate limited (429) on szDecimals for ${coin}, using default value`
            );
            const defaultValue = defaultSzDecimals[coin.toUpperCase()] || 2;
            this.szDecimalsCache.set(coin, defaultValue);
            return defaultValue;
          }

          if (!response.ok) {
            console.error(
              `Error fetching meta data: HTTP ${response.status}, using default szDecimals`
            );
            const defaultValue = defaultSzDecimals[coin.toUpperCase()] || 2;
            this.szDecimalsCache.set(coin, defaultValue);
            return defaultValue;
          }

          const data = await response.json();

          // Find the coin in the universe array
          if (data && data.universe && Array.isArray(data.universe)) {
            const coinInfo = data.universe.find(
              (item: any) => item.name.toUpperCase() === coin.toUpperCase()
            );

            if (coinInfo && coinInfo.szDecimals !== undefined) {
              // Cache the result
              this.szDecimalsCache.set(coin, coinInfo.szDecimals);
              return coinInfo.szDecimals;
            }
          }

          // If we couldn't find the coin in the API response, use default values
          const defaultValue = defaultSzDecimals[coin.toUpperCase()] || 2;
          this.szDecimalsCache.set(coin, defaultValue);
          return defaultValue;
        } catch (error) {
          console.error(`Error fetching szDecimals for ${coin}:`, error);
          const defaultValue = defaultSzDecimals[coin.toUpperCase()] || 2;
          this.szDecimalsCache.set(coin, defaultValue);
          return defaultValue;
        }
      });
    } catch (error) {
      console.error(`Error in getSzDecimals for ${coin}:`, error);
      const defaultValue = defaultSzDecimals[coin.toUpperCase()] || 2;
      this.szDecimalsCache.set(coin, defaultValue);
      return defaultValue;
    }
  }

  // Format price according to the requirements for a specific coin
  formatPriceForCoin(price: number, coin: string): string {
    // Default price formatting based on common coins
    const priceFormatting: Record<string, number> = {
      BTC: 1, // $0.1 precision
      ETH: 2, // $0.01 precision
      SOL: 3, // $0.001 precision
      AVAX: 3, // $0.001 precision
      ARB: 4, // $0.0001 precision
      OP: 4, // $0.0001 precision
    };

    const decimals = priceFormatting[coin.toUpperCase()] || 2;
    return price.toFixed(decimals);
  }

  // Get minimum order size for a specific coin
  getMinimumSize(coin: string): number {
    // Minimum sizes based on Hyperliquid requirements
    const minimumSizes: Record<string, number> = {
      BTC: 0.001, // 0.001 BTC
      ETH: 0.01, // 0.01 ETH
      SOL: 1, // 1 SOL
      AVAX: 0.1, // 0.1 AVAX
      ARB: 1, // 1 ARB
      OP: 1, // 1 OP
    };

    return minimumSizes[coin.toUpperCase()] || 0.01;
  }
}
