import { Candle, AnalysisResult } from "./technicalAnalysis";
import {
  calculateRSI,
  calculateBollingerBands,
  calculateMACD,
  calculateSMAs,
  calculateEMAs,
  calculateMomentum,
  analyzePriceAction,
} from "./technicalAnalysis";

/**
 * Enhanced market analysis for automatic price and size determination
 */

export interface MarketCondition {
  sentiment: "bullish" | "bearish" | "neutral";
  volatility: number; // 0-1 scale
  momentum: number; // -100 to 100 scale
  volumeProfile: {
    highVolumeLevels: { price: number; volume: number }[];
    vwap: number;
  };
  technicalSignals: {
    rsi: {
      value: number | null;
      signal: "overbought" | "oversold" | "neutral";
    };
    macd: {
      histogram: number | null;
      signal: "bullish" | "bearish" | "neutral";
    };
    bollingerBands: {
      width: number | null; // Width as percentage of price
      position: "upper" | "lower" | "middle" | "unknown";
    };
    ema: {
      crossover: "golden" | "death" | "none";
      trend: "up" | "down" | "sideways";
    };
  };
  supportResistance: {
    supports: number[];
    resistances: number[];
    nearestSupport: number | null;
    nearestResistance: number | null;
  };
}

/**
 * Calculate volatility from price history
 * @param prices Array of prices
 * @param window Window size for volatility calculation
 * @returns Volatility as a decimal (0-1 scale)
 */
export function calculateVolatility(
  prices: number[],
  window: number = 20
): number {
  if (prices.length < window + 1) {
    return 0.5; // Default to medium volatility if not enough data
  }

  // Calculate returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  // Calculate standard deviation of returns
  const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
  const squaredDiffs = returns.map(val => Math.pow(val - mean, 2));
  const variance =
    squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
  const stdDev = Math.sqrt(variance);

  // Annualize and normalize to 0-1 scale
  const annualizedVolatility = stdDev * Math.sqrt(365 * 24); // Assuming hourly data

  // Cap at 1.0 and ensure minimum of 0.1
  return Math.min(1.0, Math.max(0.1, annualizedVolatility * 10));
}

/**
 * Detect EMA crossovers from historical data
 * @param shortEMA Array of short-term EMA values
 * @param longEMA Array of long-term EMA values
 * @returns Crossover type and trend direction
 */
export function detectEMACrossover(
  shortEMA: number[],
  longEMA: number[]
): {
  crossover: "golden" | "death" | "none";
  trend: "up" | "down" | "sideways";
} {
  if (shortEMA.length < 2 || longEMA.length < 2) {
    return { crossover: "none", trend: "sideways" };
  }

  // Check for crossovers
  const prevShort = shortEMA[shortEMA.length - 2];
  const currShort = shortEMA[shortEMA.length - 1];
  const prevLong = longEMA[longEMA.length - 2];
  const currLong = longEMA[longEMA.length - 1];

  let crossover: "golden" | "death" | "none" = "none";

  // Golden cross: short EMA crosses above long EMA
  if (prevShort < prevLong && currShort > currLong) {
    crossover = "golden";
  }
  // Death cross: short EMA crosses below long EMA
  else if (prevShort > prevLong && currShort < currLong) {
    crossover = "death";
  }

  // Determine trend direction
  let trend: "up" | "down" | "sideways" = "sideways";

  // Check if both EMAs are trending in the same direction
  const shortTrend = currShort > prevShort ? "up" : "down";
  const longTrend = currLong > prevLong ? "up" : "down";

  if (shortTrend === longTrend) {
    trend = shortTrend;
  } else {
    // If they're moving in opposite directions, check the strength
    const shortChange = Math.abs((currShort - prevShort) / prevShort);
    const longChange = Math.abs((currLong - prevLong) / prevLong);

    if (shortChange > longChange * 2) {
      trend = shortTrend; // Short-term trend is stronger
    } else if (longChange > shortChange * 2) {
      trend = longTrend; // Long-term trend is stronger
    }
  }

  return { crossover, trend };
}

/**
 * Identify support and resistance levels from price history
 * @param candles Array of candles
 * @param levels Number of levels to identify
 * @returns Support and resistance levels
 */
