import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, Server as HttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { createStandaloneServer } from "../../src/server.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

describe("HTTP Transport /mcp Endpoint", () => {
  let httpServer: HttpServer;
  let testPort: number;
  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: Server }
  >();

  beforeAll(async () => {
    httpServer = createHttpServer();

    httpServer.on("request", async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);

      if (url.pathname === "/mcp") {
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
          const serverInstance = createStandaloneServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
              sessions.set(sessionId, { transport, server: serverInstance });
            },
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              sessions.delete(transport.sessionId);
            }
          };

          try {
            await serverInstance.connect(transport);
            await transport.handleRequest(req, res);
          } catch {
            res.statusCode = 500;
            res.end("Internal server error");
          }
          return;
        }

        res.statusCode = 400;
        res.end("Invalid request");
        return;
      }

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

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
    // Clean up sessions
    for (const [, session] of sessions) {
      await session.server.close();
    }
    sessions.clear();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }, 30000);

  it("should respond to /health endpoint", async () => {
    const response = await fetch(`http://localhost:${testPort}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("healthy");
  });

  it("should reject GET requests to /mcp without session", async () => {
    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "GET",
    });
    expect(response.status).toBe(400);
  });

  it("should handle POST to /mcp with tools/list JSON-RPC request", async () => {
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
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    expect(response.status).toBe(200);

    const sessionId = response.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    // Read the response body
    const responseText = await response.text();
    expect(responseText).toBeTruthy();

    // The response should contain valid JSON-RPC response
    const lines = responseText.split("\n").filter((line) => line.trim());
    let foundInitializeResponse = false;

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonData = line.slice(6);
        if (jsonData) {
          try {
            const parsed = JSON.parse(jsonData);
            if (parsed.id === 1 && parsed.result) {
              foundInitializeResponse = true;
              expect(parsed.result.protocolVersion).toBeDefined();
              expect(parsed.result.serverInfo).toBeDefined();
              expect(parsed.result.serverInfo.name).toBe("webpage-extract");
            }
          } catch {
            // Ignore non-JSON lines
          }
        }
      }
    }

    expect(foundInitializeResponse).toBe(true);

    // Now send tools/list request with the session ID
    if (sessionId) {
      const toolsListRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      };

      const toolsResponse = await fetch(`http://localhost:${testPort}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify(toolsListRequest),
      });

      expect(toolsResponse.status).toBe(200);

      const toolsResponseText = await toolsResponse.text();
      const toolsLines = toolsResponseText.split("\n").filter((line) => line.trim());
      let foundToolsList = false;

      for (const line of toolsLines) {
        if (line.startsWith("data: ")) {
          const jsonData = line.slice(6);
          if (jsonData) {
            try {
              const parsed = JSON.parse(jsonData);
              if (parsed.id === 2 && parsed.result && parsed.result.tools) {
                foundToolsList = true;
                const tools = parsed.result.tools;
                expect(Array.isArray(tools)).toBe(true);
                expect(tools.length).toBeGreaterThan(0);

                // Verify expected tools exist
                const toolNames = tools.map((t: { name: string }) => t.name);
                expect(toolNames).toContain("fetch_url");
                expect(toolNames).toContain("extract_readable_markdown");
                expect(toolNames).toContain("extract_tables");
                expect(toolNames).toContain("extract_metadata");
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      }

      expect(foundToolsList).toBe(true);
    }
  }, 30000);

  it("should return 404 for unknown paths", async () => {
    const response = await fetch(`http://localhost:${testPort}/unknown`);
    expect(response.status).toBe(404);
  });

  it("should return 404 for non-existent session", async () => {
    const response = await fetch(`http://localhost:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": "non-existent-session-id",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(404);
  });
});
