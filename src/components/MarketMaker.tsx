"use client";

import { MarketMaker as RefactoredMarketMaker } from "./market-maker/MarketMaker";
import { Config } from "@/app/config";
import { HyperliquidService } from "@/app/services/hyperliquid/compatibility";

interface MarketMakerProps {
  config: Config;
  hyperliquidService?: HyperliquidService;
}

export function MarketMaker(props: MarketMakerProps) {
  return <RefactoredMarketMaker {...props} />;
}
