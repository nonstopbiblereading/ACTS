// 經緯度投影、陸地判斷、城市上的建築擺放，以及一些小工具。

import { LAND } from "./land.js?v=13";

export { LAND };

// 等距圓柱投影，經度依中央緯度的 cos 縮放，形狀才不會被橫向拉長
const DEG = 5;                         // 每一緯度換算成多少世界單位
const LAT0 = 37, LON0 = 26;
const KX = DEG * Math.cos(LAT0 * Math.PI / 180);

export function project(lon, lat) {
  return { x: (lon - LON0) * KX, z: -(lat - LAT0) * DEG };
}

// 地圖範圍（與 land.js 的裁切範圍一致）
export const GEO_BOUNDS = { w: 7, e: 42, s: 28, n: 46.5 };
export const BOUNDS = (() => {
  const a = project(GEO_BOUNDS.w, GEO_BOUNDS.n), b = project(GEO_BOUNDS.e, GEO_BOUNDS.s);
  return { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z };
})();

function insideRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function onLand(lon, lat) {
  return LAND.some(p => insideRing(lon, lat, p.outer) && !p.holes.some(h => insideRing(lon, lat, h)));
}

export function unproject(x, z) {
  return { lon: x / KX + LON0, lat: -z / DEG + LAT0 };
}

// 城市上建築的擺放位置：事件少的排一圈，多的中心再加一棟、外面再一圈
export function slotLayout(n, radius) {
  const ring = (count, r, phase) => Array.from({ length: count }, (_, i) => {
    const a = phase + i * Math.PI * 2 / count;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
  if (n === 1) return [{ x: 0, z: 0 }];
  if (n <= 6) return ring(n, radius * 0.5, Math.PI / 2);
  const inner = Math.min(6, n - 1);
  return [{ x: 0, z: 0 }, ...ring(inner, radius * 0.45, Math.PI / 6), ...ring(n - 1 - inner, radius * 0.78, 0)];
}

// 決定性的亂數，讓每次載入的小人、樹位置都一樣
export function mulberry(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 章節字串轉成可比較的數字："15:36" → 15.36，"13–14" → 13
export function refValue(ref) {
  const m = String(ref).match(/(\d+)(?::(\d+))?/);
  if (!m) return 0;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0);
}

// 一段經文的起點落在哪個時期
export function eraOf(ref, eras) {
  const v = refValue(ref);
  const e = eras.find(e => v >= refValue(e.from) && v <= refValue(e.to));
  return e ? e.id : null;
}

// "16:8–10" → [16.08, 16.10]；"13–14" → [13, 14.99]；"18:23–21:17" → [18.23, 21.17]
export function refRange(ref) {
  const m = String(ref).match(/(\d+)(?::(\d+))?(?:\s*[–-]\s*(\d+)(?::(\d+))?)?/);
  if (!m) return null;
  const [, c1, v1, a, b] = m.map(x => x && Number(x));
  const start = c1 + (v1 ? v1 / 100 : 0);
  let end;
  if (b != null) end = a + b / 100;
  else if (a != null) end = v1 ? c1 + a / 100 : a + 0.99;
  else end = v1 ? start : c1 + 0.99;
  return [start, end];
}

// 兩段經文範圍有沒有重疊
export function refsOverlap(a, b) {
  const x = refRange(a), y = refRange(b);
  return !!x && !!y && x[0] <= y[1] && y[0] <= x[1];
}
