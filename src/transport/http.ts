/**
 * HTTP transport for webpage-extract MCP server
 * Uses stateless JSON-RPC handling without sessions
 */

import { createServer, IncomingMessage, ServerResponse, Server } from "node:http";
import {
  fetchUrl,
  extractReadableMarkdown,
  extractTables,
  extractMetadata,
} from "../tools/index.js";
import type {
  FetchUrlInput,
  ExtractMarkdownInput,
  ExtractTablesInput,
  ExtractMetadataInput,
} from "../types.js";

/**
 * MCP JSON-RPC request
 */
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response
 */
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface HttpTransportOptions {
  port: number;
}

/**
 * Tool definitions for the MCP server
 */
const toolDefinitions = [
  {
    name: "fetch_url",
    description:
      "Fetch raw HTML from a URL with optional custom headers and timeout. Returns the HTML content, status code, content type, and final URL (after redirects).",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch (must be http:// or https://)",
        },
        headers: {
          type: "object",
          description: "Optional custom headers to include in the request",
          additionalProperties: { type: "string" },
        },
        timeout_ms: {
          type: "number",
          description: "Request timeout in milliseconds (default: 30000)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "extract_readable_markdown",
    description:
      "Convert HTML to readable Markdown, removing boilerplate, navigation, ads, and sidebars. Focuses on the main content. Returns markdown text, document headings, and word count.",
    inputSchema: {
      type: "object" as const,
      properties: {
        html_or_url: {
          type: "string",
          description:
            "Either a URL to fetch (http:// or https://) or raw HTML content",
        },
      },
      required: ["html_or_url"],
    },
  },
  {
    name: "extract_tables",
    description:
      "Extract all data tables from HTML as structured JSON. Returns an array of tables with headers and rows. Layout tables are filtered out.",
    inputSchema: {
      type: "object" as const,
      properties: {
        html_or_url: {
          type: "string",
          description:
            "Either a URL to fetch (http:// or https://) or raw HTML content",
        },
      },
      required: ["html_or_url"],
    },
  },
  {
    name: "extract_metadata",
    description:
      "Extract metadata from HTML including: canonical URL, title, description, Open Graph tags, JSON-LD structured data (best-effort), author, and publish date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        html_or_url: {
          type: "string",
          description:
            "Either a URL to fetch (http:// or https://) or raw HTML content",
        },
      },
      required: ["html_or_url"],
    },
  },
];

/**
 * Handle a single JSON-RPC request
 */
async function handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "webpage-extract",
              version: "1.0.0",
            },
          },
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: toolDefinitions,
          },
        };
      }

      case "tools/call": {
        const toolName = params?.name as string;
        const args = params?.arguments as Record<string, unknown>;

        let result: unknown;

        switch (toolName) {
          case "fetch_url": {
            result = await fetchUrl(args as unknown as FetchUrlInput);
            break;
          }

          case "extract_readable_markdown": {
            result = await extractReadableMarkdown(args as unknown as ExtractMarkdownInput);
            break;
          }

          case "extract_tables": {
            result = await extractTables(args as unknown as ExtractTablesInput);
            break;
          }

          case "extract_metadata": {
            result = await extractMetadata(args as unknown as ExtractMetadataInput);
            break;
          }

          default:
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`,
              },
            };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: `Internal error: ${message}`,
      },
    };
  }
}

/**
 * Read the request body as a string
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Send a JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(res: ServerResponse): void {
  sendJson(res, 200, {
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "webpage-extract",
    version: "1.0.0",
  });
}

/**
 * Handle not found
 */
function handleNotFound(res: ServerResponse): void {
  sendJson(res, 404, { error: "Not found" });
}

/**
 * Handle method not allowed
 */
function handleMethodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, { error: "Method not allowed" });
}

/**
 * Handle MCP JSON-RPC endpoint
 */
async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const request: JsonRpcRequest = JSON.parse(body);

    if (!request.jsonrpc || request.jsonrpc !== "2.0") {
      sendJson(res, 400, {
        jsonrpc: "2.0",
        id: request.id || 0,
        error: {
          code: -32600,
          message: "Invalid Request: missing or invalid jsonrpc version",
        },
      });
      return;
    }

    const response = await handleJsonRpcRequest(request);
    sendJson(res, 200, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 500, {
      ok: false,
      error: message,
    });
  }
}

/**
 * Create and configure the HTTP server
 */
export function createHttpServer(): Server {
  const httpServer = createServer();

  httpServer.on("request", async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host || "localhost"}`);
    const method = req.method?.toUpperCase();

    try {
      switch (url.pathname) {
        case "/mcp":
          if (method === "POST") {
            await handleMcpRequest(req, res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        case "/health":
          if (method === "GET") {
            handleHealthCheck(res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        default:
          handleNotFound(res);
      }
    } catch (error) {
      console.error("Server error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      sendJson(res, 500, { ok: false, error: message });
    }
  });

  return httpServer;
}

/**
 * Starts the HTTP transport server
 * @param options - Server options with port
 */
export function startHttpTransport(options: HttpTransportOptions): Server {
  const httpServer = createHttpServer();
  const host = "localhost";

  httpServer.listen(options.port, host, () => {
    console.error(`webpage-extract MCP Server listening on http://${host}:${options.port}`);
    console.error(`MCP endpoint: http://${host}:${options.port}/mcp`);
    console.error(`Health check: http://${host}:${options.port}/health`);
  });

  return httpServer;
}