export function identifySupportResistance(
  candles: Candle[],
  levels: number = 3
): { supports: number[]; resistances: number[] } {
  if (candles.length < 30) {
    return { supports: [], resistances: [] };
  }

  // Extract highs and lows
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);

  // Find local maxima and minima
  const localMaxima: number[] = [];
  const localMinima: number[] = [];

  // Window size for local extrema detection
  const window = Math.min(5, Math.floor(candles.length / 10));

  for (let i = window; i < candles.length - window; i++) {
    // Check if this is a local maximum
    let isMax = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && highs[j] > highs[i]) {
        isMax = false;
        break;
      }
    }
    if (isMax) {
      localMaxima.push(highs[i]);
    }

    // Check if this is a local minimum
    let isMin = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && lows[j] < lows[i]) {
        isMin = false;
        break;
      }
    }
    if (isMin) {
      localMinima.push(lows[i]);
    }
  }

  // Cluster similar levels
  const clusterThreshold = 0.005; // 0.5% threshold for clustering

  const clusteredMaxima = clusterLevels(localMaxima, clusterThreshold);
  const clusteredMinima = clusterLevels(localMinima, clusterThreshold);

  // Sort by strength (frequency)
  clusteredMaxima.sort((a, b) => b.strength - a.strength);
  clusteredMinima.sort((a, b) => b.strength - a.strength);

  // Take top levels
  const resistances = clusteredMaxima
    .slice(0, levels)
    .map(level => level.price);
  const supports = clusteredMinima.slice(0, levels).map(level => level.price);

  return { supports, resistances };
}

/**
 * Cluster similar price levels
 * @param levels Array of price levels
 * @param threshold Threshold for clustering (as percentage)
 * @returns Clustered levels with strength
 */
function clusterLevels(
  levels: number[],
  threshold: number
): Array<{ price: number; strength: number }> {
  if (levels.length === 0) {
    return [];
  }

  // Sort levels
  levels.sort((a, b) => a - b);

  // Initialize clusters
  const clusters: Array<{ sum: number; count: number; levels: number[] }> = [];

  // Cluster similar levels
  for (const level of levels) {
    let foundCluster = false;

    for (const cluster of clusters) {
      const clusterAvg = cluster.sum / cluster.count;

      // Check if level is within threshold of cluster average
      if (Math.abs(level - clusterAvg) / clusterAvg < threshold) {
        cluster.sum += level;
        cluster.count += 1;
        cluster.levels.push(level);
        foundCluster = true;
        break;
      }
    }

    // If no suitable cluster found, create a new one
    if (!foundCluster) {
      clusters.push({
        sum: level,
        count: 1,
        levels: [level],
      });
    }
  }

  // Convert clusters to result format
  return clusters.map(cluster => ({
    price: cluster.sum / cluster.count,
    strength: cluster.count,
  }));
}

/**
 * Determine position in Bollinger Bands
 * @param price Current price
 * @param bands Bollinger Bands values
 * @returns Position in bands
 */
export function getBollingerPosition(
  price: number,
  bands: { upper: number | null; middle: number | null; lower: number | null }
): "upper" | "lower" | "middle" | "unknown" {
  if (bands.upper === null || bands.middle === null || bands.lower === null) {
    return "unknown";
  }

  if (price >= bands.upper) {
    return "upper";
  } else if (price <= bands.lower) {
    return "lower";
  } else {
    // Calculate relative position within the bands
    const totalRange = bands.upper - bands.lower;
    const positionFromLower = price - bands.lower;
    const relativePosition = positionFromLower / totalRange;

    // If close to middle (40-60% of range), consider it middle
    if (relativePosition >= 0.4 && relativePosition <= 0.6) {
      return "middle";
    } else if (relativePosition < 0.4) {
      return "lower";
    } else {
      return "upper";
    }
  }
}

/**
 * Calculate Bollinger Band width as percentage of price
 * @param bands Bollinger Bands values
 * @param price Current price
 * @returns Band width as percentage
 */
export function calculateBandWidth(
  bands: { upper: number | null; middle: number | null; lower: number | null },
  price: number
): number | null {
  if (bands.upper === null || bands.lower === null || price === 0) {
    return null;
  }

  const bandWidth = bands.upper - bands.lower;
  return (bandWidth / price) * 100;
}

/**
 * Analyze market conditions for a given coin
 * @param candles Array of candles
 * @param currentPrice Current market price
 * @param emaHistory Historical EMA values
 * @returns Market condition analysis
 */
