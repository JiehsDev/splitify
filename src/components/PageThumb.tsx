"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageItem } from "@/lib/store";
import { useStore } from "@/lib/store";

export default function PageThumb({
  doc,
  page,
}: {
  doc: PDFDocumentProxy | null;
  page: PageItem;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const toggle = useStore((s) => s.toggle);
  const rotate = useStore((s) => s.rotate);
  const remove = useStore((s) => s.remove);

  useEffect(() => {
    if (!doc || !wrapRef.current) return;
    const el = wrapRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || renderedRef.current) return;
        renderedRef.current = true;
        (async () => {
          try {
            const pdfPage = await doc.getPage(page.sourceIndex + 1);
            const canvas = canvasRef.current;
            if (!canvas) return;
            const viewport = pdfPage.getViewport({ scale: 0.4, rotation: page.rotation });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
          } catch {
            /* thumbnail failure shouldn't break the grid */
          }
        })();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // re-render when rotation changes
  }, [doc, page.sourceIndex, page.rotation]);

  // If the thumbnail already rendered once, re-render immediately on rotation.
  const firstRotation = useRef(page.rotation);
  useEffect(() => {
    if (firstRotation.current === page.rotation) return;
    firstRotation.current = page.rotation;
    if (!doc || !renderedRef.current) return;
    (async () => {
      try {
        const pdfPage = await doc.getPage(page.sourceIndex + 1);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewport = pdfPage.getViewport({ scale: 0.4, rotation: page.rotation });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
      } catch {
        /* ignore */
      }
    })();
  }, [doc, page.rotation, page.sourceIndex]);

  const pageNo = page.sourceIndex + 1;

  return (
    <div
      ref={wrapRef}
      className={`group relative flex flex-col overflow-hidden rounded-xl border-2 bg-white transition-colors ${
        page.selected ? "border-emerald-500" : "border-zinc-200 opacity-70"
      }`}
    >
      <button
        type="button"
        onClick={() => toggle(page.id)}
        aria-pressed={page.selected}
        aria-label={`Page ${pageNo}, ${page.selected ? "selected" : "not selected"}`}
        className="relative block w-full cursor-pointer"
      >
        <canvas ref={canvasRef} className="h-auto w-full bg-zinc-50" />
        <span
          className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-sm font-bold ${
            page.selected ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-500"
          }`}
        >
          {page.selected ? "✓" : ""}
        </span>
      </button>
      <div className="flex items-center justify-between gap-1 border-t border-zinc-100 px-2 py-1.5">
        <span className="text-xs font-medium text-zinc-600">Page {pageNo}</span>
        <span className="flex gap-1">
          <button
            type="button"
            title="Rotate left"
            aria-label={`Rotate page ${pageNo} left`}
            onClick={() => rotate(page.id, -1)}
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            ⟲
          </button>
          <button
            type="button"
            title="Rotate right"
            aria-label={`Rotate page ${pageNo} right`}
            onClick={() => rotate(page.id, 1)}
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            ⟳
          </button>
          <button
            type="button"
            title="Remove page"
            aria-label={`Remove page ${pageNo}`}
            onClick={() => remove(page.id)}
            className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            🗑
          </button>
        </span>
      </div>
    </div>
  );
}
