import { Config } from "@/app/config";
import { HyperliquidService } from "@/app/services/hyperliquid/compatibility";
import { WalletConnectionState } from "@/components/wallet/WalletConnection";
import * as z from "zod";

// Define the error types
export type ErrorType = "critical" | "warning" | "info";

// Define the error interface
export interface ErrorMessage {
  id: string;
  type: ErrorType;
  message: string;
  timestamp: Date;
}

// Define the order interface
export interface Order {
  id: string;
  coin: string;
  side: "buy" | "sell";
  price: number;
  size: number;
  status: "pending" | "placed" | "failed" | "cancelled";
  timestamp: Date;
  error?: string;
}

export interface MarketMakerProps {
  config: Config;
  hyperliquidService?: HyperliquidService;
  walletState?: WalletConnectionState;
}

// Define the form schema for market maker orders
export const orderFormSchema = z.object({
  coin: z.string().min(1, "Coin is required"),
  orderCount: z.coerce.number().int().min(1).max(20),
  startPrice: z.coerce.number().positive(),
  endPrice: z.coerce.number().positive(),
  sizePerOrder: z.coerce.number().positive(),
  side: z.enum(["buy", "sell"]),
});

// Define the form schema for configuration
export const configFormSchema = z.object({
  // Wallet configuration
  walletAddress: z.string().optional(),
  tradingAmount: z.coerce.number().positive("Trading amount must be positive"),
  maxSpread: z.coerce.number().positive("Max spread must be positive"),
  minSpread: z.coerce.number().positive("Min spread must be positive"),
  updateInterval: z.coerce
    .number()
    .positive("Update interval must be positive"),
  candleInterval: z.string().min(1, "Candle interval is required"),
  leverage: z.coerce.number().positive("Leverage must be positive"),
  riskPercentage: z.coerce
    .number()
    .positive("Risk percentage must be positive"),
  orderLevels: z.coerce
    .number()
    .int()
    .positive("Order levels must be positive"),
  orderSpacing: z.coerce.number().positive("Order spacing must be positive"),
  volumeBasedPricing: z.boolean(),
  aggressiveness: z.coerce.number().min(0).max(10),
  orderRefreshRate: z.coerce
    .number()
    .positive("Order refresh rate must be positive"),
  enableAutomaticPricing: z.boolean(),
  enableAutomaticSizing: z.boolean(),
  useMarketIndicators: z.boolean(),
  simultaneousPairs: z.boolean(),
  tradingPairs: z
    .array(z.string())
    .min(1, "At least one trading pair is required"),
});
