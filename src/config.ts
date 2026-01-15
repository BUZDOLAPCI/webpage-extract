import type { Config, TransportType } from "./types.js";

/**
 * Load configuration from environment variables with defaults
 */
export function loadConfig(): Config {
  const transport = (process.env.TRANSPORT || "http") as TransportType;
  const port = parseInt(process.env.PORT || "8000", 10);
  const defaultTimeoutMs = parseInt(
    process.env.DEFAULT_TIMEOUT_MS || "30000",
    10
  );
  const userAgent = process.env.USER_AGENT || "webpage-extract/1.0.0";

  return {
    transport,
    port,
    defaultTimeoutMs,
    userAgent,
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
  transport: "http",
  port: 8000,
  defaultTimeoutMs: 30000,
  userAgent: "webpage-extract/1.0.0",
};
