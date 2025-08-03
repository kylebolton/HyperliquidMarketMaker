# Hyperliquid Market Maker

A professional market making application for the Hyperliquid exchange, built with Next.js and browser wallet integration.

## Features

- **Automated Market Making**: Set up automated market making strategies with customizable parameters
- **Browser Wallet Integration**: Connect with MetaMask or Coinbase Wallet - no API keys required
- **Real-time Market Data**: View real-time market data including order books and trades
- **Position Management**: Monitor and manage your open positions and orders
- **Technical Analysis**: Integrated technical analysis tools to inform your trading decisions

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MetaMask or Coinbase Wallet browser extension
- A Hyperliquid account

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hyperliquid-market-maker.git
   cd hyperliquid-market-maker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Connecting to Hyperliquid

### Wallet Connection

1. **Install a Browser Wallet**: Make sure you have MetaMask or Coinbase Wallet installed in your browser
2. **Connect to Arbitrum**: Ensure your wallet is connected to the Arbitrum network (Chain ID: 42161)
3. **Connect Wallet**: Click "Connect MetaMask" or "Connect Coinbase Wallet" in the application
4. **Approve Connection**: Approve the connection request in your wallet

### Trading Setup

1. Navigate to the "Configuration" tab
2. Your wallet address will be automatically filled when connected
3. Configure your trading parameters:
   - Trading pairs (BTC, ETH, etc.)
   - Trading amount and spread percentages
   - Order levels and update intervals
   - Risk management settings

### Start Trading

1. Click "Start Market Maker" to begin automated trading
2. Monitor your positions and orders in real-time
3. Click "Stop Market Maker" to halt trading

## Fee Structure

This application includes a 2 basis point (0.02%) fee on each trade to support development and maintenance. This fee is automatically calculated and reported with each transaction.

## Built With

- [Next.js](https://nextjs.org/) - React framework
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
- [Hyperliquid SDK](https://www.npmjs.com/package/@nktkas/hyperliquid) - Exchange SDK
- Browser wallet integration for secure trading

## License

This project is licensed under the MIT License.