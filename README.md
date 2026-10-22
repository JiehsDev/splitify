# Splitify ✂️

Pick the pages you need from a PDF and save them as a new PDF.
**100% in-browser — files are never uploaded.** No account, no backend, no page limits.

## Features (Phase 1 — Split MVP, built 2026-10-22)
- Open a PDF by drag-and-drop or file picker (encrypted/corrupt files get a clear error)
- Thumbnail grid of every page (lazy-rendered, works with 100+ page PDFs)
- Select pages by tapping thumbnails, quick buttons (All / None / Invert / Even / Odd),
  or a range like `1-3, 5, 8-10`
- **Extract selected** → one new PDF, pages in original order
- **Every page → ZIP** → each remaining page as its own PDF
- **Every N pages → ZIP** → chunked PDFs
- Rotate (⟲ ⟳) and remove pages before exporting — rotation is applied in the output
- Original file bytes are never mutated; every export is built fresh with pdf-lib

## Run it
```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 13 tests: range parser + extraction/split/rotation
npm run build    # production build
```

## Deploy
Any static/Next host. On Vercel: import this repo, framework = Next.js, no env vars needed.

## Stack
Next.js (App Router) + TypeScript + Tailwind · `pdfjs-dist` (rendering) ·
`pdf-lib` (output) · `jszip` · Zustand

## Roadmap
- Phase 2: reorder by drag, merge a second PDF, duplicate, insert blank page
- Phase 3: annotate — text, draw/highlight, image, signature (flattened into output)
- Phase 4: page numbers, watermark, white-out + retype

> Note: true Word-style editing of existing PDF text is out of scope — PDFs have no
> text reflow; like paid tools, Phase 4 uses white-out + type-over.
