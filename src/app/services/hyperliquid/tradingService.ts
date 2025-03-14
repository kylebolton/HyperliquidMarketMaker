import { WalletClient } from "@nktkas/hyperliquid";
import { PlaceOrderResponse, PnlData, AccountInfo } from "./types";
import { RateLimiter } from "./rateLimiter";
import { retryWithBackoff } from "./utils";
import { Config } from "../../config";
import { WalletService } from "./walletService";
import { MarketDataService } from "./marketDataService";

export class TradingService {
  private walletService: WalletService;
  private marketDataService: MarketDataService;
  private rateLimiter: RateLimiter;
  private config: Config;

  // PNL caching
  private _lastPnlRequestTime: number | null = null;
  private _lastPnlResponse: PnlData | null = null;

  // Size decimals cache
  private szDecimalsCache: Map<string, number> = new Map();

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
    data?: any;
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

    // Format price with proper precision
    const formattedPrice = this.formatPriceForCoin(price, coin);
    if (!formattedPrice) {
      return {
        success: false,
        message: "Failed to format price",
      };
    }

    // Format size with proper precision
    const formattedSize = this.formatSize(size, coin);
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
        // Get wallet client
        const walletClient = this.walletService.getWalletClient();

        if (!walletClient) {
          console.error(
            "Cannot place limit order: wallet client not initialized"
          );
          return {
            success: false,
            message: "Wallet client not initialized",
          };
        }

