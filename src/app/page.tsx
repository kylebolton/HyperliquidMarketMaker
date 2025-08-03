"use client";

import { MarketMaker } from "@/components/MarketMaker";
import { defaultConfig } from "./config";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8">
      <MarketMaker config={defaultConfig} />
    </main>
  );
}
