import { describe, it, expect } from "vitest";
import {
  isValidUrl,
  isUrl,
  createSuccessResponse,
  createErrorResponse,
} from "../../src/tools/fetch.js";
import { extractReadableMarkdown } from "../../src/tools/markdown.js";
import { extractTables } from "../../src/tools/tables.js";
import { extractMetadata } from "../../src/tools/metadata.js";

describe("URL Utilities", () => {
  describe("isValidUrl", () => {
    it("should return true for valid HTTP URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("https://example.com/path?query=1")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("isUrl", () => {
    it("should return true for strings starting with http:// or https://", () => {
      expect(isUrl("http://example.com")).toBe(true);
      expect(isUrl("https://example.com")).toBe(true);
    });

    it("should return false for other strings", () => {
      expect(isUrl("<html>content</html>")).toBe(false);
      expect(isUrl("ftp://example.com")).toBe(false);
    });
  });
});

describe("Response Helpers", () => {
  describe("createSuccessResponse", () => {
    it("should create a success response with correct structure", () => {
      const data = { test: "value" };
      const response = createSuccessResponse(data, "http://example.com", [
        "warning1",
      ]);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.data).toEqual(data);
        expect(response.meta.source).toBe("http://example.com");
        expect(response.meta.warnings).toEqual(["warning1"]);
        expect(response.meta.pagination).toEqual({ next_cursor: null });
        expect(response.meta.retrieved_at).toBeDefined();
      }
    });
  });

  describe("createErrorResponse", () => {
    it("should create an error response with correct structure", () => {
      const response = createErrorResponse("INVALID_INPUT", "Test error", {
        detail: "info",
      });

      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error.code).toBe("INVALID_INPUT");
        expect(response.error.message).toBe("Test error");
        expect(response.error.details).toEqual({ detail: "info" });
        expect(response.meta.retrieved_at).toBeDefined();
      }
    });
  });
});

describe("extractReadableMarkdown", () => {
  it("should convert simple HTML to Markdown", async () => {
    const html = `
      <html>
        <body>
          <main>
            <h1>Test Title</h1>
            <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
            <h2>Subtitle</h2>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </main>
        </body>
      </html>
    `;

    const result = await extractReadableMarkdown({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.markdown).toContain("# Test Title");
      expect(result.data.markdown).toContain("**bold**");
      expect(result.data.markdown).toContain("*italic*");
      expect(result.data.markdown).toContain("## Subtitle");
      expect(result.data.headings).toHaveLength(2);
      expect(result.data.headings[0]).toEqual({ level: 1, text: "Test Title" });
      expect(result.data.word_count).toBeGreaterThan(0);
    }
  });

  it("should remove navigation and boilerplate", async () => {
    const html = `
      <html>
        <body>
          <nav>Navigation menu</nav>
          <header>Header content</header>
          <main>
            <h1>Main Content</h1>
            <p>This is the main article content.</p>
          </main>
          <footer>Footer content</footer>
          <aside>Sidebar content</aside>
        </body>
      </html>
    `;

    const result = await extractReadableMarkdown({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.markdown).toContain("Main Content");
      expect(result.data.markdown).not.toContain("Navigation menu");
      expect(result.data.markdown).not.toContain("Footer content");
      expect(result.data.markdown).not.toContain("Sidebar content");
    }
  });

  it("should return error for empty input", async () => {
    const result = await extractReadableMarkdown({ html_or_url: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });
});

describe("extractTables", () => {
  it("should extract simple table with headers", async () => {
    const html = `
      <html>
        <body>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>City</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Alice</td>
                <td>30</td>
                <td>New York</td>
              </tr>
              <tr>
                <td>Bob</td>
                <td>25</td>
                <td>Los Angeles</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    const result = await extractTables({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.count).toBe(1);
      expect(result.data.tables[0].headers).toEqual(["Name", "Age", "City"]);
      expect(result.data.tables[0].rows).toHaveLength(2);
      expect(result.data.tables[0].rows[0]).toEqual([
        "Alice",
        "30",
        "New York",
      ]);
    }
  });

  it("should extract table with caption", async () => {
    const html = `
      <table>
        <caption>Employee Data</caption>
        <tr><th>Name</th></tr>
        <tr><td>John</td></tr>
      </table>
    `;

    const result = await extractTables({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tables[0].caption).toBe("Employee Data");
    }
  });

  it("should skip layout tables", async () => {
    const html = `
      <table role="presentation">
        <tr><td>Layout content</td></tr>
      </table>
      <table>
        <tr><th>Data</th></tr>
        <tr><td>Real data</td></tr>
      </table>
    `;

    const result = await extractTables({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.count).toBe(1);
    }
  });

  it("should handle tables without thead", async () => {
    const html = `
      <table>
        <tr><th>Col1</th><th>Col2</th></tr>
        <tr><td>A</td><td>B</td></tr>
      </table>
    `;

    const result = await extractTables({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tables[0].headers).toEqual(["Col1", "Col2"]);
      expect(result.data.tables[0].rows).toHaveLength(1);
    }
  });

  it("should add warning when no tables found", async () => {
    const html = "<html><body><p>No tables here</p></body></html>";

    const result = await extractTables({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.count).toBe(0);
      expect(result.meta.warnings).toContain(
        "No data tables found in the document"
      );
    }
  });
});

describe("extractMetadata", () => {
  it("should extract basic metadata", async () => {
    const html = `
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="This is a test description">
          <meta name="author" content="Test Author">
          <link rel="canonical" href="https://example.com/page">
        </head>
        <body></body>
      </html>
    `;

    const result = await extractMetadata({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Test Page Title");
      expect(result.data.description).toBe("This is a test description");
      expect(result.data.author).toBe("Test Author");
      expect(result.data.canonical_url).toBe("https://example.com/page");
    }
  });

  it("should extract Open Graph metadata", async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta property="og:type" content="article">
          <meta property="og:url" content="https://example.com/article">
        </head>
        <body></body>
      </html>
    `;

    const result = await extractMetadata({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.open_graph.title).toBe("OG Title");
      expect(result.data.open_graph.description).toBe("OG Description");
      expect(result.data.open_graph.image).toBe(
        "https://example.com/image.jpg"
      );
      expect(result.data.open_graph.type).toBe("article");
    }
  });

  it("should extract JSON-LD structured data", async () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "headline": "Test Article",
              "author": {
                "@type": "Person",
                "name": "John Doe"
              },
              "datePublished": "2024-01-15"
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const result = await extractMetadata({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.json_ld).toHaveLength(1);
      expect((result.data.json_ld[0] as Record<string, unknown>)["@type"]).toBe(
        "Article"
      );
      expect(result.data.author).toBe("John Doe");
      expect(result.data.publish_date).toBe("2024-01-15");
    }
  });

  it("should extract publish date from meta tags", async () => {
    const html = `
      <html>
        <head>
          <meta property="article:published_time" content="2024-06-20T10:00:00Z">
        </head>
        <body></body>
      </html>
    `;

    const result = await extractMetadata({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.publish_date).toBe("2024-06-20T10:00:00Z");
    }
  });

  it("should handle missing metadata gracefully", async () => {
    const html = "<html><head></head><body></body></html>";

    const result = await extractMetadata({ html_or_url: html });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBeUndefined();
      expect(result.data.description).toBeUndefined();
      expect(result.meta.warnings).toContain("No title found in the document");
      expect(result.meta.warnings).toContain(
        "No description found in the document"
      );
    }
  });

  it("should return error for empty input", async () => {
    const result = await extractMetadata({ html_or_url: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });
});
