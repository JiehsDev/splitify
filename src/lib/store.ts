import { create } from "zustand";
import type { Annotation } from "./annotations";

export type { Annotation };
export type Rotation = 0 | 90 | 180 | 270;

export interface SourceDoc {
  id: string;
  fileName: string;
  bytes: Uint8Array;
  pageCount: number;
}

export interface PageItem {
  id: string;
  kind: "pdf" | "blank";
  /** for kind="pdf": which source document */
  sourceId?: string;
  /** for kind="pdf": 0-based index into that source */
  sourceIndex?: number;
  /** for kind="blank": page size in points */
  width?: number;
  height?: number;
  selected: boolean;
  rotation: Rotation;
  annotations: Annotation[];
}

interface SplitifyState {
  sources: SourceDoc[];
  pages: PageItem[];
  busy: string | null;
  error: string | null;
  load: (fileName: string, bytes: Uint8Array, pageCount: number) => void;
  addSource: (fileName: string, bytes: Uint8Array, pageCount: number) => void;
  reset: () => void;
  toggle: (id: string) => void;
  setSelection: (mode: "all" | "none" | "invert" | "even" | "odd") => void;
  /** positions are 1-based positions in the current list order */
  setSelectionPositions: (positions: number[]) => void;
  rotate: (id: string, dir: 1 | -1) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  move: (id: string, dir: 1 | -1) => void;
  moveTo: (draggedId: string, targetId: string) => void;
  insertBlank: (afterId?: string) => void;
  addAnnotation: (pageId: string, annotation: Annotation) => void;
  undoAnnotation: (pageId: string) => void;
  clearAnnotations: (pageId: string) => void;
  setBusy: (busy: string | null) => void;
  setError: (error: string | null) => void;
}

let counter = 0;
export const nextId = (prefix: string) => `${prefix}${++counter}`;

function pagesForSource(sourceId: string, pageCount: number): PageItem[] {
  return Array.from({ length: pageCount }, (_, i) => ({
    id: nextId("p"),
    kind: "pdf" as const,
    sourceId,
    sourceIndex: i,
    selected: true,
    rotation: 0 as Rotation,
    annotations: [],
  }));
}

export const useStore = create<SplitifyState>((set) => ({
  sources: [],
  pages: [],
  busy: null,
  error: null,

  load: (fileName, bytes, pageCount) => {
    const sourceId = nextId("src");
    set({
      sources: [{ id: sourceId, fileName, bytes, pageCount }],
      pages: pagesForSource(sourceId, pageCount),
      error: null,
    });
  },

  addSource: (fileName, bytes, pageCount) => {
    const sourceId = nextId("src");
    set((s) => ({
      sources: [...s.sources, { id: sourceId, fileName, bytes, pageCount }],
      pages: [...s.pages, ...pagesForSource(sourceId, pageCount)],
      error: null,
    }));
  },

  reset: () => set({ sources: [], pages: [], busy: null, error: null }),

  toggle: (id) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)),
    })),

  setSelection: (mode) =>
    set((s) => ({
      pages: s.pages.map((p, idx) => {
        const position = idx + 1;
        let selected = p.selected;
        if (mode === "all") selected = true;
        else if (mode === "none") selected = false;
        else if (mode === "invert") selected = !p.selected;
        else if (mode === "even") selected = position % 2 === 0;
        else if (mode === "odd") selected = position % 2 === 1;
        return { ...p, selected };
      }),
    })),

  setSelectionPositions: (positions) =>
    set((s) => ({
      pages: s.pages.map((p, idx) => ({ ...p, selected: positions.includes(idx + 1) })),
    })),

  rotate: (id, dir) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === id
          ? { ...p, rotation: (((p.rotation + dir * 90) % 360) + 360) % 360 as Rotation }
          : p,
      ),
    })),

  remove: (id) => set((s) => ({ pages: s.pages.filter((p) => p.id !== id) })),

  duplicate: (id) =>
    set((s) => {
      const idx = s.pages.findIndex((p) => p.id === id);
      if (idx === -1) return s;
      const copy: PageItem = {
        ...s.pages[idx],
        id: nextId("p"),
        annotations: [...s.pages[idx].annotations],
      };
      const pages = [...s.pages];
      pages.splice(idx + 1, 0, copy);
      return { pages };
    }),

  move: (id, dir) =>
    set((s) => {
      const idx = s.pages.findIndex((p) => p.id === id);
      const swap = idx + dir;
      if (idx === -1 || swap < 0 || swap >= s.pages.length) return s;
      const pages = [...s.pages];
      [pages[idx], pages[swap]] = [pages[swap], pages[idx]];
      return { pages };
    }),

  moveTo: (draggedId, targetId) =>
    set((s) => {
      const from = s.pages.findIndex((p) => p.id === draggedId);
      const to = s.pages.findIndex((p) => p.id === targetId);
      if (from === -1 || to === -1 || from === to) return s;
      const pages = [...s.pages];
      const [item] = pages.splice(from, 1);
      pages.splice(to, 0, item);
      return { pages };
    }),

  insertBlank: (afterId) =>
    set((s) => {
      // Match the size of a neighbouring pdf page's common default: A4.
      // (Exact neighbour sizes need pdf.js page info; A4 is the sane default,
      // users export mostly A4 documents.)
      const blank: PageItem = {
        id: nextId("p"),
        kind: "blank",
        width: 595.28,
        height: 841.89,
        selected: true,
        rotation: 0,
        annotations: [],
      };
      if (!afterId) return { pages: [...s.pages, blank] };
      const idx = s.pages.findIndex((p) => p.id === afterId);
      if (idx === -1) return { pages: [...s.pages, blank] };
      const pages = [...s.pages];
      pages.splice(idx + 1, 0, blank);
      return { pages };
    }),

  addAnnotation: (pageId, annotation) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId ? { ...p, annotations: [...p.annotations, annotation] } : p,
      ),
    })),

  undoAnnotation: (pageId) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId ? { ...p, annotations: p.annotations.slice(0, -1) } : p,
      ),
    })),

  clearAnnotations: (pageId) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === pageId ? { ...p, annotations: [] } : p)),
    })),

  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));
