import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "./store";

const bytes = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  useStore.getState().reset();
});

describe("store — merge, reorder, duplicate, blank", () => {
  it("load creates selected pages for one source", () => {
    useStore.getState().load("a.pdf", bytes, 3);
    const s = useStore.getState();
    expect(s.sources).toHaveLength(1);
    expect(s.pages).toHaveLength(3);
    expect(s.pages.every((p) => p.selected)).toBe(true);
  });

  it("addSource appends the second document's pages (merge)", () => {
    const st = useStore.getState();
    st.load("a.pdf", bytes, 2);
    st.addSource("b.pdf", bytes, 3);
    const s = useStore.getState();
    expect(s.sources).toHaveLength(2);
    expect(s.pages).toHaveLength(5);
    expect(s.pages[4].sourceId).toBe(s.sources[1].id);
    expect(s.pages[4].sourceIndex).toBe(2);
  });

  it("move swaps neighbours and stops at the ends", () => {
    const st = useStore.getState();
    st.load("a.pdf", bytes, 3);
    const first = useStore.getState().pages[0].id;
    st.move(first, 1);
    expect(useStore.getState().pages[1].id).toBe(first);
    st.move(first, -1);
    expect(useStore.getState().pages[0].id).toBe(first);
    st.move(first, -1); // already first — no-op
    expect(useStore.getState().pages[0].id).toBe(first);
  });

  it("moveTo drag-reorders to the target position", () => {
    const st = useStore.getState();
    st.load("a.pdf", bytes, 4);
    const pages = useStore.getState().pages;
    st.moveTo(pages[0].id, pages[2].id);
    const order = useStore.getState().pages.map((p) => p.sourceIndex);
    expect(order).toEqual([1, 2, 0, 3]);
  });

  it("duplicate inserts a copy right after the original", () => {
    const st = useStore.getState();
    st.load("a.pdf", bytes, 2);
    const target = useStore.getState().pages[0];
    st.duplicate(target.id);
    const pages = useStore.getState().pages;
    expect(pages).toHaveLength(3);
    expect(pages[1].sourceIndex).toBe(target.sourceIndex);
    expect(pages[1].id).not.toBe(target.id);
  });

  it("insertBlank adds an A4 blank page", () => {
    const st = useStore.getState();
    st.load("a.pdf", bytes, 1);
    st.insertBlank();
    const pages = useStore.getState().pages;
    expect(pages).toHaveLength(2);
    expect(pages[1].kind).toBe("blank");
    expect(Math.round(pages[1].width!)).toBe(595);
  });

  it("range positions select by list position, not source page", () => {
    const st = useStore.getState();
    st.load("a.pdf", bytes, 4);
    st.setSelectionPositions([2, 4]);
    const selected = useStore.getState().pages.map((p) => p.selected);
    expect(selected).toEqual([false, true, false, true]);
  });
});
