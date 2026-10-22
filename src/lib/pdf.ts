import { PDFDocument, degrees } from "pdf-lib";
import JSZip from "jszip";

export interface ExportPage {
  /** 0-based index into the source PDF */
  sourceIndex: number;
  /** extra rotation the user applied, degrees clockwise */
  rotation: 0 | 90 | 180 | 270;
}

function normaliseRotation(deg: number): 0 | 90 | 180 | 270 {
  const n = ((deg % 360) + 360) % 360;
  return (Math.round(n / 90) * 90 % 360) as 0 | 90 | 180 | 270;
}

/** Build a brand-new PDF from the given source pages, in the given order. */
export async function buildPdf(
  sourceBytes: Uint8Array,
  pages: ExportPage[],
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("No pages to export");
  const src = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p.sourceIndex),
  );
  copied.forEach((page, i) => {
    const extra = pages[i].rotation;
    if (extra) {
      const current = page.getRotation().angle;
      page.setRotation(degrees(normaliseRotation(current + extra)));
    }
    out.addPage(page);
  });
  return out.save();
}

export async function buildSinglePagePdfs(
  sourceBytes: Uint8Array,
  pages: ExportPage[],
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const bytes = await buildPdf(sourceBytes, [pages[i]]);
    results.push({ name: `p${pages[i].sourceIndex + 1}`, bytes });
  }
  return results;
}

export async function buildChunkedPdfs(
  sourceBytes: Uint8Array,
  pages: ExportPage[],
  chunkSize: number,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  if (chunkSize < 1) throw new Error("Chunk size must be at least 1");
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i += chunkSize) {
    const chunk = pages.slice(i, i + chunkSize);
    const bytes = await buildPdf(sourceBytes, chunk);
    const first = chunk[0].sourceIndex + 1;
    const last = chunk[chunk.length - 1].sourceIndex + 1;
    results.push({ name: `pages-${first}-${last}`, bytes });
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