export function analyzeMarketConditions(
  candles: Candle[],
  currentPrice: number,
  emaHistory: { short: number[]; medium: number[]; long: number[] } = {
    short: [],
    medium: [],
    long: [],
  }
): MarketCondition {
  // Extract prices from candles
  const prices = candles.map(c => c.c);

  // Calculate technical indicators
  const rsi = calculateRSI(prices);
  const bollingerBands = calculateBollingerBands(prices);
  const macd = calculateMACD(prices);
  const momentum = calculateMomentum(prices);
  const priceAction = analyzePriceAction(candles);

  // Calculate volatility
  const volatility = calculateVolatility(prices);

  // Identify support and resistance levels
  const { supports, resistances } = identifySupportResistance(candles);

  // Find nearest support and resistance
  let nearestSupport = null;
  let nearestResistance = null;

  if (supports.length > 0) {
    // Find supports below current price
    const validSupports = supports.filter(s => s < currentPrice);
    if (validSupports.length > 0) {
      nearestSupport = Math.max(...validSupports);
    }
  }

  if (resistances.length > 0) {
    // Find resistances above current price
    const validResistances = resistances.filter(r => r > currentPrice);
    if (validResistances.length > 0) {
      nearestResistance = Math.min(...validResistances);
    }
  }

  // Determine RSI signal
  let rsiSignal: "overbought" | "oversold" | "neutral" = "neutral";
  if (rsi !== null) {
    if (rsi > 70) rsiSignal = "overbought";
    else if (rsi < 30) rsiSignal = "oversold";
  }

  // Determine MACD signal
  let macdSignal: "bullish" | "bearish" | "neutral" = "neutral";
  if (macd.histogram !== null && macd.macd !== null && macd.signal !== null) {
    if (macd.histogram > 0 && macd.macd > macd.signal) macdSignal = "bullish";
    else if (macd.histogram < 0 && macd.macd < macd.signal)
      macdSignal = "bearish";
  }

  // Calculate Bollinger Band width and position
  const bandWidth = calculateBandWidth(bollingerBands, currentPrice);
  const bandPosition = getBollingerPosition(currentPrice, bollingerBands);

  // Detect EMA crossover
  const emaCrossover = detectEMACrossover(emaHistory.short, emaHistory.medium);

  // Determine overall market sentiment
  let bullishSignals = 0;
  let bearishSignals = 0;

  // RSI signals
  if (rsiSignal === "oversold") bullishSignals += 1;
  if (rsiSignal === "overbought") bearishSignals += 1;

  // MACD signals
  if (macdSignal === "bullish") bullishSignals += 1;
  if (macdSignal === "bearish") bearishSignals += 1;

  // Bollinger Band signals
  if (bandPosition === "lower") bullishSignals += 1;
  if (bandPosition === "upper") bearishSignals += 1;

  // EMA crossover signals
  if (emaCrossover.crossover === "golden") bullishSignals += 2;
  if (emaCrossover.crossover === "death") bearishSignals += 2;
  if (emaCrossover.trend === "up") bullishSignals += 1;
  if (emaCrossover.trend === "down") bearishSignals += 1;

  // Price action signals
  if (priceAction.isBreakout) bullishSignals += 2;
  if (priceAction.isBreakdown) bearishSignals += 2;

  // Momentum signals
  if (momentum !== null) {
    if (momentum > 2) bullishSignals += 1;
    if (momentum < -2) bearishSignals += 1;
  }

  // Determine overall sentiment
  let sentiment: "bullish" | "bearish" | "neutral";
  if (bullishSignals > bearishSignals + 2) {
    sentiment = "bullish";
  } else if (bearishSignals > bullishSignals + 2) {
    sentiment = "bearish";
  } else {
    sentiment = "neutral";
  }

  // Return comprehensive market condition analysis
  return {
    sentiment,
    volatility,
    momentum: momentum !== null ? momentum : 0,
    volumeProfile: {
      highVolumeLevels: [], // This would need to be calculated separately
      vwap: 0, // This would need to be calculated separately
    },
    technicalSignals: {
      rsi: {
        value: rsi,
        signal: rsiSignal,
      },
      macd: {
        histogram: macd.histogram,
        signal: macdSignal,
      },
      bollingerBands: {
        width: bandWidth,
        position: bandPosition,
      },
      ema: emaCrossover,
    },
    supportResistance: {
      supports,
      resistances,
      nearestSupport,
      nearestResistance,
    },
  };
}

