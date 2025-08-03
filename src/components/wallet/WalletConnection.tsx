"use client";

import { useEffect, useMemo, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Wallet, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWalletState } from "@/hooks/useWalletState";

export type WalletProvider = "metamask" | "walletconnect" | "coinbase" | "privatekey";

export interface WalletConnectionState {
  isConnected: boolean;
  address: string | null;
  provider: WalletProvider | null;
  chainId: number | null;
}

interface WalletConnectionProps {
  onWalletConnect: (state: WalletConnectionState) => void;
  onWalletDisconnect: () => void;
  className?: string;
}

const WalletConnectionComponent = function WalletConnection({
  onWalletConnect,
  onWalletDisconnect,
  className = "",
}: WalletConnectionProps) {
  const {
    walletState,
    detection,
    isConnecting,
    error,
    isMounted,
    connectWallet,
    disconnectWallet,
    checkExistingConnections,
    copyAddress,
    openEtherscan,
  } = useWalletState({ onWalletConnect, onWalletDisconnect });

  // Check for existing connections when component mounts - memoized
  const shouldCheckConnections = isMounted && !detection.isDetecting;
  useEffect(() => {
    if (shouldCheckConnections) {
      checkExistingConnections();
    }
  }, [shouldCheckConnections, checkExistingConnections]);

  // Memoize provider name to prevent recalculation
  const getProviderName = useCallback((provider: WalletProvider | null) => {
    switch (provider) {
      case "metamask": return "MetaMask";
      case "coinbase": return "Coinbase Wallet";
      case "walletconnect": return "WalletConnect";
      case "privatekey": return "Private Key";
      default: return "Unknown";
    }
  }, []);

  // Memoize chain name to prevent recalculation
  const getChainName = useCallback((chainId: number | null) => {
    switch (chainId) {
      case 1: return "Ethereum Mainnet";
      case 42161: return "Arbitrum One";
      case 421614: return "Arbitrum Sepolia";
      default: return chainId ? `Chain ${chainId}` : "Unknown";
    }
  }, []);

  // Memoize computed values
  const providerName = useMemo(() => getProviderName(walletState.provider), [walletState.provider, getProviderName]);
  const chainName = useMemo(() => getChainName(walletState.chainId), [walletState.chainId, getChainName]);
  const isWrongNetwork = useMemo(() => walletState.chainId && walletState.chainId !== 42161, [walletState.chainId]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Wallet Connection
        </CardTitle>
        <CardDescription>
          Connect your wallet to Hyperliquid for trading. Choose from supported wallet providers below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <Badge variant={walletState.isConnected ? "default" : "secondary"}>
            {walletState.isConnected ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected to {providerName}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                Not Connected
              </>
            )}
          </Badge>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Wallet Connection Buttons */}
        {!walletState.isConnected ? (
          <div className="space-y-2">
            {!isMounted || detection.isDetecting ? (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground mt-2">Loading wallet options...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => connectWallet("metamask")}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4 mr-2" />
                  )}
                  {detection.hasMetaMask ? "Connect MetaMask" : "Install MetaMask"}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => connectWallet("coinbase")}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4 mr-2" />
                  )}
                  {detection.hasCoinbaseWallet ? "Connect Coinbase Wallet" : "Install Coinbase Wallet"}
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              Connect your wallet to start trading on Hyperliquid
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={disconnectWallet}
              className="w-full"
            >
              Disconnect Wallet
            </Button>
          </div>
        )}

        {/* Connected Wallet Information */}
        {walletState.isConnected && walletState.address && (
          <div className="space-y-2">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Connected Address</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {walletState.address}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {providerName}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {chainName}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyAddress(walletState.address!)}
                    title="Copy address"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEtherscan(walletState.address!)}
                    title="View on Etherscan"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {isWrongNetwork && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Hyperliquid operates on Arbitrum One (Chain ID: 42161). Please switch your wallet to the correct network for optimal performance.
                </AlertDescription>
              </Alert>
            )}

            {walletState.isConnected && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-800">
                    Wallet connected successfully! You can now configure and start trading.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Security Notice */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Security Notice</p>
              <p>
                Your private key is used locally to sign transactions and is never sent to our servers. 
                Keep your private key secure and never share it with anyone.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const WalletConnection = memo(WalletConnectionComponent);

// Type declarations for wallet providers
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
    };
  }
}