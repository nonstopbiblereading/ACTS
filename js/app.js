// 介面：側邊面板（地點／旅程／人物／搜尋）、時間軸、導覽，並把操作轉給 3D 場景。

import { DATA } from "./data.js?v=13";
import { createScene, TIME_PRESETS, timeLabel } from "./scene.js?v=13";
import { refValue, eraOf, refRange } from "./world.js?v=13";
import { DEFAULT_LOOK, LOOK_OPTIONS, ROLES } from "./people.js?v=13";

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const placeById = new Map(DATA.places.map(p => [p.id, p]));
const journeyById = new Map(DATA.journeys.map(j => [j.id, j]));
const journeysAt = id => DATA.journeys.filter(j => j.route.includes(id));
const eraById = new Map(DATA.eras.map(e => [e.id, e]));
const charById = new Map(DATA.characters.map(c => [c.id, c]));
DATA.characters.forEach(c => c.appearances.forEach(a => (a.era = eraOf(a.r, DATA.eras))));
const charsAt = id => DATA.characters.filter(c => c.appearances.some(a => a.place === id));
const encById = new Map(DATA.encounters.map(e => [e.id, e]));
DATA.encounters.forEach(e => (e.era = eraOf(e.r, DATA.eras)));
const encountersAt = (pid, era) => DATA.encounters.filter(e => e.place === pid && (!era || e.era === era));
const encountersOf = cid => DATA.encounters.filter(e => e.people.includes(cid));

// 每個時期涵蓋哪些地點、哪些旅程（人物在那個時期走到的城市也算）
const eraFocus = new Map(DATA.eras.map(e => {
  const lo = refValue(e.from), hi = refValue(e.to);
  const journeys = new Set(DATA.journeys.filter(j => j.era === e.id).map(j => j.id));
  const places = new Set();
  for (const p of DATA.places) if (p.events.some(ev => { const v = refValue(ev.r); return v >= lo && v <= hi; })) places.add(p.id);
  for (const id of journeys) journeyById.get(id).route.forEach(pid => places.add(pid));
  for (const c of DATA.characters) c.appearances.forEach(a => { if (a.era === e.id) places.add(a.place); });
  return [e.id, { places, journeys }];
}));

const scene = createScene($("#stage"), DATA);
$("#loading").remove();

const state = { tab: "places", place: null, journey: null, character: null, era: null, query: "", tour: -1, follow: null };

// ---------- 標頭與右側工具列 ----------
$("#tour-btn").onclick = () => startTour();

$("#tools").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (!b) return;
  switch (b.dataset.tool) {
    case "home":
      stopTour();
      setEra(null); openPlace(null); setJourney(null, false); openCharacter(null);
      scene.flyHome();
      break;
    case "avatar":
      $("#avatar-card").hidden ? openAvatar() : closeAvatar();
      break;
    case "list": {
      const hidden = document.body.classList.toggle("panel-hidden");
      b.classList.toggle("on", !hidden);
      scene.relayout();
      break;
    }
    case "time":
      $("#time-pop").hidden = !$("#time-pop").hidden;
      b.classList.toggle("on", !$("#time-pop").hidden);
      break;
  }
});

// ---------- 時間與顯示 ----------
$("#time-presets").innerHTML = TIME_PRESETS.map(([n, m]) => `<button data-min="${m}">${n}</button>`).join("");
$("#time-presets").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (b) { scene.setTime(Number(b.dataset.min)); updateClock(); }
});
$("#time-pause").onclick = () => { scene.setPaused(!scene.isPaused()); updateClock(); };
$("#opt-names").onchange = ev => scene.setShowNames(ev.target.checked);
$("#opt-flows").onchange = ev => scene.setShowFlows(ev.target.checked);
function updateClock() {
  const m = scene.getTime();
  $("#time-now").textContent = timeLabel(m);
  const cur = timeLabel(m).split(" ")[0];
  document.querySelectorAll("#time-presets button").forEach(b => b.classList.toggle("on", b.textContent === cur));
  $("#time-pause").textContent = scene.isPaused() ? "▶ 繼續" : "❚❚ 暫停";
}