/**
 * Determine optimal price levels for orders based on market conditions
 * @param midPrice Current mid price
 * @param marketCondition Market condition analysis
 * @param baseSpread Base spread percentage
 * @param orderLevels Number of order levels
 * @param orderSpacing Spacing between order levels
 * @returns Optimal buy and sell price levels
 */
export function determineOptimalPriceLevels(
  midPrice: number,
  marketCondition: MarketCondition,
  baseSpread: number,
  orderLevels: number,
  orderSpacing: number
): { buyPrices: number[]; sellPrices: number[] } {
  // Validate inputs
  if (!midPrice || midPrice <= 0) {
    console.error(`Invalid midPrice: ${midPrice}`);
    // Return safe default values
    return {
      buyPrices: Array(orderLevels)
        .fill(0)
        .map((_, i) => midPrice * 0.99 * (1 - i * 0.005)),
      sellPrices: Array(orderLevels)
        .fill(0)
        .map((_, i) => midPrice * 1.01 * (1 + i * 0.005)),
    };
  }

  // Cap the base spread to reasonable values (0.1% to 5%)
  const safeBaseSpread = Math.min(Math.max(baseSpread, 0.001), 0.05);

  // Cap volatility to reasonable values (0 to 1)
  const safeVolatility = Math.min(Math.max(marketCondition.volatility, 0), 1);

  // Adjust spread based on volatility
  const volatilityAdjustedSpread = safeBaseSpread * (1 + safeVolatility);

  // Adjust spread based on sentiment
  let sentimentMultiplier = 1.0;
  if (marketCondition.sentiment === "bullish") {
    sentimentMultiplier = 0.9; // Tighter spread in bullish market
  } else if (marketCondition.sentiment === "bearish") {
    sentimentMultiplier = 1.1; // Wider spread in bearish market
  }

  const adjustedSpread = volatilityAdjustedSpread * sentimentMultiplier;

  // Cap the final spread to reasonable values (0.1% to 10%)
  const safeSpread = Math.min(Math.max(adjustedSpread, 0.001), 0.1);

  // Initialize price arrays
  const buyPrices: number[] = [];
  const sellPrices: number[] = [];

  // Cap the order spacing to reasonable values (0.1% to 2%)
  const safeOrderSpacing = Math.min(Math.max(orderSpacing, 0.001), 0.02);

  // Generate base price levels
  for (let i = 0; i < orderLevels; i++) {
    // Increase spread for each level, but cap the maximum level spread
    const levelSpread = Math.min(safeSpread * (1 + i * safeOrderSpacing), 0.2);

    // Calculate base prices
    const buyPrice = midPrice * (1 - levelSpread);
    const sellPrice = midPrice * (1 + levelSpread);

    buyPrices.push(buyPrice);
    sellPrices.push(sellPrice);
  }

  // Adjust prices based on support and resistance levels
  if (marketCondition.supportResistance.nearestSupport !== null) {
    // Adjust buy prices to cluster near support levels
    for (let i = 0; i < buyPrices.length; i++) {
      const support = marketCondition.supportResistance.nearestSupport;
      const distanceToSupport = Math.abs(buyPrices[i] - support) / support;

      // If price is close to support, adjust it towards support
      if (distanceToSupport < 0.03) {
        // Weight between original price and support level
        buyPrices[i] = buyPrices[i] * 0.7 + support * 0.3;
      }
    }
  }

  if (marketCondition.supportResistance.nearestResistance !== null) {
    // Adjust sell prices to cluster near resistance levels
    for (let i = 0; i < sellPrices.length; i++) {
      const resistance = marketCondition.supportResistance.nearestResistance;
      const distanceToResistance =
        Math.abs(sellPrices[i] - resistance) / resistance;

      // If price is close to resistance, adjust it towards resistance
      if (distanceToResistance < 0.03) {
        // Weight between original price and resistance level
        sellPrices[i] = sellPrices[i] * 0.7 + resistance * 0.3;
      }
    }
  }

  // Ensure minimum price difference between levels
  for (let i = 1; i < buyPrices.length; i++) {
    if (buyPrices[i] > buyPrices[i - 1] * 0.997) {
      buyPrices[i] = buyPrices[i - 1] * 0.997;
    }
  }

  for (let i = 1; i < sellPrices.length; i++) {
    if (sellPrices[i] < sellPrices[i - 1] * 1.003) {
      sellPrices[i] = sellPrices[i - 1] * 1.003;
    }
  }

  // Final validation to ensure all prices are positive and within reasonable range
  for (let i = 0; i < buyPrices.length; i++) {
    // Ensure buy price is positive and not too far from mid price
    if (buyPrices[i] <= 0 || (midPrice - buyPrices[i]) / midPrice > 0.5) {
      buyPrices[i] = midPrice * 0.95;
    }
  }

  for (let i = 0; i < sellPrices.length; i++) {
    // Ensure sell price is positive and not too far from mid price
    if (sellPrices[i] <= 0 || (sellPrices[i] - midPrice) / midPrice > 0.5) {
      sellPrices[i] = midPrice * 1.05;
    }
  }

  return { buyPrices, sellPrices };
}

