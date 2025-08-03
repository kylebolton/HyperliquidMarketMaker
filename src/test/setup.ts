import '@testing-library/jest-dom';

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor() {}
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.WebSocket = MockWebSocket as any;

// Mock setTimeout
jest.useFakeTimers();

// Mock console methods
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};
