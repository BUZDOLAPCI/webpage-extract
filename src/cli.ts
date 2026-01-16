import type { TransportType } from "./types.js";

interface CliOptions {
  transport: TransportType;
  port: number;
}

/**
 * Parse command line arguments
 */
export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    transport: "http",
    port: 8080,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--transport" || arg === "-t") {
      const value = args[++i];
      if (value === "http" || value === "stdio") {
        options.transport = value;
      } else {
        console.error(`Invalid transport: ${value}. Must be "http" or "stdio"`);
        process.exit(1);
      }
    } else if (arg === "--port" || arg === "-p") {
      const value = parseInt(args[++i], 10);
      if (isNaN(value) || value < 1 || value > 65535) {
        console.error(`Invalid port: ${args[i]}. Must be a number between 1 and 65535`);
        process.exit(1);
      }
      options.port = value;
    } else if (arg === "--stdio") {
      options.transport = "stdio";
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("webpage-extract v1.0.0");
      process.exit(0);
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
webpage-extract - MCP server for webpage extraction

USAGE:
  webpage-extract [OPTIONS]

OPTIONS:
  -t, --transport <TYPE>   Transport type: "stdio" or "http" (default: http)
  -p, --port <PORT>        HTTP server port (default: 8080, only for http transport)
  --stdio                  Use STDIO transport (shorthand for --transport stdio)
  -h, --help               Show this help message
  -v, --version            Show version

EXAMPLES:
  # Start with HTTP transport on default port 8080
  webpage-extract

  # Start with HTTP transport on custom port
  webpage-extract --port 3000

  # Start with STDIO transport (for MCP client integration)
  webpage-extract --stdio

TOOLS:
  fetch_url                Fetch raw HTML from a URL
  extract_readable_markdown  Convert HTML to readable Markdown
  extract_tables           Extract tables as structured JSON
  extract_metadata         Extract metadata (title, OG tags, JSON-LD, etc.)
`);
}
