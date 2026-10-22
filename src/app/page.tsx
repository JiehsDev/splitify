"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import UploadZone from "@/components/UploadZone";
import PageThumb from "@/components/PageThumb";
import PageEditor from "@/components/PageEditor";
import { useStore } from "@/lib/store";
import { parseRange } from "@/lib/range";
import {
  baseNameOf,
  buildChunkedPdfs,
  buildPdf,
  buildSinglePagePdfs,
  downloadBlob,
  downloadPdf,
  inspectPdf,
  zipPdfs,
  type Documents,
  type ExportPage,
} from "@/lib/pdf";

export default function Home() {
  const sources = useStore((s) => s.sources);
  const pages = useStore((s) => s.pages);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const load = useStore((s) => s.load);
  const addSource = useStore((s) => s.addSource);
  const reset = useStore((s) => s.reset);
  const setSelection = useStore((s) => s.setSelection);
  const setSelectionPositions = useStore((s) => s.setSelectionPositions);
  const insertBlank = useStore((s) => s.insertBlank);
  const setBusy = useStore((s) => s.setBusy);
  const setError = useStore((s) => s.setError);

  const [docs, setDocs] = useState<Record<string, PDFDocumentProxy>>({});
  const [rangeInput, setRangeInput] = useState("");
  const [rangeMsg, setRangeMsg] = useState<string | null>(null);
  const [chunkN, setChunkN] = useState(3);
  const [editingId, setEditingId] = useState<string | null>(null);
  const tasksRef = useRef<Record<string, PDFDocumentLoadingTask>>({});
  const addInputRef = useRef<HTMLInputElement>(null);

  const selectedCount = pages.filter((p) => p.selected).length;
  const primaryName = sources[0]?.fileName ?? "";
  const hasDoc = sources.length > 0;

  const readFile = useCallback(
    async (file: File): Promise<{ bytes: Uint8Array; pageCount: number } | null> => {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setError("That file isn't a PDF.");
        return null;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { pageCount } = await inspectPdf(bytes);
        return { bytes, pageCount };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't open that file.");
        return null;
      }
    },
    [setError],
  );

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setRangeMsg(null);
      const result = await readFile(file);
      if (result) load(file.name, result.bytes, result.pageCount);
    },
    [load, readFile, setError],
  );

  const onAddFile = useCallback(
    async (file: File) => {
      setError(null);
      const result = await readFile(file);
      if (result) addSource(file.name, result.bytes, result.pageCount);
    },
    [addSource, readFile, setError],
  );

  // Load a PDF.js document for each source, for thumbnails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = sources.filter((src) => !tasksRef.current[src.id]);
      if (missing.length === 0) return;
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      for (const src of missing) {
        const task = pdfjs.getDocument({ data: new Uint8Array(src.bytes) });
        tasksRef.current[src.id] = task;
        try {
          const loaded = await task.promise;
          if (!cancelled) setDocs((d) => ({ ...d, [src.id]: loaded }));
        } catch {
          if (!cancelled) setError("Couldn't render thumbnails for one PDF — exports still work.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sources, setError]);

  // Clear rendered docs when everything is reset.
  useEffect(() => {
    if (sources.length === 0 && Object.keys(tasksRef.current).length > 0) {
      for (const task of Object.values(tasksRef.current)) void task.destroy();
      tasksRef.current = {};
      setDocs({});
    }
  }, [sources]);

  const documents = useCallback((): Documents => {
    const out: Documents = {};
    for (const src of sources) out[src.id] = src.bytes;
    return out;
  }, [sources]);

  const toExport = (items: typeof pages): ExportPage[] =>
    items.map((p) =>
      p.kind === "blank"
        ? {
            kind: "blank" as const,
            width: p.width ?? 595.28,
            height: p.height ?? 841.89,
            rotation: p.rotation,
            annotations: p.annotations,
          }
        : {
            kind: "pdf" as const,
            sourceId: p.sourceId!,
            sourceIndex: p.sourceIndex!,
            rotation: p.rotation,
            annotations: p.annotations,
          },
    );

  const runExport = async (label: string, fn: () => Promise<void>) => {
    if (!hasDoc) return;
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const base = () => baseNameOf(primaryName);

  const doExtract = () =>
    runExport("Extracting…", async () => {
      const sel = pages.filter((p) => p.selected);
      if (sel.length === 0) throw new Error("Select at least one page first.");
      const out = await buildPdf(documents(), toExport(sel));
      downloadPdf(out, `${base()}-extract.pdf`);
    });

  const doSplitEach = () =>
    runExport("Splitting…", async () => {
      const files = await buildSinglePagePdfs(documents(), toExport(pages));
      downloadBlob(await zipPdfs(base(), files), `${base()}-pages.zip`);
    });

  const doSplitChunks = () =>
    runExport("Splitting…", async () => {
      const files = await buildChunkedPdfs(documents(), toExport(pages), chunkN);
      downloadBlob(await zipPdfs(base(), files), `${base()}-chunks-of-${chunkN}.zip`);
    });

  const doDownloadAll = () =>
    runExport("Building…", async () => {
      const out = await buildPdf(documents(), toExport(pages));
      downloadPdf(out, `${base()}-all-pages.pdf`);
    });

  const applyRange = () => {
    const result = parseRange(rangeInput, pages.length);
    if (result.error) {
      setRangeMsg(result.error);
      return;
    }
    setSelectionPositions(result.pages);
    setRangeMsg(
      result.warnings.length
        ? `Applied. ${result.warnings[0]}${result.warnings.length > 1 ? ` (+${result.warnings.length - 1} more)` : ""}`
        : `Selected ${result.pages.length} position${result.pages.length === 1 ? "" : "s"}.`,
    );
  };

  const multiSource = sources.length > 1;
  const sourceShort = (id?: string) => {
    const src = sources.find((s) => s.id === id);
    if (!src) return undefined;
    const name = src.fileName.replace(/\.pdf$/i, "");
    return name.length > 10 ? `${name.slice(0, 10)}…` : name;
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col px-4 pb-44 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>✂️</span>
          <span className="text-xl font-bold tracking-tight text-zinc-900">Splitify</span>
          <span className="hidden rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 sm:inline">
            100% in-browser · files never uploaded
          </span>
        </div>
        {hasDoc && (
          <button
            type="button"
            onClick={() => {
              reset();
              setRangeInput("");
              setRangeMsg(null);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Start over
          </button>
        )}
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!hasDoc ? (
        <main className="mt-6">
          <UploadZone onFile={onFile} />
          <p className="mt-4 text-center text-xs text-zinc-400">
            Split · Merge · Reorder · Extract pages · No account, no upload, no page limits
          </p>
        </main>
      ) : (
        <main>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="max-w-full truncate text-base font-semibold text-zinc-800">
              {sources.map((s) => s.fileName).join("  +  ")}
            </h1>
            <span className="text-sm text-zinc-500">
              {pages.length} page{pages.length === 1 ? "" : "s"} · {selectedCount} selected · drag cards to reorder
            </span>
          </div>

          {/* Selection + page tools */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex gap-1">
              {(["all", "none", "invert", "even", "odd"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSelection(mode)}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium capitalize text-zinc-700 hover:bg-zinc-200"
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="flex min-w-52 flex-1 items-center gap-2">
              <input
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyRange()}
                placeholder="Positions e.g. 1-3, 5, 8-10"
                aria-label="Page positions, for example 1-3, 5"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={applyRange}
                className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Apply
              </button>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                ＋ Add PDF (merge)
              </button>
              <button
                type="button"
                onClick={() => insertBlank()}
                className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
              >
                ＋ Blank page
              </button>
              <input
                ref={addInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onAddFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            {rangeMsg && <p className="w-full text-xs text-zinc-500">{rangeMsg}</p>}
          </div>

          {pages.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
              All pages removed. Start over to load a PDF again.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {pages.map((p, idx) => (
                <PageThumb
                  key={p.id}
                  doc={p.sourceId ? (docs[p.sourceId] ?? null) : null}
                  page={p}
                  position={idx + 1}
                  sourceLabel={multiSource ? sourceShort(p.sourceId) : undefined}
                  onAnnotate={setEditingId}
                />
              ))}
            </div>
          )}

          {editingId &&
            (() => {
              const idx = pages.findIndex((p) => p.id === editingId);
              if (idx === -1) return null;
              const p = pages[idx];
              return (
                <PageEditor
                  page={p}
                  doc={p.sourceId ? (docs[p.sourceId] ?? null) : null}
                  position={idx + 1}
                  onClose={() => setEditingId(null)}
                />
              );
            })()}

          {/* Sticky action bar */}
          <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
              <span className="text-sm font-medium text-zinc-700">
                {selectedCount} of {pages.length} selected
              </span>
              <span className="mx-1 hidden h-5 w-px bg-zinc-200 sm:block" />
              <button
                type="button"
                disabled={!!busy || selectedCount === 0}
                onClick={doExtract}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Extract selected
              </button>
              <button
                type="button"
                disabled={!!busy || pages.length === 0}
                onClick={doDownloadAll}
                title="Download all pages in the current order as one PDF (use after reordering/merging)"
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Download all in order
              </button>
              <button
                type="button"
                disabled={!!busy || pages.length === 0}
                onClick={doSplitEach}
                title="Every page in the current list as its own PDF, in a zip"
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 disabled:opacity-40"
              >
                Every page → ZIP
              </button>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!!busy || pages.length === 0}
                  onClick={doSplitChunks}
                  title="Chunk pages in the current order into groups, in a zip"
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 disabled:opacity-40"
                >
                  Every
                </button>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={chunkN}
                  onChange={(e) => setChunkN(Math.max(1, parseInt(e.target.value || "1", 10)))}
                  aria-label="Pages per chunk"
                  className="w-14 rounded-lg border border-zinc-300 px-2 py-2 text-sm"
                />
                <span className="text-sm text-zinc-600">pages → ZIP</span>
              </span>
              {busy && <span className="text-sm text-zinc-500">{busy}</span>}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
