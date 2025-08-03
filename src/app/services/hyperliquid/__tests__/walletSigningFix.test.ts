import { WalletService } from "../walletService";
import { HttpTransport } from "@nktkas/hyperliquid";
import { Config } from "../../../config";
import { WalletConnectionState } from "@/components/wallet/WalletConnection";

// Mock viem
jest.mock("viem", () => ({
  createWalletClient: jest.fn().mockReturnValue({
    account: { address: "0x1234567890123456789012345678901234567890" },
    signTypedData: jest.fn().mockResolvedValue("0xsignature"),
  }),
  custom: jest.fn().mockReturnValue({}),
}));

// Mock window.ethereum
const mockEthereum = {
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  isMetaMask: true,
};

// Mock ExchangeClient
jest.mock("@nktkas/hyperliquid", () => ({
  ExchangeClient: jest.fn().mockImplementation(() => ({
    order: jest.fn().mockResolvedValue({ success: true }),
    cancel: jest.fn().mockResolvedValue({ success: true }),
  })),
  HttpTransport: jest.fn(),
}));

describe("WalletService - Signing Fix Tests", () => {
  let walletService: WalletService;
  let config: Config;
  let httpTransport: HttpTransport;

  beforeEach(() => {
    // Mock window.ethereum
    if (typeof global.window === 'undefined') {
      Object.defineProperty(global, "window", {
        value: {
          ethereum: mockEthereum,
        },
        writable: true,
        configurable: true,
      });
    } else {
      (global.window as any).ethereum = mockEthereum;
    }

    config = {
      walletAddress: "0x1234567890123456789012345678901234567890",
      tradingPairs: ["BTC"],
      tradingAmount: 100,
      maxSpread: 0.5,
      minSpread: 0.1,
      updateInterval: 100,
      candleInterval: "1m",
      leverage: 1,
      riskPercentage: 1,
      orderLevels: 5,
      orderSpacing: 0.05,
      volumeBasedPricing: true,
      aggressiveness: 7,
      orderRefreshRate: 500,
      enableAutomaticPricing: true,
      enableAutomaticSizing: true,
      useMarketIndicators: true,
      rsiPeriod: 14,
      emaPeriods: { short: 9, medium: 21, long: 50 },
      volatilityWindow: 20,
      maxPositionSize: 10,
      simultaneousPairs: true,
      feeRecipient: "0x0e7FCDC85f296004Bc235cc86cfA69da2c39324a",
      feeBasisPoints: 2,
    };

    httpTransport = new HttpTransport();
    walletService = new WalletService(config, httpTransport);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Browser Wallet Initialization", () => {
    it("should initialize with proper viem wallet client", async () => {
      const walletState: WalletConnectionState = {
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        provider: "metamask",
        chainId: 42161,
      };

      walletService.setWalletConnectionState(walletState);

      const result = await walletService.initializeWithBrowserWallet();

      expect(result).toBe(true);
      expect(walletService.getExchangeClient()).toBeTruthy();
      expect(walletService.getViemWalletClient()).toBeTruthy();
    });

    it("should fail gracefully when window.ethereum is not available", async () => {
      // Remove window.ethereum
      (global.window as any).ethereum = undefined;

      const walletState: WalletConnectionState = {
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        provider: "metamask",
        chainId: 42161,
      };

      walletService.setWalletConnectionState(walletState);

      const result = await walletService.initializeWithBrowserWallet();

      expect(result).toBe(false);
      expect(walletService.getExchangeClient()).toBeNull();
      expect(walletService.getViemWalletClient()).toBeNull();
    });

    it("should fail when wallet state is not connected", async () => {
      const walletState: WalletConnectionState = {
        isConnected: false,
        address: null,
        provider: null,
        chainId: null,
      };

      walletService.setWalletConnectionState(walletState);

      const result = await walletService.initializeWithBrowserWallet();

      expect(result).toBe(false);
    });
  });

  describe("Exchange Client Verification", () => {
    it("should verify exchange connection successfully", async () => {
      const walletState: WalletConnectionState = {
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        provider: "metamask",
        chainId: 42161,
      };

      walletService.setWalletConnectionState(walletState);
      await walletService.initializeWithBrowserWallet();

      const result = await walletService.verifyExchangeConnection();

      expect(result).toBe(true);
    });

    it("should fail verification when exchange client is not initialized", async () => {
      const result = await walletService.verifyExchangeConnection();

      expect(result).toBe(false);
    });
  });

  describe("Wallet State Management", () => {
    it("should clear clients when wallet state is reset", () => {
      const walletState: WalletConnectionState = {
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        provider: "metamask",
        chainId: 42161,
      };

      walletService.setWalletConnectionState(walletState);

      // Clear the wallet state
      walletService.setWalletConnectionState(null);

      expect(walletService.getExchangeClient()).toBeNull();
      expect(walletService.getViemWalletClient()).toBeNull();
    });

    it("should return correct wallet address", async () => {
      const walletState: WalletConnectionState = {
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        provider: "metamask",
        chainId: 42161,
      };

      walletService.setWalletConnectionState(walletState);
      await walletService.initializeWithBrowserWallet();

      const address = await walletService.getWalletAddress();

      expect(address).toBe("0x1234567890123456789012345678901234567890");
    });
  });

  describe("Wallet Status Checks", () => {
    it("should return ready status when properly initialized", async () => {
      const walletState: WalletConnectionState = {
        isConnected: true,
        address: "0x1234567890123456789012345678901234567890",
        provider: "metamask",
        chainId: 42161,
      };

      walletService.setWalletConnectionState(walletState);
      await walletService.initializeWithBrowserWallet();

      const status = walletService.checkExchangeStatus();

      expect(status.ready).toBe(true);
      expect(status.message).toBe("Exchange client is ready");
    });

    it("should return not ready status when wallet is not connected", () => {
      const status = walletService.checkExchangeStatus();

      expect(status.ready).toBe(false);
      expect(status.message).toBe("Browser wallet is not connected");
    });
  });
});