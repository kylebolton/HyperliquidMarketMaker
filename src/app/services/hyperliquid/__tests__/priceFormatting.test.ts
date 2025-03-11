import { TradingService } from "../tradingService";
import { WalletService } from "../walletService";
import { MarketDataService } from "../marketDataService";
import { RateLimiter } from "../rateLimiter";
import { Config } from "../../../config";
import {
  PublicClient,
  EventClient,
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
      apiKey: "test",
      apiSecret: "test",
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
    };

    // Create mock clients
    const mockHttpTransport = new HttpTransport();
    const mockPublicClient = new PublicClient({ transport: mockHttpTransport });
    const mockEventClient = new EventClient({
      transport: new WebSocketTransport(),
    });
    const mockWsTransport = new WebSocketTransport();

    walletService = new WalletService(config, mockHttpTransport);
    marketDataService = new MarketDataService(
      mockPublicClient,
      mockEventClient,
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

  test("BTC price formatting - already divisible by 0.1", () => {
    const price = 94028.0;
    const formattedPrice = tradingService.formatPriceForCoin(price, "BTC");
    expect(formattedPrice).toBe("94028.0");
  });

  test("BTC price formatting - needs rounding up", () => {
    const price = 94028.5;
    const formattedPrice = tradingService.formatPriceForCoin(price, "BTC");
    expect(formattedPrice).toBe("94028.5");
  });

  test("BTC price formatting - needs rounding down", () => {
    const price = 94028.7;
    const formattedPrice = tradingService.formatPriceForCoin(price, "BTC");
    expect(formattedPrice).toBe("94028.7");
  });

  test("BTC price formatting - complex decimal", () => {
    const price = 94028.123456;
    const formattedPrice = tradingService.formatPriceForCoin(price, "BTC");
    expect(formattedPrice).toBe("94028.1");
  });

  test("BTC price formatting - zero decimal", () => {
    const price = 94028;
    const formattedPrice = tradingService.formatPriceForCoin(price, "BTC");
    expect(formattedPrice).toBe("94028.0");
  });

  test("BTC price formatting - negative price", () => {
    const price = -94028.5;
    const formattedPrice = tradingService.formatPriceForCoin(price, "BTC");
    expect(formattedPrice).toBe("-94028.5");
  });

  test("ETH price formatting", () => {
    const price = 1234.5678;
    const formattedPrice = tradingService.formatPriceForCoin(price, "ETH");
    expect(formattedPrice).toBe("1234.57");
  });

  test("Invalid coin price formatting", () => {
    const price = 1234.5678;
    const formattedPrice = tradingService.formatPriceForCoin(price, "INVALID");
    expect(formattedPrice).toBe("1234.57"); // Should use fallback formatting
  });
});
