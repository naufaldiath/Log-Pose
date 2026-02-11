import { describe, it, expect } from 'vitest';

/**
 * Basic tests for analytics logger module
 * Note: Since analyticsLogger is a singleton that reads env vars at import time,
 * we can only test the module interface, not the actual logging behavior
 * without complex mocking or test environment setup.
 */
describe('Analytics Logger', () => {
  it('should export analytics logger module', async () => {
    const { analyticsLogger } = await import('./analytics-logger.js');
    expect(analyticsLogger).toBeDefined();
    expect(typeof analyticsLogger.log).toBe('function');
    expect(typeof analyticsLogger.queryEvents).toBe('function');
    expect(typeof analyticsLogger.getSummary).toBe('function');
    expect(typeof analyticsLogger.getTimeSeries).toBe('function');
    expect(typeof analyticsLogger.getFeatureAdoption).toBe('function');
    expect(typeof analyticsLogger.getPerformanceMetrics).toBe('function');
    expect(typeof analyticsLogger.close).toBe('function');
  });

  it('should have helper methods for common events', async () => {
    const { analyticsLogger } = await import('./analytics-logger.js');
    expect(typeof analyticsLogger.logApiRequest).toBe('function');
    expect(typeof analyticsLogger.logApiError).toBe('function');
    expect(typeof analyticsLogger.logFileOpened).toBe('function');
    expect(typeof analyticsLogger.logFileSaved).toBe('function');
    expect(typeof analyticsLogger.logSearchPerformed).toBe('function');
    expect(typeof analyticsLogger.logTerminalConnected).toBe('function');
    expect(typeof analyticsLogger.logTerminalDisconnected).toBe('function');
    expect(typeof analyticsLogger.logTaskCompleted).toBe('function');
  });
});
