import { ExchangeClient } from "@nktkas/hyperliquid";
import { HttpTransport } from "@nktkas/hyperliquid";
import { Config } from "../../config";
import { WalletStatus } from "./types";
import { WalletConnectionState } from "@/components/wallet/WalletConnection";
import { createWalletClient, custom, type WalletClient } from "viem";

export class WalletService {
  private exchangeClient: ExchangeClient | null = null;
  private httpTransport: HttpTransport;
  private walletConnectionState: WalletConnectionState | null = null;
  private viemWalletClient: WalletClient | null = null;

  constructor(_config: Config, httpTransport: HttpTransport) {
    this.httpTransport = httpTransport;
    this.walletConnectionState = null;
  }

  /**
   * Set wallet connection state for browser wallet usage
   */
  public setWalletConnectionState(state: WalletConnectionState | null): void {
    this.walletConnectionState = state;
    
    // Clear existing clients if wallet state is being reset
    if (!state?.isConnected) {
      this.exchangeClient = null;
      this.viemWalletClient = null;
    }
  }

  /**
   * Get current wallet connection state
   */
  public getWalletConnectionState(): WalletConnectionState | null {
    return this.walletConnectionState;
  }

  /**
   * Initialize exchange client with browser wallet or private key
   */
  public async initializeWithBrowserWallet(): Promise<boolean> {
    try {
      if (this.walletConnectionState?.isConnected && this.walletConnectionState.address) {
        // Check if window.ethereum is available
        if (typeof window === 'undefined' || !window.ethereum) {
          console.error("window.ethereum is not available");
          return false;
        }

        // Create a proper viem wallet client that can handle EIP-712 signing
        this.viemWalletClient = createWalletClient({
          account: this.walletConnectionState.address as `0x${string}`,
          transport: custom(window.ethereum),
        });

        // Initialize ExchangeClient with the viem wallet client
        this.exchangeClient = new ExchangeClient({
          wallet: this.viemWalletClient,
          transport: this.httpTransport,
        });

        console.log(
          "Exchange client initialized with browser wallet:",
          this.walletConnectionState.address
        );
        return true;
      } else {
        console.warn("No wallet connection state available for browser wallet initialization");
        return false;
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(
        "Error initializing exchange client with browser wallet:",
        err.message || error
      );
      this.exchangeClient = null;
      this.viemWalletClient = null;
      return false;
    }
  }

  /**
   * Initialize the exchange client using browser wallet
   * @returns True if initialization was successful, false otherwise
   */
  public initializeExchangeClient(): boolean {
    if (!this.walletConnectionState?.isConnected) {
      console.warn("No wallet connected for exchange client initialization");
      return false;
    }

    try {
      // Check if window.ethereum is available
      if (typeof window === 'undefined' || !window.ethereum) {
        console.error("window.ethereum is not available");
        return false;
      }

      // Create a proper viem wallet client that can handle EIP-712 signing
      this.viemWalletClient = createWalletClient({
        account: this.walletConnectionState.address as `0x${string}`,
        transport: custom(window.ethereum),
      });

      // Initialize ExchangeClient with the viem wallet client
      this.exchangeClient = new ExchangeClient({
        wallet: this.viemWalletClient,
        transport: this.httpTransport,
      });

      console.log(
        "Exchange client initialized with browser wallet:",
        this.walletConnectionState.address
      );
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      console.error(
        "Error initializing exchange client:",
        err.message || error
      );
      this.exchangeClient = null;
      this.viemWalletClient = null;
      return false;
    }
  }

  /**
   * Verify that the exchange connection is working
   */
  public async verifyExchangeConnection(): Promise<boolean> {
    if (!this.exchangeClient || !this.viemWalletClient) {
      console.error(
        "Cannot verify exchange connection: exchange client or viem wallet client is not initialized"
      );
      return false;
    }

    try {
      // Try to get the wallet address from the viem wallet client
      const address = this.viemWalletClient.account?.address;
      console.log("Exchange verification successful with address:", address);
      
      // Verify that the wallet can access window.ethereum for signing
      if (typeof window !== 'undefined' && window.ethereum) {
        console.log("window.ethereum is available for signing operations");
        return true;
      } else {
        console.warn("window.ethereum is not available - signing may fail");
        return false;
      }
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

      try {
        let initSuccess = false;
        
        if (this.walletConnectionState?.isConnected) {
          // Use browser wallet
          initSuccess = await this.initializeWithBrowserWallet();
        } else {
          throw new Error("No wallet connected");
        }

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
      // Check wallet connection
      if (!this.walletConnectionState?.isConnected) {
        return {
          ready: false,
          message: "Browser wallet is not connected",
          details: "Please connect your browser wallet (MetaMask, etc.) to continue",
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
      // Return the connected browser wallet address
      if (this.walletConnectionState?.isConnected) {
        return this.walletConnectionState.address;
      }

      // Fallback to viem wallet client if available
      if (this.viemWalletClient?.account?.address) {
        return this.viemWalletClient.account.address;
      }

      return null;
    } catch (error) {
      console.error("Error getting wallet address:", error);
      return null;
    }
  }

  /**
   * Get the viem wallet client for advanced wallet operations
   * @returns The viem wallet client or null if not initialized
   */
  public getViemWalletClient(): WalletClient | null {
    return this.viemWalletClient;
  }

  /**
   * Check if using browser wallet connection
   */
  public isUsingBrowserWallet(): boolean {
    return this.walletConnectionState?.isConnected === true;
  }

  // Legacy methods for backward compatibility
  /**
   * @deprecated Use initializeExchangeClient instead
   */
  public initializeWalletClient(): boolean {
    return this.initializeExchangeClient();
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
