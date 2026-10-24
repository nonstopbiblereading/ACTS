// Convert world-atlas land-50m TopoJSON into a small clipped/simplified JS module.
// usage: node make-land.mjs <land-50m.json> <out.js>
import fs from "node:fs";

const [src, out] = process.argv.slice(2);
const topo = JSON.parse(fs.readFileSync(src, "utf8"));
const BBOX = { w: 7, e: 42, s: 28, n: 46.5 };
const TOL = 0.007;          // Douglas–Peucker tolerance in degrees
const MIN_AREA = 0.003;     // drop islets smaller than this (deg²); Malta ≈ 0.03

const { scale, translate } = topo.transform;
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
const arcPts = i => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
function ring(idx) {
  const pts = [];
  idx.forEach((a, k) => { const p = arcPts(a); pts.push(...(k ? p.slice(1) : p)); });
  return pts;
}

function clip(pts) {
  const edges = [
    [p => p[0] >= BBOX.w, (a, b) => inter(a, b, 0, BBOX.w)],
    [p => p[0] <= BBOX.e, (a, b) => inter(a, b, 0, BBOX.e)],
    [p => p[1] >= BBOX.s, (a, b) => inter(a, b, 1, BBOX.s)],
    [p => p[1] <= BBOX.n, (a, b) => inter(a, b, 1, BBOX.n)],
  ];
  let poly = pts;
  for (const [inside, cut] of edges) {
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
      if (inside(cur)) { if (!inside(prev)) res.push(cut(prev, cur)); res.push(cur); }
      else if (inside(prev)) res.push(cut(prev, cur));
    }
    poly = res;
    if (!poly.length) break;
  }
  return poly;
}
function inter(a, b, axis, v) {
  const t = (v - a[axis]) / (b[axis] - a[axis]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Closed rings: drop the duplicate end point and split at the vertex farthest from the start,
// otherwise the DP baseline has zero length and everything gets discarded.
function simplifyRing(pts, tol) {
  const p = pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts;
  if (p.length < 4) return p;
  let far = 1, fd = -1;
  p.forEach((q, i) => { const d = (q[0] - p[0][0]) ** 2 + (q[1] - p[0][1]) ** 2; if (d > fd) { fd = d; far = i; } });
  const a = dp(p.slice(0, far + 1), tol), b = dp([...p.slice(far), p[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const round = pts => pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);

const polys = [];
for (const g of topo.objects.land.geometries) {
  const list = g.type === "Polygon" ? [g.arcs] : g.arcs;
  for (const p of list) {
    const rings = p.map(ring).map(clip).filter(r => r.length >= 3).map(r => simplifyRing(r, TOL)).filter(r => r.length >= 3);
    if (!rings.length || area(rings[0]) < MIN_AREA) continue;
    polys.push({ outer: round(rings[0]), holes: rings.slice(1).filter(r => area(r) >= MIN_AREA).map(round) });
  }
}
const nPts = polys.reduce((s, p) => s + p.outer.length + p.holes.reduce((t, h) => t + h.length, 0), 0);
fs.writeFileSync(out,
  `// 陸地輪廓：Natural Earth 1:50m（公共領域，經 world-atlas 取得），裁切到地中海一帶並簡化。\n` +
  `// 由工具程式產生，請勿手動編輯。格式：[{ outer:[[經度,緯度],…], holes:[…] }]\n` +
  `export const LAND = ${JSON.stringify(polys)};\n`);
console.log(`polygons=${polys.length} points=${nPts} bytes=${fs.statSync(out).size}`);
