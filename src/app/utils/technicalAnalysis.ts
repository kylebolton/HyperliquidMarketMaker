import { RSI, BollingerBands, MACD, SMA, EMA } from "trading-signals";

export interface Candle {
  t: number; // open time
  T: number; // close time
  s: string; // symbol
  i: string; // interval
  o: number; // open price
  c: number; // close price
  h: number; // high price
  l: number; // low price
  v: number; // volume
  n: number; // number of trades
}

export interface AnalysisResult {
  rsi: number | null;
  bollingerBands: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
  };
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
  };
  sma: {
    short: number | null;
    medium: number | null;
    long: number | null;
  };
  ema: {
    veryShort: number | null;
    short: number | null;
  };
  momentum: number | null;
  priceAction: {
    recentHigh: number | null;
    recentLow: number | null;
    isBreakout: boolean;
    isBreakdown: boolean;
  };
}

// Convert candles to prices for technical indicators
export function candlesToPrices(candles: Candle[]): number[] {
  return candles.map(candle => candle.c);
}

// Calculate RSI (Relative Strength Index)
export function calculateRSI(
  prices: number[],
  period: number = 14
): number | null {
  try {
    const rsi = new RSI(period);
    prices.forEach(price => rsi.update(price));
    return rsi.isStable ? Number(rsi.getResult()?.toFixed(2)) : null;
  } catch (error) {
    console.error("Error calculating RSI:", error);
    return null;
  }
}

// Calculate Bollinger Bands
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number | null; middle: number | null; lower: number | null } {
  try {
    const bb = new BollingerBands(period, stdDev);
    prices.forEach(price => bb.update(price));

    if (bb.isStable) {
      const result = bb.getResult();
      if (result) {
        return {
          upper: Number(result.upper.toFixed(2)),
          middle: Number(result.middle.toFixed(2)),
          lower: Number(result.lower.toFixed(2)),
        };
      }
    }

    return { upper: null, middle: null, lower: null };
  } catch (error) {
    console.error("Error calculating Bollinger Bands:", error);
    return { upper: null, middle: null, lower: null };
  }
}

// Calculate MACD (Moving Average Convergence Divergence)
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number | null; signal: number | null; histogram: number | null } {
  try {
    const macd = new MACD({
      indicator: EMA,
      longInterval: slowPeriod,
      shortInterval: fastPeriod,
      signalInterval: signalPeriod,
    });

    prices.forEach(price => macd.update(price));

    if (macd.isStable) {
      const result = macd.getResult();
      if (result) {
        return {
          macd: Number(result.macd.toFixed(2)),
          signal: Number(result.signal.toFixed(2)),
          histogram: Number(result.histogram.toFixed(2)),
        };
      }
    }

    return { macd: null, signal: null, histogram: null };
  } catch (error) {
    console.error("Error calculating MACD:", error);
    return { macd: null, signal: null, histogram: null };
  }
}

// Calculate Simple Moving Averages
export function calculateSMAs(
  prices: number[],
  shortPeriod: number = 10,
  mediumPeriod: number = 50,
  longPeriod: number = 200
): { short: number | null; medium: number | null; long: number | null } {
  try {
    const shortSMA = new SMA(shortPeriod);
    const mediumSMA = new SMA(mediumPeriod);
    const longSMA = new SMA(longPeriod);

    prices.forEach(price => {
      shortSMA.update(price);
      mediumSMA.update(price);
      longSMA.update(price);
    });

    return {
      short: shortSMA.isStable
        ? Number(shortSMA.getResult()?.toFixed(2))
        : null,
      medium: mediumSMA.isStable
        ? Number(mediumSMA.getResult()?.toFixed(2))
        : null,
      long: longSMA.isStable ? Number(longSMA.getResult()?.toFixed(2)) : null,
    };
  } catch (error) {
    console.error("Error calculating SMAs:", error);
    return { short: null, medium: null, long: null };
  }
}

// Calculate EMAs (Exponential Moving Averages) for short timeframes
export function calculateEMAs(
  prices: number[],
  veryShortPeriod: number = 5,
  shortPeriod: number = 9
): { veryShort: number | null; short: number | null } {
  try {
    const veryShortEma = new EMA(veryShortPeriod);
    const shortEma = new EMA(shortPeriod);

    prices.forEach(price => {
      veryShortEma.update(price);
      shortEma.update(price);
    });

    return {
      veryShort: veryShortEma.isStable
        ? Number(veryShortEma.getResult().toString())
        : null,
      short: shortEma.isStable ? Number(shortEma.getResult().toString()) : null,
    };
  } catch (error) {
    console.error("Error calculating EMAs:", error);
    return { veryShort: null, short: null };
  }
}

