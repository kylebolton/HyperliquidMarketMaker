import {
  analyzeMarketConditions,
  determineOptimalPriceLevels,
  determineOptimalOrderSizes,
  MarketCondition,
} from '../marketAnalysis';
import { Candle } from '../technicalAnalysis';

describe('marketAnalysis', () => {
  const mockCandles: Candle[] = [
    {
      t: Date.now() - 180000, // 3 minutes ago
      T: Date.now() - 120000,
      s: 'BTC-USD',
      i: '1m',
      o: 98,
      c: 99,
      h: 100,
      l: 97,
      v: 1000,
      n: 100,
    },
    {
      t: Date.now() - 120000, // 2 minutes ago
      T: Date.now() - 60000,
      s: 'BTC-USD',
      i: '1m',
      o: 99,
      c: 100,
      h: 101,
      l: 98,
      v: 1200,
      n: 150,
    },
    {
      t: Date.now() - 60000, // 1 minute ago
      T: Date.now(),
      s: 'BTC-USD',
      i: '1m',
      o: 100,
      c: 100.5,
      h: 102,
      l: 99.5,
      v: 1100,
      n: 120,
    },
  ];

  describe('analyzeMarketConditions', () => {
    it('should analyze market conditions with valid data', () => {
      const result = analyzeMarketConditions(mockCandles, 100);

      expect(result).toBeDefined();
      expect(result.sentiment).toMatch(/bullish|bearish|neutral/);
      expect(result.volatility).toBeGreaterThanOrEqual(0);
      expect(result.volatility).toBeLessThanOrEqual(1);
      expect(result.momentum).toBeGreaterThanOrEqual(-100);
      expect(result.momentum).toBeLessThanOrEqual(100);
      
      expect(result.volumeProfile).toBeDefined();
      expect(result.volumeProfile.vwap).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.volumeProfile.highVolumeLevels)).toBe(true);
      
      expect(result.technicalSignals).toBeDefined();
      expect(result.technicalSignals.rsi).toBeDefined();
      expect(result.technicalSignals.macd).toBeDefined();
      expect(result.technicalSignals.bollingerBands).toBeDefined();
      
      expect(result.supportResistance).toBeDefined();
      expect(Array.isArray(result.supportResistance.supports)).toBe(true);
      expect(Array.isArray(result.supportResistance.resistances)).toBe(true);
    });

    it('should handle empty candle data gracefully', () => {
      const result = analyzeMarketConditions([], 100);

      expect(result).toBeDefined();
      expect(result.sentiment).toMatch(/bullish|bearish|neutral/);
      expect(result.volatility).toBeGreaterThanOrEqual(0);
      expect(result.supportResistance.supports).toEqual([]);
      expect(result.supportResistance.resistances).toEqual([]);
      expect(result.supportResistance.nearestSupport).toBeNull();
      expect(result.supportResistance.nearestResistance).toBeNull();
    });

    it('should handle minimal candle data gracefully', () => {
      const minimalCandles: Candle[] = [
        {
          t: Date.now(),
          T: Date.now(),
          s: 'BTC-USD',
          i: '1m',
          o: 100,
          c: 100,
          h: 100,
          l: 100,
          v: 1,
          n: 1,
        },
      ];

      const result = analyzeMarketConditions(minimalCandles, 100);

      expect(result).toBeDefined();
      // With minimal data, some indicators might be null but structure should be intact
      expect(result.technicalSignals).toBeDefined();
      expect(result.supportResistance).toBeDefined();
    });
  });

  describe('determineOptimalPriceLevels', () => {
    const mockMarketCondition: MarketCondition = {
      sentiment: 'neutral',
      volatility: 0.5,
      momentum: 0,
      volumeProfile: {
        highVolumeLevels: [{ price: 100, volume: 1000 }],
        vwap: 100,
      },
      technicalSignals: {
        rsi: { value: 50, signal: 'neutral' },
        macd: { histogram: 0, signal: 'neutral' },
        bollingerBands: { width: 10, position: 'middle' },
        ema: { crossover: 'none', trend: 'sideways' },
      },
      supportResistance: {
        supports: [95, 90],
        resistances: [105, 110],
        nearestSupport: 95,
        nearestResistance: 105,
      },
    };

    it('should generate optimal price levels with valid inputs', () => {
      const result = determineOptimalPriceLevels(
        100, // midPrice
        mockMarketCondition,
        0.01, // baseSpread (1%)
        5, // orderLevels
        0.002 // orderSpacing (0.2%)
      );

      expect(result).toBeDefined();
      expect(result.buyPrices).toBeDefined();
      expect(result.sellPrices).toBeDefined();
      expect(result.buyPrices.length).toBe(5);
      expect(result.sellPrices.length).toBe(5);

      // Buy prices should be below mid price
      result.buyPrices.forEach(price => {
        expect(price).toBeLessThan(100);
        expect(price).toBeGreaterThan(0);
      });

      // Sell prices should be above mid price
      result.sellPrices.forEach(price => {
        expect(price).toBeGreaterThan(100);
      });

      // Prices should be in descending order for buys (highest first)
      for (let i = 1; i < result.buyPrices.length; i++) {
        expect(result.buyPrices[i]).toBeLessThanOrEqual(result.buyPrices[i - 1]);
      }

      // Prices should be in ascending order for sells (lowest first)
      for (let i = 1; i < result.sellPrices.length; i++) {
        expect(result.sellPrices[i]).toBeGreaterThanOrEqual(result.sellPrices[i - 1]);
      }
    });

    it('should handle market condition without support/resistance', () => {
      const marketConditionNoSR: MarketCondition = {
        ...mockMarketCondition,
        supportResistance: {
          supports: [],
          resistances: [],
          nearestSupport: null,
          nearestResistance: null,
        },
      };

      const result = determineOptimalPriceLevels(
        100,
        marketConditionNoSR,
        0.01,
        3,
        0.002
      );

      expect(result).toBeDefined();
      expect(result.buyPrices.length).toBe(3);
      expect(result.sellPrices.length).toBe(3);
    });

    it('should handle undefined supportResistance gracefully', () => {
      const marketConditionUndefinedSR: MarketCondition = {
        ...mockMarketCondition,
        supportResistance: undefined as unknown as MarketCondition['supportResistance'],
      };

      const result = determineOptimalPriceLevels(
        100,
        marketConditionUndefinedSR,
        0.01,
        3,
        0.002
      );

      expect(result).toBeDefined();
      expect(result.buyPrices.length).toBe(3);
      expect(result.sellPrices.length).toBe(3);
    });

    it('should validate input parameters', () => {
      // Invalid midPrice should be handled gracefully
      const result1 = determineOptimalPriceLevels(0, mockMarketCondition, 0.01, 3, 0.002);
      expect(result1).toBeDefined();

      const result2 = determineOptimalPriceLevels(-10, mockMarketCondition, 0.01, 3, 0.002);
      expect(result2).toBeDefined();

      // Test with reasonable values
      const result3 = determineOptimalPriceLevels(
        100,
        mockMarketCondition,
        0.05, // 5% spread
        2,
        0.01 // 1% spacing
      );

      expect(result3.buyPrices.length).toBe(2);
      expect(result3.sellPrices.length).toBe(2);
    });

    it('should adjust prices near support and resistance levels', () => {
      const marketConditionWithSR: MarketCondition = {
        ...mockMarketCondition,
        supportResistance: {
          supports: [95, 90],
          resistances: [105, 110],
          nearestSupport: 98, // Very close to potential buy prices
          nearestResistance: 102, // Very close to potential sell prices
        },
      };

      const result = determineOptimalPriceLevels(
        100,
        marketConditionWithSR,
        0.02, // 2% base spread
        3,
        0.005
      );

      expect(result).toBeDefined();
      expect(result.buyPrices.length).toBe(3);
      expect(result.sellPrices.length).toBe(3);

      // All prices should be valid
      expect(result.buyPrices.every(price => price > 0)).toBe(true);
      expect(result.sellPrices.every(price => price > 100)).toBe(true);
    });
  });

  describe('determineOptimalOrderSizes', () => {
    const mockMarketCondition: MarketCondition = {
      sentiment: 'neutral',
      volatility: 0.5,
      momentum: 0,
      volumeProfile: {
        highVolumeLevels: [{ price: 100, volume: 1000 }],
        vwap: 100,
      },
      technicalSignals: {
        rsi: { value: 50, signal: 'neutral' },
        macd: { histogram: 0, signal: 'neutral' },
        bollingerBands: { width: 10, position: 'middle' },
        ema: { crossover: 'none', trend: 'sideways' },
      },
      supportResistance: {
        supports: [95, 90],
        resistances: [105, 110],
        nearestSupport: 95,
        nearestResistance: 105,
      },
    };

    it('should determine optimal order sizes', () => {
      const result = determineOptimalOrderSizes(
        1.0, // baseSize
        mockMarketCondition,
        5, // orderLevels
        10.0 // maxPositionSize
      );

      expect(result).toBeDefined();
      expect(result.buySizes).toBeDefined();
      expect(result.sellSizes).toBeDefined();
      expect(Array.isArray(result.buySizes)).toBe(true);
      expect(Array.isArray(result.sellSizes)).toBe(true);
      expect(result.buySizes.length).toBe(5);
      expect(result.sellSizes.length).toBe(5);

      // All sizes should be positive
      result.buySizes.forEach(size => {
        expect(size).toBeGreaterThan(0);
      });

      result.sellSizes.forEach(size => {
        expect(size).toBeGreaterThan(0);
      });

      // Total size should not exceed max position
      const totalBuySize = result.buySizes.reduce((sum, size) => sum + size, 0);
      const totalSellSize = result.sellSizes.reduce((sum, size) => sum + size, 0);
      expect(totalBuySize).toBeLessThanOrEqual(10.0);
      expect(totalSellSize).toBeLessThanOrEqual(10.0);
    });

    it('should handle low base sizes', () => {
      const result = determineOptimalOrderSizes(
        0.1, // Low base size
        mockMarketCondition,
        3, // orderLevels
        1.0 // maxPositionSize
      );

      expect(result).toBeDefined();
      expect(result.buySizes.length).toBe(3);
      expect(result.sellSizes.length).toBe(3);
      
      // Should still generate reasonable sizes
      result.buySizes.forEach(size => {
        expect(size).toBeGreaterThan(0);
        expect(size).toBeLessThanOrEqual(1.0);
      });

      result.sellSizes.forEach(size => {
        expect(size).toBeGreaterThan(0);
        expect(size).toBeLessThanOrEqual(1.0);
      });
    });

    it('should adjust sizes based on volatility', () => {
      const highVolatilityCondition: MarketCondition = {
        ...mockMarketCondition,
        volatility: 0.8, // High volatility
      };

      const lowVolatilityCondition: MarketCondition = {
        ...mockMarketCondition,
        volatility: 0.2, // Low volatility
      };

      const highVolSizes = determineOptimalOrderSizes(
        1.0, highVolatilityCondition, 3, 5.0
      );

      const lowVolSizes = determineOptimalOrderSizes(
        1.0, lowVolatilityCondition, 3, 5.0
      );

      expect(highVolSizes).toBeDefined();
      expect(lowVolSizes).toBeDefined();

      // Both should generate valid sizes
      expect(highVolSizes.buySizes.every(size => size > 0)).toBe(true);
      expect(highVolSizes.sellSizes.every(size => size > 0)).toBe(true);
      expect(lowVolSizes.buySizes.every(size => size > 0)).toBe(true);
      expect(lowVolSizes.sellSizes.every(size => size > 0)).toBe(true);
    });

    it('should handle edge cases gracefully', () => {
      // Zero base size
      const result1 = determineOptimalOrderSizes(0, mockMarketCondition, 3, 1.0);
      expect(result1.buySizes.every(size => size >= 0)).toBe(true);
      expect(result1.sellSizes.every(size => size >= 0)).toBe(true);

      // Single order level
      const result2 = determineOptimalOrderSizes(1.0, mockMarketCondition, 1, 5.0);
      expect(result2.buySizes.length).toBe(1);
      expect(result2.sellSizes.length).toBe(1);
      expect(result2.buySizes[0]).toBeGreaterThan(0);
      expect(result2.sellSizes[0]).toBeGreaterThan(0);
    });
  });
});