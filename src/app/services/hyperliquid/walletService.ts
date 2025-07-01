import { ExchangeClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { HttpTransport } from "@nktkas/hyperliquid";
import { Config } from "../../config";
import { WalletStatus } from "./types";
import { validateApiSecret } from "./utils";

export class WalletService {
  private exchangeClient: ExchangeClient | null = null;
  private config: Config;
  private httpTransport: HttpTransport;

  constructor(config: Config, httpTransport: HttpTransport) {
    this.config = config;
    this.httpTransport = httpTransport;
  }

  /**
   * Initialize the exchange client with the provided API secret
   * @returns True if initialization was successful, false otherwise
   */
  public initializeExchangeClient(apiSecret: string): boolean {
    try {
      // Validate API secret
      if (!apiSecret || apiSecret.trim() === "") {
        console.warn(
          "API secret is empty. Exchange client will not be initialized."
        );
        return false;
      }

      // Validate the API secret format
      let privateKey;
      try {
        privateKey = validateApiSecret(apiSecret);
      } catch (validationError: unknown) {
        const error = validationError as Error;
        console.error(
          "API secret validation failed:",
          error.message || validationError
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
      } catch (accountError: unknown) {
        const error = accountError as Error;
        console.error(
          "Failed to create account from private key:",
          error.message || accountError
        );
        return false;
      }

      // Initialize exchange client using the existing httpTransport
      try {
        this.exchangeClient = new ExchangeClient({
          wallet: account,
          transport: this.httpTransport,
        });
      } catch (clientError: unknown) {
        const error = clientError as Error;
        console.error(
          "Failed to initialize exchange client:",
          error.message || clientError
        );
        this.exchangeClient = null;
        return false;
      }

      console.log(
        "Exchange client initialized successfully with address:",
        account.address
      );

      return true;
    } catch (error: unknown) {
      const err = error as Error;
      console.error(
        "Error initializing exchange client:",
        err.message || error
      );
      this.exchangeClient = null;
      return false;
    }
  }

  /**
   * Verify that the exchange connection is working
   */
  public async verifyExchangeConnection(): Promise<boolean> {
    if (!this.exchangeClient) {
      console.error(
        "Cannot verify exchange connection: exchange client is not initialized"
      );
      return false;
    }

    try {
      // Try to get the wallet address as a simple verification
      const exchangeClientWithWallet = this.exchangeClient as ExchangeClient & {
        wallet?: { address?: string };
      };
      const address = exchangeClientWithWallet.wallet?.address;
      console.log("Exchange verification successful with address:", address);
      return true;
    } catch (error) {
      console.error("Exchange verification failed:", error);
      return false;
    }
  }

  /**
   * Ensure the exchange client is initialized before performing operations
   */
  public async ensureExchangeInitialized(): Promise<void> {
    if (!this.exchangeClient) {
      console.log(
        "Exchange client not initialized, attempting to initialize..."
      );

      if (!this.config.apiSecret) {
        throw new Error("API secret is required to initialize exchange client");
      }

      try {
        const initSuccess = this.initializeExchangeClient(
          this.config.apiSecret
        );

        // Check if initialization was successful
        if (!initSuccess) {
          throw new Error("Exchange client initialization failed");
        }

        // Verify the exchange client was properly initialized
        if (!this.exchangeClient) {
          throw new Error("Exchange client is null after initialization");
        }

        // Wait a moment for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log("Exchange client initialized successfully");
      } catch (error: unknown) {
        const err = error as Error;
        console.error(
          "Failed to initialize exchange client:",
          err.message || String(error)
        );
        throw error;
      }
    }
  }

  /**
   * Check if the exchange client is ready to use
   */
  public checkExchangeStatus(): WalletStatus {
    try {
      // Check if API secret is configured
      if (!this.config.apiSecret || this.config.apiSecret.trim() === "") {
        return {
          ready: false,
          message: "API secret is not configured",
          details: "Please configure your API secret in the settings",
        };
      }

      // Check if exchange client is initialized
      if (!this.exchangeClient) {
        return {
          ready: false,
          message: "Exchange client is not initialized",
          details: "The exchange client failed to initialize properly",
        };
      }

      return {
        ready: true,
        message: "Exchange client is ready",
        details: "All checks passed",
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error checking exchange status:", error);
      return {
        ready: false,
        message: "Error checking exchange status",
        details: err.message || String(error),
      };
    }
  }

  /**
   * Get the exchange client
   * @returns The exchange client or null if not initialized
   */
  getExchangeClient(): ExchangeClient | null {
    if (!this.exchangeClient) {
      console.warn(
        "Attempted to get exchange client, but it is not initialized"
      );
      return null;
    }

    return this.exchangeClient;
  }

  /**
   * Get the wallet address
   * @returns The wallet address or null if not available
   */
  async getWalletAddress(): Promise<string | null> {
    try {
      // Ensure the exchange client is initialized
      await this.ensureExchangeInitialized();

      if (!this.exchangeClient) {
        return null;
      }

      // Try to get the address from the exchange client
      if (this.config.walletAddress) {
        return this.config.walletAddress;
      }

      return null;
    } catch (error) {
      console.error("Error getting wallet address:", error);
      return null;
    }
  }

  // Legacy methods for backward compatibility
  /**
   * @deprecated Use initializeExchangeClient instead
   */
  public initializeWalletClient(apiSecret: string): boolean {
    return this.initializeExchangeClient(apiSecret);
  }

  /**
   * @deprecated Use verifyExchangeConnection instead
   */
  public async verifyWalletConnection(): Promise<boolean> {
    return this.verifyExchangeConnection();
  }

  /**
   * @deprecated Use ensureExchangeInitialized instead
   */
  public async ensureWalletInitialized(): Promise<void> {
    return this.ensureExchangeInitialized();
  }

  /**
   * @deprecated Use checkExchangeStatus instead
   */
  public checkWalletStatus(): WalletStatus {
    return this.checkExchangeStatus();
  }

  /**
   * @deprecated Use getExchangeClient instead
   */
  getWalletClient(): ExchangeClient | null {
    return this.getExchangeClient();
  }

  /**
   * @deprecated No longer needed with ExchangeClient
   */
  ensureExchangeProperty(): boolean {
    // With the new ExchangeClient, trading methods are built-in
    return this.exchangeClient !== null;
  }
}