// Calculate price momentum (rate of change)
export function calculateMomentum(
  prices: number[],
  period: number = 10
): number | null {
  try {
    if (prices.length < period + 1) {
      return null;
    }

    const currentPrice = prices[prices.length - 1];
    const previousPrice = prices[prices.length - period - 1];

    // Calculate momentum as percentage change
    const momentum = ((currentPrice - previousPrice) / previousPrice) * 100;

    return Number(momentum.toString());
  } catch (error) {
    console.error("Error calculating momentum:", error);
    return null;
  }
}

// Analyze recent price action for breakouts/breakdowns
export function analyzePriceAction(
  candles: Candle[],
  lookbackPeriod: number = 14
): {
  recentHigh: number | null;
  recentLow: number | null;
  isBreakout: boolean;
  isBreakdown: boolean;
} {
  try {
    if (candles.length < lookbackPeriod + 1) {
      return {
        recentHigh: null,
        recentLow: null,
        isBreakout: false,
        isBreakdown: false,
      };
    }

    // Get recent candles for analysis
    const recentCandles = candles.slice(-lookbackPeriod - 1);
    const currentCandle = recentCandles[recentCandles.length - 1];
    const priorCandles = recentCandles.slice(0, recentCandles.length - 1);

    // Find recent high and low
    const recentHigh = Math.max(...priorCandles.map(c => c.h));
    const recentLow = Math.min(...priorCandles.map(c => c.l));

    // Detect breakouts and breakdowns
    const isBreakout = currentCandle.c > recentHigh;
    const isBreakdown = currentCandle.c < recentLow;

    return {
      recentHigh: Number(recentHigh.toString()),
      recentLow: Number(recentLow.toString()),
      isBreakout,
      isBreakdown,
    };
  } catch (error) {
    console.error("Error analyzing price action:", error);
    return {
      recentHigh: null,
      recentLow: null,
      isBreakout: false,
      isBreakdown: false,
    };
  }
}

// Perform complete technical analysis on candles
export function analyzeCandles(candles: Candle[]): AnalysisResult {
  const prices = candlesToPrices(candles);

  return {
    rsi: calculateRSI(prices),
    bollingerBands: calculateBollingerBands(prices),
    macd: calculateMACD(prices),
    sma: calculateSMAs(prices),
    ema: calculateEMAs(prices),
    momentum: calculateMomentum(prices),
    priceAction: analyzePriceAction(candles),
  };
}

// Detect candlestick patterns
export function detectCandlestickPatterns(candles: Candle[]): string[] {
  if (candles.length < 3) {
    return [];
  }

  const patterns: string[] = [];
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const beforePrevious = candles[candles.length - 3];

  // Calculate candle properties
  const bodySize = Math.abs(current.o - current.c);
  const candleRange = current.h - current.l;
  const lowerShadow = Math.min(current.o, current.c) - current.l;
  const upperShadow = current.h - Math.max(current.o, current.c);

  // Improved Doji pattern detection
  // A doji has a very small body compared to its total range
  const dojiBodyThreshold = 0.05; // Body is less than 5% of the total range
  if (candleRange > 0 && bodySize / candleRange < dojiBodyThreshold) {
    // Different types of dojis
    if (upperShadow > 2 * bodySize && lowerShadow > 2 * bodySize) {
      patterns.push("Long-Legged Doji"); // Long shadows on both sides
    } else if (upperShadow > 3 * bodySize && lowerShadow < bodySize) {
      patterns.push("Gravestone Doji"); // Long upper shadow
    } else if (lowerShadow > 3 * bodySize && upperShadow < bodySize) {
      patterns.push("Dragonfly Doji"); // Long lower shadow
    } else {
      patterns.push("Doji"); // Standard doji
    }
  }

  // Hammer pattern (small body, long lower shadow, little or no upper shadow)
  if (
    bodySize < candleRange * 0.3 &&
    lowerShadow > bodySize * 2 &&
    upperShadow < bodySize * 0.5
  ) {
    patterns.push("Hammer");
  }

  // Bullish Engulfing pattern
  if (
    previous.c < previous.o && // Previous candle is bearish
    current.c > current.o && // Current candle is bullish
    current.o < previous.c && // Current open is lower than previous close
    current.c > previous.o
  ) {
    // Current close is higher than previous open
    patterns.push("Bullish Engulfing");
  }

  // Bearish Engulfing pattern
  if (
    previous.c > previous.o && // Previous candle is bullish
    current.c < current.o && // Current candle is bearish
    current.o > previous.c && // Current open is higher than previous close
    current.c < previous.o
  ) {
    // Current close is lower than previous open
    patterns.push("Bearish Engulfing");
  }

  // Morning Star pattern (3-candle bullish reversal pattern)
  if (
    beforePrevious.c < beforePrevious.o && // First candle is bearish
    Math.abs(previous.o - previous.c) / previous.o < 0.01 && // Second candle has small body
    current.c > current.o && // Third candle is bullish
    current.c > (beforePrevious.o + beforePrevious.c) / 2
  ) {
    // Third candle closes above midpoint of first candle
    patterns.push("Morning Star");
  }

  // Evening Star pattern (3-candle bearish reversal pattern)
  if (
    beforePrevious.c > beforePrevious.o && // First candle is bullish
    Math.abs(previous.o - previous.c) / previous.o < 0.01 && // Second candle has small body
    current.c < current.o && // Third candle is bearish
    current.c < (beforePrevious.o + beforePrevious.c) / 2
  ) {
    // Third candle closes below midpoint of first candle
    patterns.push("Evening Star");
  }

  return patterns;
}

