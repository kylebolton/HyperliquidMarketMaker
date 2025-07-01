THIS SHOULD BE A LINTER ERRORimport {
  HttpTransport,
  WebSocketTransport,
  PublicClient,
  EventClient,
} from "@nktkas/hyperliquid";
import { Config } from "../../config";
import { Candle } from "../../utils/technicalAnalysis";
import {
  OrderBook,
  PlaceOrderResponse,
  AccountInfo,
  PnlData,
  Asset,
} from "./types";
import { RateLimiter } from "./rateLimiter";
import { WalletService } from "./walletService";
import { MarketDataService } from "./marketDataService";
import { TradingService } from "./tradingService";

/**
 * Main HyperliquidService class that integrates all the modular services
 */
export class HyperliquidService {
  private config: Config;
  private httpTransport: HttpTransport;
  private wsTransport: WebSocketTransport;
  private publicClient: PublicClient;
  private eventClient: EventClient;

  private rateLimiter: RateLimiter;
  private walletService: WalletService;
  private marketDataService: MarketDataService;
  private tradingService: TradingService;

  constructor(config: Config) {
    this.config = config;

    // Initialize transports and clients
    this.httpTransport = new HttpTransport({
      keepalive: true,
      timeout: 30000,
      retries: 3,
    });
    this.wsTransport = new WebSocketTransport();
    this.publicClient = new PublicClient({ transport: this.httpTransport });
    this.eventClient = new EventClient({ transport: this.wsTransport });

    // Initialize services
    this.rateLimiter = new RateLimiter();
    this.walletService = new WalletService(config, this.httpTransport);
    this.marketDataService = new MarketDataService(
      this.publicClient,
      this.eventClient,
      this.wsTransport,
      config,
      this.rateLimiter
    );
    this.tradingService = new TradingService(
      this.walletService,
      this.marketDataService,
      this.rateLimiter,
      config
    );

    // Initialize wallet if API secret is provided
    if (config.apiSecret) {
      this.initializeWallet().catch(err => {
        console.error("Failed to initialize wallet:", err);
      });
    } else {
      console.warn(
        "No API secret provided. Trading functionality will be limited."
      );
    }
  }

  // Market Data Methods

  /**
   * Initialize WebSocket connections for real-time data
   */
  async initializeWebSockets(coins: string[]): Promise<void> {
    return this.marketDataService.initializeWebSockets(coins);
  }

  /**
   * Close all WebSocket connections
   */
  async closeWebSockets(): Promise<void> {
    return this.marketDataService.closeWebSockets();
  }

  /**
   * Get available coins from the API
   */
  async getAvailableCoins(): Promise<string[]> {
    return this.marketDataService.getAvailableCoins();
  }

  /**
   * Get candles for a specific coin
   */
  async getCandles(coin: string, limit: number = 100): Promise<Candle[]> {
    return this.marketDataService.getCandles(coin, limit);
  }

  /**
   * Get order book for a specific coin
   */
  async getOrderBook(coin: string): Promise<OrderBook> {
    return this.marketDataService.getOrderBook(coin);
  }

  /**
   * Get recent trades for a specific coin
   */
  async getTrades(coin: string, limit: number = 100): Promise<any[]> {
    return this.marketDataService.getTrades(coin, limit);
  }

  /**
   * Get metadata about available markets
   */
  async getMetadata(): Promise<any> {
    return this.marketDataService.getMetadata();
  }

  // Wallet Methods

  /**
   * Initialize the wallet with the provided API secret
   */
  async initializeWallet(): Promise<void> {
    try {
      if (!this.config.apiSecret) {
        throw new Error("API secret is required to initialize wallet");
      }

      // Initialize the wallet client
      this.walletService.initializeWalletClient(this.config.apiSecret);

      // Wait a moment for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify the wallet connection
      const isConnected = await this.walletService.verifyWalletConnection();

      if (!isConnected) {
        throw new Error("Failed to verify wallet connection");
      }

      // Get the wallet client and check if the exchange property is available
      const walletClient = this.walletService.getWalletClient();

      if (walletClient) {
        // Ensure the exchange property is available
        const exchangeReady = this.walletService.ensureExchangeProperty();
        if (!exchangeReady) {
          console.warn(
            "Could not initialize exchange property on wallet client. Trading functionality may be limited."
          );
        }
      } else {
        throw new Error("Wallet client is null after initialization");
      }

      console.log("Wallet initialized successfully");
    } catch (error) {
      console.error("Error initializing wallet:", error);
      throw error;
    }
  }

  /**
   * Check if the wallet is ready to use
   */
  checkWalletStatus() {
    return this.walletService.checkWalletStatus();
  }

  // Trading Methods

  /**
   * Place a limit order
   */
  async placeLimitOrder(
    coin: string,
    side: "B" | "A",
    size: number,
    price: number,
    reduceOnly: boolean = false
  ): Promise<PlaceOrderResponse> {
    return this.tradingService.placeLimitOrder(
      coin,
      side,
      size,
      price,
      reduceOnly
    );
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<AccountInfo> {
    return this.tradingService.getAccountInfo();
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<any[]> {
    return this.tradingService.getOpenOrders();
  }

  /**
   * Get total PNL and position information
   */
  async getTotalPnl(): Promise<PnlData> {
    const result = await this.tradingService.getTotalPnl();

    // Ensure the result conforms to the PnlData interface
    return {
      success: result.success,
      message: result.success ? "PNL data retrieved successfully" : undefined,
      error: result.error,
      totalUnrealizedPnl: result.totalUnrealizedPnl || 0,
      totalRealizedPnl: result.totalRealizedPnl || 0,
      positions: result.positions || [],
    };
  }

  /**
   * Cancel all orders for a specific coin
   */
  async cancelAllOrders(coin: string): Promise<any> {
    return this.tradingService.cancelAllOrders(coin);
  }

  /**
   * Calculate appropriate order size based on risk percentage
   */
  async calculateOrderSize(
    coin: string,
    price: number,
    riskPercentage: number,
    leverage: number = 1
  ): Promise<number> {
    return this.tradingService.calculateOrderSize(
      coin,
      price,
      riskPercentage,
      leverage
    );
  }

  /**
   * Get minimum size for a coin
   */
  getMinimumSize(coin: string): number {
    return this.tradingService.getMinimumSize(coin);
  }

  /**
   * Format price for a specific coin
   */
  formatPriceForCoin(price: number, coin: string): string {
    return this.tradingService.formatPriceForCoin(price, coin);
  }

  /**
   * Get the wallet client
   */
  public getWalletClient(): any {
    return this.walletService.getWalletClient();
  }
}

// Export all the types and utility functions
export * from "./types";
export * from "./utils";
export * from "./rateLimiter";
export * from "./walletService";
export * from "./marketDataService";
export * from "./tradingService";