        // Check if exchange property exists on wallet client
        if (!(walletClient as any).exchange) {
          console.error(
            "Cannot place limit order: exchange not available on wallet client"
          );
          return {
            success: false,
            message: "Exchange not available on wallet client",
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

        // Create order object with the formatted values
        const orderObj = {
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
        };

        console.log("Placing order with parameters:", {
          coin,
          side,
          price: formattedPrice,
          size: formattedSize,
          reduceOnly,
        });

        try {
          const result = await (walletClient as any).exchange.placeOrder(
            orderObj
          );
          return {
            success: true,
            data: result,
          };
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          console.error("Error placing order:", errorMessage);

          if (errorMessage.includes("price")) {
            // Handle price-related errors
            try {
              // For BTC, ensure price is divisible by tick size (0.1)
              let strictPriceStr;
              if (coin === "BTC") {
                const numPrice = Number(formattedPrice);
                const tickSize = 0.1;
                const tickCount = Math.floor(numPrice / tickSize);
                strictPriceStr = (tickCount * tickSize).toFixed(1);
              } else {
                const numPrice = Number(formattedPrice);
                const tickSize = 0.01;
                const tickCount = Math.floor(numPrice / tickSize);
                strictPriceStr = (tickCount * tickSize).toFixed(2);
              }

              console.log(
                `Retrying with strictly rounded price: ${strictPriceStr}`
              );

              const finalAttemptOrder = {
                ...orderObj,
                p: strictPriceStr,
              };

              const result = await (walletClient as any).exchange.placeOrder(
                finalAttemptOrder
              );
              return {
                success: true,
                data: result,
              };
            } catch (finalError) {
              return {
                success: false,
                message:
                  "Price must be divisible by tick size. Please adjust your price.",
              };
            }
          } else if (errorMessage.includes("size")) {
            return {
              success: false,
              message:
                "Size must be divisible by step size. Please adjust your order size.",
            };
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
      } catch (error: any) {
        console.error("Error in placeLimitOrder:", error);
        return {
          success: false,
          message:
            "Failed to format order parameters. This may be due to an issue with the wallet client.",
        };
      }
    });
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<AccountInfo> {
    await this.walletService.ensureWalletInitialized();
    const walletClient = this.walletService.getWalletClient();

    if (!walletClient) {
      throw new Error("Wallet client is not initialized");
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
  async getOpenOrders(): Promise<any[]> {
    await this.walletService.ensureWalletInitialized();
    const walletClient = this.walletService.getWalletClient();

    if (!walletClient) {
      throw new Error("Wallet client is not initialized");
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
   * Ensure the wallet client is initialized and the exchange property is available
   * @returns True if the wallet client is ready for trading operations
   */
  private ensureWalletReady(): boolean {
    try {
      // First, ensure the wallet is initialized
      this.walletService.ensureWalletInitialized();

      // Then, ensure the exchange property is available
      const exchangeReady = this.walletService.ensureExchangeProperty();

      if (!exchangeReady) {
        console.warn(
          "Exchange property is not available on wallet client. Trading operations may fail."
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error ensuring wallet is ready:", error);
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
    positions?: any[];
    error?: string;
  }> {
    try {
      // Ensure wallet is ready for trading operations
      const isWalletReady = this.ensureWalletReady();

      if (!isWalletReady) {
        return {
          success: false,
          error: "Wallet is not ready for trading operations",
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

      // First check if we can use the wallet client's methods
      const walletClient = this.walletService.getWalletClient();

      // Try to use the wallet client's methods first if available
      if (walletClient && (walletClient as any).exchange) {
        try {
          console.log("Attempting to get PNL data using wallet client...");
          const userState = await (walletClient as any).exchange.userState(
            formattedAddress
          );

          if (userState && userState.assetPositions) {
            // Process the data from the wallet client
            let totalUnrealizedPnl = 0;
            let totalRealizedPnl = 0;
            const positions: any[] = [];

            userState.assetPositions.forEach((position: any) => {
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

            const result = {
              success: true,
              message: "PNL data retrieved successfully via wallet client",
              totalUnrealizedPnl,
              totalRealizedPnl,
              positions,
              rawData: userState,
            };

            // Cache the response
            this._lastPnlResponse = result;
            return result;
          }
        } catch (walletError) {
          console.warn(
            "Failed to get PNL data using wallet client:",
            walletError
          );
          // Fall back to direct API call
        }
      }

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
                type: "userState",
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
      const positions: any[] = [];

      if (apiData && apiData.assetPositions) {
        apiData.assetPositions.forEach((position: any) => {
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
    data?: any;
  }> {
    try {
      // Validate coin parameter
      if (!coin) {
        return {
          success: false,
          error: "Coin parameter is required",
        };
      }

      // Ensure the wallet is ready for trading
      if (!this.ensureWalletReady()) {
        return {
          success: false,
          error: "Wallet is not ready for trading operations",
        };
      }

      // Get the wallet client
      const walletClient = this.walletService.getWalletClient();
      if (!walletClient) {
        return {
          success: false,
          error: "Wallet client is not available",
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

      // Check if exchange property exists on wallet client
      if (!(walletClient as any).exchange) {
        console.warn(
          "Exchange not available on wallet client. Attempting to fix..."
        );

        // Try to ensure the exchange property is available
        const exchangeReady = this.walletService.ensureExchangeProperty();
        if (!exchangeReady) {
          return {
            success: false,
            error: "Exchange not available on wallet client",
          };
        }
      }

      // Verify cancelByAssetId method exists
      if (
        typeof (walletClient as any).exchange.cancelByAssetId !== "function"
      ) {
        return {
          success: false,
          error: "cancelByAssetId method not available on exchange",
        };
      }

      // Cancel all orders for this asset
      try {
        console.log(
          `Attempting to cancel all orders for ${coin} (asset ID: ${assetId})`
        );
        const response = await (walletClient as any).exchange.cancelByAssetId(
          assetId
        );

        console.log(`Cancel orders response:`, response);

        // Check if the response contains an error about orders already canceled
        // This is not a critical error, so we can treat it as a success
        if (
          response &&
          response.error &&
          typeof response.error === "string" &&
          (response.error.includes("already canceled") ||
            response.error.includes("never placed") ||
            response.error.includes("Order was never placed"))
        ) {
          console.log(
            `No active orders to cancel for ${coin} (asset ID: ${assetId})`
          );
          return {
            success: true,
            message: `No active orders to cancel for ${coin}`,
            data: response,
          };
        }

        return {
          success: true,
          message: `All orders for ${coin} cancelled successfully`,
          data: response,
        };
      } catch (cancelError: any) {
        console.error(`Error in cancelByAssetId for ${coin}:`, cancelError);

        // Check if the error is about orders already canceled or never placed
        // This is not a critical error, so we can treat it as a success
        const errorMessage = cancelError?.message || String(cancelError);
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
            cancelError.message || String(cancelError)
          }`,
        };
      }
    } catch (error: any) {
      console.error(`Error cancelling orders for ${coin}:`, error);
      return {
        success: false,
        error: `Failed to cancel orders: ${error.message || String(error)}`,
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
    if (this.szDecimalsCache.has(coin)) {
      return this.szDecimalsCache.get(coin)!;
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
    this.szDecimalsCache.set(coin, precision);
    return precision;
  }

  /**
   * Format price for a specific coin
   */
  formatPriceForCoin(price: number, coin: string): string {
    try {
      // For BTC, ensure price is divisible by tick size (0.1)
      if (coin === "BTC") {
        const tickSize = 0.1;
        const tickCount = Math.floor(price / tickSize);
        const roundedPrice = tickCount * tickSize;
        // Ensure exactly one decimal place
        return roundedPrice.toFixed(1);
      }

      // For ETH, ensure price is divisible by tick size (0.01)
      if (coin === "ETH") {
        const tickSize = 0.01;
        const tickCount = Math.floor(price / tickSize);
        const roundedPrice = tickCount * tickSize;
        // Ensure exactly two decimal places
        return roundedPrice.toFixed(2);
      }

      // For other coins, use default tick size of 0.01
      const tickSize = 0.01;
      const tickCount = Math.floor(price / tickSize);
      const roundedPrice = tickCount * tickSize;
      return roundedPrice.toFixed(2);
    } catch (error) {
      console.error(`Error formatting price for ${coin}:`, error);
      return "";
    }
  }

  /**
   * Format size with proper precision
   */
  private formatSize(size: number, coin: string): string {
    try {
      // For BTC, ensure size is divisible by 0.0001
      if (coin === "BTC") {
        const stepSize = 0.0001;
        const steps = Math.floor(size / stepSize);
        const formattedSize = (steps * stepSize).toFixed(4);
        // Validate the formatted size
        if (isNaN(Number(formattedSize)) || Number(formattedSize) <= 0) {
          console.error(`Invalid size for ${coin}: ${formattedSize}`);
          return "";
        }
        return formattedSize;
      }

      // For ETH, ensure size is divisible by 0.01
      if (coin === "ETH") {
        const stepSize = 0.01;
        const steps = Math.floor(size / stepSize);
        const formattedSize = (steps * stepSize).toFixed(2);
        // Validate the formatted size
        if (isNaN(Number(formattedSize)) || Number(formattedSize) <= 0) {
          console.error(`Invalid size for ${coin}: ${formattedSize}`);
          return "";
        }
        return formattedSize;
      }

      // For other coins, use default step size of 0.01
      const stepSize = 0.01;
      const steps = Math.floor(size / stepSize);
      const formattedSize = (steps * stepSize).toFixed(2);
      // Validate the formatted size
      if (isNaN(Number(formattedSize)) || Number(formattedSize) <= 0) {
        console.error(`Invalid size for ${coin}: ${formattedSize}`);
        return "";
      }
      return formattedSize;
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
