import { QueuedRequest } from "./types";
import { retryWithBackoff } from "./utils";

export class RateLimiter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requestQueue: Array<QueuedRequest<any>> = [];
  private isProcessingQueue = false;
  private rateLimitWindowMs = 10000; // 10 second window
  private maxRequestsPerWindow = 20; // Maximum requests per window
  private requestTimestamps: number[] = [];

  // Order queue properties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private orderQueue: Array<QueuedRequest<any>> = [];
  private isProcessingOrderQueue = false;
  private lastOrderTime = 0;
  private orderDelayMs = 250; // 250ms between orders

  constructor(
    maxRequestsPerWindow?: number,
    rateLimitWindowMs?: number,
    orderDelayMs?: number
  ) {
    if (maxRequestsPerWindow) this.maxRequestsPerWindow = maxRequestsPerWindow;
    if (rateLimitWindowMs) this.rateLimitWindowMs = rateLimitWindowMs;
    if (orderDelayMs) this.orderDelayMs = orderDelayMs;
  }

  /**
   * Enqueues a general API request with rate limiting
   */
  public async enqueueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({
        fn: requestFn,
        resolve,
        reject,
      });

      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Enqueues an order-related request with additional rate limiting
   */
  public async enqueueOrder<T>(orderFn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.orderQueue.push({
        fn: orderFn,
        resolve,
        reject,
      });

      if (!this.isProcessingOrderQueue) {
        this.processOrderQueue();
      }
    });
  }

  /**
   * Processes the general request queue with rate limiting
   */
  private async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    // Wait until we have capacity to make more requests
    const waitUntilCapacity = async () => {
      const now = Date.now();

      // Remove timestamps older than the rate limit window
      this.requestTimestamps = this.requestTimestamps.filter(
        timestamp => now - timestamp < this.rateLimitWindowMs
      );

      // If we're at or near the rate limit, wait before proceeding
      if (this.requestTimestamps.length >= this.maxRequestsPerWindow * 0.8) {
        // More conservative - 80% of limit

        // Calculate time to wait until we can make another request
        const oldestRequest = Math.min(...this.requestTimestamps);
        const timeToWait = this.rateLimitWindowMs - (now - oldestRequest) + 500; // Add 500ms buffer

        // Log the rate limit wait
        console.log(
          `Rate limit reached. Waiting ${timeToWait}ms before next request.`
        );

        await new Promise(resolve => setTimeout(resolve, timeToWait));
        return waitUntilCapacity(); // Recursively check again after waiting
      }

      return;
    };

    try {
      while (this.requestQueue.length > 0) {
        await waitUntilCapacity();

        const request = this.requestQueue.shift();
        if (!request) continue;

        try {
          // Record the timestamp of this request
          this.requestTimestamps.push(Date.now());

          // Execute the request with retry logic
          const result = await retryWithBackoff(request.fn);
          request.resolve(result);
        } catch (error) {
          console.error("Error executing queued request:", error);
          request.reject(error);
        }

        // Add a small delay between requests to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error("Error processing request queue:", error);
    } finally {
      this.isProcessingQueue = false;

      // If more requests were added while processing, start processing again
      if (this.requestQueue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Processes the order queue with stricter rate limiting
   */
  private async processOrderQueue() {
    if (this.isProcessingOrderQueue || this.orderQueue.length === 0) {
      return;
    }

    this.isProcessingOrderQueue = true;

    try {
      while (this.orderQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastOrder = now - this.lastOrderTime;

        // Ensure minimum delay between orders
        if (timeSinceLastOrder < this.orderDelayMs) {
          const waitTime = this.orderDelayMs - timeSinceLastOrder;
          console.log(`Waiting ${waitTime}ms before next order`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const request = this.orderQueue.shift();
        if (!request) continue;

        try {
          // Update last order time
          this.lastOrderTime = Date.now();

          // Execute the order with retry logic
          const result = await retryWithBackoff(request.fn, 2); // Only retry twice for orders
          request.resolve(result);
        } catch (error) {
          console.error("Error executing queued order:", error);
          request.reject(error);
        }
      }
    } catch (error) {
      console.error("Error processing order queue:", error);
    } finally {
      this.isProcessingOrderQueue = false;

      // If more orders were added while processing, start processing again
      if (this.orderQueue.length > 0) {
        this.processOrderQueue();
      }
    }
  }
}
