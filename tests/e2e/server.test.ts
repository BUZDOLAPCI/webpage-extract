import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createServer } from "../../src/server.js";

describe("MCP Server E2E Tests", () => {
  let server: Server;

  beforeAll(() => {
    server = createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Server Initialization", () => {
    it("should create a server instance", () => {
      expect(server).toBeDefined();
    });
  });

  describe("Tool Integration Tests", () => {
    it("should handle extract_readable_markdown with raw HTML", async () => {
      const html = `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <nav>Navigation</nav>
            <main>
              <h1>Welcome</h1>
              <p>This is the main content of the page.</p>
              <h2>Section</h2>
              <p>More content here.</p>
            </main>
            <footer>Footer</footer>
          </body>
        </html>
      `;

      // Import the tool directly for E2E testing
      const { extractReadableMarkdown } = await import(
        "../../src/tools/markdown.js"
      );
      const result = await extractReadableMarkdown({ html_or_url: html });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.markdown).toContain("# Welcome");
        expect(result.data.markdown).toContain("main content");
        expect(result.data.headings).toEqual([
          { level: 1, text: "Welcome" },
          { level: 2, text: "Section" },
        ]);
      }
    });

    it("should handle extract_tables with complex HTML", async () => {
      const html = `
        <html>
          <body>
            <h1>Data Report</h1>
            <table>
              <caption>Quarterly Results</caption>
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th>Revenue</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Q1</td>
                  <td>$100,000</td>
                  <td>$20,000</td>
                </tr>
                <tr>
                  <td>Q2</td>
                  <td>$150,000</td>
                  <td>$35,000</td>
                </tr>
                <tr>
                  <td>Q3</td>
                  <td>$180,000</td>
                  <td>$45,000</td>
                </tr>
              </tbody>
            </table>
            <table role="presentation">
              <tr><td>This is a layout table</td></tr>
            </table>
          </body>
        </html>
      `;

      const { extractTables } = await import("../../src/tools/tables.js");
      const result = await extractTables({ html_or_url: html });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.count).toBe(1);
        expect(result.data.tables[0].caption).toBe("Quarterly Results");
        expect(result.data.tables[0].headers).toEqual([
          "Quarter",
          "Revenue",
          "Profit",
        ]);
        expect(result.data.tables[0].rows).toHaveLength(3);
        expect(result.data.tables[0].rows[1]).toEqual([
          "Q2",
          "$150,000",
          "$35,000",
        ]);
      }
    });

    it("should handle extract_metadata with rich metadata", async () => {
      const html = `
        <html>
          <head>
            <title>Article: How to Build MCP Servers</title>
            <meta name="description" content="A comprehensive guide to building MCP servers">
            <meta name="author" content="Jane Developer">
            <link rel="canonical" href="https://example.com/mcp-guide">
            <meta property="og:title" content="Building MCP Servers">
            <meta property="og:description" content="Learn MCP development">
            <meta property="og:type" content="article">
            <meta property="og:image" content="https://example.com/og-image.png">
            <meta property="article:published_time" content="2024-01-15T12:00:00Z">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Article",
                "headline": "How to Build MCP Servers",
                "author": {
                  "@type": "Person",
                  "name": "Jane Developer"
                },
                "datePublished": "2024-01-15T12:00:00Z"
              }
            </script>
          </head>
          <body>
            <article>Content here</article>
          </body>
        </html>
      `;

      const { extractMetadata } = await import("../../src/tools/metadata.js");
      const result = await extractMetadata({ html_or_url: html });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.title).toBe("Article: How to Build MCP Servers");
        expect(result.data.description).toBe(
          "A comprehensive guide to building MCP servers"
        );
        expect(result.data.author).toBe("Jane Developer");
        expect(result.data.canonical_url).toBe("https://example.com/mcp-guide");
        expect(result.data.publish_date).toBe("2024-01-15T12:00:00Z");

        expect(result.data.open_graph.title).toBe("Building MCP Servers");
        expect(result.data.open_graph.type).toBe("article");

        expect(result.data.json_ld).toHaveLength(1);
        const jsonLd = result.data.json_ld[0] as Record<string, unknown>;
        expect(jsonLd["@type"]).toBe("Article");
      }
    });

    it("should handle combined workflow: all tools on same HTML", async () => {
      const html = `
        <html>
          <head>
            <title>Product Catalog</title>
            <meta name="description" content="Our product listing">
            <meta property="og:title" content="Products">
          </head>
          <body>
            <nav>Menu</nav>
            <main>
              <h1>Products</h1>
              <p>Browse our selection.</p>
              <table>
                <thead>
                  <tr><th>Product</th><th>Price</th></tr>
                </thead>
                <tbody>
                  <tr><td>Widget A</td><td>$10</td></tr>
                  <tr><td>Widget B</td><td>$20</td></tr>
                </tbody>
              </table>
            </main>
            <footer>Contact us</footer>
          </body>
        </html>
      `;

      const { extractReadableMarkdown } = await import(
        "../../src/tools/markdown.js"
      );
      const { extractTables } = await import("../../src/tools/tables.js");
      const { extractMetadata } = await import("../../src/tools/metadata.js");

      const [markdownResult, tablesResult, metadataResult] = await Promise.all([
        extractReadableMarkdown({ html_or_url: html }),
        extractTables({ html_or_url: html }),
        extractMetadata({ html_or_url: html }),
      ]);

      // Verify markdown extraction
      expect(markdownResult.ok).toBe(true);
      if (markdownResult.ok) {
        expect(markdownResult.data.markdown).toContain("# Products");
        expect(markdownResult.data.markdown).toContain("Browse our selection");
        expect(markdownResult.data.markdown).not.toContain("Menu");
      }

      // Verify table extraction
      expect(tablesResult.ok).toBe(true);
      if (tablesResult.ok) {
        expect(tablesResult.data.count).toBe(1);
        expect(tablesResult.data.tables[0].headers).toEqual([
          "Product",
          "Price",
        ]);
        expect(tablesResult.data.tables[0].rows).toHaveLength(2);
      }

      // Verify metadata extraction
      expect(metadataResult.ok).toBe(true);
      if (metadataResult.ok) {
        expect(metadataResult.data.title).toBe("Product Catalog");
        expect(metadataResult.data.description).toBe("Our product listing");
        expect(metadataResult.data.open_graph.title).toBe("Products");
      }
    });

    it("should handle error cases gracefully", async () => {
      const { extractReadableMarkdown } = await import(
        "../../src/tools/markdown.js"
      );
      const { extractTables } = await import("../../src/tools/tables.js");
      const { extractMetadata } = await import("../../src/tools/metadata.js");

      // Empty input
      const emptyMarkdown = await extractReadableMarkdown({ html_or_url: "" });
      expect(emptyMarkdown.ok).toBe(false);
      if (!emptyMarkdown.ok) {
        expect(emptyMarkdown.error.code).toBe("INVALID_INPUT");
      }

      const emptyTables = await extractTables({ html_or_url: "" });
      expect(emptyTables.ok).toBe(false);

      const emptyMetadata = await extractMetadata({ html_or_url: "" });
      expect(emptyMetadata.ok).toBe(false);
    });

    it("should validate response envelope format", async () => {
      const { extractReadableMarkdown } = await import(
        "../../src/tools/markdown.js"
      );

      const html = "<html><body><main><p>Test</p></main></body></html>";
      const result = await extractReadableMarkdown({ html_or_url: html });

      // Verify success envelope structure
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("meta");

      if (result.ok) {
        expect(result).toHaveProperty("data");
        expect(result.meta).toHaveProperty("retrieved_at");
        expect(result.meta).toHaveProperty("pagination");
        expect(result.meta).toHaveProperty("warnings");
        expect(result.meta.pagination).toEqual({ next_cursor: null });

        // Verify ISO-8601 timestamp format
        const timestamp = result.meta.retrieved_at;
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
      }
    });

    it("should validate error envelope format", async () => {
      const { extractReadableMarkdown } = await import(
        "../../src/tools/markdown.js"
      );

      const result = await extractReadableMarkdown({ html_or_url: "" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result).toHaveProperty("error");
        expect(result.error).toHaveProperty("code");
        expect(result.error).toHaveProperty("message");
        expect(result).toHaveProperty("meta");
        expect(result.meta).toHaveProperty("retrieved_at");
      }
    });
  });
});
