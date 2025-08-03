import { NextResponse } from "next/server";
import { TradingService } from "@/app/services/hyperliquid/tradingService";
import { WalletService } from "@/app/services/hyperliquid/walletService";
import { MarketDataService } from "@/app/services/hyperliquid/marketDataService";
import { RateLimiter } from "@/app/services/hyperliquid/rateLimiter";
// Remove unused import
import {
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
  HttpTransport,
} from "@nktkas/hyperliquid";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { coin, side, price, size, config } = body;

    // Validate required fields
    if (!coin || !side || !price || !size || !config) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate side
    if (side !== "B" && side !== "A") {
      return NextResponse.json(
        { error: "Invalid side. Must be 'B' (buy) or 'A' (sell)" },
        { status: 400 }
      );
    }

    // Validate config
    if (!config.privateKey) {
      return NextResponse.json(
        { error: "Private key is required to place orders" },
        { status: 400 }
      );
    }

    // Initialize services
    const rateLimiter = new RateLimiter(5, 60000, 1000); // 5 requests per minute, 1s between orders
    const httpTransport = new HttpTransport();
    const wsTransport = new WebSocketTransport();
    const infoClient = new InfoClient({ transport: httpTransport });
    const subscriptionClient = new SubscriptionClient({
      transport: wsTransport,
    });

    const walletService = new WalletService(config, httpTransport);
    const marketDataService = new MarketDataService(
      infoClient,
      subscriptionClient,
      wsTransport,
      config,
      rateLimiter
    );
    const tradingService = new TradingService(
      walletService,
      marketDataService,
      rateLimiter,
      config
    );

    // Get exchange client
    const exchangeClient = walletService.getExchangeClient();
    if (!exchangeClient) {
      return NextResponse.json(
        { error: "Failed to initialize exchange client" },
        { status: 500 }
      );
    }

    // Place the order
    const result = await tradingService.placeLimitOrder(
      coin,
      side,
      price,
      size
    );

    if (!result.success) {
      // Check if it's a tick size or formatting error
      const isTickSizeError =
        result.message?.includes("tick size") ||
        result.message?.includes("price") ||
        result.message?.includes("divisible");

      return NextResponse.json(
        {
          error: result.message || "Failed to place order",
          type: isTickSizeError ? "TICK_SIZE_ERROR" : "ORDER_ERROR",
        },
        { status: isTickSizeError ? 422 : 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error placing order:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
