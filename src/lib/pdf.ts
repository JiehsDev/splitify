import { PDFDocument, degrees } from "pdf-lib";
import JSZip from "jszip";

export type ExportPage =
  | {
      kind: "pdf";
      /** key into the documents record passed to buildPdf */
      sourceId: string;
      /** 0-based index into that source document */
      sourceIndex: number;
      rotation: 0 | 90 | 180 | 270;
    }
  | {
      kind: "blank";
      width: number;
      height: number;
      rotation: 0 | 90 | 180 | 270;
    };

/** Map of sourceId -> source PDF bytes */
export type Documents = Record<string, Uint8Array>;

function normaliseRotation(deg: number): 0 | 90 | 180 | 270 {
  const n = ((deg % 360) + 360) % 360;
  return ((Math.round(n / 90) * 90) % 360) as 0 | 90 | 180 | 270;
}

function shortLabel(page: ExportPage, documents: Documents): string {
  if (page.kind === "blank") return "blank";
  void documents;
  return `p${page.sourceIndex + 1}`;
}

/**
 * Build a brand-new PDF from the given pages, in the given order.
 * Pages may come from different source documents (merge) and blank
 * pages may be interleaved.
 */
export async function buildPdf(
  documents: Documents,
  pages: ExportPage[],
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("No pages to export");
  const out = await PDFDocument.create();

  // Load each source once, copy page-by-page to preserve interleaved order.
  const loaded = new Map<string, PDFDocument>();
  for (const page of pages) {
    if (page.kind === "blank") {
      const blank = out.addPage([page.width, page.height]);
      if (page.rotation) blank.setRotation(degrees(page.rotation));
      continue;
    }
    let src = loaded.get(page.sourceId);
    if (!src) {
      const bytes = documents[page.sourceId];
      if (!bytes) throw new Error("A source PDF is missing — reload the file.");
      src = await PDFDocument.load(bytes, { ignoreEncryption: false });
      loaded.set(page.sourceId, src);
    }
    const [copied] = await out.copyPages(src, [page.sourceIndex]);
    if (page.rotation) {
      const current = copied.getRotation().angle;
      copied.setRotation(degrees(normaliseRotation(current + page.rotation)));
    }
    out.addPage(copied);
  }
  return out.save();
}

export async function buildSinglePagePdfs(
  documents: Documents,
  pages: ExportPage[],
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const bytes = await buildPdf(documents, [pages[i]]);
    results.push({ name: `${String(i + 1).padStart(2, "0")}-${shortLabel(pages[i], documents)}`, bytes });
  }
  return results;
}

export async function buildChunkedPdfs(
  documents: Documents,
  pages: ExportPage[],
  chunkSize: number,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  if (chunkSize < 1) throw new Error("Chunk size must be at least 1");
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i += chunkSize) {
    const chunk = pages.slice(i, i + chunkSize);
    const bytes = await buildPdf(documents, chunk);
    results.push({ name: `pages-${i + 1}-${i + chunk.length}`, bytes });
  }
  return results;
}

export async function zipPdfs(
  baseName: string,
  files: { name: string; bytes: Uint8Array }[],
): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(`${baseName}-${f.name}.pdf`, f.bytes);
  }
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes);
  downloadBlob(new Blob([copy.buffer], { type: "application/pdf" }), filename);
}

/** Validate bytes are a loadable PDF and return its page count. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number }> {
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (!header.startsWith("%PDF-")) {
    throw new Error("That file isn't a PDF.");
  }
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const pageCount = doc.getPageCount();
    if (pageCount === 0) throw new Error("This PDF has no pages.");
    return { pageCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg)) {
      throw new Error("This PDF is password-protected — encrypted PDFs aren't supported yet.");
    }
    if (msg === "This PDF has no pages.") throw e;
    throw new Error("Couldn't read this PDF — it may be corrupted.");
  }
}

export function baseNameOf(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").replace(/[^\w\- ]+/g, "").trim() || "splitify";
}
