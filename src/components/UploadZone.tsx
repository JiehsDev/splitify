"use client";

import { useRef, useState } from "react";

export default function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Open a PDF file"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
        dragging
          ? "border-emerald-500 bg-emerald-50"
          : "border-zinc-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/40"
      }`}
    >
      <div className="text-5xl" aria-hidden>
        ✂️
      </div>
      <p className="text-lg font-semibold text-zinc-800">Drop a PDF here, or tap to open one</p>
      <p className="max-w-md text-sm text-zinc-500">
        Pick the pages you need and save them as a new PDF. Your file never leaves
        this device — everything happens in your browser.
      </p>
      <span className="mt-1 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">
        Open PDF
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
