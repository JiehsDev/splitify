/**
 * Annotations are stored in DISPLAYED page space, as fractions:
 * x, y are fractions of the displayed page width/height, y from the TOP
 * (like a canvas). Sizes (font size, stroke width, image w/h) are also
 * fractions so annotations survive any page size / zoom.
 *
 * At export time they are converted to PDF user space (points, origin
 * bottom-left, unrotated) — see toUserSpace().
 */

export type Annotation =
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      text: string;
      /** font size as a fraction of displayed page height */
      sizeFrac: number;
      color: string; // #rrggbb
    }
  | {
      id: string;
      type: "path";
      /** freehand stroke points (fractions, y from top) */
      points: { x: number; y: number }[];
      color: string;
      /** stroke width as a fraction of displayed page width */
      widthFrac: number;
      /** 1 = pen, ~0.35 = highlighter */
      opacity: number;
    }
  | {
      id: string;
      type: "rect";
      x: number;
      y: number;
      /** width/height as fractions of displayed page width/height */
      w: number;
      h: number;
      /** fill colour, #ffffff for white-out */
      color: string;
      opacity: number;
    }
  | {
      id: string;
      type: "image";
      x: number;
      y: number;
      /** width/height as fractions of displayed page width/height */
      w: number;
      h: number;
      /** PNG or JPEG data URL (signature or uploaded image) */
      dataUrl: string;
    };

export function displayedSize(
  pageW: number,
  pageH: number,
  rotation: 0 | 90 | 180 | 270,
): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: pageH, h: pageW } : { w: pageW, h: pageH };
}

/**
 * Convert a point in displayed space (points, origin bottom-LEFT of the
 * displayed page) to PDF user space (points, origin bottom-left of the
 * unrotated page). The viewer rotates user space clockwise by `rotation`
 * to display it; these are the exact inverses of that rotation:
 *   r=90:  display = (y, W - x)        -> user = (W - dy, dx)
 *   r=180: display = (W - x, H - y)    -> user = (W - dx, H - dy)
 *   r=270: display = (H - y, x)        -> user = (dy, H - dx)
 */
export function toUserSpace(
  pageW: number,
  pageH: number,
  rotation: 0 | 90 | 180 | 270,
  dx: number,
  dy: number,
): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: dx, y: dy };
    case 90:
      return { x: pageW - dy, y: dx };
    case 180:
      return { x: pageW - dx, y: pageH - dy };
    case 270:
      return { x: dy, y: pageH - dx };
  }
}

/** #rrggbb -> {r,g,b} in 0..1 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
