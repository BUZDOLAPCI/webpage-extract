import * as cheerio from "cheerio";
import type {
  ExtractMetadataInput,
  ExtractMetadataData,
  OpenGraphData,
  Response,
} from "../types.js";
import {
  fetchHtmlOrUseProvided,
  createSuccessResponse,
  createErrorResponse,
} from "./fetch.js";

/**
 * Extract Open Graph metadata from the document
 */
function extractOpenGraph($: cheerio.CheerioAPI): OpenGraphData {
  const og: OpenGraphData = {};

  // Find all og: meta tags
  $('meta[property^="og:"]').each((_, element) => {
    const property = $(element).attr("property");
    const content = $(element).attr("content");

    if (property && content) {
      // Extract property name (e.g., "og:title" -> "title")
      const key = property.replace("og:", "");
      og[key] = content;
    }
  });

  return og;
}

/**
 * Extract JSON-LD structured data from the document
 */
function extractJsonLd($: cheerio.CheerioAPI): unknown[] {
  const jsonLdData: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const content = $(element).html();
    if (content) {
      try {
        const parsed = JSON.parse(content);
        jsonLdData.push(parsed);
      } catch {
        // Silently skip invalid JSON-LD
      }
    }
  });

  return jsonLdData;
}

/**
 * Extract all meta tags as key-value pairs
 */
function extractMetaTags($: cheerio.CheerioAPI): Record<string, string> {
  const tags: Record<string, string> = {};

  $("meta").each((_, element) => {
    const $el = $(element);
    const name = $el.attr("name") || $el.attr("property") || $el.attr("itemprop");
    const content = $el.attr("content");

    if (name && content) {
      tags[name] = content;
    }
  });

  return tags;
}

/**
 * Extract author from various sources
 */
function extractAuthor(
  $: cheerio.CheerioAPI,
  metaTags: Record<string, string>,
  jsonLd: unknown[]
): string | undefined {
  // Try meta tags first
  if (metaTags["author"]) {
    return metaTags["author"];
  }

  // Try article:author
  if (metaTags["article:author"]) {
    return metaTags["article:author"];
  }

  // Try JSON-LD
  for (const data of jsonLd) {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;

      // Direct author field
      if (typeof obj.author === "string") {
        return obj.author;
      }

      // Author as object
      if (typeof obj.author === "object" && obj.author !== null) {
        const author = obj.author as Record<string, unknown>;
        if (typeof author.name === "string") {
          return author.name;
        }
      }

      // Creator field
      if (typeof obj.creator === "string") {
        return obj.creator;
      }
    }
  }

  // Try rel="author" link
  const authorLink = $('a[rel="author"]').first().text().trim();
  if (authorLink) {
    return authorLink;
  }

  return undefined;
}

/**
 * Extract publish date from various sources
 */
function extractPublishDate(
  $: cheerio.CheerioAPI,
  metaTags: Record<string, string>,
  jsonLd: unknown[]
): string | undefined {
  // Try meta tags
  const dateMetaTags = [
    "article:published_time",
    "datePublished",
    "date",
    "pubdate",
    "DC.date.issued",
  ];

  for (const tag of dateMetaTags) {
    if (metaTags[tag]) {
      return metaTags[tag];
    }
  }

  // Try JSON-LD
  for (const data of jsonLd) {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;

      if (typeof obj.datePublished === "string") {
        return obj.datePublished;
      }

      if (typeof obj.dateCreated === "string") {
        return obj.dateCreated;
      }
    }
  }

  // Try time element with datetime attribute
  const timeEl = $("time[datetime]").first();
  const datetime = timeEl.attr("datetime");
  if (datetime) {
    return datetime;
  }

  return undefined;
}

/**
 * Extract metadata from HTML including canonical URL, title, description,
 * Open Graph tags, JSON-LD, author, and publish date
 */
export async function extractMetadata(
  input: ExtractMetadataInput
): Promise<Response<ExtractMetadataData>> {
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

    const warnings: string[] = [];

    // Extract title
    let title = $("title").first().text().trim() || undefined;
    if (!title) {
      title = $('meta[property="og:title"]').attr("content") || undefined;
    }

    // Extract description
    let description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      undefined;

    // Extract canonical URL
    const canonicalUrl =
      $('link[rel="canonical"]').attr("href") ||
      $('meta[property="og:url"]').attr("content") ||
      source ||
      undefined;

    // Extract Open Graph
    const openGraph = extractOpenGraph($);

    // Extract JSON-LD
    const jsonLd = extractJsonLd($);

    // Extract all meta tags
    const metaTags = extractMetaTags($);

    // Extract author
    const author = extractAuthor($, metaTags, jsonLd);

    // Extract publish date
    const publishDate = extractPublishDate($, metaTags, jsonLd);

    // Add warnings for missing important metadata
    if (!title) {
      warnings.push("No title found in the document");
    }
    if (!description) {
      warnings.push("No description found in the document");
    }
    if (Object.keys(openGraph).length === 0) {
      warnings.push("No Open Graph metadata found");
    }

    return createSuccessResponse<ExtractMetadataData>(
      {
        title,
        description,
        canonical_url: canonicalUrl,
        author,
        publish_date: publishDate,
        open_graph: openGraph,
        json_ld: jsonLd,
        meta_tags: metaTags,
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
