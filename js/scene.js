// 3D 場景：海、真實海岸線的陸地、山與樹、城市、走動的小人、旅程線與旅人。
// 除了海岸線資料（land.js）以外，全部用基本幾何拼出來，不載入任何模型檔。

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { LAND, project, unproject, onLand, BOUNDS, GEO_BOUNDS, slotLayout, mulberry, eraOf, refsOverlap } from "./world.js?v=13";
import { createChibi } from "./people.js?v=13";

const CH_SCALE = 0.34;   // Q 版人物在地圖上的大小（模型身高約 1）

// 一天的光線關鍵格：分鐘（0–1440）→ 天空、太陽、環境光、海、陸地；night 控制城市燈火
const TOD = [
  { m: 0,    sky: "#17202f", sun: "#7d93c4", sunI: 0.35, hemiS: "#3d4c6c", hemiG: "#1c2433", hemiI: 0.5,  sea: "#2f4b5c", land: "#8a8270", night: 1 },
  { m: 300,  sky: "#17202f", sun: "#7d93c4", sunI: 0.35, hemiS: "#3d4c6c", hemiG: "#1c2433", hemiI: 0.5,  sea: "#2f4b5c", land: "#8a8270", night: 1 },
  { m: 375,  sky: "#f3cdb0", sun: "#ffb37a", sunI: 1.3,  hemiS: "#ffe2c8", hemiG: "#7f9aa8", hemiI: 0.85, sea: "#94c1cb", land: "#e8d2b0", night: 0.25 },
  { m: 480,  sky: "#e3f1f3", sun: "#fff1dc", sunI: 2.0,  hemiS: "#fff6e8", hemiG: "#86aab0", hemiI: 1.2,  sea: "#a7d4dd", land: "#ebe0c2", night: 0 },
  { m: 1020, sky: "#e3f1f3", sun: "#fff1dc", sunI: 2.0,  hemiS: "#fff6e8", hemiG: "#86aab0", hemiI: 1.2,  sea: "#a7d4dd", land: "#ebe0c2", night: 0 },
  { m: 1110, sky: "#efb48c", sun: "#ff9a5a", sunI: 1.3,  hemiS: "#ffd9bd", hemiG: "#8a8fa8", hemiI: 0.8,  sea: "#8fb3be", land: "#e6c9a4", night: 0.35 },
  { m: 1230, sky: "#17202f", sun: "#7d93c4", sunI: 0.35, hemiS: "#3d4c6c", hemiG: "#1c2433", hemiI: 0.5,  sea: "#2f4b5c", land: "#8a8270", night: 1 },
  { m: 1440, sky: "#17202f", sun: "#7d93c4", sunI: 0.35, hemiS: "#3d4c6c", hemiG: "#1c2433", hemiI: 0.5,  sea: "#2f4b5c", land: "#8a8270", night: 1 },
];
export const TIME_PRESETS = [["清晨", 360], ["白天", 720], ["黃昏", 1080], ["夜晚", 1260]];
export function timeLabel(m) {
  const name = m < 300 || m >= 1200 ? "夜晚" : m < 480 ? "清晨" : m < 1020 ? "白天" : "黃昏";
  const h = Math.floor(m / 60), mm = Math.floor(m % 60);
  return `${name} ${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const LAND_TOP = 0.3;              // 陸地厚度
const CITY_TOP = LAND_TOP + 0.14;  // 城市平台頂面高度
const DIM = new THREE.Color("#d4cdc2");

const C = {
  sea: "#a7d4dd", sky: "#e3f1f3",
  landTop: "#ebe0c2", landSide: "#c7b28a", coast: "#9a8462",
  mountain: "#bfae8c", snow: "#f6f1e6",
  wall: "#fbf4e6", roof: "#c4693f", stone: "#e7dcc4", dark: "#6b6560",
  wood: "#8a5a3b", leaf: "#7fa35a", gold: "#d8b25a",
};

// 地區與海的名稱（和合本譯名），只是地圖上的字，不能點
const REGIONS = [
  { n: "義大利", lon: 15.6, lat: 41.0 },
  { n: "馬其頓", lon: 21.6, lat: 41.6 },
  { n: "亞該亞", lon: 22.0, lat: 37.3 },
  { n: "亞細亞", lon: 29.0, lat: 38.9 },
  { n: "加拉太", lon: 33.2, lat: 39.4 },
  { n: "基利家", lon: 34.0, lat: 37.3 },
  { n: "敘利亞", lon: 37.6, lat: 35.2 },
  { n: "猶太", lon: 35.6, lat: 30.9 },
  { n: "埃及", lon: 30.5, lat: 29.4 },
  { n: "呂彼亞", lon: 21.5, lat: 31.4 },
  { n: "大海（地中海）", lon: 19.0, lat: 34.6, sea: true },
  { n: "愛琴海", lon: 25.2, lat: 38.6, sea: true },
  { n: "亞底亞海", lon: 17.6, lat: 37.2, sea: true },
  { n: "黑海", lon: 34.5, lat: 43.3, sea: true },
];

// 山脈：只是裝飾，讓陸地看起來有起伏
const MOUNTAINS = [
  [32.0, 37.2], [33.2, 37.0], [34.3, 37.3], [35.4, 37.8], [36.6, 37.9], [38.2, 38.4], // 托魯斯山
  [35.9, 34.1], [36.2, 34.5], [36.4, 33.6],                                           // 黎巴嫩山
  [21.2, 39.8], [21.4, 40.5], [22.3, 40.1], [22.0, 41.3], [23.6, 41.6], [25.0, 41.9],  // 品都斯、奧林帕斯、巴爾幹
  [13.4, 42.4], [14.4, 41.6], [15.6, 40.6], [16.2, 39.4], [12.6, 43.2],               // 亞平寧
  [30.0, 39.6], [34.5, 39.9], [38.0, 39.4], [39.5, 40.4], [41.0, 39.2],               // 安納托利亞高原
  [22.3, 37.4], [24.9, 35.25], [33.0, 34.95], [9.2, 40.1], [14.9, 37.7],              // 伯羅奔尼撒、克里特、塞浦路斯、薩丁尼亞、西西里
];

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts });

export function createScene(container, data) {
  // ---------- 基本設定 ----------
  // preserveDrawingBuffer：讓「拍照」可以直接讀畫布
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "labels";
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.sky);
  scene.fog = new THREE.Fog(C.sky, 160, 300);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.6;   // 跟著人物走時要能貼近
  controls.maxDistance = 220;   // 手機直式要退很遠才看得到整個地中海
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.screenSpacePanning = false;

  const hemi = new THREE.HemisphereLight("#fff6e8", "#86aab0", 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff1dc", 2.0);
  sun.position.set(-40, 70, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -60, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ---------- 海 ----------
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2, cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat(C.sea, { roughness: 0.55 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(cx, 0, cz);
  sea.receiveShadow = true;
  scene.add(sea);

  // 地圖外框：淡淡的經緯線，讓它更像一張地圖
  {
    const pts = [];
    for (let lon = 10; lon <= 40; lon += 5) { const a = project(lon, GEO_BOUNDS.s), b = project(lon, GEO_BOUNDS.n); pts.push(a.x, 0.01, a.z, b.x, 0.01, b.z); }
    for (let lat = 30; lat <= 45; lat += 5) { const a = project(GEO_BOUNDS.w, lat), b = project(GEO_BOUNDS.e, lat); pts.push(a.x, 0.01, a.z, b.x, 0.01, b.z); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35 })));
  }

  // 海面上的波紋，只放在海上
  const rnd = mulberry(7);
  const ripples = [];
  {
    const g = new THREE.RingGeometry(0.8, 0.9, 32);
    while (ripples.length < 60) {
      const lon = GEO_BOUNDS.w + rnd() * (GEO_BOUNDS.e - GEO_BOUNDS.w);
      const lat = GEO_BOUNDS.s + rnd() * (GEO_BOUNDS.n - GEO_BOUNDS.s);
      if (onLand(lon, lat)) continue;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
      const p = project(lon, lat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.02, p.z);
      m.userData.phase = rnd() * 6;
      scene.add(m);
      ripples.push(m);
    }
  }

  // ---------- 陸地（真實海岸線擠出成薄板） ----------
  const toShapePt = ([lon, lat]) => { const p = project(lon, lat); return new THREE.Vector2(p.x, -p.z); };
  const landMats = [mat(C.landTop), mat(C.landSide)];
  const coastPts = [];
  for (const poly of LAND) {
    const shape = new THREE.Shape(poly.outer.map(toShapePt));
    shape.holes = poly.holes.map(h => new THREE.Path(h.map(toShapePt)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: LAND_TOP, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);   // 擠出方向朝上；shape 的 y 變成 -z
    const mesh = new THREE.Mesh(geo, landMats);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);

    for (const ring of [poly.outer, ...poly.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = project(...ring[i]), b = project(...ring[(i + 1) % ring.length]);
        coastPts.push(a.x, LAND_TOP + 0.005, a.z, b.x, LAND_TOP + 0.005, b.z);
      }
    }
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(coastPts, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: C.coast, transparent: true, opacity: 0.55 })));
  }

  const nearCity = (lon, lat, d) => data.places.some(p => Math.abs(p.lon - lon) < d && Math.abs(p.lat - lat) < d * 0.8);

  // 山：低矮的多角錐，頂端一點雪
  {
    const mGeo = new THREE.ConeGeometry(0.9, 1, 5); mGeo.translate(0, 0.5, 0);
    const sGeo = new THREE.ConeGeometry(0.27, 0.3, 5); sGeo.translate(0, 0.85, 0);
    const list = [];
    for (const [lon, lat] of MOUNTAINS) {
      for (let k = 0; k < 3; k++) {
        const lo = lon + (rnd() - 0.5) * 0.9, la = lat + (rnd() - 0.5) * 0.6;
        if (onLand(lo, la) && !nearCity(lo, la, 0.45)) list.push({ ...project(lo, la), s: 0.6 + rnd() * 0.7, r: rnd() * 6 });
      }
    }
    const mm = new THREE.InstancedMesh(mGeo, mat(C.mountain, { flatShading: true }), list.length);
    const sm = new THREE.InstancedMesh(sGeo, mat(C.snow, { flatShading: true }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((m, i) => {
      m4.compose(new THREE.Vector3(m.x, LAND_TOP, m.z), q.setFromAxisAngle(up, m.r), new THREE.Vector3(m.s, m.s * 0.8, m.s));
      mm.setMatrixAt(i, m4); sm.setMatrixAt(i, m4);
    });
    mm.castShadow = mm.receiveShadow = sm.castShadow = true;
    scene.add(mm, sm);
  }

  // 樹：陸地上零星的小樹
  {
    const tGeo = new THREE.ConeGeometry(0.16, 0.42, 6); tGeo.translate(0, 0.21, 0);
    const pos = [];
    while (pos.length < 420) {
      const lon = GEO_BOUNDS.w + rnd() * (GEO_BOUNDS.e - GEO_BOUNDS.w);
      const lat = 30 + rnd() * (GEO_BOUNDS.n - 30);   // 南邊是沙漠，不種樹
      if (onLand(lon, lat) && !nearCity(lon, lat, 0.3)) pos.push(project(lon, lat));
    }
    const trees = new THREE.InstancedMesh(tGeo, mat(C.leaf), pos.length);
    const m4 = new THREE.Matrix4();
    pos.forEach((p, i) => trees.setMatrixAt(i, m4.makeTranslation(p.x, LAND_TOP, p.z)));
    trees.castShadow = true;
    scene.add(trees);
  }

  for (const r of REGIONS) {
    const el = document.createElement("div");
    el.className = "region-label" + (r.sea ? " sea" : "");
    el.textContent = r.n;
    const o = new CSS2DObject(el);
    const p = project(r.lon, r.lat);
    o.position.set(p.x, r.sea ? 0.05 : LAND_TOP, p.z);
    scene.add(o);
  }

  // ---------- 城市 ----------
  const islands = new Map();   // 沿用「島」的名稱：每個地點一個
  const pickables = [];
  const stageColor = id => new THREE.Color(data.stages[id].color);

  for (const p of data.places) {
    const pos = project(p.lon, p.lat);
    const radius = 0.4 + 0.035 * p.events.length;
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);

    // 城市平台：從海平面立起，在海邊的城市也不會懸空
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.04, radius * 1.1, CITY_TOP - 0.06, 32), mat(stageColor(p.stage).multiplyScalar(0.8)));
    base.position.y = (CITY_TOP - 0.06) / 2;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 32), mat(stageColor(p.stage)));
    top.position.y = CITY_TOP - 0.03;
    for (const mesh of [base, top]) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.placeId = p.id;
      group.add(mesh);
      pickables.push(mesh);
    }

    const slots = slotLayout(p.events.length, radius);
    const buildings = p.events.map((e, i) => {
      const b = createBuilding(e.kind, i);
      const s = slots[i];
      b.scale.setScalar(0.8);
      b.position.set(s.x, CITY_TOP, s.z);
      b.rotation.y = (s.x || s.z) ? Math.atan2(s.x, s.z) + Math.PI : 0;  // 面向城市中央
      b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.placeId = p.id; pickables.push(o); } });
      group.add(b);
      return b;
    });

    const el = document.createElement("button");
    el.className = "island-label";
    el.dataset.stage = p.stage;
    el.innerHTML = `<span>${p.name}</span><small>${p.events.length}</small>`;
    el.dataset.placeId = p.id;
    const label = new CSS2DObject(el);
    label.position.set(0, CITY_TOP + 0.75, 0);
    group.add(label);

    const mats = [base.material, top.material];
    islands.set(p.id, { place: p, group, radius, buildings, label, el, mats, baseColors: mats.map(m => m.color.clone()), lift: 0, liftTo: 0 });
  }

  // 夜裡城市的燈火：每座城幾點暖色光暈，白天透明
  const glowMat = new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,230,160,1)"); grad.addColorStop(0.35, "rgba(255,190,90,0.6)"); grad.addColorStop(1, "rgba(255,160,60,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  for (const isl of islands.values()) {
    const n = 3 + Math.floor(isl.place.events.length / 2);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + 0.4;
      const s = new THREE.Sprite(glowMat);
      s.position.set(Math.cos(a) * isl.radius * 0.85, CITY_TOP + 0.12, Math.sin(a) * isl.radius * 0.85);
      s.scale.setScalar(0.55);
      isl.group.add(s);
    }
    const big = new THREE.Sprite(glowMat);
    big.position.y = CITY_TOP + 0.3;
    big.scale.setScalar(isl.radius * 4);
    isl.group.add(big);
  }

  // 被選取時的外框
  const selRing = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.3, 48),
    new THREE.MeshBasicMaterial({ color: "#211d1d", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  selRing.rotation.x = -Math.PI / 2;
  selRing.visible = false;
  scene.add(selRing);

  // ---------- 城裡走動的小人 ----------
  const people = [];
  {
    const r2 = mulberry(11);
    const cloth = ["#c4693f", "#3f6fa0", "#8a6bb0", "#5e9a5a", "#d6a640", "#a04e5e"];
    for (const isl of islands.values()) {
      const n = Math.min(4, 1 + Math.floor(isl.place.events.length / 2));
      for (let i = 0; i < n; i++) {
        people.push({ isl, a: r2() * Math.PI * 2, rad: isl.radius * (0.3 + r2() * 0.55), speed: (0.2 + r2() * 0.3) * (r2() < 0.5 ? -1 : 1), color: cloth[Math.floor(r2() * cloth.length)], bob: r2() * 6 });
      }
    }
  }
  const bodyGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.11, 6); bodyGeo.translate(0, 0.055, 0);
  const headGeo = new THREE.SphereGeometry(0.03, 8, 6); headGeo.translate(0, 0.14, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat("#ffffff"), people.length);
  const heads = new THREE.InstancedMesh(headGeo, mat("#e9c9a8"), people.length);
  people.forEach((pp, i) => bodies.setColorAt(i, new THREE.Color(pp.color)));
  bodies.castShadow = heads.castShadow = true;
  scene.add(bodies, heads);

  // 人物走路的參數（旅程線建立時就會用到地面路徑，所以放在前面）
  const WATER_Y = 0.03, SPEED = 3, STAY = 3.2;

  // ---------- 旅程線 ----------
  const flows = new Map();
  const legCount = new Map();   // 同一對城市之間有幾條線，用來錯開
  data.journeys.forEach(j => {
    const group = new THREE.Group();
    scene.add(group);
    const material = new THREE.MeshBasicMaterial({ color: j.color, transparent: true, opacity: 0.3, depthWrite: false });
    const legs = [];
    for (let i = 0; i < j.route.length - 1; i++) {
      const a = islands.get(j.route[i]).group.position;
      const b = islands.get(j.route[i + 1]).group.position;
      const pair = [j.route[i], j.route[i + 1]].sort().join("|");
      const nth = legCount.get(pair) || 0;
      legCount.set(pair, nth + 1);

      const start = new THREE.Vector3(a.x, CITY_TOP + 0.1, a.z);
      const end = new THREE.Vector3(b.x, CITY_TOP + 0.1, b.z);
      const dist = start.distanceTo(end);
      const side = new THREE.Vector3(-(end.z - start.z), 0, end.x - start.x).normalize();
      const offset = (nth % 2 ? -1 : 1) * Math.ceil(nth / 2) * 0.45;
      const mid = start.clone().lerp(end, 0.5).addScaledVector(side, offset);
      mid.y += 0.8 + dist * 0.1 + nth * 0.3;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.08, 6, false), material);
      group.add(tube);
      legs.push({ curve, len: curve.getLength() });
    }

    // 旅人：走這段路的第一位人物的 Q 版模樣，帶著旅程名字
    const lead = data.characters.find(c => c.id === (j.walkers || [])[0]);
    const tag = document.createElement("div");
    tag.className = "walker-tag";
    tag.style.setProperty("--c", j.color);
    tag.textContent = j.walker;
    const fig = makeFigure(lead ? lead.look : { robe: j.color }, tag);
    const walker = fig.chibi.root;
    walker.visible = fig.tag.visible = false;
    const ground = j.route.slice(1).map((pid, i) => groundLeg(j.route[i], pid));

    flows.set(j.id, { journey: j, group, material, legs, ground, fig, walker, tag, tagObj: fig.tag, t: 0 });
  });

  // ---------- 走在地上的人 ----------
  // 兩座城之間取直線，每 0.2 單位取樣：在城裡站在平台上、在陸地上走、在海上坐船
  function groundLeg(fromId, toId) {
    const A = islands.get(fromId), B = islands.get(toId);
    const a = A.group.position, b = B.group.position;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.ceil(len / 0.2));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, d = u * len;
      let y = CITY_TOP, sea = false;
      if (d > A.radius * 0.9 && len - d > B.radius * 0.9) {
        const g = unproject(x, z);
        if (onLand(g.lon, g.lat)) y = LAND_TOP; else { y = WATER_Y; sea = true; }
      }
      pts.push({ x, y, z, sea });
    }
    return { pts, len };
  }
  function legPoint(leg, u, out) {
    const f = Math.min(0.9999, Math.max(0, u)) * (leg.pts.length - 1);
    const i = Math.floor(f), k = f - i, p = leg.pts[i], q = leg.pts[i + 1];
    out.set(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k, p.z + (q.z - p.z) * k);
    return k < 0.5 ? p.sea : q.sea;
  }

  function makeFigure(look, tagEl) {
    const chibi = createChibi(look);
    chibi.root.scale.setScalar(CH_SCALE);
    const tag = new CSS2DObject(tagEl);
    tag.position.y = 1.35;
    chibi.root.add(tag);
    scene.add(chibi.root);
    return { chibi, tag, prev: new THREE.Vector3(), yaw: 0, fresh: true };
  }
  // 依移動方向轉身、擺動手腳；在海上就坐船
  function poseFigure(f, pos, sea, time, dt) {
    const dx = pos.x - f.prev.x, dz = pos.z - f.prev.z;
    const moving = !f.fresh && dx * dx + dz * dz > 1e-8;
    if (moving) {
      let d = Math.atan2(dx, dz) - f.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      f.yaw += d * Math.min(1, dt * 10);
    }
    f.fresh = false;
    f.chibi.root.position.copy(pos);
    f.chibi.root.rotation.y = f.yaw;
    f.chibi.setBoat(sea);
    f.chibi.animate(time, moving && !sea, dt);
    f.prev.copy(pos);
  }

  // 在城裡繞圈；剛到和要離開時從城中心慢慢走出去、走回來，接上路徑不會跳
  function cityPos(placeId, angle, k, out) {
    const isl = islands.get(placeId);
    const g = isl.group.position;
    const rad = isl.radius * 0.62 * k;
    return out.set(g.x + Math.cos(angle) * rad, g.y + CITY_TOP, g.z + Math.sin(angle) * rad);
  }

  // stops：依序的城市；legs：對應的地面路徑。回傳現在的位置、是否在海上、在哪一站
  function routeAt(stops, legs, t, angle, out, { loop = true, stay = STAY } = {}) {
    const n = stops.length;
    if (n === 1) { cityPos(stops[0], angle, 1, out); return { sea: false, index: 0, staying: true }; }
    const cycle = n * stay + legs.reduce((s, l) => s + l.len / SPEED, 0);
    let r = loop ? t % cycle : Math.min(t, cycle - 1e-6);
    for (let i = 0; i < n; i++) {
      if (r < stay) {
        const k = Math.min(1, r / 0.6, i === n - 1 && !loop ? 1 : (stay - r) / 0.6);
        cityPos(stops[i], angle, Math.max(0, k), out);
        return { sea: false, index: i, staying: true, done: !loop && i === n - 1 };
      }
      r -= stay;
      const leg = legs[i];
      if (!leg) break;
      const dur = leg.len / SPEED;
      if (r < dur) return { sea: legPoint(leg, r / dur, out), index: i + 1, staying: false };
      r -= dur;
    }
    cityPos(stops[n - 1], angle, 1, out);
    return { sea: false, index: n - 1, staying: true, done: true };
  }

  // ---------- 聖經人物 ----------
  // 每個人物依出現的順序在城市之間走：在城裡繞一會兒，再走到下一座城
  const characters = new Map();
  data.characters.forEach((c, ci) => {
    const el = document.createElement("button");
    el.className = "char-tag";
    el.style.setProperty("--c", c.color);
    el.dataset.characterId = c.id;
    const fig = makeFigure(c.look, el);
    fig.chibi.root.visible = fig.tag.visible = false;
    const apps = c.appearances.map(a => ({ ...a, era: eraOf(a.r, data.eras) }));
    characters.set(c.id, { c, f: fig, fig: fig.chibi.root, el, tag: fig.tag, apps, stops: [], legs: [], t: 0, phase: ci * 1.7, name: "" });
  });

  let charEra = null;
  let hiddenChars = new Set();

  function buildCharRoutes() {
    for (const ch of characters.values()) {
      // 同一座城連續出現的合併成一站
      const stops = [];
      for (const a of ch.apps) {
        if (charEra && a.era !== charEra) continue;
        if (stops.length && stops.at(-1).place === a.place) { stops.at(-1).apps.push(a); continue; }
        stops.push({ place: a.place, apps: [a] });
      }
      ch.stops = stops;
      ch.legs = stops.slice(1).map((s, i) => groundLeg(stops[i].place, s.place));
      ch.t = 0;
      ch.f.fresh = true;
      const on = !!ch.pinned || (stops.length > 0 && !hiddenChars.has(ch.c.id));
      ch.fig.visible = ch.tag.visible = on;
    }
  }

  const tmpPos = new THREE.Vector3();
  function setTagName(ch, name) {
    if (name !== ch.name) { ch.name = name; ch.el.innerHTML = `<i>${name[0]}</i><span>${name}</span>`; }
  }
  function updateCharacter(ch, dt, time) {
    if (ch.pinned) { posePinned(ch.f, ch.pinned, time, dt, speaking.has(ch.c.id)); return; }
    if (!ch.fig.visible) return;
    ch.t += dt;
    const angle = time * 0.45 + ch.phase;
    const r = routeAt(ch.stops.map(s => s.place), ch.legs, ch.t, angle, tmpPos);
    poseFigure(ch.f, tmpPos, r.sea, time, dt);
    const stop = ch.stops[r.index];
    setTagName(ch, stop.apps[0].name || ch.c.name);
    // 剛走進一座城（停留中）時通知一次，讓介面可以提示「這裡有對話」
    const arrivedKey = r.staying ? stop.place + "#" + r.index : null;
    if (arrivedKey && arrivedKey !== ch.arrivedKey) {
      const enc = encounterFor(ch, stop.place, stop.apps);
      if (enc) showBubble(enc);
      handlers.arrive(ch.c.id, stop.place, enc);
    }
    ch.arrivedKey = arrivedKey;
    ch.at = stop.place;
  }

  // ---------- 相遇與對話 ----------
  // 對話進行時，相關人物被「釘」在同一座城裡圍成半圈，面向中央；說話的人會跳一跳
  const speaking = new Set();
  let staged = null;   // { place, ids }
  function posePinned(f, pin, time, dt, talk) {
    f.fresh = true;   // 解除後重新算移動方向，不會一下子轉身
    f.chibi.root.position.copy(pin.pos);
    if (talk) f.chibi.root.position.y += Math.abs(Math.sin(time * 9)) * 0.06;
    let d = pin.yaw - f.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    f.yaw += d * Math.min(1, dt * 8);
    f.chibi.root.rotation.y = f.yaw;
    f.chibi.setBoat(false);
    f.chibi.animate(time, false, dt);
    f.prev.copy(pin.pos);
  }
  function stageEncounter(enc, names = {}) {
    releaseEncounter();
    const isl = islands.get(enc.place);
    const g = isl.group.position;
    const ids = enc.people.filter(id => characters.has(id));
    const withMe = !!avatar && avatar.place === enc.place;
    const n = ids.length + (withMe ? 1 : 0);
    // 站在城市靠鏡頭那一側的半圓上，大家都看得到臉
    const camDir = Math.atan2(camera.position.z - g.z, camera.position.x - g.x);
    const spread = Math.min(Math.PI * 0.9, 0.55 * n);
    const pinAt = i => {
      const a = camDir + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1));
      const rad = isl.radius * 0.5;
      const pos = new THREE.Vector3(g.x + Math.cos(a) * rad, g.y + CITY_TOP, g.z + Math.sin(a) * rad);
      return { pos, yaw: Math.atan2(g.x - pos.x, g.z - pos.z) + (camDir - a) * 0.6 };
    };
    ids.forEach((id, i) => {
      const ch = characters.get(id);
      ch.pinned = pinAt(i);
      ch.fig.visible = ch.tag.visible = true;
      setTagName(ch, names[id] || ch.c.name);
    });
    if (withMe) avatar.pinned = pinAt(ids.length);
    staged = { place: enc.place, ids };
    // 鏡頭貼近這座城
    const target = new THREE.Vector3(g.x, CITY_TOP + 0.2, g.z);
    const off = new THREE.Vector3(Math.cos(camDir), 0, Math.sin(camDir)).multiplyScalar(3.4).add(new THREE.Vector3(0, 2.2, 0));
    flyTo(target.clone().add(off), target, 1.2);
  }
  function releaseEncounter() {
    if (!staged) return;
    for (const id of staged.ids) {
      const ch = characters.get(id);
      ch.pinned = null;
      ch.fig.visible = ch.tag.visible = ch.stops.length > 0 && !hiddenChars.has(id);
    }
    if (avatar) avatar.pinned = null;
    speaking.clear();
    for (const ch of characters.values()) ch.el.classList.remove("speaking");
    staged = null;
  }

  // 對話泡泡平常不出現：人物走進一座城、正好是某段相遇發生的地方時，才在城上冒出來，過一會兒消失
  const BUBBLE_SECONDS = 9;
  const bubbles = new Map();   // placeId → { obj, el, until }
  for (const pid of new Set((data.encounters || []).map(e => e.place))) {
    const el = document.createElement("button");
    el.className = "talk-bubble";
    el.dataset.placeId = pid;
    const obj = new CSS2DObject(el);
    obj.position.set(0, CITY_TOP + 1.25, 0);
    obj.visible = false;
    islands.get(pid).group.add(obj);
    bubbles.set(pid, { obj, el, until: 0 });
  }
  let clockNow = 0;
  function showBubble(enc) {
    const b = bubbles.get(enc.place);
    if (!b || staged) return;
    b.el.dataset.encId = enc.id;
    b.el.innerHTML = `💬<span>${enc.title}</span>`;
    b.until = clockNow + BUBBLE_SECONDS;
    b.obj.visible = true;
  }
  // 這個人物在這一站（這些出場）有沒有對應的相遇：經文範圍要重疊。
  // 同一站有好幾段（例如保羅在腓立比：呂底亞、半夜的詩歌），每次經過輪流出現一段
  function encounterFor(ch, placeId, apps) {
    const list = (data.encounters || []).filter(e => e.place === placeId && e.people.includes(ch.c.id) &&
      apps.some(a => refsOverlap(a.r, e.r)));
    if (!list.length) return null;
    ch.encTurn = (ch.encTurn || 0) + 1;
    return list[ch.encTurn % list.length];
  }

  // ---------- 我的角色 ----------
  let avatar = null;   // { f, el, name, look, place, stops, legs, t, walking, arrived, onArrive, onDone }
  function setAvatar(look, name, placeId) {
    const keep = avatar;
    const el = document.createElement("div");
    el.className = "char-tag me";
    el.innerHTML = `<i>我</i><span></span>`;
    el.querySelector("span").textContent = name || "我";
    const f = makeFigure(look, el);
    if (keep) {
      f.yaw = keep.f.yaw;
      scene.remove(keep.f.chibi.root);
      keep.f.chibi.dispose();
      keep.el.remove();
    }
    avatar = { ...(keep || { place: placeId, stops: [placeId], legs: [], t: 0, walking: false, arrived: -1 }), f, el, name, look };
    if (placeId && !avatar.walking) { avatar.place = placeId; avatar.stops = [placeId]; avatar.legs = []; }
  }
  function updateAvatar(dt, time) {
    if (!avatar) return;
    if (avatar.pinned) { posePinned(avatar.f, avatar.pinned, time, dt, false); return; }
    avatar.t += dt;
    const r = routeAt(avatar.stops, avatar.legs, avatar.walking ? avatar.t : 0, time * 0.4, tmpPos, { loop: false, stay: avatar.walking ? 2.6 : 1 });
    poseFigure(avatar.f, tmpPos, r.sea, time, dt);
    if (avatar.walking && r.staying && r.index !== avatar.arrived) {
      avatar.arrived = r.index;
      avatar.place = avatar.stops[r.index];
      avatar.onArrive?.(avatar.place, r.index);
    }
    if (avatar.walking && r.done) {
      avatar.walking = false;
      avatar.stops = [avatar.place];
      avatar.legs = [];
      avatar.onDone?.();
    }
  }

  // ---------- 互動 ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const handlers = { pick: () => {}, hover: () => {}, character: () => {}, follow: () => {}, arrive: () => {}, talk: () => {} };

  function pickAt(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.placeId : null;
  }
  renderer.domElement.addEventListener("pointerdown", ev => { down = { x: ev.clientX, y: ev.clientY }; });
  renderer.domElement.addEventListener("pointerup", ev => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved < 6) handlers.pick(pickAt(ev));
  });
  renderer.domElement.addEventListener("pointermove", ev => {
    if (down) return;
    const id = pickAt(ev);
    renderer.domElement.style.cursor = id ? "pointer" : "";
    handlers.hover(id);
  });
  labelRenderer.domElement.addEventListener("click", ev => {
    const t = ev.target.closest(".talk-bubble");
    if (t) { handlers.talk(t.dataset.placeId, t.dataset.encId); return; }
    const c = ev.target.closest(".char-tag");
    if (c) { if (c.dataset.characterId) handlers.character(c.dataset.characterId); return; }
    const b = ev.target.closest(".island-label");
    if (b) handlers.pick(b.dataset.placeId);
  });

  // ---------- 鏡頭飛行 ----------
  let fly = null;
  // track：飛行途中目標還在移動（跟著人物走），每個畫格更新終點
  function flyTo(pos, target, dur = 1.1, track = null) {
    if (!track) stopFollow();
    fly = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), track, off: pos.clone().sub(target) };
  }

  // ---------- 跟著走 ----------
  let follow = null;   // { key, get: () => Vector3 | null }
  const followLast = new THREE.Vector3();
  function startFollow(key, get) {
    const p = get();
    if (!p) return false;
    // 從目前的方向貼近，仰角固定在 35 度左右，看得到人也看得到城
    const d = camera.position.clone().sub(controls.target); d.y = 0;
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize().multiplyScalar(3.2).add(new THREE.Vector3(0, 2.3, 0));
    flyTo(p.clone().add(d), p, 1.3, get);
    follow = { key, get };
    handlers.follow(key);
    return true;
  }
  function stopFollow() {
    if (!follow) return;
    follow = null;
    handlers.follow(null);
  }
  const chest = v => v.clone().add(new THREE.Vector3(0, 0.22, 0));
  const charGetter = id => () => { const ch = characters.get(id); return ch && ch.fig.visible ? chest(ch.fig.position) : null; };
  const avatarGetter = () => (avatar ? chest(avatar.f.chibi.root.position) : null);
  function flyToPlace(id, dist = 12) {
    const g = islands.get(id).group.position;
    const target = new THREE.Vector3(g.x, CITY_TOP, g.z);
    // 保留目前的觀看方向，只拉近距離
    const dir = camera.position.clone().sub(controls.target).normalize();
    flyTo(target.clone().addScaledVector(dir, dist), target);
  }
  // 算出能把這些城市全部框進「沒被面板擋住的區域」的鏡頭位置
  function framePlaces(ids, dir) {
    const box = new THREE.Box3();
    ids.forEach(id => box.expandByPoint(islands.get(id).group.position));
    box.expandByScalar(2);
    const center = box.getCenter(new THREE.Vector3()); center.y = CITY_TOP;
    const size = box.getSize(new THREE.Vector3());
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // 可見範圍以整張畫布的高度算，再乘上沒被擋住的比例；斜看時地面深度會被壓縮，用仰角修正
    const tilt = Math.max(0.35, Math.abs(dir.y));
    const fit = 1.1;
    const dist = Math.min(controls.maxDistance, Math.max(9,
      fit * size.x * view.fullH / (2 * tan * view.w),
      fit * size.z * tilt * view.fullH / (2 * tan * view.h)));
    return { pos: center.clone().addScaledVector(dir, dist), target: center };
  }
  function flyToPlaces(ids) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    const f = framePlaces(ids, dir);
    flyTo(f.pos, f.target);
  }
  const HOME_DIR = new THREE.Vector3(0, 0.86, 0.5).normalize();
  const allIds = data.places.map(p => p.id);
  const flyHome = () => { const f = framePlaces(allIds, HOME_DIR); flyTo(f.pos, f.target); };

  // ---------- 狀態 ----------
  let selected = null;
  let activeJourney = null;
  let focus = null;   // { places:Set, journeys:Set } 或 null 表示全部
  let pulse = null;
  let showFlows = true;

  function applyFocus() {
    for (const [id, isl] of islands) {
      const on = !focus || focus.places.has(id);
      isl.mats.forEach((m, i) => m.color.copy(isl.baseColors[i]).lerp(DIM, on ? 0 : 0.7));
      isl.el.classList.toggle("dim", !on);
      isl.buildings.forEach(b => (b.visible = on || id === selected));
    }
    for (const [id, f] of flows) {
      const inFocus = !focus || focus.journeys.has(id);
      const active = id === activeJourney;
      f.group.visible = showFlows && (inFocus || active);
      f.material.opacity = active ? 1 : (activeJourney ? 0.08 : (focus ? 0.7 : 0.3));
      // CSS2DRenderer 不看父物件的 visible，名牌要自己藏
      f.walker.visible = f.tagObj.visible = active;
    }
  }

  function select(id) {
    if (selected) islands.get(selected).liftTo = 0;
    selected = id;
    for (const [pid, isl] of islands) isl.el.classList.toggle("selected", pid === id);
    if (id) {
      const isl = islands.get(id);
      isl.liftTo = 0.15;
      selRing.scale.setScalar(isl.radius);
    }
    selRing.visible = !!id;
    applyFocus();
  }

  function pulseBuilding(placeId, index) {
    const isl = islands.get(placeId);
    if (isl && isl.buildings[index]) pulse = { b: isl.buildings[index], t: 0 };
  }

  // ---------- 一天的光線 ----------
  // 一天在現實中跑 4 分鐘；可以暫停，也可以直接跳到某個時段
  const DAY_SPEED = 6;   // 每秒前進幾分鐘
  let dayMin = 540, dayPaused = false;
  const cA = new THREE.Color(), cB = new THREE.Color();
  function applyTime(m) {
    let i = 0;
    while (i < TOD.length - 2 && TOD[i + 1].m <= m) i++;
    const a = TOD[i], b = TOD[i + 1], k = (m - a.m) / (b.m - a.m || 1);
    const col = (key, target) => target.copy(cA.set(a[key])).lerp(cB.set(b[key]), k);
    const num = key => a[key] + (b[key] - a[key]) * k;
    col("sky", scene.background);
    scene.fog.color.copy(scene.background);
    col("sun", sun.color); sun.intensity = num("sunI");
    col("hemiS", hemi.color); col("hemiG", hemi.groundColor); hemi.intensity = num("hemiI");
    col("sea", sea.material.color);
    col("land", landMats[0].color);
    landMats[1].color.copy(landMats[0].color).multiplyScalar(0.84);
    glowMat.opacity = num("night") * 0.9;
    // 太陽早上從東邊（+x）升起、傍晚在西邊落下；夜裡換成高掛的月光
    const ph = (m - 360) / 720;
    if (ph > 0 && ph < 1) sun.position.set(Math.cos(Math.PI * ph) * 70, 14 + Math.sin(Math.PI * ph) * 60, 30);
    else sun.position.set(-20, 60, 30);
    document.body.classList.toggle("night", num("night") > 0.6);
  }

  // ---------- 動畫迴圈 ----------
  const clock = new THREE.Clock();
  const m4 = new THREE.Matrix4();

  // 面板蓋住畫面的一部分：用 view offset 把畫面中心移到沒被擋住的區域
  const view = { w: 1, h: 1, fullH: 1 };
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    const mobile = w <= 760;
    const panel = !document.body.classList.contains("panel-hidden");   // 「清單」可以把面板收起來
    const offX = mobile || !panel ? 0 : 366 / 2;
    // 桌面版左上角有標頭卡、底部有時間軸，畫面中心略往下移
    let offY = mobile ? (panel ? h * 0.44 / 2 - 30 : -20) : -10;
    // 對話進行中：對話框在下方，把畫面往上推，讓聚在一起的人物露出來
    if (document.body.classList.contains("talking")) offY += mobile ? h * 0.12 : h * 0.17;
    view.w = mobile || !panel ? w - 32 : w - 366 - 16;
    view.h = mobile ? (panel ? h * 0.42 : h - 220) : h - 190;
    view.fullH = h;
    camera.setViewOffset(w, h, offX, offY, w, h);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  { const f = framePlaces(allIds, HOME_DIR); camera.position.copy(f.pos); controls.target.copy(f.target); }

  // 城市標籤互相重疊時，只留事件多的那個；選取中的永遠顯示。每 200ms 檢查一次就夠了
  const byPriority = [...islands.values()].sort((a, b) => b.place.events.length - a.place.events.length);
  setInterval(() => {
    const shown = [];
    const order = selected ? [islands.get(selected), ...byPriority.filter(i => i.place.id !== selected)] : byPriority;
    for (const isl of order) {
      isl.el.classList.remove("crowded");
      const r = isl.el.getBoundingClientRect();
      const hit = shown.some(s => r.left < s.right + 2 && r.right > s.left - 2 && r.top < s.bottom + 1 && r.bottom > s.top - 1);
      if (hit && isl.place.id !== selected) isl.el.classList.add("crowded");
      else shown.push(r);
    }
  }, 200);

  renderer.setAnimationLoop(frame);
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // 先讓人物走，鏡頭再跟上，才不會慢一格
    clockNow = time;
    for (const ch of characters.values()) updateCharacter(ch, dt, time);
    for (const b of bubbles.values()) if (b.obj.visible && (staged || time > b.until)) b.obj.visible = false;
    updateAvatar(dt, time);
    if (activeJourney) {
      const f = flows.get(activeJourney);
      f.t += dt;
      const r = routeAt(f.journey.route, f.ground, f.t, time * 0.5, tmpPos, { stay: 1.2 });
      poseFigure(f.fig, tmpPos, r.sea, time, dt);
      // 對話把這段旅程的人物本人叫來城裡時，旅人先藏起來，同一個人不會出現兩次
      const dup = !!staged && (f.journey.walkers || []).some(id => staged.ids.includes(id));
      f.walker.visible = f.tagObj.visible = !dup;
    }

    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      if (fly.track) {
        const p = fly.track();
        if (p) { fly.t1.copy(p); fly.p1.copy(p).add(fly.off); }
      }
      const e = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (fly.t >= 1) { fly = null; if (follow) { const p = follow.get(); if (p) followLast.copy(p); } }
    } else if (follow) {
      // 跟著走：人物移動多少，鏡頭和注視點就一起平移多少；使用者仍可旋轉、縮放
      const p = follow.get();
      if (!p) stopFollow();
      else {
        const d = p.clone().sub(followLast);
        camera.position.add(d);
        controls.target.add(d);
        followLast.copy(p);
      }
    }
    controls.update();

    if (!dayPaused) dayMin = (dayMin + dt * DAY_SPEED) % 1440;
    applyTime(dayMin);

    for (const isl of islands.values()) {
      isl.lift += (isl.liftTo - isl.lift) * Math.min(1, dt * 8);
      isl.group.position.y = isl.lift;
    }
    if (selected) {
      const g = islands.get(selected).group.position;
      selRing.position.set(g.x, LAND_TOP + 0.02, g.z);
      selRing.material.opacity = 0.55 + Math.sin(time * 3) * 0.25;
    }

    if (pulse) {
      pulse.t += dt;
      const s = 0.8 * (1 + Math.sin(Math.min(pulse.t, 0.9) / 0.9 * Math.PI * 3) * 0.35 * (1 - pulse.t / 0.9));
      pulse.b.scale.setScalar(pulse.t < 0.9 ? s : 0.8);
      if (pulse.t >= 0.9) pulse = null;
    }

    for (const r of ripples) {
      const k = (time * 0.2 + r.userData.phase) % 3 / 3;
      r.scale.setScalar(0.6 + k * 2.4);
      r.material.opacity = Math.sin(k * Math.PI) * 0.16;
    }

    people.forEach((pp, i) => {
      pp.a += pp.speed * dt;
      const g = pp.isl.group.position;
      const x = g.x + Math.cos(pp.a) * pp.rad, z = g.z + Math.sin(pp.a) * pp.rad;
      const y = g.y + CITY_TOP + Math.abs(Math.sin(time * 6 + pp.bob)) * 0.015;
      const on = !focus || focus.places.has(pp.isl.place.id);
      if (on) m4.makeRotationY(-pp.a - (pp.speed > 0 ? 0 : Math.PI)).setPosition(x, y, z);
      else m4.makeScale(0, 0, 0);
      bodies.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;

    // 拉遠時人物名牌縮成一個字的圓點，免得蓋住城市名
    labelRenderer.domElement.classList.toggle("far", camera.position.distanceTo(controls.target) > 55);

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  buildCharRoutes();

  return {
    islands, flows,
    on(name, fn) { handlers[name] = fn; },
    select, flyToPlace, flyToPlaces, flyHome, pulseBuilding,
    setFocus(f) { focus = f; applyFocus(); },
    setJourney(id) {
      if (id && id !== activeJourney) flows.get(id).t = 0;
      activeJourney = id;
      applyFocus();
      // 旅程的旅人已經代表這些人物，地圖上同一個人不要出現兩次
      hiddenChars = new Set(id ? flows.get(id).journey.walkers || [] : []);
      for (const ch of characters.values()) ch.fig.visible = ch.tag.visible = !!ch.pinned || (ch.stops.length > 0 && !hiddenChars.has(ch.c.id));
    },
    setCharacterEra(id) { charEra = id; buildCharRoutes(); },

    // 相遇與對話
    stageEncounter,
    releaseEncounter,
    setSpeaking(ids) {
      speaking.clear();
      ids.forEach(id => speaking.add(id));
      for (const ch of characters.values()) ch.el.classList.toggle("speaking", speaking.has(ch.c.id));
    },
    // 自己的角色走到有相遇的城時，也冒出對話泡泡
    showEncounterBubble(enc) { showBubble(enc); },

    // 跟著走
    followCharacter(id) { return startFollow({ kind: "character", id }, charGetter(id)); },
    followAvatar() { return startFollow({ kind: "avatar" }, avatarGetter); },
    stopFollow,

    // 時間與顯示
    setTime(m) { dayMin = m; applyTime(m); },
    getTime: () => dayMin,
    setPaused(on) { dayPaused = on; },
    isPaused: () => dayPaused,
    setShowFlows(on) { showFlows = on; applyFocus(); },
    setShowNames(on) { labelRenderer.domElement.classList.toggle("hide-names", !on); },
    relayout() { resize(); },

    // 我的角色
    setAvatar(look, name, placeId) { setAvatar(look, name, placeId); },
    hasAvatar: () => !!avatar,
    avatarPlace: () => avatar?.place || null,
    startAvatarTrip(route, onArrive, onDone) {
      if (!avatar) return;
      avatar.stops = route.slice();
      avatar.legs = route.slice(1).map((pid, i) => groundLeg(route[i], pid));
      avatar.t = 0;
      avatar.arrived = -1;
      avatar.walking = true;
      avatar.place = route[0];
      avatar.onArrive = onArrive;
      avatar.onDone = onDone;
    },
    stopAvatarTrip() {
      if (!avatar) return;
      avatar.walking = false;
      avatar.stops = [avatar.place];
      avatar.legs = [];
    },
    removeAvatar() {
      if (!avatar) return;
      if (follow && follow.key.kind === "avatar") stopFollow();
      scene.remove(avatar.f.chibi.root);
      avatar.f.chibi.dispose();
      avatar.el.remove();
      avatar = null;
    },

    // 拍照：把目前畫面加上一行說明，回傳 PNG 的 data URL
    snapshot(title, sub) {
      renderer.render(scene, camera);
      const src = renderer.domElement, w = src.width, h = src.height;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.drawImage(src, 0, 0);
      const s = h / 900, pad = 28 * s;
      g.font = `700 ${34 * s}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
      const tw = Math.max(g.measureText(title).width, (g.font = `${22 * s}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`, g.measureText(sub).width));
      const bw = tw + pad * 2, bh = 104 * s, x = pad, y = h - bh - pad;
      g.fillStyle = "rgba(255,250,243,0.92)";
      g.beginPath(); g.roundRect(x, y, bw, bh, 18 * s); g.fill();
      g.fillStyle = "#2a2420";
      g.font = `700 ${34 * s}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
      g.fillText(title, x + pad, y + 46 * s);
      g.fillStyle = "#7a6f66";
      g.font = `${22 * s}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
      g.fillText(sub, x + pad, y + 82 * s);
      return c.toDataURL("image/png");
    },
    selectCharacter(id) {
      for (const ch of characters.values()) ch.el.classList.toggle("selected", ch.c.id === id);
    },
    // 人物現在在哪座城（停留中或正要前往）
    characterPlace(id) { return characters.get(id).at || characters.get(id).stops[0]?.place || null; },
    flyToCharacter(id, dist = 12) {
      const ch = characters.get(id);
      if (!ch.fig.visible) return false;
      const target = ch.fig.position.clone();
      const dir = camera.position.clone().sub(controls.target).normalize();
      flyTo(target.clone().addScaledVector(dir, dist), target);
      return true;
    },
  };
}

