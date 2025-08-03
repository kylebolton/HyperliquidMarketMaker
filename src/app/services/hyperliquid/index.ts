import {
  HttpTransport,
  WebSocketTransport,
  InfoClient,
  SubscriptionClient,
} from "@nktkas/hyperliquid";
import { Config } from "../../config";
import { Candle } from "../../utils/technicalAnalysis";
import { OrderBook, PlaceOrderResponse, AccountInfo, PnlData } from "./types";
import { RateLimiter } from "./rateLimiter";
import { WalletService } from "./walletService";
import { MarketDataService } from "./marketDataService";
import { TradingService } from "./tradingService";
import { WalletConnectionState } from "@/components/wallet/WalletConnection";

/**
 * Main HyperliquidService class that integrates all the modular services
 */
export class HyperliquidService {
  private config: Config;
  private httpTransport: HttpTransport;
  private wsTransport: WebSocketTransport;
  private infoClient: InfoClient;
  private subscriptionClient: SubscriptionClient;

  private rateLimiter: RateLimiter;
  private walletService: WalletService;
  private marketDataService: MarketDataService;
  private tradingService: TradingService;
  private walletConnectionState: WalletConnectionState | null = null;

  constructor(config: Config) {
    this.config = config;

    // Initialize transports and clients
    this.httpTransport = new HttpTransport({
      timeout: 30000,
    });
    this.wsTransport = new WebSocketTransport();
    this.infoClient = new InfoClient({ transport: this.httpTransport });
    this.subscriptionClient = new SubscriptionClient({
      transport: this.wsTransport,
    });

    // Initialize services
    this.rateLimiter = new RateLimiter();
    this.walletService = new WalletService(config, this.httpTransport);
    this.marketDataService = new MarketDataService(
      this.infoClient,
      this.subscriptionClient,
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

    // Initialize wallet if wallet address is provided
    if (config.walletAddress) {
      this.initializeWallet().catch(err => {
        console.error("Failed to initialize wallet:", err);
      });
    } else {
      console.warn(
        "No wallet address provided. Trading functionality will be limited."
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
  async getTrades(coin: string, limit: number = 100): Promise<unknown[]> {
    return this.marketDataService.getTrades(coin, limit);
  }

  /**
   * Get metadata about available markets
   */
  async getMetadata(): Promise<unknown> {
    return this.marketDataService.getMetadata();
  }

  // Wallet Methods

  /**
   * Set wallet connection state (for browser wallet)
   */
  public setWalletConnectionState(state: WalletConnectionState | null): void {
    this.walletConnectionState = state;
    this.walletService.setWalletConnectionState(state);
  }

  /**
   * Get current wallet connection state
   */
  public getWalletConnectionState(): WalletConnectionState | null {
    return this.walletConnectionState;
  }

  /**
   * Initialize the wallet with the provided private key or browser wallet
   */
  async initializeWallet(walletState?: WalletConnectionState): Promise<void> {
    try {
      if (walletState) {
        // Set the wallet connection state
        this.setWalletConnectionState(walletState);
      }

      if (this.walletConnectionState?.isConnected) {
        // Initialize with browser wallet
        const initSuccess = await this.walletService.initializeWithBrowserWallet();
        if (!initSuccess) {
          throw new Error("Failed to initialize with browser wallet");
        }

        console.log("Wallet initialized successfully with browser wallet");
        return;
      } else {
        throw new Error("No wallet connection available. Please connect a browser wallet.");

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

        console.log("Wallet initialized successfully with private key");
      }
    } catch (error) {
      console.error("Error initializing wallet:", error);
      throw error;
    }
  }

  /**
   * Check if the wallet is ready to use
   */
  checkWalletStatus() {
    return this.walletService.checkExchangeStatus();
  }

  /**
   * Check if using browser wallet connection
   */
  public isUsingBrowserWallet(): boolean {
    return this.walletService.isUsingBrowserWallet();
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
  async getOpenOrders(): Promise<unknown[]> {
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
  async cancelAllOrders(coin: string): Promise<unknown> {
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
  async formatPriceForCoin(price: number, coin: string): Promise<string> {
    return this.tradingService.formatPriceForCoin(price, coin);
  }

  /**
   * Get the wallet client
   */
  public getWalletClient(): unknown {
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
