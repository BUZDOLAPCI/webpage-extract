/**
 * HTTP transport for webpage-extract MCP server
 * Uses raw Node.js HTTP with StreamableHTTPServerTransport
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { createStandaloneServer } from "../server.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/** Session storage for streamable HTTP connections */
const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; server: Server }
>();

interface HttpTransportOptions {
  port: number;
}

/**
 * Starts the HTTP transport server
 * @param options - Server options with port
 */
export function startHttpTransport(options: HttpTransportOptions): void {
  const httpServer = createServer();

  httpServer.on("request", async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    switch (url.pathname) {
      case "/mcp":
        await handleMcpRequest(req, res);
        break;
      case "/health":
        handleHealthCheck(res);
        break;
      default:
        handleNotFound(res);
    }
  });

  const host = "localhost";

  httpServer.listen(options.port, host, () => {
    logServerStart(options.port);
  });
}

/**
 * Handles MCP protocol requests
 * @param req - HTTP request
 * @param res - HTTP response
 */
async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      res.statusCode = 404;
      res.end("Session not found");
      return;
    }
    return await session.transport.handleRequest(req, res);
  }

  if (req.method === "POST") {
    await createNewSession(req, res);
    return;
  }

  res.statusCode = 400;
  res.end("Invalid request");
}

/**
 * Creates a new MCP session for HTTP transport
 * @param req - HTTP request
 * @param res - HTTP response
 */
async function createNewSession(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const serverInstance = createStandaloneServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { transport, server: serverInstance });
      console.error("New webpage-extract session created:", sessionId);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
      console.error("webpage-extract session closed:", transport.sessionId);
    }
  };

  try {
    await serverInstance.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Streamable HTTP connection error:", error);
    res.statusCode = 500;
    res.end("Internal server error");
  }
}

/**
 * Handles health check endpoint
 * @param res - HTTP response
 */
function handleHealthCheck(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "webpage-extract",
      version: "1.0.0",
    })
  );
}

/**
 * Handles 404 Not Found responses
 * @param res - HTTP response
 */
function handleNotFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

/**
 * Logs server startup information
 * @param port - Server port
 */
function logServerStart(port: number): void {
  console.error(`webpage-extract MCP Server listening on http://localhost:${port}`);
  console.error("Put this in your client config:");
  console.error(
    JSON.stringify(
      {
        mcpServers: {
          "webpage-extract": {
            url: `http://localhost:${port}/mcp`,
          },
        },
      },
      null,
      2
    )
  );
}
