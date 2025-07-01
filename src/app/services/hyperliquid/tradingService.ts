import { AccountInfo } from "./types";
import { RateLimiter } from "./rateLimiter";
import { retryWithBackoff } from "./utils";
import { Config } from "../../config";
import { WalletService } from "./walletService";
import { MarketDataService } from "./marketDataService";

// Define interfaces for position data
interface PositionData {
  coin: string;
  size: number;
  absSize: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  leverage: number;
  side: string;
}

interface OpenOrder {
  coin: string;
  side: string;
  price: string;
  size: string;
  orderId: string;
  timestamp: number;
  [key: string]: unknown;
}

interface AssetPosition {
  coin: string;
  position: string;
  unrealizedPnl: string;
  realizedPnl: string;
  entryPx: string;
  markPx: string;
  liquidationPx: string;
  leverage: string;
  [key: string]: unknown;
}

// Interface for asset metadata
interface AssetMetadata {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  isDelisted?: boolean;
}

export class TradingService {
  private walletService: WalletService;
  private marketDataService: MarketDataService;
  private rateLimiter: RateLimiter;
  private config: Config;

  // PNL caching
  private _lastPnlRequestTime: number | null = null;
  private _lastPnlResponse: {
    success: boolean;
    totalUnrealizedPnl?: number;
    totalRealizedPnl?: number;
    positions?: PositionData[];
    error?: string;
    message?: string;
    rawData?: unknown;
  } | null = null;

  // Metadata caching
  private assetMetadataCache: Map<string, AssetMetadata> = new Map();
  private lastMetadataFetch: number = 0;
  private metadataMaxAge: number = 300000; // 5 minutes

  constructor(
    walletService: WalletService,
    marketDataService: MarketDataService,
    rateLimiter: RateLimiter,
    config: Config
  ) {
    this.walletService = walletService;
    this.marketDataService = marketDataService;
    this.rateLimiter = rateLimiter;
    this.config = config;

    // Initialize metadata in the background
    this.refreshAssetMetadata();
  }

  /**
   * Refresh asset metadata from the API
   */
  private async refreshAssetMetadata(): Promise<void> {
    try {
      const now = Date.now();
      if (now - this.lastMetadataFetch < this.metadataMaxAge) {
        return; // Don't refresh too frequently
      }

      console.log("Refreshing asset metadata...");
      const metadata = await this.marketDataService.getMetadata();

      if (metadata && metadata.universe) {
        this.assetMetadataCache.clear();
        metadata.universe.forEach((asset: AssetMetadata) => {
          if (asset.name) {
            this.assetMetadataCache.set(asset.name, asset);
          }
        });
        this.lastMetadataFetch = now;
        console.log(
          `Cached metadata for ${this.assetMetadataCache.size} assets`
        );
      }
    } catch (error) {
      console.error("Error refreshing asset metadata:", error);
    }
  }

  /**
   * Get asset metadata for a given coin
   */
  private async getAssetMetadata(coin: string): Promise<AssetMetadata | null> {
    // Check if we need to refresh metadata
    if (Date.now() - this.lastMetadataFetch > this.metadataMaxAge) {
      await this.refreshAssetMetadata();
    }

    return this.assetMetadataCache.get(coin) || null;
  }

  /**
   * Get proper tick size based on asset metadata
   */
  private async getTickSize(coin: string): Promise<number> {
    const metadata = await this.getAssetMetadata(coin);

    if (metadata && metadata.szDecimals !== undefined) {
      // For Hyperliquid, tick size is typically 1 / (10^szDecimals)
      // But for price, we need to be more conservative
      if (metadata.szDecimals === 5) {
        // BTC case - use 0.1 tick size for prices
        return 0.1;
      } else if (metadata.szDecimals === 4) {
        // ETH case - use 0.01 tick size for prices
        return 0.01;
      } else if (metadata.szDecimals === 0) {
        // Whole number coins - use 1.0 tick size
        return 1.0;
      } else {
        // For other cases, use 0.01 as default
        return 0.01;
      }
    }

    // Fallback to defaults if metadata not available
    if (coin === "BTC") return 0.1;
    if (coin === "ETH") return 0.01;
    return 0.01;
  }

