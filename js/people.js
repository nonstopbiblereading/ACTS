// Q 版人物：大頭、長袍、頭巾、鬍子與手上的東西，全部用基本幾何拼出來。
// 模型站在原點、面向 +z，身高約 1 單位，使用時再縮放。

import * as THREE from "three";

export const DEFAULT_LOOK = {
  skin: "#e9c9a8", hair: "short", hairColor: "#3b2a1e", beard: "none", beardColor: null,
  head: "none", headColor: "#e8dcc4", robe: "#3f6fa0", sash: "#c9a227", item: "none", itemColor: null,
};

// 「我的角色」編輯器的選項
export const LOOK_OPTIONS = {
  hair:  [["short", "短髮"], ["long", "長髮"], ["curly", "捲髮"], ["bald", "光頭"]],
  beard: [["none", "無"], ["short", "短鬍子"], ["long", "長鬍子"]],
  head:  [["none", "無"], ["headcloth", "頭巾"], ["veil", "面紗"], ["helmet", "頭盔"]],
  item:  [["none", "空手"], ["staff", "杖"], ["scroll", "書卷"], ["net", "漁網"], ["basket", "籃子"],
          ["lamp", "油燈"], ["sword", "劍"], ["cloth", "布匹"], ["tent", "帳棚布"]],
  skin:  ["#f1d3b3", "#e2b48c", "#c68a5e", "#8d5a3b"],
  robe:  ["#f2ecdf", "#b5483d", "#c4693f", "#c9a227", "#6f9a4f", "#4e8f9e", "#2f6fa0", "#7b4a9a", "#8c6a4a", "#4a4440"],
  color: ["#e8dcc4", "#f2ecdf", "#e3c56a", "#c77fa6", "#b58ac9", "#9ac3d6", "#3b2a1e", "#8a8580", "#1f1a16", "#9aa0a6"],
};

// 身分：選了會套用一組預設外觀，之後還能再改
export const ROLES = [
  { id: "disciple", name: "門徒", look: { item: "none" } },
  { id: "fisher", name: "漁夫", look: { beard: "short", head: "none", item: "net", robe: "#4e8f9e" } },
  { id: "tentmaker", name: "織帳棚的", look: { beard: "short", item: "tent", robe: "#8c6a4a" } },
  { id: "merchant", name: "商人", look: { head: "headcloth", headColor: "#e3c56a", item: "basket", robe: "#c4693f" } },
  { id: "centurion", name: "百夫長", look: { head: "helmet", headColor: "#9aa0a6", item: "sword", robe: "#b5483d", beard: "none" } },
  { id: "scribe", name: "文士", look: { head: "headcloth", headColor: "#f2ecdf", beard: "long", item: "scroll", robe: "#f2ecdf" } },
  { id: "shepherd", name: "牧羊人", look: { head: "headcloth", headColor: "#e8dcc4", item: "staff", robe: "#8c6a4a" } },
  { id: "woman", name: "婦女", look: { head: "veil", headColor: "#e9b7cf", beard: "none", hair: "long", item: "lamp", robe: "#c77fa6" } },
];

const matCache = new Map();
function mat(color, opts) {
  const k = color + (opts ? JSON.stringify(opts) : "");
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  return matCache.get(k);
}
const WOOD = "#8a5a3b", CREAM = "#f4ead2", METAL = "#a9adb2", INK = "#2a2420";

