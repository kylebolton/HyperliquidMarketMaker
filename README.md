# Hyperliquid Market Maker

A market-making application for the Hyperliquid decentralized exchange, built with Next.js and TypeScript.

## Features

- **Automated Market Making**: Place and manage buy and sell orders around the mid-price with configurable spreads.
- **Technical Analysis**: Utilizes candlestick patterns and indicators (RSI, Bollinger Bands, MACD, SMAs) to make informed trading decisions.
- **Real-time Data**: WebSocket connections for live market data updates.
- **Risk Management**: Configurable risk parameters to control exposure.
- **User-friendly Interface**: Easy-to-use dashboard to monitor and control the market maker.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Hyperliquid account with API credentials
- An on-chain wallet address

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/hyperliquid-market-maker.git
   cd hyperliquid-market-maker
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Run the development server:

   ```
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

The market maker can be configured through the UI with the following parameters:

- **API Key**: Your Hyperliquid API key
- **API Secret**: Your Hyperliquid API secret
- **Wallet Address**: Your on-chain wallet address
- **Trading Pairs**: Comma-separated list of assets to trade (e.g., "BTC, ETH")
- **Trading Amount**: Base amount in USD for each order
- **Leverage**: Trading leverage (1x recommended for beginners)
- **Min/Max Spread**: Minimum and maximum spread percentages
- **Update Interval**: How often to update orders (in seconds)
- **Risk Percentage**: Percentage of account balance to risk per trade
- **Candle Interval**: Timeframe for technical analysis

## How It Works

1. **Market Analysis**: The application fetches market data and performs technical analysis to determine optimal trading parameters.
2. **Dynamic Spreads**: Spreads are adjusted based on market volatility and technical indicators.
3. **Order Placement**: Buy and sell orders are placed around the mid-price with the calculated spread.
4. **Order Management**: Existing orders are regularly canceled and replaced to adapt to changing market conditions.

## Technical Architecture

- **Next.js Frontend**: React-based UI for configuration and monitoring
- **TypeScript**: Type-safe code for reliability
- **Hyperliquid SDK**: Integration with the Hyperliquid exchange API
- **Trading Signals**: Library for technical analysis calculations
- **WebSockets**: Real-time data updates

## Security Considerations

- API keys and secrets are stored locally and never sent to any server
- All trading operations happen directly between your browser and Hyperliquid
- Consider using a dedicated wallet with limited funds for market making

## Disclaimer

This software is provided for educational and informational purposes only. Trading cryptocurrency involves significant risk. Use this software at your own risk. The authors are not responsible for any financial losses incurred while using this application.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