  /**
   * Get proper size step based on asset metadata
   */
  private async getSizeStep(coin: string): Promise<number> {
    const metadata = await this.getAssetMetadata(coin);

    if (metadata && metadata.szDecimals !== undefined) {
      // Size step is 1 / (10^szDecimals)
      return 1 / Math.pow(10, metadata.szDecimals);
    }

    // Fallback to defaults if metadata not available
    if (coin === "BTC") return 0.00001; // 5 decimal places
    if (coin === "ETH") return 0.0001; // 4 decimal places
    return 0.01; // 2 decimal places default
  }

  /**
   * Get number of decimal places for formatting
   */
  private async getDecimalPlaces(
    coin: string,
    isSize: boolean = false
  ): Promise<number> {
    const metadata = await this.getAssetMetadata(coin);

    if (metadata && metadata.szDecimals !== undefined) {
      if (isSize) {
        return metadata.szDecimals;
      } else {
        // For prices, use fewer decimal places
        if (metadata.szDecimals === 5) return 1; // BTC
        if (metadata.szDecimals === 4) return 2; // ETH
        if (metadata.szDecimals === 0) return 0; // Whole number coins
        return 2; // Default
      }
    }

    // Fallback to defaults
    if (isSize) {
      if (coin === "BTC") return 5;
      if (coin === "ETH") return 4;
      return 2;
    } else {
      if (coin === "BTC") return 1;
      if (coin === "ETH") return 2;
      return 2;
    }
  }

