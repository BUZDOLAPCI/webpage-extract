#!/usr/bin/env node

import { startHttpTransport } from "./transport/http.js";

/**
 * Main entry point for the webpage-extract MCP server
 * Always starts HTTP transport on port 8080
 */
startHttpTransport({ port: 8080 });

// Export for programmatic use
export { createServer, createStandaloneServer } from "./server.js";
export * from "./types.js";
export * from "./tools/index.js";