/**
 * Determine optimal order sizes based on market conditions
 * @param baseSize Base order size
 * @param marketCondition Market condition analysis
 * @param orderLevels Number of order levels
 * @param maxPositionSize Maximum position size as percentage of account
 * @returns Optimal order sizes for each level
 */
export function determineOptimalOrderSizes(
  baseSize: number,
  marketCondition: MarketCondition,
  orderLevels: number,
  maxPositionSize: number
): { buySizes: number[]; sellSizes: number[] } {
  // Validate inputs
  if (!baseSize || baseSize <= 0) {
    console.error(`Invalid baseSize: ${baseSize}`);
    // Return safe default values
    return {
      buySizes: Array(orderLevels).fill(0.01),
      sellSizes: Array(orderLevels).fill(0.01),
    };
  }

  // Ensure maxPositionSize is positive
  const safeMaxPositionSize = Math.max(maxPositionSize, baseSize * orderLevels);

  // Initialize size arrays
  const buySizes: number[] = [];
  const sellSizes: number[] = [];

  // Adjust base size based on volatility (capped between 0.5 and 1)
  const safeVolatility = Math.min(Math.max(marketCondition.volatility, 0), 1);
  const volatilityMultiplier = Math.max(0.5, 1 - safeVolatility);
  let adjustedBaseSize = baseSize * volatilityMultiplier;

  // Ensure adjusted base size is at least 0.01
  adjustedBaseSize = Math.max(adjustedBaseSize, 0.01);

  // Adjust sizes based on sentiment
  let buyMultiplier = 1.0;
  let sellMultiplier = 1.0;

  if (marketCondition.sentiment === "bullish") {
    buyMultiplier = 1.2; // Increase buy sizes in bullish market
    sellMultiplier = 0.8; // Decrease sell sizes in bullish market
  } else if (marketCondition.sentiment === "bearish") {
    buyMultiplier = 0.8; // Decrease buy sizes in bearish market
    sellMultiplier = 1.2; // Increase sell sizes in bearish market
  }

  // Generate sizes for each level
  for (let i = 0; i < orderLevels; i++) {
    // Decrease size as we move away from mid price (but not below 0.5)
    const levelMultiplier = Math.max(0.5, 1 - i * 0.1);

    // Calculate sizes
    let buySize = adjustedBaseSize * levelMultiplier * buyMultiplier;
    let sellSize = adjustedBaseSize * levelMultiplier * sellMultiplier;

    // Ensure minimum size of 0.01
    buySize = Math.max(buySize, 0.01);
    sellSize = Math.max(sellSize, 0.01);

    buySizes.push(buySize);
    sellSizes.push(sellSize);
  }

  // Ensure total position size doesn't exceed maximum
  const totalBuySize = buySizes.reduce((sum, size) => sum + size, 0);
  const totalSellSize = sellSizes.reduce((sum, size) => sum + size, 0);

  // If total size exceeds maximum, scale down proportionally
  if (totalBuySize > safeMaxPositionSize) {
    const scaleFactor = safeMaxPositionSize / totalBuySize;
    for (let i = 0; i < buySizes.length; i++) {
      buySizes[i] *= scaleFactor;
      // Ensure minimum size after scaling
      buySizes[i] = Math.max(buySizes[i], 0.01);
    }
  }

  if (totalSellSize > safeMaxPositionSize) {
    const scaleFactor = safeMaxPositionSize / totalSellSize;
    for (let i = 0; i < sellSizes.length; i++) {
      sellSizes[i] *= scaleFactor;
      // Ensure minimum size after scaling
      sellSizes[i] = Math.max(sellSizes[i], 0.01);
    }
  }

  return { buySizes, sellSizes };
}
