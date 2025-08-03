"use client";

import { useState, useEffect, useCallback } from "react";
import * as z from "zod";
import { HyperliquidService } from "@/app/services/hyperliquid/compatibility";
import { MarketMakerStrategy } from "@/app/services/marketMakerStrategy";
import { Config } from "@/app/config";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfigForm } from "./ConfigForm";
import { TradingDashboard } from "./TradingDashboard";
import { OrdersTable } from "./OrdersTable";
import { PositionsTable } from "./PositionsTable";
import { ErrorLogs } from "./ErrorLogs";
import { OrderForm } from "./OrderForm";
import {
  ErrorMessage,
  Order,
  configFormSchema,
  orderFormSchema,
} from "./types";
import { WalletConnectionState, WalletConnection } from "@/components/wallet/WalletConnection";

// Define ErrorType here since it's not exported from types
type ErrorType = "critical" | "warning" | "info";

// Define interfaces for API data
interface CrossMarginSummary {
  accountValue?: string;
  freeCollateral?: string;
  [key: string]: unknown;
}

interface AccountInfo {
  crossMarginSummary?: CrossMarginSummary;
  [key: string]: unknown;
}

interface Position {
  coin: string;
  size: string | number;
  entryPrice: string | number;
  markPrice: string | number;
  unrealizedPnl: string | number;
  realizedPnl: string | number;
  [key: string]: unknown;
}


interface MarketMakerProps {
  config: Config;
  hyperliquidService?: HyperliquidService;
}

