import { HyperliquidService as ModularHyperliquidService } from "./index";
import { Config } from "../../config";
import { HyperliquidCandle, QueuedRequest } from "./types";

/**
 * Compatibility layer for the HyperliquidService
 * This class extends the new modular HyperliquidService to match the interface of the old one
 * It will be used during the migration period and can be removed once all code is updated
 */
export class HyperliquidService extends ModularHyperliquidService {
  // Properties from the old service that need to be exposed
  public walletClient: unknown;
  public candleCache: Map<string, HyperliquidCandle[]> = new Map();
  public orderBookCache: Map<string, unknown> = new Map();
  public tradeCache: Map<string, unknown[]> = new Map();
  public activeSubscriptions: Map<string, unknown> = new Map();
  public availableCoinsCache: string[] = [];
  public lastMetaFetch = 0;
  public requestQueue: Array<() => Promise<unknown>> = [];
  public isProcessingQueue = false;
  public rateLimitWindowMs = 60000;
  public maxRequestsPerWindow = 5;
  public requestTimestamps: number[] = [];
  public szDecimalsCache: Map<string, number> = new Map();
  public metadata: unknown = null;
  public assetIdCache: Map<string, number> = new Map();
  public orderQueue: Array<QueuedRequest<unknown>> = [];
  public isProcessingOrderQueue = false;
  public lastOrderTime = 0;
  public orderDelayMs = 1000;
  public lastOrderBookUpdate: Map<string, number> = new Map();
  public lastTradeUpdate: Map<string, number> = new Map();
  public lastMidPriceUpdate: number = 0;
  public orderBookThrottleMs: number = 5000;
  public tradeThrottleMs: number = 10000;
  public midPriceThrottleMs: number = 3000;
  private _lastPnlRequestTime: number | null = null;
  private _lastPnlResponse: unknown = null;
  private wallet: unknown;

  constructor(config: Config) {
    super(config);

    // Initialize wallet if API secret is provided
    if (config.apiSecret) {
      this.initializeWallet().catch(err => {
        console.error("Failed to initialize wallet:", err);
      });
    }
  }

  // Override the getter for exchange to ensure it's always up to date
  get exchange() {
    // This is needed for compatibility with code that uses service.exchange
    const walletClient = super.getWalletClient();
    return walletClient
      ? (walletClient as Record<string, unknown>).exchange
      : null;
  }

  // Override initializeWallet to set the walletClient property
  async initializeWallet(): Promise<void> {
    await super.initializeWallet();

    // Update the walletClient property after initialization
    this.walletClient = super.getWalletClient();

    // Ensure the wallet client is properly initialized
    if (this.walletClient) {
      // Wait a moment for the wallet client to fully initialize
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if the exchange property is available
      if (!(this.walletClient as Record<string, unknown>).exchange) {
        console.warn(
          "Exchange property not found on wallet client. Attempting to fix..."
        );

        // Try to manually set the exchange property
        if (this.walletClient) {
          // Since we can't access the walletService directly, we'll check if the exchange
          // property is already available on the wallet client from the parent class
          if (!(this.walletClient as Record<string, unknown>).exchange) {
            console.error(
              "Could not initialize exchange property on wallet client. Trading functionality may be limited."
            );
          }
        }
      }

      console.log(
        "Wallet client initialization completed with exchange:",
        (this.walletClient as Record<string, unknown>).exchange
          ? "available"
          : "not available"
      );
    } else {
      console.error(
        "Wallet client initialization failed in compatibility layer"
      );
    }
  }

  // Add any methods from the old service that aren't in the new service
  // or that have different signatures

  // If there are any methods with the same name but different implementations,
  // override them here to maintain backward compatibility
}