// Generate trading signals based on technical analysis
export function generateSignals(
  analysis: AnalysisResult,
  patterns: string[]
): {
  signal: "buy" | "sell" | "neutral";
  confidence: number; // 0-100
  reasons: string[];
} {
  const reasons: string[] = [];
  let buySignals = 0;
  let sellSignals = 0;
  let totalSignals = 0;

  // RSI signals
  if (analysis.rsi !== null) {
    if (analysis.rsi < 30) {
      buySignals++;
      reasons.push(`RSI is oversold (${analysis.rsi})`);
    } else if (analysis.rsi > 70) {
      sellSignals++;
      reasons.push(`RSI is overbought (${analysis.rsi})`);
    }
    totalSignals++;
  }

  // Bollinger Bands signals
  if (
    analysis.bollingerBands.upper !== null &&
    analysis.bollingerBands.lower !== null &&
    analysis.bollingerBands.middle !== null
  ) {
    // Price near lower band is a buy signal
    if (
      analysis.sma.short !== null &&
      analysis.sma.short < analysis.bollingerBands.lower * 1.01
    ) {
      buySignals++;
      reasons.push("Price near lower Bollinger Band");
    }
    // Price near upper band is a sell signal
    else if (
      analysis.sma.short !== null &&
      analysis.sma.short > analysis.bollingerBands.upper * 0.99
    ) {
      sellSignals++;
      reasons.push("Price near upper Bollinger Band");
    }
    totalSignals++;
  }

  // MACD signals
  if (analysis.macd.macd !== null && analysis.macd.signal !== null) {
    // MACD crossing above signal line is a buy signal
    if (
      analysis.macd.macd > analysis.macd.signal &&
      analysis.macd.histogram !== null &&
      analysis.macd.histogram > 0
    ) {
      buySignals++;
      reasons.push("MACD crossed above signal line");
    }
    // MACD crossing below signal line is a sell signal
    else if (
      analysis.macd.macd < analysis.macd.signal &&
      analysis.macd.histogram !== null &&
      analysis.macd.histogram < 0
    ) {
      sellSignals++;
      reasons.push("MACD crossed below signal line");
    }
    totalSignals++;
  }

  // SMA signals
  if (analysis.sma.short !== null && analysis.sma.medium !== null) {
    // Short SMA crossing above medium SMA is a buy signal
    if (analysis.sma.short > analysis.sma.medium) {
      buySignals++;
      reasons.push("Short-term SMA above medium-term SMA");
    }
    // Short SMA crossing below medium SMA is a sell signal
    else if (analysis.sma.short < analysis.sma.medium) {
      sellSignals++;
      reasons.push("Short-term SMA below medium-term SMA");
    }
    totalSignals++;
  }

  // NEW: EMA signals for short-term trends
  if (analysis.ema.veryShort !== null && analysis.ema.short !== null) {
    // Very short EMA crossing above short EMA is a buy signal (short-term uptrend)
    if (analysis.ema.veryShort > analysis.ema.short) {
      buySignals += 1.5; // Give more weight to short-term signals
      reasons.push("Very short-term EMA above short-term EMA (uptrend)");
    }
    // Very short EMA crossing below short EMA is a sell signal (short-term downtrend)
    else if (analysis.ema.veryShort < analysis.ema.short) {
      sellSignals += 1.5; // Give more weight to short-term signals
      reasons.push("Very short-term EMA below short-term EMA (downtrend)");
    }
    totalSignals += 1.5;
  }

  // NEW: Momentum signals
  if (analysis.momentum !== null) {
    // Strong positive momentum is a buy signal
    if (analysis.momentum > 2.0) {
      buySignals += 1.2;
      reasons.push(`Strong positive momentum (${analysis.momentum}%)`);
    }
    // Strong negative momentum is a sell signal
    else if (analysis.momentum < -2.0) {
      sellSignals += 1.2;
      reasons.push(`Strong negative momentum (${analysis.momentum}%)`);
    }
    totalSignals += 1.2;
  }

  // NEW: Price action breakout/breakdown signals
  if (analysis.priceAction.isBreakout) {
    buySignals += 2; // Strong buy signal on breakout
    reasons.push("Price breakout above recent high");
    totalSignals += 2;
  } else if (analysis.priceAction.isBreakdown) {
    sellSignals += 2; // Strong sell signal on breakdown
    reasons.push("Price breakdown below recent low");
    totalSignals += 2;
  }

  // Candlestick pattern signals
  for (const pattern of patterns) {
    // Bullish patterns
    if (["Hammer", "Bullish Engulfing", "Morning Star"].includes(pattern)) {
      buySignals++;
      reasons.push(`Bullish pattern: ${pattern}`);
      totalSignals++;
    }
    // Bearish patterns
    else if (["Bearish Engulfing", "Evening Star"].includes(pattern)) {
      sellSignals++;
      reasons.push(`Bearish pattern: ${pattern}`);
      totalSignals++;
    }
    // Doji patterns - indicate indecision but can be bullish or bearish depending on context
    else if (pattern === "Doji") {
      // Standard doji is neutral but slightly favors reversal
      reasons.push("Doji pattern: market indecision");
      totalSignals++;
      // No signal adjustment for standard doji
    } else if (pattern === "Long-Legged Doji") {
      // Long-legged doji shows high volatility and indecision
      reasons.push("Long-Legged Doji: high volatility and indecision");
      totalSignals++;
      // No signal adjustment for long-legged doji
    } else if (pattern === "Dragonfly Doji") {
      // Dragonfly doji is typically bullish, especially at support
      buySignals += 0.7;
      reasons.push("Dragonfly Doji: potential bullish reversal");
      totalSignals++;
    } else if (pattern === "Gravestone Doji") {
      // Gravestone doji is typically bearish, especially at resistance
      sellSignals += 0.7;
      reasons.push("Gravestone Doji: potential bearish reversal");
      totalSignals++;
    }
  }

  // Calculate confidence (0-100)
  const confidence =
    totalSignals > 0
      ? Math.round((Math.max(buySignals, sellSignals) / totalSignals) * 100)
      : 0;

  // Determine overall signal
  let signal: "buy" | "sell" | "neutral" = "neutral";
  if (buySignals > sellSignals) {
    signal = "buy";
  } else if (sellSignals > buySignals) {
    signal = "sell";
  }

  return { signal, confidence, reasons };
}

