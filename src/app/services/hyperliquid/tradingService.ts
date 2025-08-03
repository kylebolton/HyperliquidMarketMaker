import { AccountInfo } from "./types";
import { RateLimiter } from "./rateLimiter";
import { retryWithBackoff } from "./utils";
import { Config } from "../../config";
import { WalletService } from "./walletService";
import { MarketDataService } from "./marketDataService";
import type { TIF } from "@nktkas/hyperliquid";

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
  private assetIndexMap: Map<string, number> = new Map(); // coin name -> index
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
   * Update the configuration at runtime
   * @param config New configuration object
   */
  public updateConfig(config: Config): void {
    this.config = config;
    console.log("TradingService config updated with wallet address:", config.walletAddress);
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
      const metadataResponse = await this.marketDataService.getMetadata();

      if (metadataResponse && metadataResponse.universe) {
        this.assetMetadataCache.clear();
        this.assetIndexMap.clear();
        metadataResponse.universe.forEach((asset: AssetMetadata, index: number) => {
          if (asset.name) {
            this.assetMetadataCache.set(asset.name, asset);
            this.assetIndexMap.set(asset.name, index);
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
   * For Hyperliquid, the tick size for prices is typically based on the asset's price level
   */
  private async getTickSize(coin: string): Promise<number> {
    // Get metadata for future use
    await this.getAssetMetadata(coin);

    // Get current market price to determine appropriate tick size
    try {
      const orderBook = await this.marketDataService.getOrderBook(coin);
      if (orderBook && orderBook.asks && orderBook.bids && 
          orderBook.asks.length > 0 && orderBook.bids.length > 0) {
        const bestAsk = parseFloat(orderBook.asks[0].p);
        const bestBid = parseFloat(orderBook.bids[0].p);
        const midPrice = (bestAsk + bestBid) / 2;
        
        // Determine tick size based on price level (Hyperliquid standard)
        if (midPrice >= 10000) {
          return 1.0;    // Above $10k: $1 tick
        } else if (midPrice >= 1000) {
          return 0.1;    // $1k-$10k: $0.10 tick
        } else if (midPrice >= 100) {
          return 0.01;   // $100-$1k: $0.01 tick
        } else if (midPrice >= 10) {
          return 0.001;  // $10-$100: $0.001 tick
        } else if (midPrice >= 1) {
          return 0.0001; // $1-$10: $0.0001 tick
        } else {
          return 0.00001; // Below $1: $0.00001 tick
        }
      }
    } catch (error) {
      console.warn(`Could not get market price for ${coin} tick size:`, error);
    }

    // Fallback based on typical asset prices if market data unavailable
    if (coin === "BTC") return 0.1;   // BTC typically ~$50k
    if (coin === "ETH") return 0.01;  // ETH typically ~$3k
    if (coin === "SOL") return 0.001; // SOL typically ~$100
    if (coin === "DOGE" || coin === "XRP" || coin === "ADA") return 0.00001; // Low price coins
    
    return 0.01; // Safe default for mid-range assets
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
        // Size decimal places come directly from metadata
        return metadata.szDecimals;
      } else {
        // For prices, determine based on tick size
        const tickSize = await this.getTickSize(coin);
        if (tickSize >= 1) return 0;
        if (tickSize >= 0.1) return 1;
        if (tickSize >= 0.01) return 2;
        if (tickSize >= 0.001) return 3;
        if (tickSize >= 0.0001) return 4;
        return 5; // For very small tick sizes
      }
    }

    // Fallback to defaults
    if (isSize) {
      if (coin === "BTC") return 5;
      if (coin === "ETH") return 4;
      if (coin === "SOL") return 2;
      if (coin === "DOGE" || coin === "XRP" || coin === "ADA") return 0;
      return 2;
    } else {
      if (coin === "BTC") return 1;
      if (coin === "ETH") return 2;
      if (coin === "SOL") return 3;
      if (coin === "DOGE" || coin === "XRP" || coin === "ADA") return 5;
      return 2;
    }
  }

  /**
   * Calculate and apply trading fee
   * @param price Order price
   * @param size Order size
   * @returns Fee amount in USD
   */
  private calculateTradingFee(price: number, size: number): number {
    const orderValue = price * size;
    const feeAmount = (orderValue * this.config.feeBasisPoints) / 10000;
    return feeAmount;
  }

  /**
   * Send trading fee to the configured recipient
   * This would be implemented based on the exchange's fee sharing mechanism
   */
  private async processTradingFee(feeAmount: number, coin: string): Promise<void> {
    try {
      // Log the fee calculation for transparency
      console.log(`Trading fee calculated: ${feeAmount} USD (${this.config.feeBasisPoints} bps) for ${coin}`);
      console.log(`Fee recipient: ${this.config.feeRecipient}`);
      
      // Note: Actual fee transfer would depend on the exchange's fee sharing API
      // For now, we log the fee calculation for record keeping
      // In a production system, this might involve:
      // 1. Recording the fee in a database
      // 2. Making an API call to transfer funds
      // 3. Using the exchange's referral/fee sharing program
      
    } catch (error) {
      console.error("Error processing trading fee:", error);
      // Don't throw here to avoid failing the main trade
    }
  }

  /**
   * Place multiple limit orders in a single transaction (batch order)
   * This avoids multiple wallet signing popups
   */
  async placeBatchLimitOrders(
    orders: Array<{
      coin: string;
      side: "B" | "A";
      price: number;
      size: number;
      reduceOnly?: boolean;
    }>
  ): Promise<{
    success: boolean;
    message?: string;
    data?: unknown;
    totalFeeAmount?: number;
    processedOrders?: number;
  }> {
    if (!orders || orders.length === 0) {
      return {
        success: false,
        message: "No orders provided",
      };
    }

    // Validate all orders first
    for (const order of orders) {
      if (
        !order.coin ||
        !order.side ||
        typeof order.price !== "number" ||
        typeof order.size !== "number" ||
        order.price <= 0 ||
        order.size <= 0
      ) {
        return {
          success: false,
          message: `Invalid order parameters for ${order.coin}`,
        };
      }
    }

    return this.rateLimiter.enqueueOrder(async () => {
      try {
        const exchangeClient = this.walletService.getExchangeClient();
        if (!exchangeClient) {
          return {
            success: false,
            message: "Exchange client not initialized",
          };
        }

        // Prepare batch orders
        const batchOrders = [];
        let totalFeeAmount = 0;

        for (const order of orders) {
          // Get asset ID for the coin
          const assetId = await this.getAssetIdForCoin(order.coin);
          if (assetId === -1) {
            return {
              success: false,
              message: `Invalid coin: ${order.coin}`,
            };
          }

          // Format price and size
          const formattedPrice = await this.formatPriceForCoin(order.price, order.coin);
          const formattedSize = await this.formatSizeForCoin(order.size, order.coin);

          if (!formattedPrice || !formattedSize) {
            return {
              success: false,
              message: `Failed to format order parameters for ${order.coin}`,
            };
          }

          // Calculate fee for this order
          const feeAmount = this.calculateTradingFee(order.price, order.size);
          totalFeeAmount += feeAmount;

          // Add to batch
          batchOrders.push({
            a: assetId,
            b: order.side === "B",
            p: formattedPrice,
            s: formattedSize,
            r: order.reduceOnly || false,
            t: {
              limit: {
                tif: "Gtc" as TIF,
              },
            },
          });

          console.log(`Prepared batch order: ${order.coin} ${order.side} ${formattedPrice} x ${formattedSize}`);
        }

        console.log(`Placing batch of ${batchOrders.length} orders`);

        // Place all orders in a single transaction
        const result = await exchangeClient.order({
          orders: batchOrders,
          grouping: "na",
        });

        // Process trading fees for all orders
        for (const order of orders) {
          const feeAmount = this.calculateTradingFee(order.price, order.size);
          await this.processTradingFee(feeAmount, order.coin);
        }

        return {
          success: true,
          message: `Batch of ${batchOrders.length} orders placed successfully`,
          data: result,
          totalFeeAmount,
          processedOrders: batchOrders.length,
        };
      } catch (error: unknown) {
        const errorMessage = (error as Error)?.message || String(error);
        console.error("Error placing batch orders:", errorMessage);

        return {
          success: false,
          message: `Failed to place batch orders: ${errorMessage}`,
        };
      }
    });
  }

  /**
   * Place a limit order with automatic fee calculation
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
    feeAmount?: number;
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
        const assetId = await this.getAssetIdForCoin(coin);
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
          // Calculate trading fee before placing order
          const feeAmount = this.calculateTradingFee(price, size);
          
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
                    tif: "Gtc" as TIF,
                  },
                },
              },
            ],
            grouping: "na",
          });

          // Process the trading fee after successful order placement
          await this.processTradingFee(feeAmount, coin);

          return {
            success: true,
            message: "Order placed successfully",
            data: result,
            feeAmount,
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
                        tif: "Gtc" as TIF,
                      },
                    },
                  },
                ],
                grouping: "na",
              });

              // Process fee for the adjusted order
              const adjustedPrice = Number(strictPriceStr);
              const feeAmount = this.calculateTradingFee(adjustedPrice, size);
              await this.processTradingFee(feeAmount, coin);

              return {
                success: true,
                message: "Order placed successfully after price adjustment",
                data: result,
                feeAmount,
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
                        tif: "Gtc" as TIF,
                      },
                    },
                  },
                ],
                grouping: "na",
              });

              // Process fee for the adjusted order
              const adjustedSize = Number(strictSizeStr);
              const feeAmount = this.calculateTradingFee(price, adjustedSize);
              await this.processTradingFee(feeAmount, coin);

              return {
                success: true,
                message: "Order placed successfully after size adjustment",
                data: result,
                feeAmount,
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
        if (!this.config.walletAddress) {
          throw new Error("Wallet address is not configured");
        }
        
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
        if (!this.config.walletAddress) {
          throw new Error("Wallet address is not configured");
        }
        
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
      if (!this.config.walletAddress) {
        return {
          success: false,
          error: "Wallet address is not configured",
          totalUnrealizedPnl: 0,
          totalRealizedPnl: 0,
          positions: [],
        };
      }
      
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
      const assetId = await this.getAssetIdForCoin(coin);

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

        // First, get all open orders for this asset
        const openOrders = await this.getOpenOrders();
        const ordersForAsset = openOrders.filter((order: any) => {
          return order.coin === coin || (order.a !== undefined && order.a === assetId);
        });

        if (ordersForAsset.length === 0) {
          console.log(`No open orders found for ${coin} (asset ID: ${assetId})`);
          return {
            success: true,
            message: `No active orders to cancel for ${coin}`,
          };
        }

        console.log(`Found ${ordersForAsset.length} orders to cancel for ${coin}`);

        // Cancel all orders by using o: 0 (cancel all) or specific order IDs
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
          errorMessage.includes("Order was never placed") ||
          errorMessage.includes("or filled")
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

      // Ensure price is positive
      if (price <= 0) {
        throw new Error(`Invalid price: ${price}`);
      }

      // Round to nearest tick (crucial for Hyperliquid)
      const tickCount = Math.round(price / tickSize);
      const roundedPrice = tickCount * tickSize;

      // Format with exact decimal places (no trailing zero removal for consistency)
      let formatted = roundedPrice.toFixed(decimalPlaces);

      // Validate the result
      const numFormatted = Number(formatted);
      if (isNaN(numFormatted) || numFormatted <= 0) {
        throw new Error(`Invalid formatted price: ${formatted}`);
      }

      // Ensure price is divisible by tick size (double-check)
      const remainder = numFormatted % tickSize;
      if (Math.abs(remainder) > tickSize * 0.0001) { // Allow tiny floating point errors
        console.warn(`Price ${formatted} may not be exactly divisible by tick size ${tickSize}, remainder: ${remainder}`);
        // Re-round more strictly
        const strictTickCount = Math.round(numFormatted / tickSize);
        formatted = (strictTickCount * tickSize).toFixed(decimalPlaces);
      }

      console.log(`Formatted price for ${coin}: ${price} -> ${formatted} (tick: ${tickSize}, decimals: ${decimalPlaces})`);
      return formatted;
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

      // Ensure size is positive
      if (size <= 0) {
        throw new Error(`Invalid size: ${size}`);
      }

      // Round to nearest step (crucial for Hyperliquid size requirements)
      const stepCount = Math.round(size / sizeStep);
      let roundedSize = stepCount * sizeStep;

      // Ensure minimum size
      if (roundedSize < sizeStep) {
        roundedSize = sizeStep;
      }

      // Format with exact decimal places
      let formatted = roundedSize.toFixed(decimalPlaces);

      // Validate the result
      const numFormatted = Number(formatted);
      if (isNaN(numFormatted) || numFormatted <= 0) {
        throw new Error(`Invalid formatted size: ${formatted}`);
      }

      // Ensure size is divisible by size step (double-check)
      const remainder = numFormatted % sizeStep;
      if (Math.abs(remainder) > sizeStep * 0.0001) { // Allow tiny floating point errors
        console.warn(`Size ${formatted} may not be exactly divisible by size step ${sizeStep}, remainder: ${remainder}`);
        // Re-round more strictly
        const strictStepCount = Math.round(numFormatted / sizeStep);
        formatted = (strictStepCount * sizeStep).toFixed(decimalPlaces);
      }

      // Remove unnecessary trailing zeros for cleaner formatting
      formatted = formatted.replace(/\.?0+$/, "");
      
      // But ensure we don't have an empty string
      if (!formatted || formatted === "0") {
        formatted = sizeStep.toFixed(decimalPlaces).replace(/\.?0+$/, "");
      }

      console.log(`Formatted size for ${coin}: ${size} -> ${formatted} (step: ${sizeStep}, decimals: ${decimalPlaces})`);
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
   * Get the asset ID for a given coin using dynamic metadata
   */
  private async getAssetIdForCoin(coin: string): Promise<number> {
    // Ensure metadata is fresh
    if (Date.now() - this.lastMetadataFetch > this.metadataMaxAge) {
      await this.refreshAssetMetadata();
    }

    // Check cached index map first
    const cachedIndex = this.assetIndexMap.get(coin);
    if (cachedIndex !== undefined) {
      return cachedIndex;
    }

    // Try to refresh metadata and find the asset
    try {
      await this.refreshAssetMetadata();
      const refreshedIndex = this.assetIndexMap.get(coin);
      if (refreshedIndex !== undefined) {
        return refreshedIndex;
      }
    } catch (error) {
      console.error(`Error fetching asset ID for ${coin}:`, error);
    }

    // Fallback to known asset indices based on the actual Hyperliquid metadata structure
    const fallbackMapping: Record<string, number> = {
      BTC: 0,
      ETH: 1,
      ATOM: 2,
      MATIC: 3,
      DYDX: 4,
      SOL: 5,
      AVAX: 6,
      BNB: 7,
      APE: 8,
      OP: 9,
      LTC: 10,
      ARB: 11,
      DOGE: 12,
      INJ: 13,
      SUI: 14,
      kPEPE: 15,
      CRV: 16,
      LDO: 17,
      LINK: 18,
      STX: 19,
    };

    const fallbackId = fallbackMapping[coin];
    if (fallbackId !== undefined) {
      console.warn(`Using fallback asset ID ${fallbackId} for ${coin}`);
      return fallbackId;
    }

    console.error(`Asset ID not found for ${coin}`);
    return -1;
  }
}