// ---------- 跟著走 ----------
scene.on("follow", key => {
  state.follow = key;
  $("#follow-chip").hidden = !key;
  updateFollowChip();
  if (state.character) render();
});
$("#follow-stop").onclick = () => scene.stopFollow();
function updateFollowChip() {
  const k = state.follow;
  if (!k) return;
  let name, color, at;
  if (k.kind === "character") { const c = charById.get(k.id); name = c.name; color = c.color; at = scene.characterPlace(k.id); }
  else { name = avatarState.name; color = "var(--accent)"; at = scene.avatarPlace(); }
  $("#follow-dot").style.background = color;
  $("#follow-text").textContent = `正在跟著 ${name}${at ? `・${placeById.get(at).name}` : ""}`;
}
setInterval(() => { updateClock(); updateFollowChip(); }, 500);

// ---------- 提示 ----------
let toastTimer = 0;
// action：{ label, fn }，例如「💬 看對話」
function toast(title, sub, action) {
  const el = $("#toast");
  el.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}${action ? `<button class="btn primary">${esc(action.label)}</button>` : ""}`;
  if (action) el.querySelector("button").onclick = () => { el.hidden = true; action.fn(); };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 8000 : 4200);
}

// ---------- 相遇與對話 ----------
const dlg = { enc: null, i: 0, names: {} };

// 這段經文當時他叫甚麼（例如 13:9 以前的保羅是「掃羅（保羅）」）
function nameIn(cid, enc) {
  const c = charById.get(cid);
  const a = c.appearances.find(x => x.place === enc.place && x.era === enc.era && x.name);
  return a ? a.name : c.name;
}

function openTalk(pid) {
  const list = encountersAt(pid, state.era);
  const all = list.length ? list : encountersAt(pid);
  if (all.length === 1) return startEncounter(all[0].id);
  // 好幾段對話：先讓人選
  stopTour();
  scene.releaseEncounter();
  dlg.enc = null;
  setTalking(true);
  $("#dialog").hidden = false;
  $("#dlg-title").textContent = `${placeById.get(pid).name}的相遇`;
  $("#dlg-ref").textContent = `${all.length} 段`;
  $("#dlg-body").innerHTML = `<ul class="list enc-list">${all.map(e => `<li><button data-enc="${e.id}"><span>${esc(e.title)}</span>
    <small>徒 ${esc(e.r)}・${e.people.map(id => esc(charById.get(id).name)).join("、")}</small></button></li>`).join("")}</ul>`;
  $("#dlg-foot").hidden = true;
}

function startEncounter(id) {
  stopTour();
  const enc = encById.get(id);
  dlg.enc = enc;
  dlg.i = 0;
  dlg.names = Object.fromEntries(enc.people.map(cid => [cid, nameIn(cid, enc)]));
  setTalking(true);
  scene.stageEncounter(enc, dlg.names);
  $("#dialog").hidden = false;
  $("#dlg-foot").hidden = false;
  $("#dlg-title").textContent = enc.title;
  $("#dlg-ref").textContent = `${placeById.get(enc.place).name}・徒 ${enc.r}`;
  renderLine();
}

function renderLine() {
  const enc = dlg.enc, n = enc.lines.length, i = dlg.i;
  $("#dlg-dots").innerHTML = Array.from({ length: n + 1 }, (_, k) => `<i class="${k === i ? "on" : k < i ? "done" : ""}"></i>`).join("");
  $("#dlg-prev").disabled = i === 0;
  if (i >= n) {
    // 最後一頁：留一個問題給自己
    scene.setSpeaking([]);
    $("#dlg-body").innerHTML = `<div class="ask"><span>想一想</span><p>${esc(enc.ask)}</p></div>
      <div class="row"><button class="btn" data-replay>↻ 再看一次</button>
      ${enc.people.map(cid => `<button class="chip" data-character="${cid}" style="--c:${charById.get(cid).color}">認識${esc(dlg.names[cid])}</button>`).join("")}</div>`;
    $("#dlg-next").textContent = "結束";
    return;
  }
  const line = enc.lines[i];
  const c = charById.get(line.who);
  let face, name;
  if (c) { face = `<i class="face" style="--c:${c.color}">${esc(dlg.names[line.who][0])}</i>`; name = dlg.names[line.who]; }
  else if (line.who === "narrator") { face = `<i class="face narrator">📖</i>`; name = "旁白"; }
  else { face = `<i class="face voice">✦</i>`; name = line.who; }
  $("#dlg-body").innerHTML = `<div class="line ${line.who === "narrator" ? "is-narrator" : ""}">${face}
    <div><b>${esc(name)}</b><p>${line.who === "narrator" ? esc(line.text) : `「${esc(line.text)}」`}</p><small>徒 ${esc(line.r)}</small></div></div>`;
  scene.setSpeaking([...(c ? [line.who] : []), ...(line.focus || [])]);
  $("#dlg-next").textContent = i === n - 1 ? "想一想 →" : "下一句 →";
}

// 對話時把時間軸等底部元件藏起來、畫面往上推；對話框可以收小
function setTalking(on) {
  document.body.classList.toggle("talking", on);
  if (!on) setDialogMin(false);
  scene.relayout();
}
function setDialogMin(on) {
  $("#dialog").classList.toggle("min", on);
  $("#dlg-min").textContent = on ? "▴ 展開" : "▾ 收起";
}
$("#dlg-min").onclick = () => setDialogMin(!$("#dialog").classList.contains("min"));

function endEncounter() {
  const was = !!dlg.enc;
  $("#dialog").hidden = true;
  dlg.enc = null;
  scene.releaseEncounter();
  setTalking(false);
  if (was) toast("對話結束", "人物回到原本的路線，時期、旅程和你的角色都沒有改變");
}

$("#dlg-next").onclick = () => {
  if (!dlg.enc) return;
  if (dlg.i >= dlg.enc.lines.length) return endEncounter();
  dlg.i++;
  renderLine();
};
$("#dlg-prev").onclick = () => { if (dlg.enc && dlg.i > 0) { dlg.i--; renderLine(); } };
$("#dlg-close").onclick = endEncounter;
$("#dlg-body").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.enc) startEncounter(b.dataset.enc);
  else if (b.hasAttribute("data-replay")) { dlg.i = 0; renderLine(); }
  else if (b.dataset.character) { endEncounter(); openCharacter(b.dataset.character); }
});
document.addEventListener("keydown", ev => {
  if ($("#dialog").hidden || !dlg.enc || ev.target.matches("input, textarea")) return;
  if (ev.key === "ArrowRight" || ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); $("#dlg-next").click(); }
  else if (ev.key === "ArrowLeft") $("#dlg-prev").click();
  else if (ev.key === "Escape") endEncounter();
});

scene.on("talk", (pid, encId) => (encId ? startEncounter(encId) : openTalk(pid)));

// 跟著某個人物走時，他走進一座有對話的城，就提示可以看
// 場景已在城上冒出對話泡泡；正在跟著這個人時，再加一則可以直接點的提示
scene.on("arrive", (cid, pid, enc) => {
  const f = state.follow;
  if (!f || f.kind !== "character" || f.id !== cid || !$("#dialog").hidden) return;
  if (enc) toast(`${nameIn(cid, enc)}來到${placeById.get(pid).name}`, enc.title, { label: "💬 看對話", fn: () => startEncounter(enc.id) });
});

// ---------- 時間軸 ----------
$("#timeline").innerHTML = `<button data-era="" class="active"><b>全部</b><small>1–28 章</small></button>` +
  DATA.eras.map(e => `<button data-era="${e.id}"><b>${esc(e.name)}</b><small>${esc(e.years)}</small></button>`).join("");
$("#timeline").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (!b) return;
  stopTour();
  setEra(b.dataset.era || null, true);
});

function setEra(id, fly = false) {
  state.era = id;
  document.querySelectorAll("#timeline button").forEach(b => b.classList.toggle("active", (b.dataset.era || null) === id));
  scene.setFocus(id ? eraFocus.get(id) : null);
  scene.setCharacterEra(id);
  if (id) {
    const f = eraFocus.get(id);
    // 人物會自己走那個時期的路線；原本選的旅程不屬於這個時期就取消
    if (state.journey && !f.journeys.has(state.journey)) setJourney(null, false);
    if (fly) scene.flyToPlaces([...f.places]);
  }
  render();
}

// ---------- 面板 ----------
$("#tabs").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (!b) return;
  state.tab = b.dataset.tab;
  state.place = null;
  scene.select(null);
  openCharacter(null);
});

$("#search").addEventListener("input", ev => { state.query = ev.target.value.trim(); render(); });

// 手機上的面板可以收合
$("#panel-grip").onclick = () => $("#panel").classList.toggle("collapsed");

function openPlace(id, { fly = true } = {}) {
  state.place = id;
  scene.select(id);
  if (id) {
    state.tab = "places";
    state.character = null;
    scene.selectCharacter(null);
    if (fly) scene.flyToPlace(id);
    $("#panel").classList.remove("collapsed");
  }
  render();
}

function setJourney(id, fly = true) {
  state.journey = id;
  scene.setJourney(id);
  if (id && fly) scene.flyToPlaces(journeyById.get(id).route);
  render();
}

function openCharacter(id) {
  state.character = id;
  scene.selectCharacter(id);
  if (id) {
    state.tab = "people";
    state.place = null;
    scene.select(null);
    $("#panel").classList.remove("collapsed");
    // 這個時期他沒出場的話，切回「全部」讓他出現
    if (state.era && !charById.get(id).appearances.some(a => a.era === state.era)) setEra(null);
    if (state.journey && (journeyById.get(state.journey).walkers || []).includes(id)) setJourney(null, false);
    // 等下一個畫格算出位置，再把鏡頭貼過去跟著他走
    setTimeout(() => scene.followCharacter(id), 60);
  }
  render();
}

scene.on("pick", id => { if (id) { stopTour(); openPlace(id); } });
scene.on("hover", () => {});
scene.on("character", id => { stopTour(); openCharacter(id); });

function render() {
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab && !state.query));
  const body = $("#panel-body");
  // 換到另一個畫面時回到頂端；同一畫面重畫（例如切換旅程）保留捲動位置
  const view = state.query ? "q" : state.place ? "p:" + state.place : state.character ? "c:" + state.character : state.tab + (state.era || "");
  if (view !== render.view) { body.scrollTop = 0; render.view = view; }
  if (state.query) body.innerHTML = renderSearch(state.query);
  else if (state.place) body.innerHTML = renderPlace(placeById.get(state.place));
  else if (state.character) body.innerHTML = renderCharacter(charById.get(state.character));
  else if (state.tab === "journeys") body.innerHTML = renderJourneys();
  else if (state.tab === "people") body.innerHTML = renderPeople();
  else body.innerHTML = renderPlaces();
}

function renderPeople() {
  const list = DATA.characters.filter(c => !state.era || c.appearances.some(a => a.era === state.era));
  return eraNote() + `<p class="hint">地圖上帶名牌的小人就是這些人物，他們會照使徒行傳的順序在城市之間走動。選一個時期，就只走那段時間的路。</p>
    <ul class="list people">
      ${list.map(c => `<li><button data-character="${c.id}" style="--c:${c.color}"><i>${esc(c.name[0])}</i>
        <span>${esc(c.name)}</span><small>${esc(c.title)}・${c.appearances.length} 處</small></button></li>`).join("")}
    </ul>`;
}

function renderCharacter(c) {
  const now = scene.characterPlace(c.id);
  const groups = DATA.eras.map(e => {
    const apps = c.appearances.filter(a => a.era === e.id);
    if (!apps.length) return "";
    return `<h3 class="group" style="--c:${c.color}">${esc(e.name)}・${esc(e.years)}</h3><ol class="stops" style="--c:${c.color}">
      ${apps.map(a => `<li><button data-app-place="${a.place}" data-app-era="${a.era}" class="${state.era === a.era && now === a.place ? "here" : ""}">
        <span>${esc(placeById.get(a.place).name)}：${esc(a.note)}</span><small>徒 ${esc(a.r)}${a.name ? `・名牌顯示「${esc(a.name)}」` : ""}</small></button></li>`).join("")}
    </ol>`;
  }).join("");
  return `
    <button class="back" data-back-people>← 所有人物</button>
    <div class="place-head person-head" style="--c:${c.color}">
      <i>${esc(c.name[0])}</i>
      <div><h2>${esc(c.name)}</h2><p class="region">${esc(c.title)}</p></div>
    </div>
    <p class="summary">${esc(c.bio)}</p>
    ${state.follow && state.follow.kind === "character" && state.follow.id === c.id
      ? `<button class="btn" data-unfollow>停止跟隨</button>`
      : `<button class="btn primary" data-follow-char="${c.id}">🎥 跟著${esc(c.name)}走</button>`}
    ${encList(encountersOf(c.id), "他的相遇")}
    <h3 class="sec">出場的地方</h3>
    <p class="hint">點下面任一處，地圖會切到那個時期並飛到那座城。</p>
    ${groups}`;
}

function encList(list, title) {
  if (!list.length) return "";
  return `<h3 class="sec">${title}</h3><ul class="list enc-list">${list.map(e => `<li><button data-enc="${e.id}">
    <span>💬 ${esc(e.title)}</span><small>${esc(placeById.get(e.place).name)}・徒 ${esc(e.r)}・${e.people.map(id => esc(charById.get(id).name)).join("、")}</small></button></li>`).join("")}</ul>`;
}

function eraNote() {
  if (!state.era) return "";
  const e = DATA.eras.find(x => x.id === state.era);
  return `<div class="era-note"><b>${esc(e.name)}</b>　徒 ${esc(e.from)}–${esc(e.to)}・${esc(e.years)}<p>${esc(e.note)}</p></div>`;
}

function renderPlaces() {
  const f = state.era ? eraFocus.get(state.era) : null;
  const groups = Object.entries(DATA.stages).map(([sid, s]) => {
    const items = DATA.places.filter(p => p.stage === sid && (!f || f.places.has(p.id)));
    if (!items.length) return "";
    return `<h3 class="group" style="--c:${s.color}">${esc(s.name)}</h3><ul class="list">` +
      items.map(p => `<li><button data-place="${p.id}"><span>${esc(p.name)}</span><small>${esc(p.region)}・${p.events.length} 件事</small></button></li>`).join("") +
      `</ul>`;
  }).join("");
  const kv = DATA.meta.keyVerse;
  const intro = state.era ? "" : `<blockquote class="verse">${esc(kv.q)}<cite>${esc(kv.r)}</cite></blockquote>
    <p class="hint">城市平台的顏色就是 1:8 的四個圈。每座城是一個地點，城上的小建築是在那裡發生的事。點城市或點下面的名字看細節。</p>`;
  return eraNote() + intro + groups;
}

function renderPlace(p) {
  const st = DATA.stages[p.stage];
  const js = journeysAt(p.id);
  const cs = charsAt(p.id);
  return `
    <button class="back" data-back>← 所有地點</button>
    <div class="place-head">
      <span class="badge" style="--c:${st.color}">1:8・${esc(st.name)}</span>
      <h2>${esc(p.name)}</h2>
      <p class="region">${esc(p.region)}</p>
    </div>
    <p class="summary">${esc(p.summary)}</p>
    ${p.verse ? `<blockquote class="verse">${esc(p.verse.q)}<cite>${esc(p.verse.r)}</cite></blockquote>` : ""}
    <h3 class="sec">在這裡發生的事</h3>
    <ol class="events">
      ${p.events.map((e, i) => `<li><button data-event="${i}"><span>${esc(e.t)}</span><small>徒 ${esc(e.r)}</small></button></li>`).join("")}
    </ol>
    ${js.length ? `<h3 class="sec">經過這裡的旅程</h3><div class="chips">${js.map(j =>
      `<button class="chip ${state.journey === j.id ? "on" : ""}" data-journey="${j.id}" style="--c:${j.color}">${esc(j.name)}</button>`).join("")}</div>` : ""}
    ${cs.length ? `<h3 class="sec">在這裡出現的人物</h3><div class="chips">${cs.map(c =>
      `<button class="chip" data-character="${c.id}" style="--c:${c.color}">${esc(c.name)}</button>`).join("")}</div>` : ""}
    ${encList(encountersAt(p.id), "在這裡的相遇")}
  `;
}

function renderJourneys() {
  const f = state.era ? eraFocus.get(state.era) : null;
  const list = DATA.journeys.filter(j => !f || f.journeys.has(j.id));
  const active = state.journey && journeyById.get(state.journey);
  return eraNote() + `<p class="hint">每條線是一段旅程。點一段旅程，會有人沿著路線走一遍。</p>
    <ul class="list journeys">
      ${list.map(j => `<li><button data-journey="${j.id}" class="${state.journey === j.id ? "on" : ""}" style="--c:${j.color}">
        <i></i><span>${esc(j.name)}</span><small>${esc(j.walker)}・徒 ${esc(j.r)}</small></button></li>`).join("")}
    </ul>
    ${active ? renderJourneyDetail(active) : (f && !list.length ? `<p class="hint">這個時期沒有旅程，事情都發生在耶路撒冷。</p>` : "")}`;
}

function renderJourneyDetail(j) {
  return `<div class="journey-detail" style="--c:${j.color}">
    <h3>${esc(j.name)}</h3>
    <p class="carry">帶著：${esc(j.carry)}</p>
    <ol class="stops">
      ${j.route.map((pid, i) => `<li><button data-place="${pid}"><span>${esc(placeById.get(pid).name)}</span>
        <small>${i === 0 ? "出發" : "徒 " + esc(j.stops[i - 1])}</small></button></li>`).join("")}
    </ol>
  </div>`;
}


function renderSearch(q) {
  const ql = q.toLowerCase();
  // 搜尋字串本身像經文出處（16、16:9、16:9-10）時，用範圍比對
  const qr = /^\d+(:\d+)?(\s*[–-]\s*\d+(:\d+)?)?$/.test(q) ? refRange(q) : null;
  const refHit = r => { if (!qr) return false; const x = refRange(r); return x && x[0] <= qr[1] && qr[0] <= x[1]; };
  const hits = [];
  for (const p of DATA.places) {
    if ((p.name + p.region + p.summary).toLowerCase().includes(ql)) hits.push(`<li><button data-place="${p.id}"><span>${esc(p.name)}</span><small>地點・${esc(p.region)}</small></button></li>`);
    p.events.forEach((e, i) => {
      if (qr ? refHit(e.r) : (e.t + " " + e.r).toLowerCase().includes(ql))
        hits.push(`<li><button data-place="${p.id}" data-event="${i}"><span>${esc(e.t)}</span><small>${esc(p.name)}・徒 ${esc(e.r)}</small></button></li>`);
    });
  }
  for (const j of DATA.journeys) {
    if ((j.name + j.walker + j.carry).toLowerCase().includes(ql) || refHit(j.r)) hits.push(`<li><button data-journey="${j.id}"><span>${esc(j.name)}</span><small>旅程・${esc(j.walker)}</small></button></li>`);
  }
  for (const e of DATA.encounters) {
    const hit = qr ? refHit(e.r) : (e.title + e.lines.map(l => l.text).join("")).toLowerCase().includes(ql);
    if (hit) hits.push(`<li><button data-enc="${e.id}"><span>💬 ${esc(e.title)}</span><small>對話・${esc(placeById.get(e.place).name)}・徒 ${esc(e.r)}</small></button></li>`);
  }
  for (const c of DATA.characters) {
    const alias = c.appearances.map(a => a.name || "").join(" ");
    if (!qr && (c.name + alias + c.title + c.bio).toLowerCase().includes(ql)) hits.unshift(`<li><button data-character="${c.id}"><span>${esc(c.name)}</span><small>人物・${esc(c.title)}</small></button></li>`);
  }
  return `<p class="hint">找到 ${hits.length} 筆「${esc(q)}」</p><ul class="list">${hits.join("")}</ul>`;
}

$("#panel-body").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (!b) return;
  stopTour();
  if (b.hasAttribute("data-back")) { openPlace(null); return; }
  if (b.hasAttribute("data-back-people")) { openCharacter(null); return; }
  if (b.dataset.followChar) { scene.followCharacter(b.dataset.followChar); return; }
  if (b.dataset.enc) { startEncounter(b.dataset.enc); return; }
  if (b.hasAttribute("data-unfollow")) { scene.stopFollow(); return; }
  if (b.dataset.character) {
    if (state.query) { state.query = ""; $("#search").value = ""; }
    openCharacter(b.dataset.character);
    return;
  }
  if (b.dataset.appPlace) {
    // 留在人物頁：切到那個時期，飛到那座城
    setEra(b.dataset.appEra);
    scene.flyToPlace(b.dataset.appPlace, 14);
    return;
  }
  if (b.dataset.journey) {
    const id = b.dataset.journey;
    if (state.query) { state.query = ""; $("#search").value = ""; state.tab = "journeys"; state.place = null; scene.select(null); }
    setJourney(state.journey === id ? null : id);
    return;
  }
  if (b.dataset.place) {
    const pid = b.dataset.place, ev2 = b.dataset.event;
    if (state.query) { state.query = ""; $("#search").value = ""; }
    openPlace(pid);
    if (ev2 != null) setTimeout(() => scene.pulseBuilding(pid, Number(ev2)), 700);
    return;
  }
  if (b.dataset.event != null && state.place) scene.pulseBuilding(state.place, Number(b.dataset.event));
});

// ---------- 我的角色 ----------
// 外觀、名字、選的旅程存在這台瀏覽器裡；讀不到就用預設值
const AV_KEY = "acts-island-avatar";
const saved = (() => { try { return JSON.parse(localStorage.getItem(AV_KEY)) || {}; } catch { return {}; } })();
const avatarState = {
  name: saved.name || "我", role: saved.role || "disciple", journey: saved.journey || "j2",
  look: { ...DEFAULT_LOOK, robe: "#c4693f", sash: "#e8d3a8", ...(saved.look || {}) },
  tab: "look", log: [], photo: null,
};
function saveAvatar() {
  const { name, role, journey, look } = avatarState;
  try { localStorage.setItem(AV_KEY, JSON.stringify({ name, role, journey, look })); } catch { /* 無痕模式等情況存不了，不影響使用 */ }
}

function openAvatar() {
  stopTour();
  $("#avatar-card").hidden = false;
  document.querySelector('[data-tool="avatar"]').classList.add("on");
  if (!scene.hasAvatar()) scene.setAvatar(avatarState.look, avatarState.name, journeyById.get(avatarState.journey).route[0]);
  setTimeout(() => scene.followAvatar(), 60);
  renderAvatar();
}
function closeAvatar() {
  $("#avatar-card").hidden = true;
  document.querySelector('[data-tool="avatar"]').classList.remove("on");
}
$("#avatar-close").onclick = closeAvatar;
$("#avatar-tabs").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (b) { avatarState.tab = b.dataset.atab; renderAvatar(); }
});

function applyLook() {
  scene.setAvatar(avatarState.look, avatarState.name);
  saveAvatar();
  renderAvatar();
}

function renderAvatar() {
  document.querySelectorAll("#avatar-tabs button").forEach(b => b.classList.toggle("active", b.dataset.atab === avatarState.tab));
  const body = $("#avatar-body");
  const L = avatarState.look;
  if (avatarState.tab === "look") {
    const seg = (key, label) => `<div class="field"><span>${label}</span><div class="seg">${LOOK_OPTIONS[key].map(([v, n]) =>
      `<button data-look-key="${key}" data-look-val="${v}" class="${L[key] === v ? "on" : ""}">${n}</button>`).join("")}</div></div>`;
    const sw = (key, label, list) => `<div class="field"><span>${label}</span><div class="swatches">${list.map(c =>
      `<button data-look-key="${key}" data-look-val="${c}" class="${L[key] === c ? "on" : ""}" style="background:${c}" aria-label="${label} ${c}"></button>`).join("")}</div></div>`;
    body.innerHTML = `
      <label class="field"><span>名字</span><input id="av-name" maxlength="8" value="${esc(avatarState.name)}"></label>
      <div class="field"><span>身分</span><div class="seg">${ROLES.map(r =>
        `<button data-role="${r.id}" class="${avatarState.role === r.id ? "on" : ""}">${r.name}</button>`).join("")}</div></div>
      ${seg("hair", "髮型")}${seg("beard", "鬍子")}${seg("head", "頭飾")}${seg("item", "手上")}
      ${sw("skin", "膚色", LOOK_OPTIONS.skin)}${sw("robe", "長袍", LOOK_OPTIONS.robe)}
      ${sw("headColor", "頭巾", LOOK_OPTIONS.color)}${sw("hairColor", "頭髮", LOOK_OPTIONS.color)}`;
  } else if (avatarState.tab === "trip") {
    const walking = avatarState.walking;
    body.innerHTML = `
      <p class="hint">選一段旅程，你的角色會從第一站出發走到最後一站，過海時會坐船。每到一座城，會告訴你那裡發生過的事、遇見了誰。</p>
      <ul class="list journeys">${DATA.journeys.map(j => `<li><button data-av-journey="${j.id}" class="${avatarState.journey === j.id ? "on" : ""}" style="--c:${j.color}">
        <i></i><span>${esc(j.name)}</span><small>${j.route.length} 站・徒 ${esc(j.r)}</small></button></li>`).join("")}</ul>
      <div class="row">
        <button class="btn primary" data-av-go>${walking ? "↻ 重新出發" : "▶ 出發"}</button>
        ${walking ? `<button class="btn" data-av-stop>停下來</button>` : ""}
        <button class="btn" data-av-follow>🎥 看我</button>
      </div>
      <h4>旅程日誌</h4>
      ${avatarState.log.length ? `<ol class="log">${avatarState.log.map(e => `<li><b>${esc(e.place)}</b><small>${esc(e.ref)}</small>
        <p>${esc(e.text)}</p>${e.meet ? `<p class="meet">遇見：${esc(e.meet)}</p>` : ""}
        ${(e.encs || []).map(id => `<button class="chip" data-enc="${id}">💬 ${esc(encById.get(id).title)}</button>`).join("")}</li>`).join("")}</ol>`
        : `<p class="hint">還沒出發。</p>`}`;
  } else {
    body.innerHTML = `
      <p class="hint">把鏡頭轉到喜歡的角度（拖曳旋轉、滾輪縮放），再按「拍一張」。照片只存在你的瀏覽器裡。</p>
      <div class="row"><button class="btn primary" data-av-shot>📷 拍一張</button><button class="btn" data-av-follow>🎥 看我</button></div>
      ${avatarState.photo ? `<img class="shot" src="${avatarState.photo}" alt="${esc(avatarState.name)}的照片">
        <a class="btn primary" download="使徒行傳島-${esc(avatarState.name)}.png" href="${avatarState.photo}">⬇ 下載照片</a>` : ""}`;
  }
}

$("#avatar-body").addEventListener("input", ev => {
  if (ev.target.id !== "av-name") return;
  avatarState.name = ev.target.value.trim() || "我";
  scene.setAvatar(avatarState.look, avatarState.name);
  saveAvatar();
});
$("#avatar-body").addEventListener("click", ev => {
  const b = ev.target.closest("button");
  if (!b) return;
  const A = avatarState;
  if (b.dataset.enc) {
    startEncounter(b.dataset.enc);
  } else if (b.dataset.role) {
    A.role = b.dataset.role;
    Object.assign(A.look, ROLES.find(r => r.id === A.role).look);
    applyLook();
  } else if (b.dataset.lookKey) {
    A.look[b.dataset.lookKey] = b.dataset.lookVal;
    applyLook();
  } else if (b.dataset.avJourney) {
    A.journey = b.dataset.avJourney;
    saveAvatar();
    renderAvatar();
  } else if (b.hasAttribute("data-av-go")) {
    startAvatarTrip();
  } else if (b.hasAttribute("data-av-stop")) {
    scene.stopAvatarTrip();
    A.walking = false;
    renderAvatar();
  } else if (b.hasAttribute("data-av-follow")) {
    scene.followAvatar();
  } else if (b.hasAttribute("data-av-shot")) {
    const at = scene.avatarPlace();
    A.photo = scene.snapshot(`${A.name} 在${at ? placeById.get(at).name : "地中海"}`, `使徒行傳島・${timeLabel(scene.getTime())}`);
    renderAvatar();
  }
});

function startAvatarTrip() {
  const A = avatarState, j = journeyById.get(A.journey);
  A.log = [];
  A.walking = true;
  // 從現在的位置先瞬間回到第一站，避免從別的地方走過去
  scene.setAvatar(A.look, A.name, j.route[0]);
  scene.startAvatarTrip(j.route, (pid, i) => {
    const p = placeById.get(pid);
    const meet = DATA.characters
      .filter(c => c.appearances.some(a => a.place === pid && a.era === j.era) && !(j.walkers || []).includes(c.id))
      .map(c => c.name).join("、");
    const ref = i === 0 ? `${j.name}・出發` : `徒 ${j.stops[i - 1]}`;
    const encs = encountersAt(pid, j.era);
    if (encs.length) scene.showEncounterBubble(encs[0]);
    A.log.push({ place: p.name, ref, text: p.summary, meet, encs: encs.map(e => e.id) });
    toast(i === 0 ? `從${p.name}出發` : `抵達${p.name}`, ref + (meet ? `・遇見 ${meet}` : ""),
      encs.length ? { label: `💬 ${encs[0].title}`, fn: () => startEncounter(encs[0].id) } : null);
    if (!$("#avatar-card").hidden && A.tab === "trip") renderAvatar();
  }, () => {
    A.walking = false;
    toast("旅程完成！", `${A.name}走完了「${j.name}」`);
    if (!$("#avatar-card").hidden) renderAvatar();
  });
  scene.followAvatar();
  renderAvatar();
}

// ---------- 導覽 ----------
function startTour() {
  setEra(null);
  state.tour = 0;
  $("#tour").hidden = false;
  showTourStep();
}
function stopTour() {
  if (state.tour < 0) return;
  state.tour = -1;
  $("#tour").hidden = true;
}
function showTourStep() {
  const cue = DATA.tour[state.tour];
  $("#tour-step").textContent = `${state.tour + 1} / ${DATA.tour.length}`;
  $("#tour-caption").innerHTML = `${esc(cue.caption)}<cite>徒 ${esc(cue.r)}</cite>`;
  $("#tour-prev").disabled = state.tour === 0;
  $("#tour-next").textContent = state.tour === DATA.tour.length - 1 ? "完成" : "下一站 →";
  setJourney(cue.journey || null, false);
  openPlace(cue.target, { fly: false });
  if (cue.journey) scene.flyToPlaces(journeyById.get(cue.journey).route);
  else scene.flyToPlace(cue.target, 16);
}
$("#tour-prev").onclick = () => { if (state.tour > 0) { state.tour--; showTourStep(); } };
$("#tour-next").onclick = () => {
  if (state.tour < DATA.tour.length - 1) { state.tour++; showTourStep(); }
  else { stopTour(); setJourney(null, false); openPlace(null); scene.flyHome(); }
};
$("#tour-close").onclick = () => stopTour();

render();