// Analyze volume profile to identify high-volume price levels
export function analyzeVolumeProfile(
  candles: Candle[],
  numLevels: number = 10
): {
  highVolumeLevels: { price: number; volume: number }[];
  volumeWeightedAvgPrice: number;
} {
  if (candles.length === 0) {
    return { highVolumeLevels: [], volumeWeightedAvgPrice: 0 };
  }

  // Create price buckets
  const minPrice = Math.min(...candles.map(c => c.l));
  const maxPrice = Math.max(...candles.map(c => c.h));
  const priceRange = maxPrice - minPrice;
  const bucketSize = priceRange / 50; // Divide price range into 50 buckets

  // Initialize buckets
  const volumeBuckets: { price: number; volume: number }[] = [];
  for (let i = 0; i < 50; i++) {
    const bucketPrice = minPrice + (i + 0.5) * bucketSize;
    volumeBuckets.push({ price: bucketPrice, volume: 0 });
  }

  // Fill buckets with volume data
  let totalVolume = 0;
  let volumeWeightedSum = 0;

  candles.forEach(candle => {
    // Calculate which buckets this candle spans
    const lowBucket = Math.max(
      0,
      Math.floor((candle.l - minPrice) / bucketSize)
    );
    const highBucket = Math.min(
      49,
      Math.floor((candle.h - minPrice) / bucketSize)
    );

    // Distribute volume across the buckets
    if (lowBucket === highBucket) {
      // Candle fits in a single bucket
      volumeBuckets[lowBucket].volume += candle.v;
    } else {
      // Distribute volume proportionally across multiple buckets
      const bucketsSpanned = highBucket - lowBucket + 1;
      const volumePerBucket = candle.v / bucketsSpanned;

      for (let i = lowBucket; i <= highBucket; i++) {
        volumeBuckets[i].volume += volumePerBucket;
      }
    }

    // Calculate VWAP components
    totalVolume += candle.v;
    volumeWeightedSum +=
      ((candle.o + candle.h + candle.l + candle.c) / 4) * candle.v;
  });

  // Sort buckets by volume
  volumeBuckets.sort((a, b) => b.volume - a.volume);

  // Calculate VWAP
  const vwap = totalVolume > 0 ? volumeWeightedSum / totalVolume : 0;

  // Return top N volume levels
  return {
    highVolumeLevels: volumeBuckets.slice(0, numLevels),
    volumeWeightedAvgPrice: vwap,
  };
}
