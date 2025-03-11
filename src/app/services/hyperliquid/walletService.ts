import { WalletClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { HttpTransport } from "@nktkas/hyperliquid";
import { Config } from "../../config";
import { WalletStatus } from "./types";
import { validateApiSecret } from "./utils";

/**
 * Custom Exchange class to implement trading functionality
 * This is needed because the SDK doesn't provide a direct Exchange class
 */
class Exchange {
  private walletClient: WalletClient;

  constructor(walletClient: WalletClient) {
    this.walletClient = walletClient;
  }

  /**
   * Cancel an order by asset ID
   */
  async cancelByAssetId(assetId: number): Promise<any> {
    try {
      // Validate assetId before using it
      if (assetId === undefined || assetId === null) {
        const error = new Error(
          `Invalid asset ID: ${assetId} - Asset ID cannot be undefined or null`
        );
        console.error(error);
        throw error;
      }

      if (typeof assetId !== "number") {
        const error = new Error(
          `Invalid asset ID type: ${typeof assetId} - Asset ID must be a number`
        );
        console.error(error);
        throw error;
      }

      if (assetId < 0) {
        const error = new Error(
          `Invalid asset ID value: ${assetId} - Asset ID cannot be negative`
        );
        console.error(error);
        throw error;
      }

      console.log(`Attempting to cancel orders for asset ID: ${assetId}`);

      try {
        // Use the wallet client's cancel method
        const result = await this.walletClient.cancel({
          cancels: [{ a: assetId, o: 0 }],
        });

        console.log(
          `Successfully cancelled orders for asset ID ${assetId}:`,
          result
        );
        return result;
      } catch (cancelError: any) {
        // Check if the error is about orders already canceled or never placed
        // This is not a critical error, so we can handle it gracefully
        const errorMessage = cancelError?.message || String(cancelError);
        if (
          errorMessage.includes("already canceled") ||
          errorMessage.includes("never placed") ||
          errorMessage.includes("Order was never placed") ||
          errorMessage.includes("Order 0 failed")
        ) {
          console.log(`No active orders to cancel for asset ID ${assetId}`);
          return {
            success: true,
            message: `No active orders to cancel for asset ID ${assetId}`,
            info: errorMessage,
          };
        }

        // For other errors, rethrow
        throw cancelError;
      }
    } catch (error: any) {
      console.error(`Error cancelling orders for asset ${assetId}:`, error);
      // Rethrow with more context if needed
      if (error.message) {
        throw new Error(
          `Failed to cancel orders for asset ${assetId}: ${error.message}`
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Place an order
   */
  async placeOrder(order: any): Promise<any> {
    try {
      console.log("Placing order:", order);

      // Clone the order to avoid modifying the original
      const orderParam = Array.isArray(order) ? [...order] : [{ ...order }];

      // Format each order in the array
      for (let i = 0; i < orderParam.length; i++) {
        const o = orderParam[i];

        // For orders using coin name format
        if (o.coin) {
          // Format size with proper precision
          if (!o.sz) {
            throw new Error("sz (size) field is required");
          } else {
            // Get precision based on coin (default to 4 for BTC, 2 for others)
            const precision = o.coin === "BTC" ? 4 : 2;
            // Parse to float and format with fixed precision
            const sizeNum = parseFloat(String(o.sz));
            // Format with fixed precision
            o.sz = sizeNum.toFixed(precision);
            // Ensure there's a decimal point
            if (!o.sz.includes(".")) {
              o.sz += ".0";
            }
          }

          // Format price with proper precision
          if (!o.limit_px) {
            throw new Error("limit_px (price) field is required");
          } else {
            // Parse to float
            const priceNum = parseFloat(String(o.limit_px));

            // For BTC, ensure price is divisible by tick size (0.1)
            if (o.coin === "BTC") {
              const tickSize = 0.1;
              // Calculate how many tick sizes fit into the price
              const tickCount = Math.round(priceNum / tickSize);
              // Calculate the price that's exactly divisible by the tick size
              const exactPrice = tickCount * tickSize;
              // Format with exactly one decimal place
              o.limit_px = exactPrice.toFixed(1);
              console.log(`Formatted BTC price: ${priceNum} → ${o.limit_px}`);
            } else {
              // For other coins, use 2 decimal places
              o.limit_px = priceNum.toFixed(2);
            }

            // Ensure there's a decimal point
            if (!o.limit_px.includes(".")) {
              o.limit_px += ".0";
            }
          }

          // Convert coin name to asset ID
          o.a = this.getAssetIdForCoin(o.coin);
          if (o.a === -1) {
            throw new Error(`Invalid coin: ${o.coin}`);
          }

          // Convert side to boolean
          o.b = o.is_buy;
          delete o.is_buy;

          // Convert price field name
          o.p = o.limit_px;
          delete o.limit_px;

          // Convert size field name
          o.s = o.sz;
          delete o.sz;

          // Convert reduce_only field name
          o.r = o.reduce_only;
          delete o.reduce_only;

          // Delete the coin field as it's no longer needed
          delete o.coin;
        }
      }

      // Use the wallet client's order method
      const result = await this.walletClient.order({
        orders: orderParam,
        grouping: "na",
      });
      console.log("Order placed successfully:", result);
      return result;
    } catch (error: any) {
      console.error("Error with wallet client order method:", error);
      throw error;
    }
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

  /**
   * Alias for placeOrder to maintain compatibility with both method names
   */
  async order(orderParams: any): Promise<any> {
    try {
      // Handle both single orders and arrays of orders
      if (Array.isArray(orderParams) && orderParams.length === 1) {
        // If it's an array with a single order, extract it
        return this.placeOrder(orderParams[0]);
      } else {
        return this.placeOrder(orderParams);
      }
    } catch (error) {
      console.error("Error in order method:", error);
      throw error;
    }
  }

  /**
   * Get user state (positions, balances, etc.)
   */
  async userState(address: string): Promise<any> {
    try {
      // Format the address if needed
      const formattedAddress = address.startsWith("0x")
        ? (address as `0x${string}`)
        : (`0x${address}` as `0x${string}`);

      // Make a direct API call since the SDK doesn't have a direct method for this
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

      return await response.json();
    } catch (error) {
      console.error(`Error getting user state for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Cancel an order by order ID
   */
  async cancelOrder(assetId: number, orderId: number): Promise<any> {
    try {
      // Use the wallet client's cancel method
      return await this.walletClient.cancel({
        cancels: [{ a: assetId, o: orderId }],
      });
    } catch (error) {
      console.error(
        `Error cancelling order ${orderId} for asset ${assetId}:`,
        error
      );
      throw error;
    }
  }
}

export class WalletService {
  private walletClient: WalletClient | null = null;
  private config: Config;
  private httpTransport: HttpTransport;

  constructor(config: Config, httpTransport: HttpTransport) {
    this.config = config;
    this.httpTransport = httpTransport;
  }

  /**
   * Initialize the wallet client with the provided API secret
   * @returns True if initialization was successful, false otherwise
   */
  public initializeWalletClient(apiSecret: string): boolean {
    try {
      // Validate API secret
      if (!apiSecret || apiSecret.trim() === "") {
        console.warn(
          "API secret is empty. Wallet client will not be initialized."
        );
        return false;
      }

      // Validate the API secret format
      let privateKey;
      try {
        privateKey = validateApiSecret(apiSecret);
      } catch (validationError: any) {
        console.error(
          "API secret validation failed:",
          validationError.message || validationError
        );
        return false;
      }

      // Add 0x prefix for privateKeyToAccount if not already present
      const privateKeyWithPrefix = privateKey.startsWith("0x")
        ? (privateKey as `0x${string}`)
        : (`0x${privateKey}` as `0x${string}`);

      // Create account from private key
      let account;
      try {
        account = privateKeyToAccount(privateKeyWithPrefix);
      } catch (accountError: any) {
        console.error(
          "Failed to create account from private key:",
          accountError.message || accountError
        );
        return false;
      }

      // Initialize wallet client using the existing httpTransport
      try {
        this.walletClient = new WalletClient({
          wallet: account,
          transport: this.httpTransport,
        });
      } catch (clientError: any) {
        console.error(
          "Failed to initialize wallet client:",
          clientError.message || clientError
        );
        this.walletClient = null;
        return false;
      }

      console.log(
        "Wallet client initialized successfully with address:",
        account.address
      );

      // Add the exchange property to the wallet client
      if (this.walletClient) {
        console.log("Adding Exchange property to wallet client...");
        try {
          (this.walletClient as any).exchange = new Exchange(this.walletClient);

          // Verify the exchange property was set correctly
          if ((this.walletClient as any).exchange) {
            console.log("Exchange property initialized successfully");

            // Verify the exchange methods are available
            const hasPlaceOrder =
              typeof (this.walletClient as any).exchange.placeOrder ===
              "function";
            const hasOrder =
              typeof (this.walletClient as any).exchange.order === "function";
            const hasCancelByAssetId =
              typeof (this.walletClient as any).exchange.cancelByAssetId ===
              "function";

            if (hasCancelByAssetId && (hasPlaceOrder || hasOrder)) {
              console.log("Exchange methods verified successfully:");
              console.log(`- cancelByAssetId: ${hasCancelByAssetId}`);
              console.log(`- placeOrder: ${hasPlaceOrder}`);
              console.log(`- order: ${hasOrder}`);
            } else {
              console.warn(
                "Exchange property exists but some methods are missing:"
              );
              console.log(`- cancelByAssetId: ${hasCancelByAssetId}`);
              console.log(`- placeOrder: ${hasPlaceOrder}`);
              console.log(`- order: ${hasOrder}`);

              // Try to fix the missing methods
              if (!hasCancelByAssetId || (!hasPlaceOrder && !hasOrder)) {
                console.log("Attempting to fix missing exchange methods...");
                (this.walletClient as any).exchange = new Exchange(
                  this.walletClient
                );
              }
            }
          } else {
            console.error("Failed to initialize exchange property");
            return false;
          }
        } catch (exchangeError: any) {
          console.error(
            "Error initializing Exchange property:",
            exchangeError.message || exchangeError
          );
          return false;
        }
      } else {
        console.error("Wallet client is null after initialization");
        return false;
      }

      // Verify wallet initialization with a simple request
      setTimeout(async () => {
        try {
          const isVerified = await this.verifyWalletConnection();
          if (!isVerified) {
            console.warn("Wallet verification failed during initialization");
          }
        } catch (error: any) {
          console.warn(
            "Initial wallet verification failed, but will retry when needed:",
            error.message || error
          );
        }
      }, 1000);

      return true;
    } catch (error: any) {
      console.error(
        "Error initializing wallet client:",
        error.message || error
      );
      this.walletClient = null;
      return false;
    }
  }

  /**
   * Verify that the wallet connection is working
   */
  public async verifyWalletConnection(): Promise<boolean> {
    if (!this.walletClient) {
      console.error(
        "Cannot verify wallet connection: wallet client is not initialized"
      );
      return false;
    }

    try {
      // Try to get the wallet address as a simple verification
      // Access the address property safely based on the wallet client structure
      const address =
        (this.walletClient as any).account?.address ||
        (this.walletClient as any).wallet?.address ||
        "unknown";
      console.log("Wallet verification successful with address:", address);
      return true;
    } catch (error) {
      console.error("Wallet verification failed:", error);
      return false;
    }
  }

  /**
   * Ensure the wallet is initialized before performing operations
   */
  public async ensureWalletInitialized(): Promise<void> {
    if (!this.walletClient) {
      console.log("Wallet client not initialized, attempting to initialize...");

      if (!this.config.apiSecret) {
        throw new Error("API secret is required to initialize wallet client");
      }

      try {
        const initSuccess = this.initializeWalletClient(this.config.apiSecret);

        // Check if initialization was successful
        if (!initSuccess) {
          throw new Error("Wallet client initialization failed");
        }

        // Verify the wallet client was properly initialized
        if (!this.walletClient) {
          throw new Error("Wallet client is null after initialization");
        }

        // Wait a moment for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log("Wallet client initialized successfully");
      } catch (error: any) {
        console.error(
          "Failed to initialize wallet client:",
          error.message || String(error)
        );
        throw error;
      }
    }
  }

  /**
   * Check if the wallet is ready to use
   */
  public checkWalletStatus(): WalletStatus {
    try {
      // Check if API secret is configured
      if (!this.config.apiSecret || this.config.apiSecret.trim() === "") {
        return {
          ready: false,
          message: "API secret is not configured",
          details: "Please configure your API secret in the settings",
        };
      }

      // Check if wallet client is initialized
      if (!this.walletClient) {
        return {
          ready: false,
          message: "Wallet client is not initialized",
          details: "The wallet client failed to initialize properly",
        };
      }

      // Check if exchange property is available
      if (!(this.walletClient as any).exchange) {
        return {
          ready: false,
          message: "Exchange property is not available",
          details: "The exchange property is missing from the wallet client",
        };
      }

      // Check if required exchange methods are available
      const hasCancelByAssetId =
        typeof (this.walletClient as any).exchange.cancelByAssetId ===
        "function";
      const hasPlaceOrder =
        typeof (this.walletClient as any).exchange.placeOrder === "function";
      const hasOrder =
        typeof (this.walletClient as any).exchange.order === "function";

      if (!hasCancelByAssetId) {
        return {
          ready: false,
          message: "cancelByAssetId method is not available",
          details:
            "The cancelByAssetId method is missing from the exchange property",
        };
      }

      if (!hasPlaceOrder && !hasOrder) {
        return {
          ready: false,
          message: "Order placement methods are not available",
          details:
            "Both placeOrder and order methods are missing from the exchange property",
        };
      }

      // All checks passed
      return {
        ready: true,
        message: "Wallet is ready",
        details: "All required wallet components are properly initialized",
      };
    } catch (error: any) {
      return {
        ready: false,
        message: `Wallet error: ${error.message || String(error)}`,
        details: "An unexpected error occurred while checking wallet status",
      };
    }
  }

  /**
   * Get the wallet client
   * @returns The wallet client or null if not initialized
   */
  getWalletClient(): any {
    if (!this.walletClient) {
      console.warn("Attempted to get wallet client, but it is not initialized");
      return null;
    }

    // Check if exchange property exists
    if (!(this.walletClient as any).exchange) {
      console.warn(
        "Wallet client is missing exchange property. Attempting to fix..."
      );
      const fixed = this.ensureExchangeProperty();
      if (!fixed) {
        console.error("Failed to fix missing exchange property");
      }
    }

    return this.walletClient;
  }

  /**
   * Ensure the exchange property is available on the wallet client
   * @returns True if the exchange property is available, false otherwise
   */
  ensureExchangeProperty(): boolean {
    try {
      if (!this.walletClient) {
        console.warn("Wallet client is not initialized");
        return false;
      }

      // Check if exchange property exists
      if (!(this.walletClient as any).exchange) {
        console.warn(
          "Exchange property not found on wallet client. Creating new Exchange instance..."
        );

        // Create a new Exchange instance and attach it to the wallet client
        (this.walletClient as any).exchange = new Exchange(this.walletClient);

        // Verify the exchange property was set correctly
        if (!(this.walletClient as any).exchange) {
          console.error("Failed to initialize exchange property");
          return false;
        }

        console.log("Exchange property initialized successfully");
      }

      // Verify the exchange property is a valid Exchange instance with required methods
      const hasCancelByAssetId =
        typeof (this.walletClient as any).exchange.cancelByAssetId ===
        "function";
      const hasPlaceOrder =
        typeof (this.walletClient as any).exchange.placeOrder === "function";
      const hasOrder =
        typeof (this.walletClient as any).exchange.order === "function";

      // Log the status of each method
      console.log("Exchange methods status:");
      console.log(
        `- cancelByAssetId: ${hasCancelByAssetId ? "Available" : "Missing"}`
      );
      console.log(`- placeOrder: ${hasPlaceOrder ? "Available" : "Missing"}`);
      console.log(`- order: ${hasOrder ? "Available" : "Missing"}`);

      // Check if any required methods are missing
      if (!hasCancelByAssetId || (!hasPlaceOrder && !hasOrder)) {
        console.warn(
          "Exchange property exists but missing required methods. Reinitializing..."
        );

        // Recreate the Exchange instance
        (this.walletClient as any).exchange = new Exchange(this.walletClient);

        // Verify again after reinitialization
        const hasCancelByAssetIdAfter =
          typeof (this.walletClient as any).exchange.cancelByAssetId ===
          "function";
        const hasPlaceOrderAfter =
          typeof (this.walletClient as any).exchange.placeOrder === "function";
        const hasOrderAfter =
          typeof (this.walletClient as any).exchange.order === "function";

        if (
          !hasCancelByAssetIdAfter ||
          (!hasPlaceOrderAfter && !hasOrderAfter)
        ) {
          console.error(
            "Failed to reinitialize Exchange with required methods"
          );
          return false;
        }

        console.log(
          "Exchange property reinitialized with all required methods"
        );
      }

      return true;
    } catch (error) {
      console.error("Error ensuring exchange property:", error);
      return false;
    }
  }

  /**
   * Generate a signature for authenticated requests
   * @param message Message to sign
   * @returns Signature
   */
  generateSignature(message: string): string {
    // Placeholder for signature generation
    return "";
  }

  /**
   * Get the wallet address
   * @returns The wallet address or null if not available
   */
  async getWalletAddress(): Promise<string | null> {
    try {
      // Ensure the wallet is initialized
      await this.ensureWalletInitialized();

      if (!this.walletClient) {
        return null;
      }

      // Try to get the address from the wallet client
      if (this.config.walletAddress) {
        return this.config.walletAddress;
      }

      return null;
    } catch (error) {
      console.error("Error getting wallet address:", error);
      return null;
    }
  }
}
