// Mock the @nktkas/hyperliquid module to avoid import issues
jest.mock("@nktkas/hyperliquid", () => ({
  InfoClient: jest.fn().mockImplementation(() => ({})),
  SubscriptionClient: jest.fn().mockImplementation(() => ({})),
  WebSocketTransport: jest.fn().mockImplementation(() => ({})),
  HttpTransport: jest.fn().mockImplementation(() => ({})),
  ExchangeClient: jest.fn().mockImplementation(() => ({})),
}));

import { TradingService } from "../tradingService";
import { WalletService } from "../walletService";
import { MarketDataService } from "../marketDataService";
import { RateLimiter } from "../rateLimiter";
import { Config } from "../../../config";
import {
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
  HttpTransport,
} from "@nktkas/hyperliquid";

describe("Price Formatting Tests", () => {
  let tradingService: TradingService;
  let walletService: WalletService;
  let marketDataService: MarketDataService;
  let rateLimiter: RateLimiter;
  let config: Config;

  beforeEach(() => {
    // Create mock services
    config = {
      walletAddress: "0x123",
      tradingPairs: ["BTC"],
      tradingAmount: 100,
      maxSpread: 0.02,
      minSpread: 0.01,
      updateInterval: 5000,
      candleInterval: "1m",
      leverage: 1,
      riskPercentage: 1,
      orderLevels: 5,
      orderSpacing: 0.05,
      volumeBasedPricing: true,
      aggressiveness: 0,
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

    // Create mock clients
    const mockHttpTransport = new HttpTransport();
    const mockInfoClient = new InfoClient({ transport: mockHttpTransport });
    const mockSubscriptionClient = new SubscriptionClient({
      transport: new WebSocketTransport(),
    });
    const mockWsTransport = new WebSocketTransport();

    walletService = new WalletService(config, mockHttpTransport);
    marketDataService = new MarketDataService(
      mockInfoClient,
      mockSubscriptionClient,
      mockWsTransport,
      config,
      new RateLimiter()
    );
    rateLimiter = new RateLimiter();
    tradingService = new TradingService(
      walletService,
      marketDataService,
      rateLimiter,
      config
    );
  });

  test("BTC price formatting - already divisible by 0.1", async () => {
    const price = 94028.0;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "BTC"
    );
    expect(formattedPrice).toBe("94028");
  });

  test("BTC price formatting - needs rounding up", async () => {
    const price = 94028.5;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "BTC"
    );
    expect(formattedPrice).toBe("94028.5");
  });

  test("BTC price formatting - needs rounding down", async () => {
    const price = 94028.7;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "BTC"
    );
    expect(formattedPrice).toBe("94028.7");
  });

  test("BTC price formatting - complex decimal", async () => {
    const price = 94028.123456;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "BTC"
    );
    expect(formattedPrice).toBe("94028.12");
  });

  test("BTC price formatting - zero decimal", async () => {
    const price = 94028;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "BTC"
    );
    expect(formattedPrice).toBe("94028");
  });

  test("BTC price formatting - negative price", async () => {
    const price = -94028.5;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "BTC"
    );
    expect(formattedPrice).toBe("-94028.5");
  });

  test("ETH price formatting", async () => {
    const price = 1234.5678;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "ETH"
    );
    expect(formattedPrice).toBe("1234.57");
  });

  test("Invalid coin price formatting", async () => {
    const price = 1234.5678;
    const formattedPrice = await tradingService.formatPriceForCoin(
      price,
      "INVALID"
    );
    expect(formattedPrice).toBe("1234.57"); // Should use fallback formatting
  });
});
