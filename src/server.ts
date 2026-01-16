import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  fetchUrl,
  extractReadableMarkdown,
  extractTables,
  extractMetadata,
} from "./tools/index.js";
import type {
  FetchUrlInput,
  ExtractMarkdownInput,
  ExtractTablesInput,
  ExtractMetadataInput,
} from "./types.js";

/**
 * Tool definitions for the MCP server
 */
const TOOLS = [
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
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: "webpage-extract",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case "fetch_url":
          result = await fetchUrl(args as unknown as FetchUrlInput);
          break;

        case "extract_readable_markdown":
          result = await extractReadableMarkdown(args as unknown as ExtractMarkdownInput);
          break;

        case "extract_tables":
          result = await extractTables(args as unknown as ExtractTablesInput);
          break;

        case "extract_metadata":
          result = await extractMetadata(args as unknown as ExtractMetadataInput);
          break;

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: {
                    code: "INVALID_INPUT",
                    message: `Unknown tool: ${name}`,
                  },
                  meta: {
                    retrieved_at: new Date().toISOString(),
                  },
                }),
              },
            ],
          };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: {
                code: "INTERNAL_ERROR",
                message: errorMessage,
              },
              meta: {
                retrieved_at: new Date().toISOString(),
              },
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Factory function for creating standalone server instances
 * Used by HTTP transport for session-based connections
 * @returns Configured MCP server instance
 */
export function createStandaloneServer(): Server {
  const server = new Server(
    {
      name: "webpage-extract",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case "fetch_url":
          result = await fetchUrl(args as unknown as FetchUrlInput);
          break;

        case "extract_readable_markdown":
          result = await extractReadableMarkdown(args as unknown as ExtractMarkdownInput);
          break;

        case "extract_tables":
          result = await extractTables(args as unknown as ExtractTablesInput);
          break;

        case "extract_metadata":
          result = await extractMetadata(args as unknown as ExtractMetadataInput);
          break;

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: {
                    code: "INVALID_INPUT",
                    message: `Unknown tool: ${name}`,
                  },
                  meta: {
                    retrieved_at: new Date().toISOString(),
                  },
                }),
              },
            ],
          };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: {
                code: "INTERNAL_ERROR",
                message: errorMessage,
              },
              meta: {
                retrieved_at: new Date().toISOString(),
              },
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
