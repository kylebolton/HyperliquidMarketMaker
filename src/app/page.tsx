"use client";

import { MarketMaker } from "@/components/MarketMaker";
import { defaultConfig } from "./config";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-8">Hyperliquid Market Maker</h1>
      <MarketMaker config={defaultConfig} hyperliquidService={undefined} />
    </main>
  );
}
