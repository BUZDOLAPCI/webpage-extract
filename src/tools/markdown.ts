import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ExtractMarkdownInput,
  ExtractMarkdownData,
  Heading,
  Response,
} from "../types.js";
import {
  fetchHtmlOrUseProvided,
  createSuccessResponse,
  createErrorResponse,
} from "./fetch.js";

/**
 * Elements to remove from the HTML before converting to Markdown
 * These are typically navigation, ads, and boilerplate elements
 */
const ELEMENTS_TO_REMOVE = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  ".nav",
  ".navbar",
  ".navigation",
  ".menu",
  ".sidebar",
  ".advertisement",
  ".ad",
  ".ads",
  ".advert",
  ".social",
  ".social-share",
  ".share",
  ".comments",
  ".comment",
  ".related",
  ".related-posts",
  ".footer",
  ".header",
  ".cookie",
  ".popup",
  ".modal",
  ".newsletter",
  ".subscribe",
  "#nav",
  "#navbar",
  "#navigation",
  "#menu",
  "#sidebar",
  "#footer",
  "#header",
  "#comments",
  "#ad",
  "#ads",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
];

/**
 * Configure Turndown for better Markdown output
 */
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  // Keep code blocks
  turndown.addRule("pre", {
    filter: "pre",
    replacement: (content, node) => {
      // For Node.js environment, we use a simplified approach
      // since HTMLElement is not available without DOM
      const nodeAny = node as { querySelector?: (s: string) => { getAttribute?: (a: string) => string | null; textContent?: string } | null; textContent?: string };
      const code = nodeAny.querySelector?.("code");
      const lang = code?.getAttribute?.("class")?.match(/language-(\w+)/)?.[1] || "";
      const text = code?.textContent || nodeAny.textContent || content;
      return `\n\`\`\`${lang}\n${text.trim()}\n\`\`\`\n`;
    },
  });

  return turndown;
}

// Use AnyNode type from cheerio
type CheerioElement = ReturnType<typeof cheerio.load> extends (selector: string) => infer R ? (R extends { first(): infer F } ? (F extends { 0: infer E } ? E : never) : never) : never;

/**
 * Find the main content area of the page
 */
function findMainContent($: cheerio.CheerioAPI): ReturnType<typeof $> {
  // Try common main content selectors in order of preference
  const mainSelectors = [
    "main",
    "article",
    '[role="main"]',
    "#content",
    "#main",
    "#main-content",
    ".content",
    ".main",
    ".main-content",
    ".post",
    ".article",
    ".entry",
    ".entry-content",
    ".post-content",
    ".article-content",
  ];

  for (const selector of mainSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      return element.first();
    }
  }

  // Fallback to body
  return $("body");
}

/**
 * Extract headings from the document
 */
function extractHeadings($: cheerio.CheerioAPI): Heading[] {
  const headings: Heading[] = [];

  $("h1, h2, h3, h4, h5, h6").each((_, element) => {
    const $el = $(element);
    const tagName = element.tagName.toLowerCase();
    const level = parseInt(tagName.charAt(1), 10);
    const text = $el.text().trim();

    if (text) {
      headings.push({ level, text });
    }
  });

  return headings;
}

/**
 * Count words in a string
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Extract readable Markdown from HTML, removing boilerplate/navigation
 */
export async function extractReadableMarkdown(
  input: ExtractMarkdownInput
): Promise<Response<ExtractMarkdownData>> {
  const { html_or_url } = input;

  if (!html_or_url || typeof html_or_url !== "string") {
    return createErrorResponse(
      "INVALID_INPUT",
      "html_or_url is required and must be a string"
    );
  }

  try {
    // Fetch HTML if URL provided
    const { html, source, error } = await fetchHtmlOrUseProvided(html_or_url);
    if (error) {
      return error;
    }

    if (!html.trim()) {
      return createErrorResponse("INVALID_INPUT", "Empty HTML content provided");
    }

    // Load HTML into cheerio
    const $ = cheerio.load(html);

    // Extract headings before removing elements
    const headings = extractHeadings($);

    // Remove unwanted elements
    for (const selector of ELEMENTS_TO_REMOVE) {
      $(selector).remove();
    }

    // Find main content
    const mainContent = findMainContent($);

    // Convert to Markdown
    const turndown = createTurndownService();
    const contentHtml = mainContent.html() || "";
    let markdown = turndown.turndown(contentHtml);

    // Clean up the markdown
    markdown = markdown
      // Remove excessive newlines
      .replace(/\n{3,}/g, "\n\n")
      // Remove leading/trailing whitespace
      .trim();

    const wordCount = countWords(markdown);

    const warnings: string[] = [];
    if (wordCount < 50) {
      warnings.push(
        "Extracted content is very short. The page may be JavaScript-rendered or have unusual structure."
      );
    }

    return createSuccessResponse<ExtractMarkdownData>(
      {
        markdown,
        headings,
        word_count: wordCount,
      },
      source,
      warnings
    );
  } catch (error) {
    if (error instanceof Error) {
      return createErrorResponse("PARSE_ERROR", `Failed to parse HTML: ${error.message}`);
    }
    return createErrorResponse("INTERNAL_ERROR", "An unknown error occurred during parsing");
  }
}
