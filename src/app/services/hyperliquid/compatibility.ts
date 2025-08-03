import { HyperliquidService as ModularHyperliquidService } from "./index";
import { Config } from "../../config";
import { HyperliquidCandle, QueuedRequest } from "./types";
import { WalletConnectionState } from "@/components/wallet/WalletConnection";

/**
 * Compatibility layer for the HyperliquidService
 * This class extends the new modular HyperliquidService to match the interface of the old one
 * It will be used during the migration period and can be removed once all code is updated
 */
export class HyperliquidService extends ModularHyperliquidService {
  // Properties from the old service that need to be exposed
  public walletClient: unknown;
  
  // Add exchange property for compatibility
  private _cachedExchange: unknown = null;
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

    // Initialize wallet if wallet address is configured
    if (config.walletAddress) {
      this.initializeWallet().catch(err => {
        console.error("Failed to initialize wallet:", err);
      });
    }
  }

  // Override the getter for exchange to ensure it's always up to date
  get exchange() {
    // This is needed for compatibility with code that uses service.exchange
    // The wallet client IS the exchange client in the new architecture
    const walletClient = super.getWalletClient();
    this._cachedExchange = walletClient || null;
    return this._cachedExchange;
  }

  // Override initializeWallet to set the walletClient property
  async initializeWallet(walletState?: WalletConnectionState): Promise<void> {
    await super.initializeWallet(walletState);

    // Update the walletClient property after initialization
    this.walletClient = super.getWalletClient();
    this._cachedExchange = this.walletClient;

    // Ensure the wallet client is properly initialized
    if (this.walletClient) {
      // In the new architecture, the wallet client IS the exchange client
      // So we just need to verify that it's a valid ExchangeClient
      const hasExchangeMethods = 
        typeof (this.walletClient as Record<string, unknown>).order === 'function' ||
        typeof (this.walletClient as Record<string, unknown>).cancel === 'function' ||
        typeof (this.walletClient as Record<string, unknown>).cancelByCloid === 'function';

      if (!hasExchangeMethods) {
        console.warn(
          "Exchange client does not appear to have trading methods. Trading functionality may be limited."
        );
      } else {
        console.log(
          "Exchange client initialization completed successfully with trading methods available"
        );
      }
    } else {
      console.log(
        "Wallet client initialization completed. Exchange client will be available when needed."
      );
    }
  }

  // Add any methods from the old service that aren't in the new service
  // or that have different signatures

  // If there are any methods with the same name but different implementations,
  // override them here to maintain backward compatibility
}
