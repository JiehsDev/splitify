import { create } from "zustand";

export type Rotation = 0 | 90 | 180 | 270;

export interface PageItem {
  id: string;
  /** 0-based index into the source PDF */
  sourceIndex: number;
  selected: boolean;
  rotation: Rotation;
}

interface SplitifyState {
  fileName: string;
  bytes: Uint8Array | null;
  pages: PageItem[];
  busy: string | null;
  error: string | null;
  load: (fileName: string, bytes: Uint8Array, pageCount: number) => void;
  reset: () => void;
  toggle: (id: string) => void;
  setSelection: (oneBasedPages: number[] | "all" | "none" | "invert" | "even" | "odd") => void;
  rotate: (id: string, dir: 1 | -1) => void;
  remove: (id: string) => void;
  setBusy: (busy: string | null) => void;
  setError: (error: string | null) => void;
}

let counter = 0;
const nextId = () => `p${++counter}`;

export const useStore = create<SplitifyState>((set) => ({
  fileName: "",
  bytes: null,
  pages: [],
  busy: null,
  error: null,

  load: (fileName, bytes, pageCount) =>
    set({
      fileName,
      bytes,
      error: null,
      pages: Array.from({ length: pageCount }, (_, i) => ({
        id: nextId(),
        sourceIndex: i,
        selected: true,
        rotation: 0 as Rotation,
      })),
    }),

  reset: () => set({ fileName: "", bytes: null, pages: [], busy: null, error: null }),

  toggle: (id) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)),
    })),

  setSelection: (sel) =>
    set((s) => ({
      pages: s.pages.map((p, idx) => {
        const pageNo = p.sourceIndex + 1;
        let selected = p.selected;
        if (sel === "all") selected = true;
        else if (sel === "none") selected = false;
        else if (sel === "invert") selected = !p.selected;
        else if (sel === "even") selected = pageNo % 2 === 0;
        else if (sel === "odd") selected = pageNo % 2 === 1;
        else if (Array.isArray(sel)) selected = sel.includes(pageNo);
        void idx;
        return { ...p, selected };
      }),
    })),

  rotate: (id, dir) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === id
          ? { ...p, rotation: (((p.rotation + dir * 90) % 360 + 360) % 360) as Rotation }
          : p,
      ),
    })),

  remove: (id) => set((s) => ({ pages: s.pages.filter((p) => p.id !== id) })),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

export function selectedPages(s: SplitifyState): PageItem[] {
  return s.pages.filter((p) => p.selected);
}
