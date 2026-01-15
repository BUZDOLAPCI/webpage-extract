import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type {
  ExtractTablesInput,
  ExtractTablesData,
  TableData,
  Response,
} from "../types.js";
import {
  fetchHtmlOrUseProvided,
  createSuccessResponse,
  createErrorResponse,
} from "./fetch.js";

/**
 * Extract text content from a cell, handling nested elements
 */
function getCellText($: cheerio.CheerioAPI, cell: Element): string {
  return $(cell).text().trim().replace(/\s+/g, " ");
}

/**
 * Extract a single table as structured data
 */
function extractTable(
  $: cheerio.CheerioAPI,
  tableElement: Element
): TableData | null {
  const $table = $(tableElement);

  // Get caption if available
  const caption = $table.find("caption").first().text().trim() || undefined;

  // Extract headers
  const headers: string[] = [];
  const theadRow = $table.find("thead tr").first();
  let usedFirstRowAsHeader = false;

  if (theadRow.length > 0) {
    // Headers from thead
    theadRow.find("th, td").each((_, cell) => {
      headers.push(getCellText($, cell));
    });
  } else {
    // Try first row as headers
    const firstRow = $table.find("tr").first();
    const firstRowCells = firstRow.find("th, td");

    // Check if first row contains th elements or looks like a header
    const hasThElements = firstRow.find("th").length > 0;

    if (hasThElements) {
      firstRowCells.each((_, cell) => {
        headers.push(getCellText($, cell));
      });
      usedFirstRowAsHeader = true;
    } else {
      // No clear headers, use empty headers
      firstRowCells.each(() => {
        headers.push("");
      });
    }
  }

  // Extract rows
  const rows: string[][] = [];
  const allRows = $table.find("tr");

  // Skip the first row if we used it as headers (and there was no thead)
  const startIndex = usedFirstRowAsHeader ? 1 : 0;

  allRows.slice(startIndex).each((_, row) => {
    const $row = $(row);
    // Skip rows that are in thead
    if ($row.parents("thead").length > 0) {
      return;
    }
    const rowData: string[] = [];
    $row
      .find("td, th")
      .each((_, cell) => {
        rowData.push(getCellText($, cell));
      });
    if (rowData.length > 0) {
      rows.push(rowData);
    }
  });

  // Skip tables with no meaningful content
  if (rows.length === 0 && headers.every((h) => h === "")) {
    return null;
  }

  // Normalize row lengths to match header count
  const maxColumns = Math.max(
    headers.length,
    ...rows.map((row) => row.length)
  );

  // Pad headers if needed
  while (headers.length < maxColumns) {
    headers.push("");
  }

  // Pad rows if needed
  const normalizedRows = rows.map((row) => {
    while (row.length < maxColumns) {
      row.push("");
    }
    return row;
  });

  return {
    headers,
    rows: normalizedRows,
    caption,
  };
}

/**
 * Check if a table is likely a layout table (not data)
 */
function isLayoutTable(
  $: cheerio.CheerioAPI,
  tableElement: Element
): boolean {
  const $table = $(tableElement);

  // Check for role="presentation" or similar
  const role = $table.attr("role");
  if (role === "presentation" || role === "none") {
    return true;
  }

  // Check for layout-related classes
  const className = $table.attr("class") || "";
  const layoutClasses = ["layout", "wrapper", "container", "frame"];
  if (layoutClasses.some((cls) => className.toLowerCase().includes(cls))) {
    return true;
  }

  // Tables nested too deeply are often layout tables
  if ($table.parents("table").length > 1) {
    return true;
  }

  return false;
}

/**
 * Extract all tables from HTML as structured JSON
 */
export async function extractTables(
  input: ExtractTablesInput
): Promise<Response<ExtractTablesData>> {
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

    const tables: TableData[] = [];
    const warnings: string[] = [];

    // Find all tables
    $("table").each((_, tableElement) => {
      // Skip layout tables
      if (isLayoutTable($, tableElement)) {
        return;
      }

      const tableData = extractTable($, tableElement);
      if (tableData) {
        tables.push(tableData);
      }
    });

    if (tables.length === 0) {
      warnings.push("No data tables found in the document");
    }

    return createSuccessResponse<ExtractTablesData>(
      {
        tables,
        count: tables.length,
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
