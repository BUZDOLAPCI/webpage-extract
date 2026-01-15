import type {
  FetchUrlInput,
  FetchUrlData,
  Response,
  ErrorCode,
} from "../types.js";
import { DEFAULT_CONFIG } from "../config.js";

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Check if a string is a URL (starts with http:// or https://)
 */
export function isUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(
  data: T,
  source?: string,
  warnings: string[] = []
): Response<T> {
  return {
    ok: true,
    data,
    meta: {
      source,
      retrieved_at: new Date().toISOString(),
      pagination: { next_cursor: null },
      warnings,
    },
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): Response<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  };
}

/**
 * Fetch raw HTML from a URL with optional custom headers and timeout
 */
export async function fetchUrl(
  input: FetchUrlInput
): Promise<Response<FetchUrlData>> {
  const { url, headers = {}, timeout_ms } = input;
  const timeout = timeout_ms ?? DEFAULT_CONFIG.defaultTimeoutMs;

  // Validate URL
  if (!url || typeof url !== "string") {
    return createErrorResponse("INVALID_INPUT", "URL is required");
  }

  if (!isValidUrl(url)) {
    return createErrorResponse(
      "INVALID_INPUT",
      "Invalid URL format. Must be a valid HTTP or HTTPS URL.",
      { url }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_CONFIG.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...headers,
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return createErrorResponse(
        "UPSTREAM_ERROR",
        `HTTP ${response.status}: ${response.statusText}`,
        {
          status_code: response.status,
          url,
        }
      );
    }

    const html = await response.text();
    const contentType = response.headers.get("content-type");

    return createSuccessResponse<FetchUrlData>(
      {
        html,
        status_code: response.status,
        content_type: contentType,
        final_url: response.url,
      },
      url
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return createErrorResponse("TIMEOUT", `Request timed out after ${timeout}ms`, {
          timeout_ms: timeout,
          url,
        });
      }

      // Check for network errors
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed")
      ) {
        return createErrorResponse(
          "UPSTREAM_ERROR",
          `Failed to connect to ${url}: ${error.message}`,
          { url }
        );
      }

      return createErrorResponse("INTERNAL_ERROR", error.message, {
        url,
        error_type: error.name,
      });
    }

    return createErrorResponse("INTERNAL_ERROR", "An unknown error occurred", {
      url,
    });
  }
}

/**
 * Fetch HTML from URL or return the HTML string if it's already HTML
 */
export async function fetchHtmlOrUseProvided(
  htmlOrUrl: string
): Promise<{ html: string; source?: string; error?: Response<never> }> {
  if (isUrl(htmlOrUrl)) {
    const result = await fetchUrl({ url: htmlOrUrl });
    if (!result.ok) {
      return { html: "", error: result };
    }
    return { html: result.data.html, source: htmlOrUrl };
  }

  // It's raw HTML
  return { html: htmlOrUrl };
}
