# webpage-extract

MCP server for fetching webpages and extracting readable Markdown, tables, and metadata.

## Features

- Fetch raw HTML from URLs
- Convert HTML to clean, readable Markdown
- Extract structured table data as JSON
- Extract metadata including Open Graph, JSON-LD, and more
- No headless browser required (lightweight HTML parsing)

## Installation

```bash
npm install
npm run build
```

## Usage

### STDIO Transport (Recommended for MCP clients)

```bash
npm run dev:stdio
# or
node dist/index.js --transport stdio
```

### HTTP Transport

```bash
npm run dev:http
# or
node dist/index.js --transport http --port 8000
```

## Tools

### 1. `fetch_url`

Fetch raw HTML from a URL with optional custom headers and timeout.

**Input:**
```json
{
  "url": "https://example.com",
  "headers": { "Accept-Language": "en-US" },
  "timeout_ms": 10000
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "html": "<!DOCTYPE html>...",
    "status_code": 200,
    "content_type": "text/html; charset=utf-8",
    "final_url": "https://example.com/"
  },
  "meta": {
    "source": "https://example.com",
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### 2. `extract_readable_markdown`

Convert HTML to readable Markdown, removing boilerplate, navigation, ads, and sidebars.

**Input:**
```json
{
  "html_or_url": "https://example.com/article"
}
```

Or with raw HTML:
```json
{
  "html_or_url": "<html><body><main><h1>Title</h1><p>Content</p></main></body></html>"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "markdown": "# Title\n\nContent",
    "headings": [
      { "level": 1, "text": "Title" }
    ],
    "word_count": 2
  },
  "meta": {
    "source": "https://example.com/article",
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### 3. `extract_tables`

Extract all data tables from HTML as structured JSON.

**Input:**
```json
{
  "html_or_url": "https://example.com/data"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "tables": [
      {
        "headers": ["Name", "Age", "City"],
        "rows": [
          ["Alice", "30", "New York"],
          ["Bob", "25", "Los Angeles"]
        ],
        "caption": "User Data"
      }
    ],
    "count": 1
  },
  "meta": {
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### 4. `extract_metadata`

Extract metadata including canonical URL, title, description, Open Graph tags, JSON-LD, author, and publish date.

**Input:**
```json
{
  "html_or_url": "https://example.com/article"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "title": "Article Title",
    "description": "Article description",
    "canonical_url": "https://example.com/article",
    "author": "John Doe",
    "publish_date": "2024-01-15T12:00:00Z",
    "open_graph": {
      "title": "OG Title",
      "description": "OG Description",
      "image": "https://example.com/image.jpg",
      "type": "article"
    },
    "json_ld": [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "Article Title"
      }
    ],
    "meta_tags": {
      "author": "John Doe",
      "description": "Article description"
    }
  },
  "meta": {
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

## Response Envelope

All tools return responses in a standard envelope format:

### Success Response
```json
{
  "ok": true,
  "data": {},
  "meta": {
    "source": "optional URL if fetched",
    "retrieved_at": "ISO-8601 timestamp",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### Error Response
```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  },
  "meta": {
    "retrieved_at": "ISO-8601 timestamp"
  }
}
```

**Error Codes:**
- `INVALID_INPUT` - Invalid or missing input parameters
- `UPSTREAM_ERROR` - Error from the target server (HTTP errors, connection failures)
- `RATE_LIMITED` - Request was rate limited
- `TIMEOUT` - Request timed out
- `PARSE_ERROR` - Failed to parse HTML
- `INTERNAL_ERROR` - Unexpected internal error

## Limitations

1. **No JavaScript Rendering** - This server only processes static HTML. Content rendered by JavaScript will not be captured. For JavaScript-heavy sites, consider using a headless browser solution.

2. **Content Detection** - The readable markdown extraction uses heuristics to identify main content. Complex or unusual page layouts may not be processed optimally.

3. **Table Detection** - Layout tables (tables used for page structure rather than data) are filtered out using heuristics. Some edge cases may be incorrectly classified.

4. **JSON-LD Parsing** - JSON-LD extraction is best-effort. Malformed JSON-LD blocks are silently skipped.

5. **No Authentication** - This server does not handle authentication. Requests to pages requiring login will return login pages or errors.

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Project Structure

```
webpage-extract/
├── src/
│   ├── index.ts            # Main entry point
│   ├── cli.ts              # Command-line argument parsing
│   ├── config.ts           # Configuration management
│   ├── server.ts           # MCP server instance
│   ├── types.ts            # TypeScript type definitions
│   ├── tools/
│   │   ├── index.ts        # Tool exports
│   │   ├── fetch.ts        # fetch_url tool
│   │   ├── markdown.ts     # extract_readable_markdown tool
│   │   ├── tables.ts       # extract_tables tool
│   │   └── metadata.ts     # extract_metadata tool
│   └── transport/
│       ├── index.ts        # Transport exports
│       ├── http.ts         # HTTP transport
│       └── stdio.ts        # STDIO transport
├── tests/
│   ├── unit/
│   │   └── tools.test.ts   # Unit tests
│   └── e2e/
│       └── server.test.ts  # E2E tests
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Configuration

Configuration can be set via environment variables or command-line arguments.

| Variable | CLI Flag | Default | Description |
|----------|----------|---------|-------------|
| `TRANSPORT` | `--transport, -t` | `stdio` | Transport type: "http" or "stdio" |
| `PORT` | `--port, -p` | `8000` | HTTP server port |
| `DEFAULT_TIMEOUT_MS` | - | `30000` | Default request timeout in ms |
| `USER_AGENT` | - | `webpage-extract/1.0.0` | User agent for HTTP requests |

## License

MIT
