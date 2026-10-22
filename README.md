# Splitify ✂️

Pick the pages you need from a PDF and save them as a new PDF.
**100% in-browser — files are never uploaded.** No account, no backend, no page limits.

## Features
### Phase 1 — Split (built 2026-10-22)
- Open a PDF by drag-and-drop or file picker (encrypted/corrupt files get a clear error)
- Thumbnail grid of every page (lazy-rendered, works with 100+ page PDFs)
- Select pages by tapping thumbnails, quick buttons (All / None / Invert / Even / Odd),
  or a range like `1-3, 5, 8-10` (positions in the current list)
- **Extract selected** → one new PDF · **Every page → ZIP** · **Every N pages → ZIP**
- Rotate (⟲ ⟳) and remove pages before exporting — rotation is applied in the output
- Original file bytes are never mutated; every export is built fresh with pdf-lib

### Phase 2 — Page ops (built 2026-10-22)
- **Reorder**: drag a card to move it, or use ⬅ ➡ buttons (touch-friendly)
- **Merge**: "＋ Add PDF" appends another document's pages; thumbnails show their source
- **Duplicate** a page (⧉) and **insert a blank A4 page**
- **Download all in order** exports the full list (after reordering/merging) as one PDF
- Exports mix pages from different source PDFs and blank pages in any order

### Phase 3 — Annotate + sign (built 2026-10-22)
- Tap **✎** on any page to open the editor (badge shows its annotation count)
- **Text** (tap to place, any colour), **Draw**, **Highlight**, **Image** (tap to place a PNG/JPG)
- **Signature pad**: draw your signature, it's placed at the page's bottom-right
- Undo / Clear-all per page; annotations are stored in resolution-independent
  coordinates and **flattened into the exported PDF** (they are part of the page,
  not a separate layer)
- Works on blank pages too. Note: annotation placement is exact on unrotated
  pages; on rotated pages the export applies the rotation transform (best effort)

## Run it
```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 32 tests: range parser, extraction/split/rotation, merge, store ops, annotation coords + export
npm run build    # production build
```

## Deploy
Any static/Next host. On Vercel: import this repo, framework = Next.js, no env vars needed.

## Stack
Next.js (App Router) + TypeScript + Tailwind · `pdfjs-dist` (rendering) ·
`pdf-lib` (output) · `jszip` · Zustand

## Roadmap
- Phase 4: page numbers, watermark, white-out + retype

> Note: true Word-style editing of existing PDF text is out of scope — PDFs have no
> text reflow; like paid tools, Phase 4 uses white-out + type-over.
