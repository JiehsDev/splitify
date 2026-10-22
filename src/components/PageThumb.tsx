"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageItem } from "@/lib/store";
import { useStore } from "@/lib/store";

export default function PageThumb({
  doc,
  page,
  position,
  sourceLabel,
  onAnnotate,
}: {
  doc: PDFDocumentProxy | null;
  page: PageItem;
  /** 1-based position in the current list */
  position: number;
  /** short source file name, shown when there are multiple sources */
  sourceLabel?: string;
  onAnnotate?: (pageId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const toggle = useStore((s) => s.toggle);
  const rotate = useStore((s) => s.rotate);
  const remove = useStore((s) => s.remove);
  const duplicate = useStore((s) => s.duplicate);
  const move = useStore((s) => s.move);
  const moveTo = useStore((s) => s.moveTo);

  const isBlank = page.kind === "blank";

  async function renderPage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (isBlank) {
      const scale = 0.4;
      canvas.width = (page.width ?? 595) * scale;
      canvas.height = (page.height ?? 842) * scale;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Blank page", canvas.width / 2, canvas.height / 2);
      return;
    }
    if (!doc || page.sourceIndex === undefined) return;
    const pdfPage = await doc.getPage(page.sourceIndex + 1);
    const viewport = pdfPage.getViewport({ scale: 0.4, rotation: page.rotation });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
  }

  useEffect(() => {
    if (!wrapRef.current) return;
    if (isBlank) {
      void renderPage();
      renderedRef.current = true;
      return;
    }
    if (!doc) return;
    const el = wrapRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || renderedRef.current) return;
        renderedRef.current = true;
        void renderPage().catch(() => {});
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page.sourceIndex, isBlank]);

  // Re-render immediately on rotation if already rendered once.
  const firstRotation = useRef(page.rotation);
  useEffect(() => {
    if (firstRotation.current === page.rotation) return;
    firstRotation.current = page.rotation;
    if (!renderedRef.current) return;
    void renderPage().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.rotation]);

  const btn =
    "rounded-md px-1.5 py-1 text-[13px] leading-none text-zinc-600 hover:bg-zinc-100";

  return (
    <div
      ref={wrapRef}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/splitify-page", page.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/splitify-page");
        if (draggedId) moveTo(draggedId, page.id);
      }}
      title="Drag to reorder"
      className={`relative flex cursor-grab flex-col overflow-hidden rounded-xl border-2 bg-white active:cursor-grabbing ${
        page.selected ? "border-emerald-500" : "border-zinc-200 opacity-70"
      }`}
    >
      <button
        type="button"
        onClick={() => toggle(page.id)}
        aria-pressed={page.selected}
        aria-label={`Position ${position}, ${page.selected ? "selected" : "not selected"}`}
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
      <div className="border-t border-zinc-100 px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-xs font-medium text-zinc-600">
            {position}
            {isBlank
              ? " · Blank"
              : ` · p${(page.sourceIndex ?? 0) + 1}${sourceLabel ? ` · ${sourceLabel}` : ""}`}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-0.5">
          <button type="button" title="Move left" aria-label="Move left" onClick={() => move(page.id, -1)} className={btn}>⬅</button>
          <button type="button" title="Move right" aria-label="Move right" onClick={() => move(page.id, 1)} className={btn}>➡</button>
          <button type="button" title="Rotate left" aria-label="Rotate left" onClick={() => rotate(page.id, -1)} className={btn}>⟲</button>
          <button type="button" title="Rotate right" aria-label="Rotate right" onClick={() => rotate(page.id, 1)} className={btn}>⟳</button>
          <button type="button" title="Duplicate page" aria-label="Duplicate page" onClick={() => duplicate(page.id)} className={btn}>⧉</button>
          <button type="button" title="Annotate / sign this page" aria-label="Annotate page" onClick={() => onAnnotate?.(page.id)} className={`${btn} font-semibold text-emerald-700 hover:bg-emerald-50`}>
            ✎{page.annotations.length > 0 ? ` ${page.annotations.length}` : ""}
          </button>
          <button type="button" title="Remove page" aria-label="Remove page" onClick={() => remove(page.id)} className={`${btn} text-red-600 hover:bg-red-50`}>🗑</button>
        </div>
      </div>
    </div>
  );
}
