import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Config } from "@/app/config";

interface CrossMarginSummary {
  accountValue?: string;
  freeCollateral?: string;
  [key: string]: unknown;
}

interface AccountInfo {
  crossMarginSummary?: CrossMarginSummary;
  [key: string]: unknown;
}

interface TradingDashboardProps {
  config: Config;
  isRunning: boolean;
  isLoading: boolean;
  accountInfo: AccountInfo | null;
  pnlData: {
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
  };
  coinPrices: Map<string, number>;
  startMarketMaker: () => Promise<void>;
  stopMarketMaker: () => Promise<void>;
  fetchMarketPrice: (coin: string) => Promise<void>;
  setSelectedCoin: (coin: string) => void;
}

export function TradingDashboard({
  config,
  isRunning,
  isLoading,
  accountInfo,
  pnlData,
  coinPrices,
  startMarketMaker,
  stopMarketMaker,
  fetchMarketPrice,
  setSelectedCoin,
}: TradingDashboardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading Dashboard</CardTitle>
        <CardDescription>
          Control your market maker and monitor performance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium mb-4">Market Maker Control</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Status</h4>
                  <p className={isRunning ? "text-green-500" : "text-red-500"}>
                    {isRunning ? "Running" : "Stopped"}
                  </p>
                </div>
                <div>
                  {isRunning ? (
                    <Button
                      variant="destructive"
                      onClick={stopMarketMaker}
                      disabled={isLoading}
                    >
                      Stop Market Maker
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      onClick={startMarketMaker}
                      disabled={isLoading}
                    >
                      Start Market Maker
                    </Button>
                  )}
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Trading Pairs</h4>
                <div className="flex flex-wrap gap-2">
                  {config.tradingPairs.map(pair => (
                    <div
                      key={pair}
                      className="px-3 py-1 bg-primary text-primary-foreground rounded-full"
                    >
                      {pair}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Trading Settings</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Leverage:</div>
                  <div className="font-medium">{config.leverage}x</div>
                  <div>Risk Percentage:</div>
                  <div className="font-medium">{config.riskPercentage}%</div>
                  <div>Order Levels:</div>
                  <div className="font-medium">{config.orderLevels}</div>
                  <div>Automatic Pricing:</div>
                  <div className="font-medium">
                    {config.enableAutomaticPricing ? "Enabled" : "Disabled"}
                  </div>
                  <div>Automatic Sizing:</div>
                  <div className="font-medium">
                    {config.enableAutomaticSizing ? "Enabled" : "Disabled"}
                  </div>
                  <div>Market Indicators:</div>
                  <div className="font-medium">
                    {config.useMarketIndicators ? "Enabled" : "Disabled"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-4">Market Overview</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {config.tradingPairs.map(pair => {
                  const pairPrice = coinPrices.get(pair);
                  return (
                    <div key={pair} className="p-4 border rounded-lg">
                      <h4 className="font-medium">{pair}</h4>
                      <div className="mt-2 text-2xl font-bold">
                        {pairPrice
                          ? `$${pairPrice.toFixed(2)}`
                          : "Click refresh to load price"}
                      </div>
                      <div className="mt-2 text-sm">
                        <button
                          className="text-primary underline"
                          onClick={() => {
                            setSelectedCoin(pair);
                            fetchMarketPrice(pair);
                          }}
                        >
                          Refresh
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Account Summary</h4>
                {accountInfo ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Account Value:</div>
                    <div className="font-medium">
                      $
                      {accountInfo.crossMarginSummary?.accountValue
                        ? parseFloat(
                            accountInfo.crossMarginSummary.accountValue
                          ).toFixed(2)
                        : "0.00"}
                    </div>
                    <div>Free Collateral:</div>
                    <div className="font-medium">
                      $
                      {accountInfo.crossMarginSummary?.freeCollateral
                        ? parseFloat(
                            accountInfo.crossMarginSummary.freeCollateral
                          ).toFixed(2)
                        : "0.00"}
                    </div>
                    <div>Unrealized PnL:</div>
                    <div
                      className={`font-medium ${
                        pnlData.totalUnrealizedPnl >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      ${pnlData.totalUnrealizedPnl.toFixed(2)}
                    </div>
                    <div>Realized PnL:</div>
                    <div
                      className={`font-medium ${
                        pnlData.totalRealizedPnl >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      ${pnlData.totalRealizedPnl.toFixed(2)}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No account data available
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
