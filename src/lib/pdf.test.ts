import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildPdf, buildSinglePagePdfs, buildChunkedPdfs } from "./pdf";

async function makeTestPdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const page = doc.addPage([300, 300]);
    page.drawText(`Page ${i}`, { x: 40, y: 160, size: 24, font });
  }
  return doc.save();
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("buildPdf — extraction", () => {
  it("extracts pages 2,5-7 of 10 in order", async () => {
    const src = await makeTestPdf(10);
    const out = await buildPdf(src, [
      { sourceIndex: 1, rotation: 0 },
      { sourceIndex: 4, rotation: 0 },
      { sourceIndex: 5, rotation: 0 },
      { sourceIndex: 6, rotation: 0 },
    ]);
    expect(await pageCount(out)).toBe(4);
  });

  it("applies user rotation on top of existing", async () => {
    const src = await makeTestPdf(3);
    const out = await buildPdf(src, [{ sourceIndex: 0, rotation: 90 }]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  it("throws on empty page list", async () => {
    const src = await makeTestPdf(2);
    await expect(buildPdf(src, [])).rejects.toThrow();
  });
});

describe("split modes", () => {
  it("split-every-page gives one 1-page PDF per page", async () => {
    const src = await makeTestPdf(5);
    const pages = [0, 1, 2, 3, 4].map((i) => ({ sourceIndex: i, rotation: 0 as const }));
    const files = await buildSinglePagePdfs(src, pages);
    expect(files).toHaveLength(5);
    for (const f of files) expect(await pageCount(f.bytes)).toBe(1);
  });

  it("split every 3 gives chunks of 3,3,1 for 7 pages", async () => {
    const src = await makeTestPdf(7);
    const pages = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ sourceIndex: i, rotation: 0 as const }));
    const chunks = await buildChunkedPdfs(src, pages, 3);
    expect(chunks).toHaveLength(3);
    expect(await pageCount(chunks[0].bytes)).toBe(3);
    expect(await pageCount(chunks[1].bytes)).toBe(3);
    expect(await pageCount(chunks[2].bytes)).toBe(1);
  });
});
