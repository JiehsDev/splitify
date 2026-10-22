"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import UploadZone from "@/components/UploadZone";
import PageThumb from "@/components/PageThumb";
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
  type ExportPage,
} from "@/lib/pdf";

export default function Home() {
  const fileName = useStore((s) => s.fileName);
  const bytes = useStore((s) => s.bytes);
  const pages = useStore((s) => s.pages);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const load = useStore((s) => s.load);
  const reset = useStore((s) => s.reset);
  const setSelection = useStore((s) => s.setSelection);
  const setBusy = useStore((s) => s.setBusy);
  const setError = useStore((s) => s.setError);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [rangeInput, setRangeInput] = useState("");
  const [rangeMsg, setRangeMsg] = useState<string | null>(null);
  const [chunkN, setChunkN] = useState(3);
  const docRef = useRef<{ destroy: () => Promise<void> } | null>(null);

  const selectedCount = pages.filter((p) => p.selected).length;

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setRangeMsg(null);
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setError("That file isn't a PDF.");
        return;
      }
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const { pageCount } = await inspectPdf(buf);
        load(file.name, buf, pageCount);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't open that file.");
      }
    },
    [load, setError],
  );

  // Load the PDF.js document once per file, for thumbnails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!bytes) {
        setDoc(null);
        return;
      }
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        const loaded = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        if (docRef.current) void docRef.current.destroy();
        docRef.current = task;
        setDoc(loaded);
      } catch {
        if (!cancelled) setError("Couldn't render thumbnails for this PDF — extraction may still work if you reload.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, setError]);

  const toExport = (items: typeof pages): ExportPage[] =>
    items.map((p) => ({ sourceIndex: p.sourceIndex, rotation: p.rotation }));

  const runExport = async (label: string, fn: () => Promise<void>) => {
    if (!bytes) return;
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

  const doExtract = () =>
    runExport("Extracting…", async () => {
      const sel = pages.filter((p) => p.selected);
      if (sel.length === 0) throw new Error("Select at least one page first.");
      const out = await buildPdf(bytes!, toExport(sel));
      downloadPdf(out, `${baseNameOf(fileName)}-extract.pdf`);
    });

  const doSplitEach = () =>
    runExport("Splitting…", async () => {
      const files = await buildSinglePagePdfs(bytes!, toExport(pages));
      downloadBlob(await zipPdfs(baseNameOf(fileName), files), `${baseNameOf(fileName)}-pages.zip`);
    });

  const doSplitChunks = () =>
    runExport("Splitting…", async () => {
      const files = await buildChunkedPdfs(bytes!, toExport(pages), chunkN);
      downloadBlob(
        await zipPdfs(baseNameOf(fileName), files),
        `${baseNameOf(fileName)}-chunks-of-${chunkN}.zip`,
      );
    });

  const applyRange = () => {
    const result = parseRange(rangeInput, pages.length ? Math.max(...pages.map((p) => p.sourceIndex)) + 1 : 0);
    // Range numbers refer to original page numbers, which match sourceIndex+1.
    if (result.error) {
      setRangeMsg(result.error);
      return;
    }
    setSelection(result.pages);
    setRangeMsg(
      result.warnings.length
        ? `Applied. ${result.warnings[0]}${result.warnings.length > 1 ? ` (+${result.warnings.length - 1} more)` : ""}`
        : `Selected ${result.pages.length} page${result.pages.length === 1 ? "" : "s"}.`,
    );
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col px-4 pb-40 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>✂️</span>
          <span className="text-xl font-bold tracking-tight text-zinc-900">Splitify</span>
          <span className="hidden rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 sm:inline">
            100% in-browser · files never uploaded
          </span>
        </div>
        {bytes && (
          <button
            type="button"
            onClick={() => {
              reset();
              setRangeInput("");
              setRangeMsg(null);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Open another file
          </button>
        )}
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!bytes ? (
        <main className="mt-6">
          <UploadZone onFile={onFile} />
          <p className="mt-4 text-center text-xs text-zinc-400">
            Split PDF · Extract pages · Split every page · No account, no upload, no page limits
          </p>
        </main>
      ) : (
        <main>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="max-w-full truncate text-base font-semibold text-zinc-800">{fileName}</h1>
            <span className="text-sm text-zinc-500">
              {pages.length} page{pages.length === 1 ? "" : "s"} · {selectedCount} selected
            </span>
          </div>

          {/* Selection controls */}
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
            <div className="flex min-w-56 flex-1 items-center gap-2">
              <input
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyRange()}
                placeholder="Range e.g. 1-3, 5, 8-10"
                aria-label="Page range, for example 1-3, 5"
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
            {rangeMsg && <p className="w-full text-xs text-zinc-500">{rangeMsg}</p>}
          </div>

          {pages.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
              All pages removed. Open another file to start again.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {pages.map((p) => (
                <PageThumb key={p.id} doc={doc} page={p} />
              ))}
            </div>
          )}

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
                {busy === "Extracting…" ? busy : "Extract selected"}
              </button>
              <button
                type="button"
                disabled={!!busy || pages.length === 0}
                onClick={doSplitEach}
                title="Every remaining page as its own PDF, in a zip"
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 disabled:opacity-40"
              >
                Every page → ZIP
              </button>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!!busy || pages.length === 0}
                  onClick={doSplitChunks}
                  title="Chunk remaining pages into groups, in a zip"
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