export function createChibi(lookIn) {
  const look = { ...DEFAULT_LOOK, ...lookIn };
  const root = new THREE.Group();
  const body = new THREE.Group();   // 坐船時整個往上抬
  root.add(body);
  const add = (parent, geo, color, x = 0, y = 0, z = 0, opts) => {
    const m = new THREE.Mesh(geo, mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // 腳（藏在袍子底下，走路時露出一點）
  const legs = [-0.06, 0.06].map(x => {
    const g = new THREE.Group(); g.position.set(x, 0.17, 0); body.add(g);
    add(g, new THREE.BoxGeometry(0.075, 0.17, 0.09), "#6b4a32", 0, -0.085, 0.01);
    return g;
  });

  // 長袍、腰帶
  add(body, new THREE.CylinderGeometry(0.15, 0.23, 0.42, 14), look.robe, 0, 0.31, 0);
  add(body, new THREE.CylinderGeometry(0.157, 0.162, 0.045, 14), look.sash, 0, 0.42, 0);
  add(body, new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), look.robe, 0, 0.52, 0);

  // 手臂：從肩膀擺動
  const arms = [-1, 1].map(side => {
    const g = new THREE.Group(); g.position.set(side * 0.175, 0.53, 0); body.add(g);
    const sleeve = add(g, new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), look.robe, 0, -0.1, 0);
    sleeve.rotation.z = side * 0.12;
    add(g, new THREE.SphereGeometry(0.042, 10, 8), look.skin, side * 0.015, -0.23, 0.01);
    return g;
  });

  // 頭
  const head = new THREE.Group(); head.position.y = 0.76; body.add(head);
  add(head, new THREE.SphereGeometry(0.21, 22, 16), look.skin);
  for (const x of [-0.072, 0.072]) add(head, new THREE.SphereGeometry(0.024, 8, 6), INK, x, 0.01, 0.195);
  for (const x of [-0.12, 0.12]) add(head, new THREE.SphereGeometry(0.03, 8, 6), "#f0a49a", x, -0.05, 0.165, { transparent: true, opacity: 0.55 });

  const hc = look.hairColor;
  if (look.hair === "bald") {
    // 傳統畫像裡的保羅：頂上光、兩側一圈頭髮
    const ring = add(head, new THREE.TorusGeometry(0.2, 0.04, 6, 18, Math.PI * 1.2), hc, 0, 0.0, -0.02);
    ring.rotation.set(Math.PI / 2, 0, -Math.PI * 0.1 + Math.PI);
  } else if (look.hair === "curly") {
    add(head, new THREE.SphereGeometry(0.215, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hc, 0, 0.02, -0.01);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      add(head, new THREE.IcosahedronGeometry(0.06, 0), hc, Math.cos(a) * 0.17, 0.11 + (i % 2) * 0.03, Math.sin(a) * 0.17 - 0.02);
    }
  } else {
    const cap = add(head, new THREE.SphereGeometry(0.222, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hc, 0, 0.01, -0.015);
    cap.rotation.x = -0.28;
    if (look.hair === "long") add(head, new THREE.BoxGeometry(0.34, 0.3, 0.12), hc, 0, -0.12, -0.13);
  }

  if (look.beard !== "none") {
    const bc = look.beardColor || hc;
    const b = add(head, new THREE.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42), bc, 0, -0.01, 0.045);
    b.scale.set(1, 1.1, 0.9);
    if (look.beard === "long") {
      const tip = add(head, new THREE.ConeGeometry(0.1, 0.2, 10), bc, 0, -0.24, 0.1);
      tip.rotation.x = Math.PI;
    }
  }

  if (look.head === "headcloth" || look.head === "veil") {
    const veil = look.head === "veil";
    add(head, new THREE.SphereGeometry(0.235, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), look.headColor, 0, 0.01, -0.01);
    const drapeH = veil ? 0.5 : 0.3;
    add(head, new THREE.BoxGeometry(0.4, drapeH, 0.07), look.headColor, 0, -drapeH / 2 + 0.05, -0.17);
    if (veil) for (const x of [-0.2, 0.2]) add(head, new THREE.BoxGeometry(0.06, 0.34, 0.2), look.headColor, x, -0.12, -0.04);
    else {
      const band = add(head, new THREE.TorusGeometry(0.226, 0.022, 6, 24), shade(look.headColor, 0.75), 0, 0.07, 0);
      band.rotation.x = Math.PI / 2 - 0.2;
    }
  } else if (look.head === "helmet") {
    add(head, new THREE.SphereGeometry(0.235, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), look.headColor, 0, 0.02, 0, { metalness: 0.5, roughness: 0.4 });
    add(head, new THREE.BoxGeometry(0.05, 0.12, 0.34), "#b5302a", 0, 0.27, 0);
    for (const x of [-0.2, 0.2]) add(head, new THREE.BoxGeometry(0.03, 0.14, 0.12), look.headColor, x, -0.07, 0.06, { metalness: 0.5, roughness: 0.4 });
  }

  // 右手拿的東西
  const hand = new THREE.Group(); hand.position.set(0.015, -0.23, 0.02); arms[1].add(hand);
  buildItem(hand, look, add);

  // 船：在海上時出現
  const boat = new THREE.Group();
  boat.visible = false;
  root.add(boat);
  {
    const hull = add(boat, new THREE.CylinderGeometry(0.34, 0.22, 1.3, 8, 1, false, 0, Math.PI), WOOD, 0, 0.12, 0);
    hull.rotation.set(Math.PI / 2, 0, Math.PI);
    hull.scale.set(1, 1, 0.45);
    add(boat, new THREE.BoxGeometry(0.5, 0.03, 1.1), "#a8794f", 0, 0.12, 0);
    add(boat, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), WOOD, 0, 0.7, -0.2);
    add(boat, new THREE.BoxGeometry(0.01, 0.65, 0.55), CREAM, 0.02, 0.85, -0.2);
  }

  let swing = 0;
  return {
    root,
    look,
    setBoat(on) {
      boat.visible = on;
      body.position.y = on ? 0.14 : 0;
      legs.forEach(l => (l.visible = !on));
    },
    // moving：走路時腳和手前後擺；停下時慢慢回正
    animate(time, moving, dt) {
      swing += ((moving ? 1 : 0) - swing) * Math.min(1, dt * 6);
      const s = Math.sin(time * 11) * 0.65 * swing;
      legs[0].rotation.x = s; legs[1].rotation.x = -s;
      arms[0].rotation.x = -s * 0.8; arms[1].rotation.x = s * 0.5 - 0.15;
      head.rotation.z = Math.sin(time * 1.3) * 0.04;
      body.position.y = (boat.visible ? 0.14 : 0) + Math.abs(Math.sin(time * 11)) * 0.025 * swing;
    },
    dispose() { root.traverse(o => o.geometry && o.geometry.dispose()); },
  };
}

