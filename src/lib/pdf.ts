import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";
import JSZip from "jszip";
import {
  displayedSize,
  hexToRgb,
  toUserSpace,
  type Annotation,
} from "./annotations";

export type ExportPage =
  | {
      kind: "pdf";
      /** key into the documents record passed to buildPdf */
      sourceId: string;
      /** 0-based index into that source document */
      sourceIndex: number;
      rotation: 0 | 90 | 180 | 270;
      annotations?: Annotation[];
    }
  | {
      kind: "blank";
      width: number;
      height: number;
      rotation: 0 | 90 | 180 | 270;
      annotations?: Annotation[];
    };

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  if (typeof atob === "function") {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** Draw a page's annotations on top of it, flattened into the content. */
async function drawAnnotations(
  out: PDFDocument,
  page: PDFPage,
  annotations: Annotation[],
  pageW: number,
  pageH: number,
  rotation: 0 | 90 | 180 | 270,
): Promise<void> {
  const { w: Wd, h: Hd } = displayedSize(pageW, pageH, rotation);
  // Point in displayed space (fractions x from left, y from top) -> user space
  const conv = (fx: number, fyTop: number) =>
    toUserSpace(pageW, pageH, rotation, fx * Wd, Hd - fyTop * Hd);

  let font: Awaited<ReturnType<PDFDocument["embedFont"]>> | null = null;
  for (const ann of annotations) {
    if (ann.type === "text") {
      if (!font) font = await out.embedFont(StandardFonts.Helvetica);
      const size = Math.max(6, ann.sizeFrac * Hd);
      // Editor y is the top of the text; baseline sits ~0.8em below the top.
      const baselineFracY = ann.y + (size * 0.8) / Hd;
      const pt = conv(ann.x, baselineFracY);
      const c = hexToRgb(ann.color);
      page.drawText(ann.text, {
        x: pt.x,
        y: pt.y,
        size,
        font,
        color: rgb(c.r, c.g, c.b),
        rotate: degrees(rotation),
      });
    } else if (ann.type === "path") {
      const c = hexToRgb(ann.color);
      const color = rgb(c.r, c.g, c.b);
      const thickness = Math.max(0.5, ann.widthFrac * Wd);
      const pts = ann.points.map((p) => conv(p.x, p.y));
      if (pts.length === 1) {
        page.drawCircle({ x: pts[0].x, y: pts[0].y, size: thickness / 2, color, opacity: ann.opacity });
      }
      for (let i = 1; i < pts.length; i++) {
        page.drawLine({
          start: pts[i - 1],
          end: pts[i],
          thickness,
          color,
          opacity: ann.opacity,
        });
      }
    } else if (ann.type === "rect") {
      const c = hexToRgb(ann.color);
      const w = ann.w * Wd;
      const h = ann.h * Hd;
      const pt = conv(ann.x, ann.y + ann.h); // bottom-left in displayed space
      page.drawRectangle({
        x: pt.x,
        y: pt.y,
        width: w,
        height: h,
        color: rgb(c.r, c.g, c.b),
        opacity: ann.opacity,
        rotate: degrees(rotation),
      });
    } else if (ann.type === "image") {
      const bytes = dataUrlToBytes(ann.dataUrl);
      const img = ann.dataUrl.startsWith("data:image/jpeg") || ann.dataUrl.startsWith("data:image/jpg")
        ? await out.embedJpg(bytes)
        : await out.embedPng(bytes);
      const w = ann.w * Wd;
      const h = ann.h * Hd;
      // (x, y) of the image is its bottom-left in displayed space.
      const pt = conv(ann.x, ann.y + ann.h);
      page.drawImage(img, { x: pt.x, y: pt.y, width: w, height: h, rotate: degrees(rotation) });
    }
  }
}

/** Map of sourceId -> source PDF bytes */
export type Documents = Record<string, Uint8Array>;

export interface StampConfig {
  pageNumbers?: {
    position: "bottom-center" | "bottom-right" | "bottom-left" | "top-center";
    format: "page-x-of-y" | "x-of-y" | "x";
  };
  watermark?: { text: string; opacity: number };
  header?: string;
  footer?: string;
}

export interface BuildOptions {
  stamps?: StampConfig;
}

function formatPageNumber(
  format: NonNullable<StampConfig["pageNumbers"]>["format"],
  index: number,
  total: number,
): string {
  const x = index + 1;
  if (format === "x") return `${x}`;
  if (format === "x-of-y") return `${x} / ${total}`;
  return `Page ${x} of ${total}`;
}

async function applyStamps(out: PDFDocument, stamps: StampConfig): Promise<void> {
  const pages = out.getPages();
  const total = pages.length;
  const needsFont =
    !!stamps.pageNumbers || !!stamps.header || !!stamps.footer || !!stamps.watermark?.text;
  if (!needsFont) return;
  const font = await out.embedFont(StandardFonts.Helvetica);
  const gray = rgb(0.45, 0.45, 0.45);

  pages.forEach((page, i) => {
    const W = page.getWidth();
    const H = page.getHeight();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    const { w: Wd, h: Hd } = displayedSize(W, H, rotation);
    const margin = 28;

    const drawAt = (
      text: string,
      size: number,
      align: "left" | "center" | "right",
      fromTop: number, // points from the displayed top edge to the baseline
      color = gray,
      opacity = 1,
    ) => {
      const tw = font.widthOfTextAtSize(text, size);
      const dispX = align === "left" ? margin : align === "right" ? Wd - margin - tw : (Wd - tw) / 2;
      const pt = toUserSpace(W, H, rotation, dispX, Hd - fromTop);
      page.drawText(text, { x: pt.x, y: pt.y, size, font, color, opacity, rotate: degrees(rotation) });
    };

    if (stamps.header) drawAt(stamps.header, 9, "center", 22);
    if (stamps.footer) drawAt(stamps.footer, 9, "center", Hd - 14);
    if (stamps.pageNumbers) {
      const text = formatPageNumber(stamps.pageNumbers.format, i, total);
      const pos = stamps.pageNumbers.position;
      if (pos === "top-center") drawAt(text, 10, "center", 22);
      else if (pos === "bottom-left") drawAt(text, 10, "left", Hd - 14);
      else if (pos === "bottom-right") drawAt(text, 10, "right", Hd - 14);
      else drawAt(text, 10, "center", Hd - 14);
    }
    if (stamps.watermark?.text) {
      const text = stamps.watermark.text;
      const size = Math.max(24, Math.min(Wd, Hd) * 0.11);
      const tw = font.widthOfTextAtSize(text, size);
      // Centre of the displayed page, in user space.
      const centre = toUserSpace(W, H, rotation, Wd / 2, Hd / 2);
      // Text direction in user space: 45° up-right in the displayed view.
      const theta = ((rotation + 45) * Math.PI) / 180;
      const dirX = Math.cos(theta);
      const dirY = Math.sin(theta);
      page.drawText(text, {
        x: centre.x - (dirX * tw) / 2,
        y: centre.y - (dirY * tw) / 2 - size * 0.35,
        size,
        font,
        color: rgb(0.6, 0.6, 0.6),
        opacity: stamps.watermark.opacity,
        rotate: degrees(rotation + 45),
      });
    }
  });
}

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
  options?: BuildOptions,
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("No pages to export");
  const out = await PDFDocument.create();

  // Load each source once, copy page-by-page to preserve interleaved order.
  const loaded = new Map<string, PDFDocument>();
  for (const page of pages) {
    if (page.kind === "blank") {
      const blank = out.addPage([page.width, page.height]);
      if (page.rotation) blank.setRotation(degrees(page.rotation));
      if (page.annotations?.length) {
        await drawAnnotations(out, blank, page.annotations, page.width, page.height, page.rotation);
      }
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
    const sourceRotation = copied.getRotation().angle;
    const effective = normaliseRotation(sourceRotation + page.rotation);
    if (page.rotation) {
      copied.setRotation(degrees(effective));
    }
    out.addPage(copied);
    if (page.annotations?.length) {
      await drawAnnotations(
        out,
        copied,
        page.annotations,
        copied.getWidth(),
        copied.getHeight(),
        effective,
      );
    }
  }
  if (options?.stamps) await applyStamps(out, options.stamps);
  return out.save();
}

export async function buildSinglePagePdfs(
  documents: Documents,
  pages: ExportPage[],
  options?: BuildOptions,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const bytes = await buildPdf(documents, [pages[i]], options);
    results.push({ name: `${String(i + 1).padStart(2, "0")}-${shortLabel(pages[i], documents)}`, bytes });
  }
  return results;
}

export async function buildChunkedPdfs(
  documents: Documents,
  pages: ExportPage[],
  chunkSize: number,
  options?: BuildOptions,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  if (chunkSize < 1) throw new Error("Chunk size must be at least 1");
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i += chunkSize) {
    const chunk = pages.slice(i, i + chunkSize);
    const bytes = await buildPdf(documents, chunk, options);
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
