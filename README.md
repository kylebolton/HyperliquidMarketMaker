# Hyperliquid Market Maker

A professional market making application for the Hyperliquid exchange, built with Next.js and shadcn UI components.

## Features

- **Automated Market Making**: Set up automated market making strategies with customizable parameters
- **Manual Market Making**: Place multiple bids and asks at different price levels
- **Real-time Market Data**: View real-time market data including order books, trades, and price charts
- **Position Management**: Monitor and manage your open positions and orders
- **Technical Analysis**: Integrated technical analysis tools to inform your trading decisions
- **Error Handling**: Sophisticated error handling to differentiate between legitimate problems and normal order rejections

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Hyperliquid account with API keys

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

3. Create a `.env` file in the root directory with your Hyperliquid API keys:

   ```
   NEXT_PUBLIC_API_KEY=your_api_key
   NEXT_PUBLIC_API_SECRET=your_api_secret
   NEXT_PUBLIC_WALLET_ADDRESS=your_wallet_address
   ```

4. Start the development server:

   ```
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Configuration

1. Navigate to the "Configuration" tab
2. Enter your API keys and wallet address
3. Configure your trading parameters including:
   - Trading pairs
   - Trading amount
   - Spread percentages
   - Order levels
   - Update intervals

### Automated Market Making

1. Configure your strategy parameters
2. Click "Start Market Maker" to begin automated trading
3. Monitor performance in real-time
4. Click "Stop Market Maker" to halt trading

### Manual Market Making

1. Navigate to the "Market Maker" tab
2. Select a coin and trading side (buy/sell)
3. Set your price range and number of orders
4. Click "Place Orders" to create multiple orders at once
5. Monitor and manage your orders in the "Active Orders" tab
6. View order history in the "Order History" tab

## Error Handling

The application distinguishes between different types of errors:

- **Critical Errors**: Serious issues that require immediate attention (network errors, authentication failures)
- **Warnings**: Non-critical issues that may affect functionality
- **Info**: Notifications about normal operations (like order rejections due to price constraints)

## Development

### Project Structure

- `/src/app`: Main application code
- `/src/components`: React components including the UI library
- `/src/lib`: Utility functions and helpers
- `/src/app/services`: Service layer for API interactions

### Built With

- [Next.js](https://nextjs.org/) - React framework
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
- [Hyperliquid API](https://hyperliquid.xyz/docs/api) - Exchange API

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Hyperliquid team for their excellent API documentation
- shadcn for the beautiful UI components