  /**
   * Place a limit order
   */
  async placeLimitOrder(
    coin: string,
    side: "B" | "A",
    price: number,
    size: number,
    reduceOnly: boolean = false
  ): Promise<{
    success: boolean;
    message?: string;
    data?: unknown;
    orderId?: string;
  }> {
    // Validate inputs
    if (
      !coin ||
      !side ||
      typeof price !== "number" ||
      typeof size !== "number"
    ) {
      return {
        success: false,
        message: "Invalid input parameters",
      };
    }

    // Additional validation for price and size
    if (price <= 0) {
      console.error(`Invalid price for ${coin}: ${price} (must be positive)`);
      return {
        success: false,
        message: `Invalid price: ${price} (must be positive)`,
      };
    }

    if (size <= 0) {
      console.error(`Invalid size for ${coin}: ${size} (must be positive)`);
      return {
        success: false,
        message: `Invalid size: ${size} (must be positive)`,
      };
    }

    // Get current market price to validate against
    try {
      const orderBook = await this.marketDataService.getOrderBook(coin);
      if (
        orderBook &&
        orderBook.asks &&
        orderBook.bids &&
        orderBook.asks.length > 0 &&
        orderBook.bids.length > 0
      ) {
        const bestAsk = parseFloat(orderBook.asks[0].p);
        const bestBid = parseFloat(orderBook.bids[0].p);

        if (!isNaN(bestAsk) && !isNaN(bestBid) && bestAsk > 0 && bestBid > 0) {
          const marketPrice = (bestAsk + bestBid) / 2;

          // Check if price is too far from market price (95% limit)
          const deviation = Math.abs(price - marketPrice) / marketPrice;
          if (deviation > 0.95) {
            console.error(
              `Price ${price} for ${coin} is too far from market price ${marketPrice} (${(
                deviation * 100
              ).toFixed(2)}% deviation)`
            );
            return {
              success: false,
              message: `Price too far from market price (${(
                deviation * 100
              ).toFixed(2)}% deviation)`,
            };
          }
        }
      }
    } catch (error) {
      console.warn("Could not validate price against market price:", error);
      // Continue with the order placement even if we can't validate against market price
    }

    // Format price and size with proper precision
    const formattedPrice = await this.formatPriceForCoin(price, coin);
    if (!formattedPrice) {
      return {
        success: false,
        message: "Failed to format price",
      };
    }

    const formattedSize = await this.formatSizeForCoin(size, coin);
    if (!formattedSize) {
      return {
        success: false,
        message: "Failed to format size",
      };
    }

    // Log the order parameters
    console.log(
      `Placing order with parameters: ${JSON.stringify({
        coin,
        side,
        price: formattedPrice,
        size: formattedSize,
        reduceOnly,
      })}`
    );

    // Use the enqueueOrder method instead of enqueueRequest
    return this.rateLimiter.enqueueOrder(async () => {
      try {
        // Get exchange client
        const exchangeClient = this.walletService.getExchangeClient();

        if (!exchangeClient) {
          console.error(
            "Cannot place limit order: exchange client not initialized"
          );
          return {
            success: false,
            message: "Exchange client not initialized",
          };
        }

        // Get asset ID for the coin
        const assetId = this.getAssetIdForCoin(coin);
        if (assetId === -1) {
          return {
            success: false,
            message: `Invalid coin: ${coin}`,
          };
        }

        console.log("Placing order with parameters:", {
          coin,
          side,
          price: formattedPrice,
          size: formattedSize,
          reduceOnly,
        });

        try {
          // Use the new ExchangeClient order method
          const result = await exchangeClient.order({
            orders: [
              {
                a: assetId,
                b: side === "B",
                p: formattedPrice,
                s: formattedSize,
                r: reduceOnly,
                t: {
                  limit: {
                    tif: "Gtc",
                  },
                },
              },
            ],
            grouping: "na",
          });

          return {
            success: true,
            message: "Order placed successfully",
            data: result,
          };
        } catch (error: unknown) {
          const errorMessage = (error as Error)?.message || String(error);
          console.error("Error placing order:", errorMessage);

          if (errorMessage.includes("price") || errorMessage.includes("tick")) {
            // Handle price-related errors with proper tick size
            try {
              const tickSize = await this.getTickSize(coin);
              const numPrice = Number(formattedPrice);
              const tickCount = Math.round(numPrice / tickSize);
              const strictPriceStr = (tickCount * tickSize).toFixed(
                await this.getDecimalPlaces(coin, false)
              );

              console.log(
                `Retrying with strictly rounded price: ${strictPriceStr} (tick size: ${tickSize})`
              );

              const result = await exchangeClient.order({
                orders: [
                  {
                    a: assetId,
                    b: side === "B",
                    p: strictPriceStr,
                    s: formattedSize,
                    r: reduceOnly,
                    t: {
                      limit: {
                        tif: "Gtc",
                      },
                    },
                  },
                ],
                grouping: "na",
              });

              return {
                success: true,
                message: "Order placed successfully after price adjustment",
                data: result,
              };
            } catch {
              return {
                success: false,
                message:
                  "Price must be divisible by tick size. Please adjust your price.",
              };
            }
          } else if (errorMessage.includes("size")) {
            // Handle size-related errors with proper size step
            try {
              const sizeStep = await this.getSizeStep(coin);
              const numSize = Number(formattedSize);
              const stepCount = Math.round(numSize / sizeStep);
              const strictSizeStr = (stepCount * sizeStep).toFixed(
                await this.getDecimalPlaces(coin, true)
              );

              console.log(
                `Retrying with strictly rounded size: ${strictSizeStr} (size step: ${sizeStep})`
              );

              const result = await exchangeClient.order({
                orders: [
                  {
                    a: assetId,
                    b: side === "B",
                    p: formattedPrice,
                    s: strictSizeStr,
                    r: reduceOnly,
                    t: {
                      limit: {
                        tif: "Gtc",
                      },
                    },
                  },
                ],
                grouping: "na",
              });

              return {
                success: true,
                message: "Order placed successfully after size adjustment",
                data: result,
              };
            } catch {
              return {
                success: false,
                message:
                  "Size must be divisible by step size. Please adjust your order size.",
              };
            }
          } else if (errorMessage.includes("rate limit")) {
            return {
              success: false,
              message:
                "Rate limit exceeded. Please wait a moment before placing another order.",
            };
          } else {
            return {
              success: false,
              message: `Failed to place order: ${errorMessage}`,
            };
          }
        }
      } catch (error: unknown) {
        console.error("Error in placeLimitOrder:", error);
        return {
          success: false,
          message:
            "Failed to format order parameters. This may be due to an issue with the exchange client.",
        };
      }
    });
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<AccountInfo> {
    await this.walletService.ensureExchangeInitialized();
    const exchangeClient = this.walletService.getExchangeClient();

    if (!exchangeClient) {
      throw new Error("Exchange client is not initialized");
    }

    return this.rateLimiter.enqueueRequest(async () => {
      try {
        // Format wallet address if needed
        const formattedAddress = this.config.walletAddress.startsWith("0x")
          ? (this.config.walletAddress as `0x${string}`)
          : (`0x${this.config.walletAddress}` as `0x${string}`);

        // Use direct API call for more control
        const response = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "clearinghouseState",
            user: formattedAddress,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();

        // Extract account information
        const balance = parseFloat(
          data.crossMarginSummary?.accountValue || "0"
        );
        const margin = parseFloat(data.crossMarginSummary?.totalMargin || "0");

        return {
          balance,
          margin,
          crossMarginSummary: data.crossMarginSummary,
        };
      } catch (error) {
        console.error("Error fetching account info:", error);
        throw error;
      }
    });
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<OpenOrder[]> {
    await this.walletService.ensureExchangeInitialized();
    const exchangeClient = this.walletService.getExchangeClient();

    if (!exchangeClient) {
      throw new Error("Exchange client is not initialized");
    }

    return this.rateLimiter.enqueueRequest(async () => {
      try {
        // Format wallet address if needed
        const formattedAddress = this.config.walletAddress.startsWith("0x")
          ? (this.config.walletAddress as `0x${string}`)
          : (`0x${this.config.walletAddress}` as `0x${string}`);

        // Use direct API call for more control
        const response = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "openOrders",
            user: formattedAddress,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        return data || [];
      } catch (error) {
        console.error("Error fetching open orders:", error);
        return [];
      }
    });
  }

  /**
   * Ensure the exchange client is initialized and ready for trading operations
   * @returns True if the exchange client is ready for trading operations
   */
  private ensureExchangeReady(): boolean {
    try {
      // First, ensure the exchange client is initialized
      this.walletService.ensureExchangeInitialized();

      // Check if the exchange client is available
      const exchangeClient = this.walletService.getExchangeClient();

      if (!exchangeClient) {
        console.warn(
          "Exchange client is not available. Trading operations may fail."
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error ensuring exchange is ready:", error);
      return false;
    }
  }

  /**
   * Get total PNL for the account
   * @returns Total PNL
   */
  async getTotalPnl(): Promise<{
    success: boolean;
    totalUnrealizedPnl?: number;
    totalRealizedPnl?: number;
    positions?: PositionData[];
    error?: string;
  }> {
    try {
      // Ensure exchange client is ready for trading operations
      const isExchangeReady = this.ensureExchangeReady();

      if (!isExchangeReady) {
        return {
          success: false,
          error: "Exchange client is not ready for trading operations",
        };
      }

      // Check if wallet is initialized
      if (!this.config.walletAddress) {
        console.warn("Wallet address not configured for PNL calculation");
        return {
          success: false,
          error: "Wallet not initialized or address not configured",
        };
      }

      // Format wallet address if needed
      const formattedAddress = this.config.walletAddress.startsWith("0x")
        ? (this.config.walletAddress as `0x${string}`)
        : (`0x${this.config.walletAddress}` as `0x${string}`);

      // Implement rate limiting for PNL requests
      const now = Date.now();
      const minTimeBetweenRequests = 10000; // 10 seconds between PNL requests

      if (
        this._lastPnlRequestTime &&
        now - this._lastPnlRequestTime < minTimeBetweenRequests
      ) {
        console.log(
          `Skipping PNL request - too soon since last request (${
            now - this._lastPnlRequestTime
          }ms)`
        );
        return (
          this._lastPnlResponse || {
            success: true,
            message: "Using cached PNL data",
            totalUnrealizedPnl: 0,
            totalRealizedPnl: 0,
            positions: [],
          }
        );
      }

      this._lastPnlRequestTime = now;

      // Use retryWithBackoff to handle potential API issues
      const apiData = await retryWithBackoff(
        async () => {
          try {
            // Use direct API call since the SDK methods might not be available
            console.log("Attempting to get PNL data using direct API call...");
            const response = await fetch("https://api.hyperliquid.xyz/info", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "clearinghouseState",
                user: formattedAddress,
              }),
            });

            if (!response.ok) {
              if (response.status === 422) {
                console.warn(
                  "API rejected the request format (422). Wallet may not be properly configured."
                );

                // Try to get more detailed error information
                const errorText = await response.text();
                console.warn("API error details:", errorText);

                throw new Error(
                  "API rejected the request format. Wallet may not be properly configured."
                );
              } else {
                throw new Error(`HTTP error ${response.status}`);
              }
            }

            const data = await response.json();

            if (!data || !data.assetPositions) {
              throw new Error("Invalid response format from API");
            }

            return data;
          } catch (error) {
            console.error("Error fetching PNL data:", error);
            throw error;
          }
        },
        2, // max retries
        2000 // initial delay
      );

      // Calculate total PNL from positions
      let totalUnrealizedPnl = 0;
      let totalRealizedPnl = 0;
      const positions: PositionData[] = [];

      if (apiData && apiData.assetPositions) {
        apiData.assetPositions.forEach((position: AssetPosition) => {
          const unrealizedPnl = parseFloat(position.unrealizedPnl) || 0;
          const realizedPnl = parseFloat(position.realizedPnl) || 0;

          totalUnrealizedPnl += unrealizedPnl;
          totalRealizedPnl += realizedPnl;

          positions.push({
            coin: position.coin,
            size: parseFloat(position.position) || 0,
            absSize: Math.abs(parseFloat(position.position) || 0),
            entryPrice: parseFloat(position.entryPx) || 0,
            markPrice: parseFloat(position.markPx) || 0,
            unrealizedPnl,
            realizedPnl,
            liquidationPrice: parseFloat(position.liquidationPx) || 0,
            leverage: parseFloat(position.leverage) || 0,
            side: parseFloat(position.position) > 0 ? "buy" : "sell",
          });
        });
      }

      const result = {
        success: true,
        message: "PNL data retrieved successfully",
        totalUnrealizedPnl,
        totalRealizedPnl,
        positions,
        rawData: apiData,
      };

      // Cache the response
      this._lastPnlResponse = result;

      return result;
    } catch (error) {
      console.error("Error in getTotalPnl:", error);
      return {
        success: false,
        error: `Error retrieving PNL data: ${error}`,
      };
    }
  }

  /**
   * Cancel all orders for a specific coin
   * @param coin Coin to cancel orders for
   * @returns Success message or error
   */
  async cancelAllOrders(coin: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    data?: unknown;
  }> {
    try {
      // Validate coin parameter
      if (!coin) {
        return {
          success: false,
          error: "Coin parameter is required",
        };
      }

      // Ensure the exchange client is ready for trading
      if (!this.ensureExchangeReady()) {
        return {
          success: false,
          error: "Exchange client is not ready for trading operations",
        };
      }

      // Get the exchange client
      const exchangeClient = this.walletService.getExchangeClient();
      if (!exchangeClient) {
        return {
          success: false,
          error: "Exchange client is not available",
        };
      }

      // Get the asset ID for the coin
      const assetId = await this.marketDataService.getAssetIdByCoin(coin);

      // Validate the asset ID
      if (assetId === undefined || assetId === null || assetId < 0) {
        console.error(`Invalid asset ID for ${coin}: ${assetId}`);
        return {
          success: false,
          error: `Asset ID not found or invalid for ${coin}`,
        };
      }

      try {
        console.log(
          `Attempting to cancel all orders for ${coin} (asset ID: ${assetId})`
        );

        // Use the new ExchangeClient cancel method
        const response = await exchangeClient.cancel({
          cancels: [{ a: assetId, o: 0 }],
        });

        console.log(`Cancel orders response:`, response);

        return {
          success: true,
          message: `All orders for ${coin} cancelled successfully`,
          data: response,
        };
      } catch (cancelError: unknown) {
        console.error(`Error in cancel for ${coin}:`, cancelError);

        // Check if the error is about orders already canceled or never placed
        // This is not a critical error, so we can treat it as a success
        const errorMessage =
          (cancelError as Error)?.message || String(cancelError);
        if (
          errorMessage.includes("already canceled") ||
          errorMessage.includes("never placed") ||
          errorMessage.includes("Order was never placed")
        ) {
          console.log(
            `No active orders to cancel for ${coin} (asset ID: ${assetId})`
          );
          return {
            success: true,
            message: `No active orders to cancel for ${coin}`,
          };
        }

        return {
          success: false,
          error: `Failed to cancel orders: ${
            (cancelError as Error).message || String(cancelError)
          }`,
        };
      }
    } catch (error: unknown) {
      console.error(`Error cancelling orders for ${coin}:`, error);
      return {
        success: false,
        error: `Failed to cancel orders: ${
          (error as Error).message || String(error)
        }`,
      };
    }
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
    try {
      // Get account info to determine available balance
      const accountInfo = await this.getAccountInfo();
      const availableBalance = accountInfo.balance;

      // Calculate the amount to risk based on percentage
      const amountToRisk = (availableBalance * riskPercentage) / 100;

      // Get the minimum size for this coin
      const minSize = this.getMinimumSize(coin);

      // Calculate size based on price and leverage
      let size = (amountToRisk * leverage) / price;

      // Round to appropriate precision for this coin
      const precision = this.getPrecisionForCoin(coin);
      size =
        Math.floor(size * Math.pow(10, precision)) / Math.pow(10, precision);

      // Ensure size is at least the minimum
      size = Math.max(size, minSize);

      console.log(
        `Calculated order size for ${coin}: ${size} (${riskPercentage}% risk of ${availableBalance} balance at ${leverage}x leverage)`
      );

      return size;
    } catch (error) {
      console.error("Error calculating order size:", error);
      return 0;
    }
  }

  /**
   * Get minimum size for a coin
   */
  getMinimumSize(coin: string): number {
    // Default minimum sizes for common coins
    const defaultMinSizes: Record<string, number> = {
      BTC: 0.0001,
      ETH: 0.01,
      SOL: 0.1,
      AVAX: 0.1,
      ARB: 1,
      OP: 1,
      DOGE: 10,
      MATIC: 1,
      LINK: 0.1,
      DOT: 0.1,
      UNI: 0.1,
      AAVE: 0.1,
      ATOM: 0.1,
      LTC: 0.01,
      XRP: 1,
    };

    return defaultMinSizes[coin] || 0.01; // Default to 0.01 if not found
  }

  /**
   * Get precision for a coin (number of decimal places)
   */
  private getPrecisionForCoin(coin: string): number {
    // Check cache first
    if (this.assetMetadataCache.has(coin)) {
      const metadata = this.assetMetadataCache.get(coin)!;
      return metadata.szDecimals;
    }

    // Default precision values for common coins
    const defaultPrecision: Record<string, number> = {
      BTC: 4, // 0.0001 BTC
      ETH: 2, // 0.01 ETH
      SOL: 1, // 0.1 SOL
      AVAX: 1, // 0.1 AVAX
      ARB: 0, // 1 ARB
      OP: 0, // 1 OP
      DOGE: 0, // 1 DOGE
      MATIC: 0, // 1 MATIC
      LINK: 1, // 0.1 LINK
      DOT: 1, // 0.1 DOT
      UNI: 1, // 0.1 UNI
      AAVE: 1, // 0.1 AAVE
      ATOM: 1, // 0.1 ATOM
      LTC: 2, // 0.01 LTC
      XRP: 0, // 1 XRP
    };

    const precision = defaultPrecision[coin] || 2; // Default to 2 decimal places
    this.assetMetadataCache.set(coin, {
      name: coin,
      szDecimals: precision,
      maxLeverage: 50, // Default leverage
    });
    return precision;
  }

  /**
   * Format price for a specific coin using dynamic metadata
   */
  async formatPriceForCoin(price: number, coin: string): Promise<string> {
    try {
      const tickSize = await this.getTickSize(coin);
      const decimalPlaces = await this.getDecimalPlaces(coin, false);

      // Round to nearest tick
      const tickCount = Math.round(price / tickSize);
      const roundedPrice = tickCount * tickSize;

      // Format with proper decimal places
      const formatted = roundedPrice.toFixed(decimalPlaces);

      // Remove trailing zeros but keep at least one decimal place for BTC
      if (coin === "BTC" && !formatted.includes(".")) {
        return formatted + ".0";
      }

      return formatted.replace(/\.?0+$/, "") || formatted;
    } catch (error) {
      console.error(`Error formatting price for ${coin}:`, error);
      return "";
    }
  }

  /**
   * Format size with proper precision using dynamic metadata
   */
  async formatSizeForCoin(size: number, coin: string): Promise<string> {
    try {
      const sizeStep = await this.getSizeStep(coin);
      const decimalPlaces = await this.getDecimalPlaces(coin, true);

      // Round to nearest step
      const stepCount = Math.round(size / sizeStep);
      const roundedSize = stepCount * sizeStep;

      // Format with proper decimal places
      const formatted = roundedSize.toFixed(decimalPlaces);

      // Validate the formatted size
      if (isNaN(Number(formatted)) || Number(formatted) <= 0) {
        console.error(`Invalid size for ${coin}: ${formatted}`);
        return "";
      }

      return formatted;
    } catch (error) {
      console.error(`Error formatting size for ${coin}:`, error);
      return "";
    }
  }

  /**
   * Fallback price formatting based on price range
   */
  private fallbackPriceFormat(price: number): string {
    const numPrice = Number(price);
    return numPrice.toLocaleString("fullwide", {
      useGrouping: false,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  /**
   * Get the asset ID for a given coin
   */
  private getAssetIdForCoin(coin: string): number {
    // In Hyperliquid, BTC is asset ID 0
    if (coin === "BTC") return 0;

    // ETH is asset ID 1
    if (coin === "ETH") return 1;

    // For other coins, we would need to look up the asset ID from metadata
    // This is a simplified implementation
    const coinToAssetId: Record<string, number> = {
      BTC: 0,
      ETH: 1,
      SOL: 2,
      ARB: 3,
      LINK: 4,
      MATIC: 5,
      DOGE: 6,
      BNB: 7,
      ADA: 8,
      XRP: 9,
      AVAX: 10,
      OP: 11,
      ATOM: 12,
      LTC: 13,
      DOT: 14,
      NEAR: 15,
      TRX: 16,
      UNI: 17,
      AAVE: 18,
      SHIB: 19,
      APE: 20,
      FIL: 21,
      PEPE: 22,
      SUI: 23,
      BLUR: 24,
      BONK: 25,
      INJ: 26,
      DYDX: 27,
      APT: 28,
      SEI: 29,
      JTO: 30,
      STRK: 31,
      JUP: 32,
      PYTH: 33,
      MEME: 34,
      TIA: 35,
      WIF: 36,
      RNDR: 37,
      ORDI: 38,
      PENDLE: 39,
      RUNE: 40,
      ETHFI: 41,
      CYBER: 42,
      METIS: 43,
      MANTA: 44,
      BEAMX: 45,
      WSTETH: 46,
      ETHENA: 47,
      USDC: 48,
      USDT: 49,
      DAI: 50,
    };

    return coinToAssetId[coin] || -1;
  }
}
