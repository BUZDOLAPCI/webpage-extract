#!/usr/bin/env node

import { createServer } from "./server.js";
import { parseArgs } from "./cli.js";
import { loadConfig } from "./config.js";
import { startStdioTransport, startHttpTransport } from "./transport/index.js";

/**
 * Main entry point for the webpage-extract MCP server
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const cliOptions = parseArgs(process.argv.slice(2));

  // Load configuration (CLI args override env vars)
  const config = {
    ...loadConfig(),
    transport: cliOptions.transport,
    port: cliOptions.port,
  };

  // Create the MCP server
  const server = createServer();

  // Start the appropriate transport
  if (config.transport === "http") {
    startHttpTransport(config);
  } else {
    await startStdioTransport(server);
  }
}

// Run the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Export for programmatic use
export { createServer, createStandaloneServer } from "./server.js";
export { loadConfig } from "./config.js";
export * from "./types.js";
export * from "./tools/index.js";
