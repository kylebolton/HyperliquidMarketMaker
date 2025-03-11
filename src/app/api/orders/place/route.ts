import { NextResponse } from "next/server";
import { TradingService } from "@/app/services/hyperliquid/tradingService";
import { WalletService } from "@/app/services/hyperliquid/walletService";
import { MarketDataService } from "@/app/services/hyperliquid/marketDataService";
import { RateLimiter } from "@/app/services/hyperliquid/rateLimiter";
import { Config } from "@/app/config";
import {
  PublicClient,
  EventClient,
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
    if (!config.apiSecret) {
      return NextResponse.json(
        { error: "API secret is required to place orders" },
        { status: 400 }
      );
    }

    // Initialize services
    const rateLimiter = new RateLimiter(5, 60000, 1000); // 5 requests per minute, 1s between orders
    const httpTransport = new HttpTransport();
    const wsTransport = new WebSocketTransport();
    const publicClient = new PublicClient({ transport: httpTransport });
    const eventClient = new EventClient({ transport: wsTransport });

    const walletService = new WalletService(config, httpTransport);
    const marketDataService = new MarketDataService(
      publicClient,
      eventClient,
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

    // Get wallet client
    const walletClient = walletService.getWalletClient();
    if (!walletClient) {
      return NextResponse.json(
        { error: "Failed to initialize wallet client" },
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
      return NextResponse.json(
        { error: result.message || "Failed to place order" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error placing order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