// ---------- 城裡的小建築 ----------
function createBuilding(kind, seed) {
  const g = new THREE.Group();
  const add = (geo, color, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  switch (kind) {
    case "temple": {
      add(new THREE.BoxGeometry(0.34, 0.04, 0.24), C.stone, 0, 0.02, 0);
      for (let i = 0; i < 4; i++) for (const z of [-0.08, 0.08])
        add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6), "#fffaf0", -0.12 + i * 0.08, 0.12, z);
      add(new THREE.BoxGeometry(0.36, 0.035, 0.26), C.stone, 0, 0.215, 0);
      const roof = add(new THREE.CylinderGeometry(0.001, 0.15, 0.36, 3), C.gold, 0, 0.27, 0);
      roof.rotation.z = Math.PI / 2; roof.scale.set(1, 1, 0.45);
      break;
    }
    case "synagogue": {
      add(new THREE.BoxGeometry(0.26, 0.16, 0.2), "#e8d3a8", 0, 0.08, 0);
      add(new THREE.BoxGeometry(0.29, 0.03, 0.23), "#cdb684", 0, 0.175, 0);
      add(new THREE.BoxGeometry(0.06, 0.09, 0.01), C.wood, 0, 0.045, 0.101);
      break;
    }
    case "prison": {
      add(new THREE.BoxGeometry(0.24, 0.16, 0.22), "#8d877f", 0, 0.08, 0);
      add(new THREE.BoxGeometry(0.1, 0.28, 0.1), C.dark, 0.08, 0.14, -0.06);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.008, 0.07, 0.008), "#2c2a28", -0.06 + i * 0.03, 0.09, 0.112);
      break;
    }
    case "market": {
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 6), C.stone, 0, 0.01, 0);
      add(new THREE.CylinderGeometry(0.02, 0.025, 0.2, 6), "#fffaf0", 0, 0.12, 0);
      const awning = ["#c4693f", "#3f6fa0", "#d6a640"];
      for (let i = 0; i < 2; i++) {
        const x = i ? 0.11 : -0.11;
        add(new THREE.BoxGeometry(0.08, 0.06, 0.07), C.wood, x, 0.05, 0.06);
        add(new THREE.BoxGeometry(0.1, 0.012, 0.09), awning[(seed + i) % 3], x, 0.1, 0.06);
      }
      break;
    }
    case "ship": {
      const hull = add(new THREE.CylinderGeometry(0.06, 0.04, 0.32, 6), C.wood, 0, 0.05, 0);
      hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, 0.6);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), C.wood, 0, 0.2, 0);
      add(new THREE.BoxGeometry(0.004, 0.17, 0.16), "#fffaf0", 0.01, 0.23, 0);
      break;
    }
    case "road": {
      add(new THREE.BoxGeometry(0.08, 0.008, 0.36), "#d6c49c", 0, 0.004, 0);
      add(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 6), C.stone, 0.07, 0.07, 0.05);
      add(new THREE.BoxGeometry(0.1, 0.03, 0.01), C.wood, 0.07, 0.13, 0.05);
      break;
    }
    case "tree": {
      add(new THREE.CylinderGeometry(0.018, 0.024, 0.14, 5), C.wood, 0, 0.07, 0);
      add(new THREE.IcosahedronGeometry(0.11, 0), C.leaf, 0, 0.2, 0);
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.006, 12), "#7cb6c4", 0.12, 0.003, 0.08);
      break;
    }
    default: { // house
      const h = 0.11 + (seed % 3) * 0.03;
      add(new THREE.BoxGeometry(0.17, h, 0.15), C.wall, 0, h / 2, 0);
      add(new THREE.BoxGeometry(0.19, 0.02, 0.17), "#e5d9c2", 0, h + 0.01, 0);
      add(new THREE.BoxGeometry(0.04, 0.06, 0.005), C.roof, 0, 0.03, 0.076);
    }
  }
  return g;
}
