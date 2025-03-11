import { Candle } from "../../utils/technicalAnalysis";
import { Config } from "../../config";

// Define interfaces to match the Hyperliquid API types
export interface HyperliquidCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

// Define order book interfaces
export interface OrderBookEntry {
  p: string; // price
  s: string; // size
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

// Define an interface for the asset structure
export interface Asset {
  name: string;
  assetId: number;
  [key: string]: any; // Allow for other properties
}

// Add PlaceOrderResponse interface
export interface PlaceOrderResponse {
  success: boolean;
  orderId?: string;
  message: string;
}

export interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export interface WalletStatus {
  ready: boolean;
  message: string;
  details?: string;
}

export interface AccountInfo {
  balance: number;
  margin: number;
  crossMarginSummary?: any;
}

export interface Position {
  coin: string;
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
}

export interface PnlData {
  success: boolean;
  message?: string;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  positions: Position[];
  error?: string;
}
