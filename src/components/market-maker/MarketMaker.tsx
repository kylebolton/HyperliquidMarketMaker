"use client";

import { useState, useEffect } from "react";
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
  const [selectedCoin, setSelectedCoin] = useState<string>("");
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
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
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [marketConditions, setMarketConditions] = useState<Map<string, any>>(
    new Map()
  );
  const [coinPrices, setCoinPrices] = useState<Map<string, number>>(new Map());

  // Fetch available coins on component mount
  useEffect(() => {
    if (hyperliquidService) {
      fetchAvailableCoins();
    }
  }, [hyperliquidService]);

  // Update market price when selected coin changes
  useEffect(() => {
    if (selectedCoin && hyperliquidService) {
      fetchMarketPrice(selectedCoin);
    }
  }, [selectedCoin, hyperliquidService]);

  // Fetch available coins from the exchange
  const fetchAvailableCoins = async () => {
    try {
      if (!hyperliquidService) return;
      const coins = await hyperliquidService.getAvailableCoins();
      setAvailableCoins(coins);
      if (coins.length > 0) {
        setSelectedCoin(coins[0]);

        // Initialize selected pairs with BTC and ETH if available
        const defaultPairs = ["BTC", "ETH"].filter(pair =>
          coins.includes(pair)
        );
        setSelectedPairs(defaultPairs);
      }
    } catch (error) {
      handleError("Failed to fetch available coins", error, "critical");
    }
  };

  // Fetch current market price for a coin
  const fetchMarketPrice = async (coin: string) => {
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
          (parseFloat(orderBook.asks[0].p) + parseFloat(orderBook.bids[0].p)) /
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
  };

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
          const result = await hyperliquidService.placeLimitOrder(
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
        } catch (error: any) {
          // Check if this is a legitimate error or just a rejected order
          const isLegitimateError = isLegitimateErrorMessage(error);

          // Update order status
          setOrders(prev =>
            prev.map(o =>
              o.id === order.id
                ? {
                    ...o,
                    status: "failed",
                    error: error?.message || "Unknown error",
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

  // Handle errors
  const handleError = (message: string, error: any, type: ErrorType) => {
    const errorMessage = error?.message || "Unknown error";
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
  };

  // Check if an error is a legitimate problem or just a rejected order
  const isLegitimateErrorMessage = (error: any): boolean => {
    const errorMessage = error?.message || "";

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
  };

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
      for (const [coin, coinOrders] of Object.entries(placedOrdersByCoin)) {
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
  const onConfigSubmit = async (values: z.infer<typeof configFormSchema>) => {
    try {
      setIsLoading(true);

      // Create a new config object with the form values
      const newConfig: Config = {
        ...config,
        apiKey: values.apiKey,
        apiSecret: values.apiSecret,
        walletAddress: values.walletAddress,
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

      // Initialize the wallet
      await newService.initializeWallet();

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

      // Check wallet status
      const walletStatus = hyperliquidService.checkWalletStatus();
      if (!walletStatus.ready) {
        handleError(
          "Wallet is not initialized",
          new Error(walletStatus.message || "Unknown error"),
          "critical"
        );
        setIsLoading(false);
        return;
      }

      // Create a new market maker strategy
      const marketMakerStrategy = new MarketMakerStrategy(
        hyperliquidService,
        config
      );

      // Register event listeners
      marketMakerStrategy.on("error", (errorMessage: string) => {
        handleError("Market maker error", errorMessage, "warning");
      });

      // Start the market maker
      await marketMakerStrategy.start();

      // Set up data refresh interval
      const refreshInterval = setInterval(async () => {
        try {
          // Get account info
          const accountInfo = await hyperliquidService.getAccountInfo();
          setAccountInfo(accountInfo);

          // Get PNL data
          const pnlData = await hyperliquidService.getTotalPnl();
          setPnlData({
            totalUnrealizedPnl: pnlData.totalUnrealizedPnl,
            totalRealizedPnl: pnlData.totalRealizedPnl,
          });

          // Get positions
          if (pnlData.positions) {
            setPositions(pnlData.positions);
          }

          // Get open orders
          const openOrders = await hyperliquidService.getOpenOrders();
          const formattedOrders = openOrders.map((order: any) => ({
            id: order.id || `order-${Date.now()}-${Math.random()}`,
            coin: order.coin,
            side: order.side === "B" ? "buy" : ("sell" as "buy" | "sell"),
            price: parseFloat(order.price),
            size: parseFloat(order.sz),
            status: "placed" as "pending" | "placed" | "failed" | "cancelled",
            timestamp: new Date(),
          }));

          setOrders(formattedOrders);

          // Get market conditions for each trading pair
          if (marketMakerStrategy.getStatus) {
            const status = marketMakerStrategy.getStatus();
          }
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
      setIsRunning(false);

      // Clear intervals
      if (dataRefreshInterval) {
        clearInterval(dataRefreshInterval);
        setDataRefreshInterval(null);
      }

      if (statusIntervalId) {
        clearInterval(statusIntervalId);
        setStatusIntervalId(null);
      }

      // Cancel all orders
      if (hyperliquidService) {
        await cancelAllOrders();
      }

      handleError("Market maker stopped successfully", null, "info");
    } catch (error) {
      handleError("Error stopping market maker", error, "warning");
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
