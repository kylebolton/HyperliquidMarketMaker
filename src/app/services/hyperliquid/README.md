# Hyperliquid Service Refactoring

This directory contains a modular refactoring of the original `hyperliquidService.ts` file, which had grown too large (over 2400 lines) and was becoming difficult to maintain.

## Modular Structure

The service has been split into the following modules:

1. **types.ts** - Common interfaces and types used across all modules
2. **utils.ts** - Utility functions like retryWithBackoff, validateApiSecret, etc.
3. **rateLimiter.ts** - Rate limiting functionality for API requests
4. **walletService.ts** - Wallet initialization and management
5. **marketDataService.ts** - Market data fetching and WebSocket management
6. **tradingService.ts** - Trading operations like placing orders and managing positions
7. **index.ts** - Main HyperliquidService class that integrates all modules

## Migration Plan

The refactored service is not yet integrated with the application. Here's the plan for a gradual migration:

### Phase 1: Parallel Implementation (Current)

- Keep the original `hyperliquidService.ts` file working
- Implement the modular version in the `hyperliquid/` directory
- Add tests for the new implementation

### Phase 2: Gradual Migration

- Update imports in the application to use specific modules where needed
- Replace functionality one piece at a time
- Ensure backward compatibility during the transition

### Phase 3: Complete Migration

- Switch the main application to use the new modular service
- Remove the original `hyperliquidService.ts` file
- Update all references to use the new implementation

## Benefits of Modular Structure

1. **Maintainability** - Smaller, focused files are easier to understand and maintain
2. **Testability** - Modules can be tested independently
3. **Separation of Concerns** - Each module has a clear responsibility
4. **Code Reuse** - Modules can be used independently where needed
5. **Scalability** - Easier to add new features without bloating a single file

## Usage Example

Once migration is complete, the service can be used as follows:

```typescript
import { HyperliquidService } from "./services/hyperliquid";

// Create an instance with configuration
const service = new HyperliquidService(config);

// Use market data methods
const candles = await service.getCandles("BTC", 100);
const orderBook = await service.getOrderBook("ETH");

// Use trading methods
await service.initializeWallet();
const orderResult = await service.placeLimitOrder("BTC", "B", 0.001, 50000);
```

Alternatively, specific modules can be imported directly:

```typescript
import { MarketDataService } from "./services/hyperliquid/marketDataService";
import { RateLimiter } from "./services/hyperliquid/rateLimiter";

// Create and use specific modules
const rateLimiter = new RateLimiter();
const marketData = new MarketDataService(/* ... */);
```
