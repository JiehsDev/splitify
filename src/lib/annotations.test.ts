import { describe, expect, it } from "vitest";
import { displayedSize, toUserSpace, hexToRgb } from "./annotations";

const W = 600;
const H = 800;

describe("displayedSize", () => {
  it("swaps width/height at 90 and 270", () => {
    expect(displayedSize(W, H, 0)).toEqual({ w: W, h: H });
    expect(displayedSize(W, H, 90)).toEqual({ w: H, h: W });
    expect(displayedSize(W, H, 180)).toEqual({ w: W, h: H });
    expect(displayedSize(W, H, 270)).toEqual({ w: H, h: W });
  });
});

describe("toUserSpace", () => {
  it("is identity at rotation 0", () => {
    expect(toUserSpace(W, H, 0, 100, 200)).toEqual({ x: 100, y: 200 });
  });
  it("maps the displayed corners back to user corners at 90", () => {
    // Displayed bottom-left (0,0) at r=90 was user top-left (0,H)... derived:
    // user = (W - dy, dx); (0,0) -> (W, 0) is user bottom-right corner.
    expect(toUserSpace(W, H, 90, 0, 0)).toEqual({ x: W, y: 0 });
    // Displayed top-right (H, W) -> user (0, H) top-left.
    expect(toUserSpace(W, H, 90, H, W)).toEqual({ x: 0, y: H });
  });
  it("is its own inverse mapping at 180", () => {
    expect(toUserSpace(W, H, 180, 100, 200)).toEqual({ x: W - 100, y: H - 200 });
  });
  it("maps corners at 270", () => {
    // user = (dy, H - dx); displayed bottom-left (0,0) -> user (0, H) top-left.
    expect(toUserSpace(W, H, 270, 0, 0)).toEqual({ x: 0, y: H });
    // displayed top-right (H, W) -> user (W, 0) bottom-right.
    expect(toUserSpace(W, H, 270, H, W)).toEqual({ x: W, y: 0 });
  });
  it("round-trips through the forward rotation formulas", () => {
    // Forward maps (user -> displayed) from the module docs.
    const fwd = (r: number, x: number, y: number) =>
      r === 0 ? { x, y } : r === 90 ? { x: y, y: W - x } : r === 180 ? { x: W - x, y: H - y } : { x: H - y, y: x };
    for (const r of [0, 90, 180, 270] as const) {
      for (const [x, y] of [[0, 0], [123, 456], [W, H], [W / 2, H / 2]] as const) {
        const d = fwd(r, x, y);
        const back = toUserSpace(W, H, r, d.x, d.y);
        expect(Math.round(back.x)).toBe(x);
        expect(Math.round(back.y)).toBe(y);
      }
    }
  });
});

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });
});
