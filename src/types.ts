/**
 * Standard response envelope for all tools
 */
export interface SuccessResponse<T> {
  ok: true;
  data: T;
  meta: ResponseMeta;
}

export interface ErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    retrieved_at: string;
  };
}

export type Response<T> = SuccessResponse<T> | ErrorResponse;

export type ErrorCode =
  | "INVALID_INPUT"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PARSE_ERROR"
  | "INTERNAL_ERROR";

export interface ResponseMeta {
  source?: string;
  retrieved_at: string;
  pagination?: {
    next_cursor: string | null;
  };
  warnings: string[];
}

/**
 * fetch_url tool types
 */
export interface FetchUrlInput {
  url: string;
  headers?: Record<string, string>;
  timeout_ms?: number;
}

export interface FetchUrlData {
  html: string;
  status_code: number;
  content_type: string | null;
  final_url: string;
}

/**
 * extract_readable_markdown tool types
 */
export interface ExtractMarkdownInput {
  html_or_url: string;
}

export interface ExtractMarkdownData {
  markdown: string;
  headings: Heading[];
  word_count: number;
}

export interface Heading {
  level: number;
  text: string;
}

/**
 * extract_tables tool types
 */
export interface ExtractTablesInput {
  html_or_url: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface ExtractTablesData {
  tables: TableData[];
  count: number;
}

/**
 * extract_metadata tool types
 */
export interface ExtractMetadataInput {
  html_or_url: string;
}

export interface OpenGraphData {
  title?: string;
  type?: string;
  url?: string;
  image?: string;
  description?: string;
  site_name?: string;
  [key: string]: string | undefined;
}

export interface ExtractMetadataData {
  title?: string;
  description?: string;
  canonical_url?: string;
  author?: string;
  publish_date?: string;
  open_graph: OpenGraphData;
  json_ld: unknown[];
  meta_tags: Record<string, string>;
}

/**
 * Configuration types
 */
export interface Config {
  transport: "http" | "stdio";
  port: number;
  defaultTimeoutMs: number;
  userAgent: string;
}

/**
 * Transport types
 */
export type TransportType = "http" | "stdio";
