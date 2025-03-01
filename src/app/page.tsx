"use client";

import { useState, useEffect, useCallback } from "react";
import { Config, defaultConfig } from "./config";
import { HyperliquidService } from "./services/hyperliquidService";
import { MarketMakerStrategy } from "./services/marketMakerStrategy";
import {
  analyzeCandles,
  detectCandlestickPatterns,
} from "./utils/technicalAnalysis";

// Add this interface at the top of the file, after the imports
interface MarketData {
  coin: string;
  candles: any[];
  lastPrice: number;
  change: number;
}

export default function Home() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [marketData, setMarketData] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [hyperliquidService, setHyperliquidService] =
    useState<HyperliquidService | null>(null);
  const [marketMakerStrategy, setMarketMakerStrategy] =
    useState<MarketMakerStrategy | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "market" | "positions">(
    "config"
  );
  const [loading, setLoading] = useState(false);
  const [estimatedOrderSizes, setEstimatedOrderSizes] = useState<
    Record<string, number>
  >({});
  // New state variables for orders, positions, and PNL
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [activePositions, setActivePositions] = useState<any[]>([]);
  const [pnlData, setPnlData] = useState<{
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
  }>({ totalUnrealizedPnl: 0, totalRealizedPnl: 0 });
  const [dataRefreshInterval, setDataRefreshInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [statusIntervalId, setStatusIntervalId] =
    useState<NodeJS.Timeout | null>(null);
  // Add a retrying state
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  // Initialize services when config changes
  useEffect(() => {
    try {
      const service = new HyperliquidService(config);
      setHyperliquidService(service);

      const strategy = new MarketMakerStrategy(service, config);
      setMarketMakerStrategy(strategy);
    } catch (err) {
      console.error("Error initializing services:", err);
      setError(
        "Failed to initialize services. Please check your configuration."
      );
    }
  }, [config.apiKey, config.apiSecret, config.walletAddress]);

  // Fetch market data for all trading pairs
  const fetchMarketData = async () => {
    if (!hyperliquidService) return;

    try {
      setLoading(true);
      const data: any = {};

      for (const coin of config.tradingPairs) {
        try {
          // Get current price from order book
          const orderBook = await hyperliquidService.getOrderBook(coin);
          const price =
            orderBook && orderBook.asks && orderBook.asks.length > 0
              ? parseFloat(orderBook.asks[0].p)
              : 0;

          // Get candles for price change calculation
          const candles = await hyperliquidService.getCandles(coin);

          // Calculate price change
          const priceChange = calculatePriceChange(candles);

          // Get recent trades
          const trades = await hyperliquidService.getTrades(coin);

          data[coin] = {
            price,
            priceChange,
            trades,
            candles,
          };
        } catch (error) {
          console.error(`Error fetching data for ${coin}:`, error);

          // Handle rate limit errors gracefully
          if (error instanceof Error && error.message.includes("429")) {
            setError(
              "API rate limit reached. Please try again in a few minutes."
            );
            break;
          }

          // For other errors, continue with other coins
          data[coin] = {
            price: null,
            priceChange: null,
            trades: [],
            candles: [],
            error: `Failed to fetch data: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          };
        }
      }

      setMarketData(data);

      // Calculate estimated order sizes after fetching market data
      calculateEstimatedOrderSizes();
    } catch (error) {
      console.error("Error fetching market data:", error);
      setError(
        `Failed to fetch market data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Update market data periodically
  useEffect(() => {
    if (!hyperliquidService || !isRunning) return;

    const fetchMarketData = async () => {
      try {
        setLoading(true);

        // Get available coins first
        const availableCoins = await hyperliquidService.getAvailableCoins();

        // Only fetch data for coins that are available
        const validCoins = config.tradingPairs.filter(coin =>
          availableCoins.includes(coin)
        );

        if (validCoins.length === 0) {
          console.warn("No valid coins found in configuration");
          setLoading(false);
          return;
        }

        // Fetch data for each valid coin
        const marketDataPromises = validCoins.map(async coin => {
          try {
            const candles = await hyperliquidService.getCandles(coin);
            if (candles.length === 0) {
              console.warn(`No candle data available for ${coin}`);
              return null;
            }

            return {
              coin,
              candles,
              lastPrice: parseFloat(String(candles[candles.length - 1].c)),
              change: calculatePriceChange(candles),
            };
          } catch (error: any) {
            // Handle rate limit errors gracefully
            if (
              error?.message?.includes("429") ||
              error?.toString().includes("429")
            ) {
              console.warn(
                `Rate limit exceeded when fetching data for ${coin}. Using cached data if available.`
              );
              // Don't set an error message here to avoid cluttering the UI
              // The rate limiter in hyperliquidService will handle retries
            } else {
              console.error(`Error fetching data for ${coin}:`, error);
            }
            return null;
          }
        });

        const marketData = (await Promise.all(marketDataPromises)).filter(
          data => data !== null
        ) as MarketData[];

        setMarketData(marketData);
      } catch (error: any) {
        console.error("Error fetching market data:", error);

        // Check if it's a rate limit error
        if (
          error?.message?.includes("429") ||
          error?.toString().includes("429")
        ) {
          setError(
            "Rate limit exceeded. The API is temporarily unavailable. Please wait a few minutes before trying again."
          );
        } else {
          setError("Failed to fetch market data. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchMarketData();

    // Set up interval for updates
    const intervalId = setInterval(fetchMarketData, 10000); // Update every 10 seconds

    return () => clearInterval(intervalId);
  }, [hyperliquidService, isRunning, config.tradingPairs]);

  // Update status periodically
  useEffect(() => {
    if (!marketMakerStrategy || !isRunning) return;

    const updateStatus = () => {
      try {
        const currentStatus = marketMakerStrategy.getStatus();
        setStatus(currentStatus);
      } catch (err) {
        console.error("Error updating status:", err);
      }
    };

    // Initial update
    updateStatus();

    // Set up interval for updates
    const intervalId = setInterval(updateStatus, 5000); // Update every 5 seconds

    return () => clearInterval(intervalId);
  }, [marketMakerStrategy, isRunning]);

  // Start the market maker
  const startMarketMaker = async () => {
    if (!marketMakerStrategy) {
      setError("Market maker strategy not initialized");
      return;
    }

    try {
      setLoading(true);
      await marketMakerStrategy.start();
      setIsRunning(true);

      // Fetch market data and trading data when starting
      await fetchMarketData();
      await fetchTradingData();

      setLoading(false);

      // Update status periodically
      const statusInterval = setInterval(() => {
        if (marketMakerStrategy) {
          setStatus(marketMakerStrategy.getStatus());
        }
      }, 5000);

      // Store the interval ID for cleanup
      setStatusIntervalId(statusInterval);
    } catch (error) {
      console.error("Error starting market maker:", error);
      setError(`Failed to start market maker: ${error}`);
      setLoading(false);
    }
  };

  // Stop the market maker
  const stopMarketMaker = async () => {
    if (!marketMakerStrategy) return;

    try {
      await marketMakerStrategy.stop();
      setIsRunning(false);

      // Clear intervals
      if (statusIntervalId) {
        clearInterval(statusIntervalId);
        setStatusIntervalId(null);
      }

      if (dataRefreshInterval) {
        clearInterval(dataRefreshInterval);
        setDataRefreshInterval(null);
      }
    } catch (err) {
      console.error("Error stopping market maker:", err);
      setError("Failed to stop market maker.");
    }
  };

  // Handle config changes
  const handleConfigChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "tradingPairs") {
      setConfig({
        ...config,
        tradingPairs: value.split(",").map(pair => pair.trim()),
      });
    } else if (
      name === "tradingAmount" ||
      name === "maxSpread" ||
      name === "minSpread" ||
      name === "updateInterval" ||
      name === "leverage" ||
      name === "riskPercentage"
    ) {
      const parsedValue = parseFloat(value);
      // Only update if the value is a valid number
      if (!isNaN(parsedValue) || value === "") {
        // Show warning for high leverage
        if (name === "leverage" && parsedValue > 5) {
          setError(
            `Warning: Using ${parsedValue}x leverage is very risky. Consider using lower leverage.`
          );
          // Clear warning after 5 seconds
          setTimeout(() => setError(null), 5000);
        }

        setConfig({
          ...config,
          [name]: value === "" ? "" : parsedValue,
        });
      }
    } else {
      setConfig({
        ...config,
        [name]: value,
      });
    }
  };

  // Helper function to calculate price change percentage
  const calculatePriceChange = (candles: any[]): number => {
    if (candles.length < 2) return 0;

    const currentPrice = candles[candles.length - 1].c;
    const previousPrice = candles[0].o;

    return ((currentPrice - previousPrice) / previousPrice) * 100;
  };

  // Calculate estimated order sizes based on current config
  const calculateEstimatedOrderSizes = useCallback(async () => {
    if (
      !hyperliquidService ||
      !marketData ||
      Object.keys(marketData).length === 0
    ) {
      return;
    }

    const sizes: Record<string, number> = {};

    for (const coin of config.tradingPairs) {
      if (marketData[coin] && marketData[coin].price) {
        try {
          // Simple estimation based on account value, risk percentage, and leverage
          const accountInfo = await hyperliquidService.getAccountInfo();
          const accountValue = parseFloat(
            accountInfo.crossMarginSummary.accountValue
          );
          const riskAmount = (accountValue * config.riskPercentage) / 100;
          const leveragedRiskAmount = riskAmount * config.leverage;
          const estimatedSize = leveragedRiskAmount / marketData[coin].price;

          // Apply minimum size constraints
          const minSize = hyperliquidService.getMinimumSize(coin);
          sizes[coin] = Math.max(minSize, estimatedSize);
        } catch (error) {
          console.error(`Error estimating order size for ${coin}:`, error);
          sizes[coin] = hyperliquidService.getMinimumSize(coin);
        }
      }
    }

    setEstimatedOrderSizes(sizes);
  }, [
    hyperliquidService,
    marketData,
    config.tradingPairs,
    config.riskPercentage,
    config.leverage,
  ]);

  // Update estimated order sizes when relevant config changes
  useEffect(() => {
    calculateEstimatedOrderSizes();
  }, [calculateEstimatedOrderSizes, config.riskPercentage, config.leverage]);

  // Fetch orders, positions, and PNL data
  const fetchTradingData = useCallback(async () => {
    if (!hyperliquidService) return;

    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      setIsRetrying(false); // Reset retry state

      // Fetch open orders
      try {
        const orders = await hyperliquidService.getOpenOrders();
        setOpenOrders(orders);
      } catch (orderError: any) {
        console.error("Error fetching open orders:", orderError);
        // Don't set error state yet, try to fetch other data
        if (
          orderError?.message &&
          typeof orderError.message === "string" &&
          orderError.message.includes("RETRYING_API_CALL")
        ) {
          setIsRetrying(true);
        }
      }

      // Fetch active positions and PNL data
      try {
        const pnlInfo = await hyperliquidService.getTotalPnl();
        setActivePositions(pnlInfo.positions);
        setPnlData({
          totalUnrealizedPnl: pnlInfo.totalUnrealizedPnl,
          totalRealizedPnl: pnlInfo.totalRealizedPnl,
        });
      } catch (pnlError: any) {
        console.error("Error fetching PNL data:", pnlError);
        if (
          pnlError?.message &&
          typeof pnlError.message === "string" &&
          pnlError.message.includes("RETRYING_API_CALL")
        ) {
          setIsRetrying(true);
        }
      }

      setLoading(false);
    } catch (error: any) {
      console.error("Error fetching trading data:", error);
      setError(
        "Failed to fetch trading data. The system will automatically retry."
      );
      if (
        error?.message &&
        typeof error.message === "string" &&
        error.message.includes("RETRYING_API_CALL")
      ) {
        setIsRetrying(true);
      }
      setLoading(false);
    }
  }, [hyperliquidService]);

  // Update the useEffect for data refresh interval
  useEffect(() => {
    if (isRunning && hyperliquidService) {
      // Initial fetch
      fetchTradingData();

      // Set up interval for regular updates
      // Use a longer interval if there are errors to avoid overwhelming the API
      const refreshRate = error ? 15000 : 5000; // 15 seconds if error, 5 seconds normally

      const intervalId = setInterval(() => {
        fetchTradingData();
      }, refreshRate);

      // Store interval ID for cleanup
      setDataRefreshInterval(intervalId);

      return () => {
        if (dataRefreshInterval) {
          clearInterval(dataRefreshInterval);
          setDataRefreshInterval(null);
        }
      };
    }
  }, [isRunning, hyperliquidService, fetchTradingData, error]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              Hyperliquid Market Maker
            </h1>
            <p className="text-gray-400 mt-1">
              Advanced trading automation for Hyperliquid
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`h-3 w-3 rounded-full ${
                isRunning ? "bg-green-500" : "bg-red-500"
              } animate-pulse`}
            ></div>
            <span
              className={`font-medium ${
                isRunning ? "text-green-500" : "text-red-500"
              }`}
            >
              {isRunning ? "Running" : "Stopped"}
            </span>
          </div>
        </header>

        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg flex items-start">
            <svg
              className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Dashboard Summary */}
        {isRunning && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Active Positions Count */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-1">
                Active Positions
              </h3>
              <div className="text-2xl font-bold text-white">
                {activePositions.length}
              </div>
            </div>

            {/* Open Orders Count */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-1">
                Open Orders
              </h3>
              <div className="text-2xl font-bold text-white">
                {openOrders.length}
              </div>
            </div>

            {/* Unrealized PNL */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-1">
                Unrealized PNL
              </h3>
              <div
                className={`text-2xl font-bold ${
                  pnlData.totalUnrealizedPnl >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {pnlData.totalUnrealizedPnl >= 0 ? "+" : ""}$
                {pnlData.totalUnrealizedPnl.toFixed(2)}
              </div>
            </div>

            {/* Leverage Warning */}
            <div
              className={`rounded-lg p-4 flex items-center ${
                config.leverage > 5
                  ? "bg-red-900/30 border border-red-500"
                  : "bg-gray-800/50 border border-gray-700"
              }`}
            >
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-1">
                  Current Leverage
                </h3>
                <div
                  className={`text-2xl font-bold ${
                    config.leverage > 5 ? "text-red-400" : "text-white"
                  }`}
                >
                  {config.leverage}x
                </div>
              </div>
              {config.leverage > 5 && (
                <div className="ml-auto">
                  <svg
                    className="w-6 h-6 text-red-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-6 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg overflow-hidden">
          <div className="flex border-b border-gray-700">
            <button
              className={`px-6 py-3 font-medium text-sm focus:outline-none ${
                activeTab === "config"
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-700/50"
              }`}
              onClick={() => setActiveTab("config")}
            >
              Configuration
            </button>
            <button
              className={`px-6 py-3 font-medium text-sm focus:outline-none ${
                activeTab === "market"
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-700/50"
              }`}
              onClick={() => setActiveTab("market")}
            >
              Market Data
            </button>
            <button
              className={`px-6 py-3 font-medium text-sm focus:outline-none ${
                activeTab === "positions"
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-700/50"
              }`}
              onClick={() => setActiveTab("positions")}
            >
              Positions
            </button>
          </div>

          <div className="p-6">
            {activeTab === "config" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* API Configuration */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 text-blue-400">
                    API Configuration
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        API Key
                      </label>
                      <input
                        type="text"
                        name="apiKey"
                        value={config.apiKey}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isRunning}
                        placeholder="Enter your API key"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        API Secret
                      </label>
                      <input
                        type="password"
                        name="apiSecret"
                        value={config.apiSecret}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isRunning}
                        placeholder="Enter your API secret"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Wallet Address
                      </label>
                      <input
                        type="text"
                        name="walletAddress"
                        value={config.walletAddress}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isRunning}
                        placeholder="0x..."
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Trading Pairs
                      </label>
                      <input
                        type="text"
                        name="tradingPairs"
                        value={config.tradingPairs.join(", ")}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isRunning}
                        placeholder="BTC, ETH, SOL"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Comma-separated list of trading pairs
                      </p>
                    </div>
                  </div>
                </div>

                {/* Trading Parameters */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 text-blue-400">
                    Trading Parameters
                  </h2>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Trading Amount (USD)
                      </label>
                      <input
                        type="number"
                        name="tradingAmount"
                        value={
                          isNaN(config.tradingAmount)
                            ? ""
                            : config.tradingAmount
                        }
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isRunning}
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Leverage
                      </label>
                      <input
                        type="number"
                        name="leverage"
                        value={config.leverage}
                        onChange={handleConfigChange}
                        className={`w-full ${
                          config.leverage > 5
                            ? "bg-red-900/30 border-red-500"
                            : "bg-gray-700/50 border-gray-600"
                        } border rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                        min="1"
                        max="20"
                        step="0.1"
                        disabled={isRunning}
                      />
                      <div className="mt-2">
                        {config.leverage > 5 ? (
                          <div className="text-red-400 text-xs flex items-start">
                            <svg
                              className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span>
                              <strong>High Risk Warning:</strong>{" "}
                              {config.leverage}x leverage will multiply your
                              position size and potential losses by{" "}
                              {config.leverage}. Only use high leverage if you
                              fully understand the risks involved.
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">
                            Multiplies your buying power. Higher values = larger
                            positions and higher risk.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Min Spread (%)
                      </label>
                      <input
                        type="number"
                        name="minSpread"
                        value={config.minSpread}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        step="0.01"
                        disabled={isRunning}
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Max Spread (%)
                      </label>
                      <input
                        type="number"
                        name="maxSpread"
                        value={config.maxSpread}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        step="0.01"
                        disabled={isRunning}
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Update Interval (sec)
                      </label>
                      <input
                        type="number"
                        name="updateInterval"
                        value={config.updateInterval}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isRunning}
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Risk Percentage (%)
                      </label>
                      <input
                        type="number"
                        name="riskPercentage"
                        value={config.riskPercentage}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        step="0.1"
                        disabled={isRunning}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Percentage of your account balance to risk per trade.
                        Higher values = larger orders.
                      </p>
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        Candle Interval
                      </label>
                      <select
                        name="candleInterval"
                        value={config.candleInterval}
                        onChange={handleConfigChange}
                        className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isRunning}
                      >
                        <option value="1m">1 minute</option>
                        <option value="5m">5 minutes</option>
                        <option value="15m">15 minutes</option>
                        <option value="1h">1 hour</option>
                        <option value="4h">4 hours</option>
                        <option value="1d">1 day</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Estimated Order Sizes */}
                {Object.keys(estimatedOrderSizes).length > 0 && (
                  <div className="mt-6 p-4 bg-gray-800/70 rounded-lg border border-gray-700">
                    <h3 className="text-lg font-semibold text-blue-400 mb-2">
                      Estimated Order Sizes
                    </h3>
                    <p className="text-xs text-gray-400 mb-3">
                      Based on your current account balance, risk percentage,
                      and leverage settings. Actual sizes may vary due to market
                      conditions and minimum size requirements.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      {config.tradingPairs.map(coin => (
                        <div
                          key={coin}
                          className="flex justify-between items-center"
                        >
                          <span className="text-white font-medium">
                            {coin}:
                          </span>
                          <span className="text-green-400">
                            {estimatedOrderSizes[coin]?.toFixed(
                              coin.toUpperCase() === "ETH"
                                ? 2
                                : coin.toUpperCase() === "BTC"
                                ? 3
                                : 4
                            ) || "0.00"}{" "}
                            {coin}
                            {marketData[coin] && marketData[coin].price && (
                              <span className="text-xs text-gray-400 ml-2">
                                (≈$
                                {(
                                  (estimatedOrderSizes[coin] || 0) *
                                  marketData[coin].price
                                ).toFixed(2)}
                                )
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "market" && (
              <div>
                {status && (
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4 text-blue-400">
                      Active Trading Pairs
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {status.activePairs.map((pair: string) => (
                        <div
                          key={pair}
                          className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-medium text-lg">{pair}</div>
                            <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          </div>
                          <div className="text-2xl font-bold text-white">
                            ${status.lastPrices.get(pair)?.toFixed(2) || "N/A"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(marketData).length > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-semibold text-blue-400">
                        Market Data
                      </h2>
                      <button
                        onClick={fetchMarketData}
                        disabled={loading}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md flex items-center"
                      >
                        {loading ? (
                          <span>Refreshing...</span>
                        ) : (
                          <>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                            Refresh Data
                          </>
                        )}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {config.tradingPairs.map(coin => (
                        <div
                          key={coin}
                          className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-white">
                              {coin}
                            </h3>
                            {marketData[coin] && marketData[coin].price ? (
                              <div className="text-right">
                                <div className="text-xl font-bold text-white">
                                  $
                                  {marketData[coin].price.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}
                                </div>
                                <div
                                  className={`text-sm ${
                                    marketData[coin].priceChange >= 0
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {marketData[coin].priceChange >= 0 ? "+" : ""}
                                  {marketData[coin].priceChange.toFixed(2)}%
                                </div>
                              </div>
                            ) : (
                              <div className="text-gray-400">Loading...</div>
                            )}
                          </div>

                          {/* Add estimated order size information */}
                          {estimatedOrderSizes[coin] && (
                            <div className="mt-2 p-2 bg-gray-700/50 rounded border border-gray-600">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-300">
                                  Estimated Order Size:
                                </span>
                                <span className="text-sm font-medium text-green-400">
                                  {estimatedOrderSizes[coin]?.toFixed(
                                    coin.toUpperCase() === "ETH"
                                      ? 2
                                      : coin.toUpperCase() === "BTC"
                                      ? 3
                                      : 4
                                  )}{" "}
                                  {coin}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-400">
                                  USD Value:
                                </span>
                                <span className="text-xs text-gray-300">
                                  $
                                  {(
                                    (estimatedOrderSizes[coin] || 0) *
                                    (marketData[coin]?.price || 0)
                                  ).toFixed(2)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                Based on {config.riskPercentage}% risk and{" "}
                                {config.leverage}x leverage
                              </div>
                            </div>
                          )}

                          {marketData[coin] && marketData[coin].error && (
                            <div className="mt-2 text-sm text-red-400">
                              {marketData[coin].error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "positions" && (
              <div className="bg-white shadow-md rounded-lg p-6">
                {/* Add retry indicator */}
                {isRetrying && (
                  <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-2 mb-4 rounded">
                    <p className="font-bold">Retrying API calls...</p>
                    <p>
                      Experiencing network issues. The system is automatically
                      retrying.
                    </p>
                  </div>
                )}

                {/* PNL Summary */}
                <div className="mb-6 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h2 className="text-xl font-semibold mb-4 text-blue-400">
                    PNL Summary
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                      <h3 className="text-lg font-medium text-gray-300 mb-2">
                        Unrealized PNL
                      </h3>
                      <div
                        className={`text-2xl font-bold ${
                          pnlData.totalUnrealizedPnl >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {pnlData.totalUnrealizedPnl >= 0 ? "+" : ""}$
                        {pnlData.totalUnrealizedPnl.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                      <h3 className="text-lg font-medium text-gray-300 mb-2">
                        Realized PNL
                      </h3>
                      <div
                        className={`text-2xl font-bold ${
                          pnlData.totalRealizedPnl >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {pnlData.totalRealizedPnl >= 0 ? "+" : ""}$
                        {pnlData.totalRealizedPnl.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk Warning */}
                <div className="mb-6 bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-yellow-200">
                  <div className="flex items-start">
                    <svg
                      className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <h3 className="font-bold text-lg mb-1">
                        Trading Risk Warning
                      </h3>
                      <p className="text-sm">
                        Trading with leverage is risky and can lead to
                        significant losses. Your current leverage setting is{" "}
                        <span className="font-bold">{config.leverage}x</span>,
                        which means your potential losses are amplified by this
                        factor. Only trade with funds you can afford to lose.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Active Positions */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-blue-400">
                      Active Positions
                    </h2>
                    <button
                      onClick={fetchTradingData}
                      disabled={loading}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md flex items-center"
                    >
                      {loading ? (
                        <span>Refreshing...</span>
                      ) : (
                        <>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          Refresh Data
                        </>
                      )}
                    </button>
                  </div>

                  {activePositions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
                        <thead className="bg-gray-700/50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Coin
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Side
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Size
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Entry Price
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Current Price
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              PNL
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {activePositions.map((position, index) => (
                            <tr key={index} className="hover:bg-gray-700/30">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                                {position.name}
                              </td>
                              <td
                                className={`px-4 py-3 whitespace-nowrap text-sm ${
                                  position.side === "long"
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.side.toUpperCase()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                {position.absSize.toFixed(4)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                $
                                {parseFloat(position.position.entryPx).toFixed(
                                  2
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                ${position.currentPrice.toFixed(2)}
                              </td>
                              <td
                                className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
                                  position.unrealizedPnl >= 0
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
                                {position.unrealizedPnl >= 0 ? "+" : ""}$
                                {position.unrealizedPnl.toFixed(2)}
                                <span className="text-xs ml-1">
                                  ({position.pnlPercentage >= 0 ? "+" : ""}
                                  {position.pnlPercentage.toFixed(2)}%)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
                      No active positions found.
                    </div>
                  )}
                </div>

                {/* Open Orders */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 text-blue-400">
                    Open Orders
                  </h2>

                  {openOrders.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
                        <thead className="bg-gray-700/50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Coin
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Side
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Price
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Size
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Time
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {openOrders.map((order, index) => (
                            <tr key={index} className="hover:bg-gray-700/30">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                                {order.coin}
                              </td>
                              <td
                                className={`px-4 py-3 whitespace-nowrap text-sm ${
                                  order.side === "B"
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
                                {order.side === "B" ? "BUY" : "SELL"}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                {order.orderType}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                ${parseFloat(order.limitPx).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                {parseFloat(order.sz).toFixed(4)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                {new Date(order.timestamp).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
                      No open orders found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-6">
          {!isRunning ? (
            <button
              onClick={startMarketMaker}
              className={`px-6 py-3 rounded-lg font-medium text-white transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 ${
                !config.apiKey || !config.apiSecret || !config.walletAddress
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg"
              }`}
              disabled={
                !config.apiKey || !config.apiSecret || !config.walletAddress
              }
            >
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Start Market Maker
              </div>
            </button>
          ) : (
            <button
              onClick={stopMarketMaker}
              className="px-6 py-3 rounded-lg font-medium text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-red-500 shadow-lg"
            >
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                  />
                </svg>
                Stop Market Maker
              </div>
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

// Helper function to calculate price change
function calculateChange(candles: any[]): string {
  if (!candles || candles.length < 2) return "0.00";

  try {
    const firstPrice = parseFloat(candles[0].c);
    const lastPrice = parseFloat(candles[candles.length - 1].c);

    // Check for valid numbers
    if (isNaN(firstPrice) || isNaN(lastPrice) || firstPrice === 0) {
      return "0.00";
    }

    const change = ((lastPrice - firstPrice) / firstPrice) * 100;

    // Check for valid result
    if (isNaN(change) || !isFinite(change)) {
      return "0.00";
    }

    return change.toFixed(2);
  } catch (error) {
    console.error("Error calculating price change:", error);
    return "0.00";
  }
}
