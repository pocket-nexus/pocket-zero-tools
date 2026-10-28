// The app's icon: a bubble between two rings on plum, the Level's face.
// `square` fills the whole square (the Store's 256 px icon, which should
// carry no rounded corners or border of its own); otherwise the plum disc
// stands on transparency, as APPLaunch's own launcher icons do (100 px).

export function drawIcon(size: number, square: boolean): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const c = size / 2;
  // The motif's radius: the disc's, or a margin inside the square.
  const r = square ? c * 0.82 : c;
  const put = (x: number, y: number, red: number, green: number, blue: number, coverage = 1) => {
    const at = (y * size + x) * 4;
    const alpha = Math.max(0, Math.min(1, coverage));
    rgba[at] = Math.round(rgba[at]! * (1 - alpha) + red * alpha);
    rgba[at + 1] = Math.round(rgba[at + 1]! * (1 - alpha) + green * alpha);
    rgba[at + 2] = Math.round(rgba[at + 2]! * (1 - alpha) + blue * alpha);
    rgba[at + 3] = Math.max(rgba[at + 3]!, Math.round(alpha * 255));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.hypot(px - c, py - c);
      // Edges are anti-aliased by distance, one pixel wide.
      const inside = (edge: number) => Math.max(0, Math.min(1, edge - d + 0.5));
      if (square) put(x, y, 0x17, 0x12, 0x26);
      else if (d > c + 0.5) continue;
      else put(x, y, 0x17, 0x12, 0x26, inside(c));
      const ring = (radius: number, width: number) => Math.max(0, Math.min(1, width - Math.abs(d - radius) + 0.5));
      put(x, y, 0x5a, 0x4d, 0x78, ring(r * 0.86, r * 0.035));
      put(x, y, 0x5a, 0x4d, 0x78, ring(r * 0.46, r * 0.028));
      if (d < r * 0.9) {
        const cross = Math.max(0, Math.min(1, r * 0.018 - Math.min(Math.abs(px - c), Math.abs(py - c)) + 0.5));
        put(x, y, 0x3a, 0x2d, 0x5c, cross);
      }
      const bubble = Math.hypot(px - (c + r * 0.12), py - (c - r * 0.1));
      put(x, y, 0xff, 0xd2, 0x3f, Math.max(0, Math.min(1, r * 0.22 - bubble + 0.5)));
      put(x, y, 0xfc, 0xf6, 0xff, Math.max(0, Math.min(1, r * 0.08 - bubble + 0.5)));
    }
  }
  return rgba;
}
