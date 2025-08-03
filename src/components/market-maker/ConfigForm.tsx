import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { Config } from "@/app/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletConnection, WalletConnectionState } from "@/components/wallet/WalletConnection";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { configFormSchema } from "./types";

interface ConfigFormProps {
  config: Config;
  availableCoins: string[];
  isLoading: boolean;
  onSubmit: (values: z.infer<typeof configFormSchema>, walletState?: WalletConnectionState) => Promise<void>;
}

export function ConfigForm({
  config,
  availableCoins,
  isLoading,
  onSubmit,
}: ConfigFormProps) {
  const [walletState, setWalletState] = useState<WalletConnectionState | null>(null);

  // Initialize config form
  const configForm = useForm<z.infer<typeof configFormSchema>>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      walletAddress: config.walletAddress || "",
      tradingAmount: config.tradingAmount,
      maxSpread: config.maxSpread,
      minSpread: config.minSpread,
      updateInterval: config.updateInterval,
      candleInterval: config.candleInterval,
      leverage: config.leverage,
      riskPercentage: config.riskPercentage,
      orderLevels: config.orderLevels,
      orderSpacing: config.orderSpacing,
      volumeBasedPricing: config.volumeBasedPricing,
      aggressiveness: config.aggressiveness,
      orderRefreshRate: config.orderRefreshRate,
      enableAutomaticPricing: config.enableAutomaticPricing,
      useMarketIndicators: config.useMarketIndicators,
      enableAutomaticSizing: config.enableAutomaticSizing,
      simultaneousPairs: config.simultaneousPairs,
      tradingPairs: config.tradingPairs,
    },
  });

  // Handle wallet connection
  const handleWalletConnect = (state: WalletConnectionState) => {
    setWalletState(state);
    if (state.isConnected && state.address) {
      // Auto-fill wallet address when wallet is connected
      configForm.setValue("walletAddress", state.address);
    }
  };

  // Handle wallet disconnect
  const handleWalletDisconnect = () => {
    setWalletState(null);
    configForm.setValue("walletAddress", "");
  };

  // Handle form submission
  const handleSubmit = async (values: z.infer<typeof configFormSchema>) => {
    await onSubmit(values, walletState || undefined);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>Configure your market maker settings</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...configForm}>
          <form
            onSubmit={configForm.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {/* Wallet Connection Section */}
            <div className="space-y-4">
              <WalletConnection
                onWalletConnect={handleWalletConnect}
                onWalletDisconnect={handleWalletDisconnect}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <FormField
                control={configForm.control}
                name="tradingAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trading Amount (USD)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="maxSpread"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Spread (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.5"
                        step="0.1"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="minSpread"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Spread (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.1"
                        step="0.1"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="updateInterval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Update Interval (ms)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="candleInterval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Candle Interval</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select candle interval" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1m">1 minute</SelectItem>
                        <SelectItem value="5m">5 minutes</SelectItem>
                        <SelectItem value="15m">15 minutes</SelectItem>
                        <SelectItem value="1h">1 hour</SelectItem>
                        <SelectItem value="4h">4 hours</SelectItem>
                        <SelectItem value="1d">1 day</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="leverage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Leverage</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="riskPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Risk Percentage (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="1"
                        step="0.1"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="orderLevels"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Levels</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="orderSpacing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Spacing (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.05"
                        step="0.01"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="orderRefreshRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Refresh Rate (ms)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="aggressiveness"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aggressiveness (0-10)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="5"
                        min="0"
                        max="10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="volumeBasedPricing"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Volume-Based Pricing</FormLabel>
                      <FormDescription>
                        Adjust prices based on volume profile
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="mr-2"
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="enableAutomaticPricing"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Automatic Pricing</FormLabel>
                      <FormDescription>
                        Automatically determine optimal prices based on market
                        conditions
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="mr-2"
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="enableAutomaticSizing"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Automatic Sizing</FormLabel>
                      <FormDescription>
                        Automatically determine optimal order sizes based on
                        market conditions
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="mr-2"
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="useMarketIndicators"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Use Market Indicators</FormLabel>
                      <FormDescription>
                        Use technical indicators (RSI, EMA, etc.) for trading
                        decisions
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="mr-2"
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="simultaneousPairs"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Trade Multiple Pairs Simultaneously</FormLabel>
                      <FormDescription>
                        Enable trading multiple pairs at the same time
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="mr-2"
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="mt-4">
              <FormField
                control={configForm.control}
                name="tradingPairs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trading Pairs</FormLabel>
                    <FormDescription>
                      Select the trading pairs to use
                    </FormDescription>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {availableCoins.map(coin => (
                        <div
                          key={coin}
                          className={`px-3 py-1 rounded-full cursor-pointer ${
                            field.value.includes(coin)
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                          onClick={() => {
                            const newValue = field.value.includes(coin)
                              ? field.value.filter(c => c !== coin)
                              : [...field.value, coin];
                            field.onChange(newValue);
                          }}
                        >
                          {coin}
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button 
              type="submit" 
              disabled={isLoading || !walletState?.isConnected}
            >
              {isLoading ? "Saving..." : "Save Configuration"}
            </Button>
            
            {!walletState?.isConnected && (
              <p className="text-sm text-muted-foreground text-center">
                Please connect your wallet before saving the configuration
              </p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
