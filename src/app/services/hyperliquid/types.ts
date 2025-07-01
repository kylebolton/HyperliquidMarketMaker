// Import types from the SDK
import type {
  WsAllMids,
  Book,
  WsTrade,
  PerpsMeta,
  PerpsUniverse,
  PerpsClearinghouseState,
  Subscription as SDKSubscription,
} from "@nktkas/hyperliquid";

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
  [key: string]: unknown; // Allow for other properties
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

// Use SDK types directly
export type Asset = PerpsUniverse;
export type Metadata = PerpsMeta;
export type Trade = WsTrade;
export type ClearinghouseState = PerpsClearinghouseState;

// Use SDK subscription type with additional properties
export interface Subscription extends SDKSubscription {
  [key: string]: unknown;
}

// Use SDK types for WebSocket data
export type MidPriceData = WsAllMids;
export type OrderBookLevelData = Book;

// Add PlaceOrderResponse interface
export interface PlaceOrderResponse {
  success: boolean;
  orderId?: string;
  message?: string;
}

export interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  crossMarginSummary?: unknown;
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
