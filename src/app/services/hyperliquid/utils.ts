// Default size decimals for common coins
export const defaultSzDecimals: Record<string, number> = {
  BTC: 4, // BTC sizes have 4 decimal places (e.g., 0.0001 BTC)
  ETH: 2, // ETH sizes have 2 decimal places (e.g., 0.01 ETH)
  SOL: 1, // SOL sizes have 1 decimal place (e.g., 0.1 SOL)
  DOGE: 0, // DOGE sizes have 0 decimal places (e.g., 10 DOGE)
  AVAX: 1, // 0.1 AVAX
  ARB: 0, // 1 ARB
  OP: 0, // 1 OP
  LINK: 1, // 0.1 LINK
  MATIC: 0, // 1 MATIC
  DOT: 1, // 0.1 DOT
  UNI: 1, // 0.1 UNI
  AAVE: 1, // 0.1 AAVE
  ATOM: 1, // 0.1 ATOM
  LTC: 2, // 0.01 LTC
  XRP: 0, // 1 XRP
  // Add more coins as needed
};

// Common asset IDs for quick reference
export const commonAssetIds: Record<string, number> = {
  BTC: 0,
  ETH: 1,
  SOL: 2,
  AVAX: 3,
  ARB: 4,
  OP: 5,
  DOGE: 6,
  MATIC: 7,
  LINK: 8,
  DOT: 9,
  ADA: 10,
  ATOM: 11,
  UNI: 12,
  AAVE: 13,
  XRP: 14,
  LTC: 15,
  BCH: 16,
  ETC: 17,
  FIL: 18,
  NEAR: 19,
};

/**
 * Retry a function with exponential backoff
 * @param fn Function to execute
 * @param maxRetries Maximum number of retries
 * @param initialDelay Initial delay in ms
 * @param maxDelay Maximum delay in ms
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 2000,
  maxDelay: number = 20000,
  isRetryableError: (error: any) => boolean = () => true
): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      attempt++;
      console.log(`Attempt ${attempt}/${maxRetries + 1}`);
      return await fn();
    } catch (error: any) {
      console.error(`Attempt ${attempt} failed:`, error);

      // Check if we should retry based on the error
      if (!isRetryableError(error)) {
        console.log(`Error is not retryable, throwing immediately`);
        throw error;
      }

      // Check if we've reached the maximum number of retries
      if (attempt > maxRetries) {
        console.log(`Maximum retries (${maxRetries}) reached, throwing error`);
        throw error;
      }

      // For 422 errors, we might want to wait longer as it could be a temporary API issue
      if (
        error.status === 422 ||
        (error.response && error.response.status === 422)
      ) {
        console.warn(
          `Received 422 error, waiting longer before retry: ${
            error.message || JSON.stringify(error)
          }`
        );
        delay = Math.min(delay * 2, maxDelay); // Double the delay for 422 errors
      } else {
        // Calculate the next delay with exponential backoff
        delay = Math.min(delay * 1.5, maxDelay);
      }

      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Validate API secret format
export function validateApiSecret(apiSecret: string): string {
  if (!apiSecret || apiSecret.trim() === "") {
    throw new Error("API secret cannot be empty");
  }

  // Remove 0x prefix if present
  let privateKey = apiSecret;
  if (privateKey.startsWith("0x")) {
    privateKey = privateKey.slice(2);
  }

  // Ensure the key is 64 characters (32 bytes)
  if (privateKey.length !== 64) {
    throw new Error(
      "API secret must be a 32-byte hex string (64 characters without 0x prefix)"
    );
  }

  // Validate that it contains only hex characters
  if (!/^[0-9a-fA-F]+$/.test(privateKey)) {
    throw new Error("API secret must contain only hexadecimal characters");
  }

  return privateKey;
}

// Convert time interval string to seconds
export function getIntervalInSeconds(interval: string): number {
  const intervalMap: Record<string, number> = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
  };

  return intervalMap[interval] || 300; // Default to 5m if interval not found
}