function buildItem(hand, look, add) {
  const c = look.itemColor;
  switch (look.item) {
    case "staff": add(hand, new THREE.CylinderGeometry(0.018, 0.018, 0.95, 6), WOOD, 0, 0.12, 0.02); break;
    case "scroll": {
      const s = add(hand, new THREE.CylinderGeometry(0.035, 0.035, 0.17, 10), CREAM, 0, 0, 0.05);
      s.rotation.z = Math.PI / 2;
      for (const x of [-0.095, 0.095]) { const e = add(hand, new THREE.CylinderGeometry(0.015, 0.015, 0.05, 6), WOOD, x, 0, 0.05); e.rotation.z = Math.PI / 2; }
      break;
    }
    case "net": {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: "#7a6a4a", wireframe: true }));
      n.position.set(0, -0.06, 0.04); n.scale.set(1, 1.3, 0.6); hand.add(n);
      break;
    }
    case "basket": {
      add(hand, new THREE.CylinderGeometry(0.08, 0.06, 0.08, 10), "#b98a4e", 0, -0.08, 0.03);
      const h = add(hand, new THREE.TorusGeometry(0.06, 0.008, 4, 12, Math.PI), "#8a6236", 0, -0.04, 0.03);
      h.rotation.y = Math.PI / 2;
      for (const [x, z, col] of [[-0.02, 0.01, "#c4693f"], [0.025, 0.04, "#8db85a"], [0, 0.05, "#d6a640"]]) add(hand, new THREE.SphereGeometry(0.025, 6, 5), col, x, -0.03, z);
      break;
    }
    case "lamp": {
      const l = add(hand, new THREE.SphereGeometry(0.05, 10, 6), "#b5713f", 0, -0.02, 0.05); l.scale.set(1.3, 0.6, 0.9);
      add(hand, new THREE.SphereGeometry(0.022, 8, 6), "#ffd257", 0.05, 0.02, 0.05, { emissive: "#ffb020", emissiveIntensity: 2 });
      break;
    }
    case "sword": {
      add(hand, new THREE.BoxGeometry(0.025, 0.32, 0.01), METAL, 0, 0.12, 0.04, { metalness: 0.7, roughness: 0.3 });
      add(hand, new THREE.BoxGeometry(0.09, 0.02, 0.03), "#c9a227", 0, -0.04, 0.04);
      break;
    }
    case "cloth": {
      add(hand, new THREE.BoxGeometry(0.16, 0.05, 0.11), c || "#8e5ba8", 0, -0.05, 0.06);
      add(hand, new THREE.BoxGeometry(0.16, 0.04, 0.11), shade(c || "#8e5ba8", 1.2), 0, 0, 0.06);
      break;
    }
    case "tent": {
      const r = add(hand, new THREE.CylinderGeometry(0.045, 0.045, 0.24, 10), "#d6c49c", 0, -0.04, 0.05);
      r.rotation.z = Math.PI / 2;
      break;
    }
  }
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
  return "#" + c.getHexString();
}
