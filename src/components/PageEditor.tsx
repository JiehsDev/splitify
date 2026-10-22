"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageItem } from "@/lib/store";
import { useStore, nextId } from "@/lib/store";
import type { Annotation } from "@/lib/annotations";

type Tool = "text" | "draw" | "highlight" | "image" | "whiteout";

export default function PageEditor({
  page,
  doc,
  position,
  onClose,
}: {
  page: PageItem;
  doc: PDFDocumentProxy | null;
  position: number;
  onClose: () => void;
}) {
  const annotations = useStore(
    (s) => s.pages.find((p) => p.id === page.id)?.annotations ?? [],
  );
  const addAnnotation = useStore((s) => s.addAnnotation);
  const undoAnnotation = useStore((s) => s.undoAnnotation);
  const clearAnnotations = useStore((s) => s.clearAnnotations);

  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sigRef = useRef<HTMLCanvasElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>("text");
  const [color, setColor] = useState("#cc0000");
  const [textDraft, setTextDraft] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [showSig, setShowSig] = useState(false);
  const strokeRef = useRef<{ x: number; y: number }[] | null>(null);
  const rectRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const sigStroke = useRef(false);
  const pendingImageAt = useRef<{ x: number; y: number }>({ x: 0.35, y: 0.4 });

  const isBlank = page.kind === "blank";

  // ---- Render the page itself ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = baseRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const maxW = Math.min(window.innerWidth - 24, 860);
      if (isBlank) {
        const w = page.width ?? 595;
        const h = page.height ?? 842;
        const scale = maxW / w;
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!cancelled) setSize({ w: canvas.width, h: canvas.height });
        return;
      }
      if (!doc || page.sourceIndex === undefined) return;
      const pdfPage = await doc.getPage(page.sourceIndex + 1);
      const unscaled = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
      const viewport = pdfPage.getViewport({ scale: maxW / unscaled.width, rotation: page.rotation });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
      if (!cancelled) setSize({ w: canvas.width, h: canvas.height });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page.id]);

  // ---- Draw annotations onto the overlay ----
  const redraw = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || !size) return;
    if (canvas.width !== size.w) canvas.width = size.w;
    if (canvas.height !== size.h) canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size.w, size.h);

    const drawAnn = (ann: Annotation) => {
      if (ann.type === "text") {
        ctx.fillStyle = ann.color;
        ctx.font = `${Math.round(ann.sizeFrac * size.h)}px Helvetica, Arial, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(ann.text, ann.x * size.w, ann.y * size.h);
      } else if (ann.type === "path") {
        if (ann.points.length === 0) return;
        ctx.strokeStyle = ann.color;
        ctx.globalAlpha = ann.opacity;
        ctx.lineWidth = Math.max(1, ann.widthFrac * size.w);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x * size.w, ann.points[0].y * size.h);
        for (const p of ann.points.slice(1)) ctx.lineTo(p.x * size.w, p.y * size.h);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (ann.type === "rect") {
        ctx.fillStyle = ann.color;
        ctx.globalAlpha = ann.opacity;
        ctx.fillRect(ann.x * size.w, ann.y * size.h, ann.w * size.w, ann.h * size.h);
        ctx.globalAlpha = 1;
      } else if (ann.type === "image") {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, ann.x * size.w, ann.y * size.h, ann.w * size.w, ann.h * size.h);
        };
        img.src = ann.dataUrl;
      }
    };
    for (const ann of annotations) drawAnn(ann);
    if (rectRef.current) {
      const r = rectRef.current;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1;
      const x = Math.min(r.x0, r.x1) * size.w;
      const y = Math.min(r.y0, r.y1) * size.h;
      const w = Math.abs(r.x1 - r.x0) * size.w;
      const h = Math.abs(r.y1 - r.y0) * size.h;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    if (strokeRef.current && strokeRef.current.length > 0) {
      drawAnn({
        id: "draft",
        type: "path",
        points: strokeRef.current,
        color: tool === "highlight" ? "#ffe600" : color,
        widthFrac: tool === "highlight" ? 0.03 : 0.006,
        opacity: tool === "highlight" ? 0.35 : 1,
      });
    }
  }, [annotations, size, color, tool]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // ---- Pointer handling ----
  const frac = (e: React.PointerEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = frac(e);
    if (tool === "whiteout") {
      rectRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      (e.target as Element).setPointerCapture(e.pointerId);
      redraw();
    } else if (tool === "draw" || tool === "highlight") {
      strokeRef.current = [p];
      (e.target as Element).setPointerCapture(e.pointerId);
      redraw();
    } else if (tool === "text") {
      setTextDraft(p);
      setTextValue("");
    } else if (tool === "image") {
      pendingImageAt.current = p;
      imgInputRef.current?.click();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (rectRef.current) {
      const p = frac(e);
      rectRef.current.x1 = p.x;
      rectRef.current.y1 = p.y;
      redraw();
      return;
    }
    if (!strokeRef.current) return;
    const p = frac(e);
    const last = strokeRef.current[strokeRef.current.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.003) return;
    strokeRef.current.push(p);
    redraw();
  };

  const onPointerUp = () => {
    if (rectRef.current) {
      const r = rectRef.current;
      rectRef.current = null;
      const x = Math.min(r.x0, r.x1);
      const y = Math.min(r.y0, r.y1);
      const w = Math.abs(r.x1 - r.x0);
      const h = Math.abs(r.y1 - r.y0);
      if (w > 0.005 && h > 0.005) {
        addAnnotation(page.id, {
          id: nextId("a"),
          type: "rect",
          x,
          y,
          w,
          h,
          color: "#ffffff",
          opacity: 1,
        });
      }
      redraw();
      return;
    }
    if (!strokeRef.current) return;
    const points = strokeRef.current;
    strokeRef.current = null;
    if (points.length > 1) {
      addAnnotation(page.id, {
        id: nextId("a"),
        type: "path",
        points,
        color: tool === "highlight" ? "#ffe600" : color,
        widthFrac: tool === "highlight" ? 0.03 : 0.006,
        opacity: tool === "highlight" ? 0.35 : 1,
      });
    }
    redraw();
  };

  const commitText = () => {
    if (textDraft && textValue.trim()) {
      addAnnotation(page.id, {
        id: nextId("a"),
        type: "text",
        x: textDraft.x,
        y: textDraft.y,
        text: textValue.trim(),
        sizeFrac: 0.035,
        color,
      });
    }
    setTextDraft(null);
    setTextValue("");
  };

  const onImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        if (!size) return;
        const wFrac = 0.3;
        const hFrac = wFrac * (size.w / size.h) * (img.height / img.width);
        addAnnotation(page.id, {
          id: nextId("a"),
          type: "image",
          x: Math.min(pendingImageAt.current.x, 1 - wFrac),
          y: Math.min(pendingImageAt.current.y, 1 - hFrac),
          w: wFrac,
          h: hFrac,
          dataUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // ---- Signature pad ----
  const sigPoint = (e: React.PointerEvent) => {
    const rect = sigRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * sigRef.current!.width,
      y: ((e.clientY - rect.top) / rect.height) * sigRef.current!.height,
    };
  };
  const sigDown = (e: React.PointerEvent) => {
    sigStroke.current = true;
    const ctx = sigRef.current!.getContext("2d")!;
    const p = sigPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const sigMove = (e: React.PointerEvent) => {
    if (!sigStroke.current) return;
    const ctx = sigRef.current!.getContext("2d")!;
    const p = sigPoint(e);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const sigClear = () => {
    const c = sigRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  };
  const sigUse = () => {
    const c = sigRef.current;
    if (!c || !size) return;
    const dataUrl = c.toDataURL("image/png");
    const wFrac = 0.35;
    const hFrac = wFrac * (size.w / size.h) * (c.height / c.width);
    addAnnotation(page.id, {
      id: nextId("a"),
      type: "image",
      x: 0.6,
      y: Math.max(0, 0.92 - hFrac),
      w: wFrac,
      h: hFrac,
      dataUrl,
    });
    setShowSig(false);
  };

  const toolBtn = (t: Tool, label: string) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        tool === t ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-900/70 p-3 sm:p-6">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3">
          <span className="mr-1 text-sm font-semibold text-zinc-800">
            Annotate — page {position}
          </span>
          {toolBtn("text", "T Text")}
          {toolBtn("draw", "✎ Draw")}
          {toolBtn("highlight", "🖍 Highlight")}
          {toolBtn("image", "🖼 Image")}
          {toolBtn("whiteout", "⬜ White-out")}
          <button
            type="button"
            onClick={() => setShowSig(true)}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
          >
            ✍ Signature
          </button>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Annotation colour"
            className="h-9 w-10 cursor-pointer rounded border border-zinc-200 bg-white"
          />
          <span className="mx-1 h-5 w-px bg-zinc-200" />
          <button
            type="button"
            onClick={() => undoAnnotation(page.id)}
            disabled={annotations.length === 0}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => clearAnnotations(page.id)}
            disabled={annotations.length === 0}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Done
          </button>
        </div>

        <p className="px-3 pt-2 text-xs text-zinc-500">
          {tool === "text" && "Tap where the text should start, type, press Enter."}
          {(tool === "draw" || tool === "highlight") && "Draw on the page with your finger or mouse."}
          {tool === "image" && "Tap where the image's top-left corner should go, then pick an image."}
          {tool === "whiteout" && "Drag a box over the text you want to cover — then use the Text tool to type over it."}
          {" "}Annotations are flattened into the PDF when you export.
        </p>

        <div className="flex justify-center p-3">
          <div className="relative shadow-md" style={size ? { width: size.w, height: size.h } : undefined}>
            <canvas ref={baseRef} className="block" />
            <canvas
              ref={overlayRef}
              width={size?.w ?? 300}
              height={size?.h ?? 300}
              className="absolute left-0 top-0 touch-none"
              style={{ cursor: tool === "text" || tool === "image" ? "crosshair" : "default" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {textDraft && size && (
              <input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") setTextDraft(null);
                }}
                onBlur={commitText}
                placeholder="Type, then Enter"
                className="absolute z-10 min-w-40 rounded border-2 border-emerald-500 bg-white/95 px-1 outline-none"
                style={{
                  left: textDraft.x * size.w,
                  top: textDraft.y * size.h,
                  fontSize: Math.round(0.035 * size.h),
                  color,
                }}
              />
            )}
          </div>
        </div>

        <input
          ref={imgInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImageFile(f);
            e.target.value = "";
          }}
        />

        {showSig && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-zinc-800">Draw your signature</p>
              <canvas
                ref={sigRef}
                width={480}
                height={180}
                className="w-full touch-none rounded-lg border border-zinc-300 bg-white"
                onPointerDown={sigDown}
                onPointerMove={sigMove}
                onPointerUp={() => (sigStroke.current = false)}
              />
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={sigClear} className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700">
                  Clear
                </button>
                <button type="button" onClick={() => setShowSig(false)} className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700">
                  Cancel
                </button>
                <button type="button" onClick={sigUse} className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                  Place signature
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
