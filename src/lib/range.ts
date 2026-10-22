export interface ParseRangeResult {
  /** 1-based page numbers, sorted, de-duplicated */
  pages: number[];
  error?: string;
  warnings: string[];
}

/**
 * Parse a page range like "1-3, 5, 8-10" against a page count.
 * Out-of-range numbers are skipped (with a warning), never fatal.
 * Any malformed token makes the whole parse an error and returns no pages,
 * so callers can leave the current selection untouched.
 */
export function parseRange(input: string, pageCount: number): ParseRangeResult {
  const warnings: string[] = [];
  if (!input.trim()) {
    return { pages: [], error: "Enter a range first, e.g. 1-3, 5", warnings };
  }
  if (pageCount < 1) {
    return { pages: [], error: "No PDF loaded", warnings };
  }

  const found = new Set<number>();
  const tokens = input.split(",");

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = token.match(/^(\d+)$/);

    if (rangeMatch) {
      let start = parseInt(rangeMatch[1], 10);
      let end = parseInt(rangeMatch[2], 10);
      if (start > end) {
        warnings.push(`Reversed range ${start}-${end} — treated as ${end}-${start}`);
        [start, end] = [end, start];
      }
      for (let p = start; p <= end; p++) {
        if (p < 1 || p > pageCount) {
          warnings.push(`Page ${p} is out of range (1-${pageCount}) — skipped`);
        } else {
          found.add(p);
        }
      }
    } else if (singleMatch) {
      const p = parseInt(singleMatch[1], 10);
      if (p < 1 || p > pageCount) {
        warnings.push(`Page ${p} is out of range (1-${pageCount}) — skipped`);
      } else {
        found.add(p);
      }
    } else {
      return {
        pages: [],
        error: `"${token}" isn't a page or range. Use e.g. 1-3, 5`,
        warnings,
      };
    }
  }

  if (found.size === 0) {
    return { pages: [], error: "No valid pages in that range", warnings };
  }
  return { pages: [...found].sort((a, b) => a - b), warnings };
}
