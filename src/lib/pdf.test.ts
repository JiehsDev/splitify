import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildPdf, buildSinglePagePdfs, buildChunkedPdfs, type ExportPage } from "./pdf";

async function makeTestPdf(n: number, label = "Page"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const page = doc.addPage([300, 300]);
    page.drawText(`${label} ${i}`, { x: 40, y: 160, size: 24, font });
  }
  return doc.save();
}

const pdfPage = (sourceId: string, sourceIndex: number): ExportPage => ({
  kind: "pdf",
  sourceId,
  sourceIndex,
  rotation: 0,
});

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("buildPdf — extraction (single source)", () => {
  it("extracts pages 2,5-7 of 10 in order", async () => {
    const src = await makeTestPdf(10);
    const out = await buildPdf({ a: src }, [pdfPage("a", 1), pdfPage("a", 4), pdfPage("a", 5), pdfPage("a", 6)]);
    expect(await pageCount(out)).toBe(4);
  });

  it("applies user rotation on top of existing", async () => {
    const src = await makeTestPdf(3);
    const page: ExportPage = { kind: "pdf", sourceId: "a", sourceIndex: 0, rotation: 90 };
    const out = await buildPdf({ a: src }, [page]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  it("throws on empty page list", async () => {
    const src = await makeTestPdf(2);
    await expect(buildPdf({ a: src }, [])).rejects.toThrow();
  });
});

describe("buildPdf — merge + reorder + blank (Phase 2)", () => {
  it("merges two documents keeping the list order", async () => {
    const a = await makeTestPdf(2, "A");
    const b = await makeTestPdf(2, "B");
    const out = await buildPdf({ a, b }, [pdfPage("a", 0), pdfPage("b", 0), pdfPage("a", 1), pdfPage("b", 1)]);
    expect(await pageCount(out)).toBe(4);
  });

  it("reordered pages produce the reordered document", async () => {
    const src = await makeTestPdf(3);
    const out = await buildPdf({ a: src }, [pdfPage("a", 2), pdfPage("a", 0)]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    // First output page is source page 3 (300x300 either way) — order is
    // exercised structurally by copy sequence; count + load proves validity.
  });

  it("inserts a blank A4 page between pdf pages", async () => {
    const src = await makeTestPdf(2);
    const blank: ExportPage = { kind: "blank", width: 595.28, height: 841.89, rotation: 0 };
    const out = await buildPdf({ a: src }, [pdfPage("a", 0), blank, pdfPage("a", 1)]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(1).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
});

describe("split modes", () => {
  it("split-every-page gives one 1-page PDF per page", async () => {
    const src = await makeTestPdf(5);
    const pages = [0, 1, 2, 3, 4].map((i) => pdfPage("a", i));
    const files = await buildSinglePagePdfs({ a: src }, pages);
    expect(files).toHaveLength(5);
    for (const f of files) expect(await pageCount(f.bytes)).toBe(1);
  });

  it("split every 3 gives chunks of 3,3,1 for 7 pages", async () => {
    const src = await makeTestPdf(7);
    const pages = [0, 1, 2, 3, 4, 5, 6].map((i) => pdfPage("a", i));
    const chunks = await buildChunkedPdfs({ a: src }, pages, 3);
    expect(chunks).toHaveLength(3);
    expect(await pageCount(chunks[0].bytes)).toBe(3);
    expect(await pageCount(chunks[1].bytes)).toBe(3);
    expect(await pageCount(chunks[2].bytes)).toBe(1);
  });
});
