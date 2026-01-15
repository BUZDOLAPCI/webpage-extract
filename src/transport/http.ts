import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "../types.js";

/**
 * Simple HTTP transport for MCP server
 * Implements a basic JSON-RPC over HTTP interface
 */
export async function startHttpTransport(
  server: Server,
  config: Config
): Promise<void> {
  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      // Enable CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check endpoint
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "webpage-extract" }));
        return;
      }

      // Only accept POST requests to root
      if (req.method !== "POST" || (req.url !== "/" && req.url !== "/mcp")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      // Parse request body
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        const request = JSON.parse(body);

        // Process the JSON-RPC request through the MCP server
        // Note: This is a simplified implementation
        // The MCP SDK typically handles transport internally

        res.writeHead(200, { "Content-Type": "application/json" });

        // For now, return method not supported as MCP SDK handles its own transport
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message:
                "HTTP transport requires SSE or WebSocket. Use STDIO transport for direct communication.",
            },
          })
        );
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error",
            },
          })
        );
      }
    }
  );

  return new Promise((resolve) => {
    httpServer.listen(config.port, () => {
      console.error(`MCP server listening on http://localhost:${config.port}`);
      console.error("Endpoints:");
      console.error("  GET  /health - Health check");
      console.error("  POST /mcp    - MCP JSON-RPC endpoint");
      console.error("");
      console.error("Note: For full MCP functionality, use STDIO transport with:");
      console.error("  npm run dev:stdio");
      resolve();
    });
  });
}
