import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server as HttpServer } from "node:http";
import { createHttpServer } from "../../src/transport/http.js";

describe("HTTP Transport /mcp Endpoint (Stateless JSON-RPC)", () => {
  let httpServer: HttpServer;
  let testPort: number;

  beforeAll(async () => {
    httpServer = createHttpServer();

    // Use port 0 to get a random available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "localhost", () => {
        const address = httpServer.address();
        if (address && typeof address === "object") {
          testPort = address.port;
        }
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }, 30000);

  it("should respond to /health endpoint", async () => {
    const response = await fetch(`http://localhost:${testPort}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("healthy");
    expect(data.service).toBe("webpage-extract");
  });

  it("should reject non-POST requests to /mcp", async () => {
    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "GET",
    });
    expect(response.status).toBe(405);
  });

  it("should handle initialize JSON-RPC request", async () => {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0",
        },
      },
    };

    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe(1);
    expect(data.result).toBeDefined();
    expect(data.result.protocolVersion).toBe("2024-11-05");
    expect(data.result.serverInfo.name).toBe("webpage-extract");
    expect(data.result.capabilities).toBeDefined();
  });

  it("should handle tools/list JSON-RPC request", async () => {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    };

    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe(2);
    expect(data.result).toBeDefined();
    expect(data.result.tools).toBeDefined();
    expect(Array.isArray(data.result.tools)).toBe(true);

    const toolNames = data.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("fetch_url");
    expect(toolNames).toContain("extract_readable_markdown");
    expect(toolNames).toContain("extract_tables");
    expect(toolNames).toContain("extract_metadata");
  });

  it("should return 404 for unknown paths", async () => {
    const response = await fetch(`http://localhost:${testPort}/unknown`);
    expect(response.status).toBe(404);
  });

  it("should return error for invalid JSON-RPC version", async () => {
    const jsonRpcRequest = {
      jsonrpc: "1.0",
      id: 3,
      method: "tools/list",
      params: {},
    };

    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32600);
  });

  it("should return error for unknown method", async () => {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: 4,
      method: "unknown/method",
      params: {},
    };

    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32601);
    expect(data.error.message).toContain("Method not found");
  });

  it("should handle tools/call for extract_readable_markdown", async () => {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "extract_readable_markdown",
        arguments: {
          html_or_url: "<html><body><main><h1>Test</h1><p>Content here</p></main></body></html>",
        },
      },
    };

    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe(5);
    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
    expect(data.result.content[0].type).toBe("text");

    // Parse the tool result
    const toolResult = JSON.parse(data.result.content[0].text);
    expect(toolResult.ok).toBe(true);
    expect(toolResult.data.markdown).toContain("Test");
  });

  it("should return error for unknown tool", async () => {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "unknown_tool",
        arguments: {},
      },
    };

    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32601);
    expect(data.error.message).toContain("Unknown tool");
  });
});