export function MarketMaker({
  config: initialConfig,
  hyperliquidService: initialService,
}: MarketMakerProps) {
  // State for the application
  const [activeTab, setActiveTab] = useState<string>("config");
  const [config, setConfig] = useState<Config>(initialConfig);
  const [hyperliquidService, setHyperliquidService] = useState<
    HyperliquidService | undefined
  >(initialService);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableCoins, setAvailableCoins] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [errors, setErrors] = useState<ErrorMessage[]>([]);
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [marketMakerStrategy, setMarketMakerStrategy] = useState<MarketMakerStrategy | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<string>("");
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pnlData, setPnlData] = useState<{
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
  }>({
    totalUnrealizedPnl: 0,
    totalRealizedPnl: 0,
  });
  const [statusIntervalId, setStatusIntervalId] =
    useState<NodeJS.Timeout | null>(null);
  const [dataRefreshInterval, setDataRefreshInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [coinPrices, setCoinPrices] = useState<Map<string, number>>(new Map());
  const [walletConnectionState, setWalletConnectionState] = useState<WalletConnectionState | null>(null);

  // Handle wallet connection
  const handleWalletConnect = useCallback((state: WalletConnectionState) => {
    setWalletConnectionState(state);
    
    // Update the config with the wallet address
    if (state.isConnected && state.address) {
      const updatedConfig = {
        ...config,
        walletAddress: state.address
      };
      setConfig(updatedConfig);
      
      // Update the HyperliquidService with the new wallet state and config
      if (hyperliquidService) {
        hyperliquidService.setWalletConnectionState(state);
        hyperliquidService.updateConfig(updatedConfig);
      }
    }
  }, [hyperliquidService, config]);

  // Handle wallet disconnection
  const handleWalletDisconnect = useCallback(() => {
    setWalletConnectionState(null);
    // Update the HyperliquidService to clear wallet state
    if (hyperliquidService) {
      hyperliquidService.setWalletConnectionState(null);
    }
  }, [hyperliquidService]);

  // Handle errors - memoized to prevent infinite re-renders
  const handleError = useCallback((message: string, error: unknown, type: ErrorType) => {
    const errorMessage = (error as Error)?.message || "Unknown error";
    const newError: ErrorMessage = {
      id: Date.now().toString(),
      type,
      message: `${message}: ${errorMessage}`,
      timestamp: new Date(),
    };
    setErrors(prev => [newError, ...prev]);

    // Remove errors after 10 seconds if they're not critical
    if (type !== "critical") {
      setTimeout(() => {
        setErrors(prev => prev.filter(e => e.id !== newError.id));
      }, 10000);
    }
  }, []);

  // Fetch available coins from the exchange
  const fetchAvailableCoins = useCallback(async () => {
    try {
      if (!hyperliquidService) return;
      const coins = await hyperliquidService.getAvailableCoins();
      setAvailableCoins(coins);
      if (coins.length > 0 && !selectedCoin) {
        setSelectedCoin(coins[0]);
      }
    } catch (error) {
      handleError("Failed to fetch available coins", error, "critical");
    }
  }, [hyperliquidService, selectedCoin, handleError]);

  // Fetch current market price for a coin
  const fetchMarketPrice = useCallback(
    async (coin: string) => {
      try {
        if (!hyperliquidService) return;
        const orderBook = await hyperliquidService.getOrderBook(coin);
        if (
          orderBook &&
          orderBook.asks &&
          orderBook.asks.length > 0 &&
          orderBook.bids &&
          orderBook.bids.length > 0
        ) {
          const midPrice =
            (parseFloat(orderBook.asks[0].p) +
              parseFloat(orderBook.bids[0].p)) /
            2;

          // Update both the marketPrice state and the coinPrices map
          setMarketPrice(midPrice);
          setCoinPrices(prevPrices => {
            const newPrices = new Map(prevPrices);
            newPrices.set(coin, midPrice);
            return newPrices;
          });
        }
      } catch (error) {
        handleError("Failed to fetch market price", error, "warning");
      }
    },
    [hyperliquidService, handleError]
  );

  // Initialize HyperliquidService if not provided
  useEffect(() => {
    if (!hyperliquidService) {
      try {
        const service = new HyperliquidService(config);
        setHyperliquidService(service);
      } catch (error) {
        handleError("Failed to initialize HyperliquidService", error, "critical");
      }
    }
  }, [config, hyperliquidService, handleError]);

  // Update service wallet state when wallet connection changes
  useEffect(() => {
    if (hyperliquidService && walletConnectionState) {
      hyperliquidService.setWalletConnectionState(walletConnectionState);
    }
  }, [hyperliquidService, walletConnectionState]);

  // Fetch available coins on component mount
  useEffect(() => {
    if (hyperliquidService) {
      fetchAvailableCoins();
    }
  }, [hyperliquidService, fetchAvailableCoins]);

  // Update market price when selected coin changes
  useEffect(() => {
    if (selectedCoin && hyperliquidService) {
      fetchMarketPrice(selectedCoin);
    }
  }, [selectedCoin, hyperliquidService, fetchMarketPrice]);

  // Handle form submission
  const onSubmit = async (values: z.infer<typeof orderFormSchema>) => {
    setIsLoading(true);
    try {
      if (!hyperliquidService) {
        throw new Error("Hyperliquid service not initialized");
      }

      const { coin, orderCount, startPrice, endPrice, sizePerOrder, side } =
        values;

      // Calculate price step
      const priceStep = (endPrice - startPrice) / (orderCount - 1);

      // Generate orders
      const newOrders: Order[] = [];

      for (let i = 0; i < orderCount; i++) {
        const price = startPrice + priceStep * i;
        const order: Order = {
          id: `${Date.now()}-${i}`,
          coin,
          side,
          price,
          size: sizePerOrder,
          status: "pending",
          timestamp: new Date(),
        };
        newOrders.push(order);
      }

      // Add orders to state
      setOrders(prev => [...prev, ...newOrders]);

      // Place orders
      for (const order of newOrders) {
        try {
          await hyperliquidService.placeLimitOrder(
            order.coin,
            order.side === "buy" ? "B" : "A",
            order.price,
            order.size,
            false
          );

          // Update order status
          setOrders(prev =>
            prev.map(o => (o.id === order.id ? { ...o, status: "placed" } : o))
          );
        } catch (error: unknown) {
          // Check if this is a legitimate error or just a rejected order
          const isLegitimateError = isLegitimateErrorMessage(error);

          // Update order status
          setOrders(prev =>
            prev.map(o =>
              o.id === order.id
                ? {
                    ...o,
                    status: "failed",
                    error: (error as Error)?.message || "Unknown error",
                  }
                : o
            )
          );

          // Add to errors list if it's a legitimate error
          if (isLegitimateError) {
            handleError(
              `Failed to place order at price ${order.price}`,
              error,
              "critical"
            );
          } else {
            handleError(
              `Order rejected at price ${order.price}`,
              error,
              "info"
            );
          }
        }
      }
    } catch (error) {
      handleError("Failed to submit orders", error, "critical");
    } finally {
      setIsLoading(false);
    }
  };


  // Check if an error is a legitimate problem or just a rejected order
  const isLegitimateErrorMessage = useCallback((error: unknown): boolean => {
    const errorMessage = (error as Error)?.message || "";

    // List of error messages that indicate legitimate problems
    const legitimateErrors = [
      "network error",
      "timeout",
      "unauthorized",
      "authentication failed",
      "insufficient funds",
      "internal server error",
      "service unavailable",
      "rate limit exceeded",
      "connection error",
      "invalid api key",
    ];

    return legitimateErrors.some(e =>
      errorMessage.toLowerCase().includes(e.toLowerCase())
    );
  }, []);

  // Cancel an order
  const cancelOrder = async (order: Order) => {
    try {
      if (!hyperliquidService) return;

      // Only try to cancel if the order was successfully placed
      if (order.status === "placed") {
        await hyperliquidService.cancelAllOrders(order.coin);

        // Since we're canceling all orders for this coin, update all placed orders for this coin
        setOrders(prev =>
          prev.map(o =>
            o.coin === order.coin && o.status === "placed"
              ? { ...o, status: "cancelled" }
              : o
          )
        );
      } else {
        // Just update this specific order's status
        setOrders(prev =>
          prev.map(o => (o.id === order.id ? { ...o, status: "cancelled" } : o))
        );
      }
    } catch (error) {
      handleError(`Failed to cancel order ${order.id}`, error, "warning");
    }
  };

  // Cancel all orders
  const cancelAllOrders = async () => {
    try {
      if (!hyperliquidService) return;

      // Get all placed orders grouped by coin
      const placedOrdersByCoin = orders
        .filter(o => o.status === "placed")
        .reduce((acc, order) => {
          if (!acc[order.coin]) {
            acc[order.coin] = [];
          }
          acc[order.coin].push(order);
          return acc;
        }, {} as Record<string, Order[]>);

      // Cancel orders for each coin
      for (const [coin] of Object.entries(placedOrdersByCoin)) {
        try {
          await hyperliquidService.cancelAllOrders(coin);

          // Update order status for all orders of this coin
          setOrders(prev =>
            prev.map(o =>
              o.coin === coin && o.status === "placed"
                ? { ...o, status: "cancelled" }
                : o
            )
          );
        } catch (error) {
          handleError(`Failed to cancel orders for ${coin}`, error, "warning");
        }
      }
    } catch (error) {
      handleError("Failed to cancel all orders", error, "critical");
    }
  };

  // Clear order history
  const clearOrderHistory = () => {
    // Only clear orders that are not pending or placed
    setOrders(prev =>
      prev.filter(o => o.status === "pending" || o.status === "placed")
    );
  };

  // Handle side change
  const handleSideChange = (value: "buy" | "sell") => {
    // Update price range based on side and market price
    if (marketPrice) {
      if (value === "buy") {
        // This will be handled by the OrderForm component
      } else {
        // This will be handled by the OrderForm component
      }
    }
  };

  // Handle coin change
  const handleCoinChange = (value: string) => {
    setSelectedCoin(value);
  };

  // Handle config form submission
  const onConfigSubmit = async (
    values: z.infer<typeof configFormSchema>,
    walletState?: WalletConnectionState
  ) => {
    try {
      setIsLoading(true);

      // Create a new config object with the form values
      const newConfig: Config = {
        ...config,
        walletAddress: values.walletAddress || walletState?.address || "",
        tradingAmount: values.tradingAmount,
        maxSpread: values.maxSpread,
        minSpread: values.minSpread,
        updateInterval: values.updateInterval,
        candleInterval: values.candleInterval,
        leverage: values.leverage,
        riskPercentage: values.riskPercentage,
        orderLevels: values.orderLevels,
        orderSpacing: values.orderSpacing,
        volumeBasedPricing: values.volumeBasedPricing,
        aggressiveness: values.aggressiveness,
        orderRefreshRate: values.orderRefreshRate,
        enableAutomaticPricing: values.enableAutomaticPricing,
        enableAutomaticSizing: values.enableAutomaticSizing,
        useMarketIndicators: values.useMarketIndicators,
        simultaneousPairs: values.simultaneousPairs,
        tradingPairs: values.tradingPairs,
      };

      // Update the config state
      setConfig(newConfig);

      // Create a new HyperliquidService with the updated config
      const newService = new HyperliquidService(newConfig);
      setHyperliquidService(newService);

      // Initialize the wallet with wallet state if using browser wallet
      await newService.initializeWallet(walletState || undefined);

      setIsLoading(false);
      setActiveTab("trading");
    } catch (error) {
      setIsLoading(false);
      handleError("Failed to update configuration", error, "critical");
    }
  };

  // Start the market maker
  const startMarketMaker = async () => {
    try {
      if (!hyperliquidService) {
        handleError(
          "HyperliquidService is not initialized",
          new Error("Service not initialized"),
          "critical"
        );
        return;
      }

      setIsLoading(true);

      // First check if wallet is connected
      if (!walletConnectionState?.isConnected) {
        handleError(
          "Wallet not connected",
          new Error("Please connect your wallet before starting the market maker"),
          "critical"
        );
        setIsLoading(false);
        return;
      }

      // Check if wallet is already initialized and ready
      let walletStatus = hyperliquidService.checkWalletStatus();
      console.log("Current wallet status:", walletStatus);
      
      // Only initialize wallet if it's not ready yet
      if (!walletStatus.ready) {
        console.log("Wallet not ready, initializing...");
        try {
          // Pass the current wallet connection state to avoid re-prompting
          await hyperliquidService.initializeWallet(walletConnectionState);
        } catch (walletError) {
          handleError(
            "Failed to initialize wallet",
            walletError,
            "critical"
          );
          setIsLoading(false);
          return;
        }

        // Re-check wallet status after initialization
        walletStatus = hyperliquidService.checkWalletStatus();
        if (!walletStatus.ready) {
          handleError(
            "Wallet is not initialized",
            new Error(walletStatus.message || "Unknown error"),
            "critical"
          );
          setIsLoading(false);
          return;
        }
      } else {
        console.log("Wallet is already initialized and ready, skipping re-initialization");
      }

      // Stop any existing strategy before starting a new one
      if (marketMakerStrategy) {
        console.log("Stopping existing market maker strategy...");
        await marketMakerStrategy.stop();
        setMarketMakerStrategy(null);
      }

      // Create a new market maker strategy
      const strategy = new MarketMakerStrategy(
        hyperliquidService,
        config
      );

      // Store the strategy instance in state
      setMarketMakerStrategy(strategy);

      // Register event listeners
      strategy.on("error", (...args: unknown[]) => {
        const errorMessage = args[0] as string;
        handleError("Market maker error", errorMessage, "warning");
      });

      // Start the market maker
      await strategy.start();

      // Set up data refresh interval
      const refreshInterval = setInterval(async () => {
        try {
          // Get account info
          const accountInfo = await hyperliquidService.getAccountInfo();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setAccountInfo(accountInfo as any);

          // Get PNL data
          const pnlData = await hyperliquidService.getTotalPnl();
          setPnlData({
            totalUnrealizedPnl: pnlData.totalUnrealizedPnl || 0,
            totalRealizedPnl: pnlData.totalRealizedPnl || 0,
          });

          // Get positions
          if (pnlData.positions) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setPositions(pnlData.positions as any);
          }

          // Get open orders
          const openOrders = await hyperliquidService.getOpenOrders();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formattedOrders = (openOrders as any[]).map((order: any) => ({
            id: order.id || `order-${Date.now()}-${Math.random()}`,
            coin: order.coin,
            side: order.side === "B" ? "buy" : ("sell" as "buy" | "sell"),
            price: parseFloat(order.price),
            size: parseFloat(order.sz),
            status: "placed" as "pending" | "placed" | "failed" | "cancelled",
            timestamp: new Date(),
          }));

          setOrders(formattedOrders);
        } catch (error) {
          handleError("Error refreshing data", error, "warning");
        }
      }, 5000);

      setDataRefreshInterval(refreshInterval);
      setIsRunning(true);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      handleError("Failed to start market maker", error, "critical");
    }
  };

  // Stop the market maker
  const stopMarketMaker = async () => {
    try {
      setIsLoading(true);
      console.log("Stopping market maker...");

      // Stop the market maker strategy first
      if (marketMakerStrategy) {
        console.log("Stopping market maker strategy...");
        await marketMakerStrategy.stop();
        setMarketMakerStrategy(null);
        console.log("Market maker strategy stopped successfully");
      }

      // Clear intervals
      if (dataRefreshInterval) {
        clearInterval(dataRefreshInterval);
        setDataRefreshInterval(null);
        console.log("Data refresh interval cleared");
      }

      if (statusIntervalId) {
        clearInterval(statusIntervalId);
        setStatusIntervalId(null);
        console.log("Status interval cleared");
      }

      // Set running state to false
      setIsRunning(false);
      console.log("Market maker stopped successfully");

      handleError("Market maker stopped - existing orders remain active", null, "info");
    } catch (error) {
      console.error("Error stopping market maker:", error);
      handleError("Error stopping market maker", error, "warning");
      // Still set running to false even if there was an error
      setIsRunning(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear errors
  const clearErrors = () => {
    setErrors([]);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Hyperliquid Market Maker</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <ConfigForm
            config={config}
            availableCoins={availableCoins}
            isLoading={isLoading}
            onSubmit={onConfigSubmit}
          />
        </TabsContent>

        <TabsContent value="trading">
          <div className="space-y-6">
            {/* Wallet Connection Section - Only show if wallet is not connected */}
            {!walletConnectionState?.isConnected && (
              <WalletConnection
                onWalletConnect={handleWalletConnect}
                onWalletDisconnect={handleWalletDisconnect}
                className="mb-4"
              />
            )}

            <TradingDashboard
              config={config}
              isRunning={isRunning}
              isLoading={isLoading}
              accountInfo={accountInfo}
              pnlData={pnlData}
              coinPrices={coinPrices}
              startMarketMaker={startMarketMaker}
              stopMarketMaker={stopMarketMaker}
              fetchMarketPrice={fetchMarketPrice}
              setSelectedCoin={setSelectedCoin}
            />

            <div className="p-4 border rounded-lg">
              <h3 className="text-lg font-medium mb-4">
                Manual Order Placement
              </h3>
              <OrderForm
                availableCoins={availableCoins}
                selectedCoin={selectedCoin}
                isLoading={isLoading}
                marketPrice={marketPrice}
                onSubmit={onSubmit}
                handleCoinChange={handleCoinChange}
                handleSideChange={handleSideChange}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <OrdersTable
            orders={orders}
            isRunning={isRunning}
            cancelOrder={cancelOrder}
            cancelAllOrders={cancelAllOrders}
            clearOrderHistory={clearOrderHistory}
          />
        </TabsContent>

        <TabsContent value="positions">
          <PositionsTable positions={positions} pnlData={pnlData} />
        </TabsContent>

        <TabsContent value="logs">
          <ErrorLogs errors={errors} clearErrors={clearErrors} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
