"use strict";
/* =====================================================================
   BREWZA front-end (free stack): Leaflet + OpenStreetMap data via the Python backend.
   Accounts, wishlist, visits, reviews, chat live in SQLite. Optional AI ask uses Gemini free tier.
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const KINDS = { cafe: { label: "Café", em: "☕" }, bar: { label: "Bar", em: "🍸" }, restaurant: { label: "Restaurant", em: "🍽️" } };
const BANDS = { "100-300": [100, 300], "300-500": [300, 500], "500-99999": [500, 99999] };

/* ---------------- API ---------------- */
async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let d = null; try { d = await r.json(); } catch (e) { }
  if (!r.ok) { const err = new Error((d && d.error) || "Request failed (" + r.status + ")"); err.status = r.status; throw err; }
  return d;
}

/* ---------------- State ---------------- */
const LOCKEY = "brewza.loc";   // location stays in this browser only
const db = { user: null, profile: { name: "", gender: "", range: 2000 }, loc: null, wish: [], visited: [], reviews: [] };
try { db.loc = JSON.parse(localStorage.getItem(LOCKEY) || "null"); } catch (e) { }
const S = { tab: "home", mode: "nearby", ptab: "visited", q: "", auth: "login", ai: false };
const F0 = () => ({ types: ["cafe", "bar", "restaurant"], spend: "any", rating: 0, open: false, sort: "distance", wifi: false, outdoor: false, veg: false, live: false, wheel: false });
let F = F0(), D = F0();
let places = [], current = null, reqId = 0, gateStep = 0;
let map, layer, circle;

function applyServerData(d) {
  db.user = d.user; db.profile = { name: d.user.name, gender: d.user.gender, range: d.user.range };
  db.wish = d.wish; db.visited = d.visited; db.reviews = d.reviews;
}
const saveProfile = () => api("/profile", "PUT", db.profile).catch(e => toast(e.message));

/* ---------------- Helpers ---------------- */
let tt; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2800); }
const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1) + " km";
const travel = m => { const r = m * 1.3; return r <= 1500 ? `🚶 ${Math.max(1, Math.round(r / 5000 * 60))} min` : `🛺 ${Math.max(2, Math.round(r / 20000 * 60))} min`; };
function haversine(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distOf = p => db.loc ? haversine(db.loc, p) : 0;
const stars = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const isMale = () => db.profile.gender === "male";
const themeName = () => isMale() ? "male" : "female";
function applyTheme() { document.body.dataset.theme = themeName(); if (map) drawMap(); }
const PIN = {
  female: { cafe: "#ffb89a", bar: "#b79cff", restaurant: "#8fdcc0", you: "#f08fb4" },
  male: { cafe: "#f5c542", bar: "#4f8cff", restaurant: "#9aa7c7", you: "#4f8cff" }
};

/* ---------------- Opening hours (handles common OpenStreetMap formats) ---------------- */
const DAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"];
function parseHours(str) {
  if (!str) return null; str = str.trim();
  if (/^24\/7$/i.test(str)) { const o = {}; for (let i = 0; i < 7; i++) o[i] = [[0, 1440]]; return o; }
  const out = {}; let any = false;
  const RNG = "[A-Za-z]{2}(?:-[A-Za-z]{2})?", TM = "\\d{1,2}:\\d{2}\\s*-\\s*\\d{1,2}:\\d{2}";
  const re = new RegExp(`^(${RNG}(?:\\s*,\\s*${RNG})*)?\\s*(off|closed|${TM}(?:\\s*,\\s*${TM})*)$`, "i");
  for (const seg of str.split(";").map(s => s.trim()).filter(Boolean)) {
    const m = seg.match(re); if (!m) return null;
    const days = new Set();
    if (m[1]) {
      for (const part of m[1].split(",")) {
        const [a, b] = part.trim().toLowerCase().split("-"), i = DAYS.indexOf(a), j = b ? DAYS.indexOf(b) : i;
        if (i < 0 || j < 0) return null;
        for (let k = i; ; k = (k + 1) % 7) { days.add(k); if (k === j) break; }
      }
    } else for (let k = 0; k < 7; k++) days.add(k);
    const iv = [];
    if (!/^(off|closed)$/i.test(m[2])) for (const r of m[2].split(",")) {
      const t = r.trim().match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      const s = +t[1] * 60 + +t[2]; let e = +t[3] * 60 + +t[4]; if (e <= s) e += 1440; iv.push([s, e]);
    }
    days.forEach(k => out[k] = iv); any = true;
  }
  return any ? out : null;
}
function openNow(str, now = new Date()) {
  const h = parseHours(str); if (!h) return undefined;
  const d = (now.getDay() + 6) % 7, t = now.getHours() * 60 + now.getMinutes();
  if ((h[d] || []).some(([s, e]) => t >= s && t < e)) return true;
  const y = (d + 6) % 7; if ((h[y] || []).some(([s, e]) => e > 1440 && t < e - 1440)) return true;
  return false;
}

/* ---------------- Gate (login → style → location) ---------------- */
function showGate(step) {
  gateStep = step; $("#gate").hidden = false;
  ["0", "1", "2"].forEach(n => $("#gstep" + n).hidden = String(step) !== n);
  $("#gsetup").hidden = step !== 3;
  $("#gateX").hidden = !(db.user && db.loc && db.profile.gender) || step === 3 || step === 0;
}
function showSetup(msg) {
  $("#gsetup").innerHTML = `<h2>Something needs attention</h2><p class="muted">${esc(msg)}</p>
   <p class="muted">Start the server in VS Code’s terminal with <code>python app.py</code> (Mac: <code>python3 app.py</code>) and open <code>http://localhost:3000</code>. See README.md.</p>`;
  showGate(3);
}
async function afterLogin() {
  applyTheme(); renderProfile(); refreshCounts();
  if (!db.profile.gender) { $("#gname").value = db.profile.name; $$("[data-g]").forEach(b => b.setAttribute("aria-pressed", false)); showGate(1); }
  else if (!db.loc) showGate(2);
  else { $("#gate").hidden = true; showLoc(); fetchPlaces(); }
}
async function submitAuth() {
  const er = $("#gerr0"); er.hidden = true;
  const username = $("#aUser").value.trim(), password = $("#aPass").value, name = $("#aName").value.trim();
  const btn = $("#aGo"); btn.disabled = true;
  try {
    const d = await api(S.auth === "login" ? "/login" : "/register", "POST", S.auth === "login" ? { username, password } : { username, password, name });
    applyServerData(d); $("#aPass").value = ""; await afterLogin();
  } catch (e) { er.textContent = e.message; er.hidden = false; }
  btn.disabled = false;
}
function setAuthMode(m) {
  S.auth = m; $$("[data-auth]").forEach(b => b.setAttribute("aria-pressed", b.dataset.auth === m));
  $("#aNameWrap").hidden = m === "login"; $("#aGo").textContent = m === "login" ? "Log in" : "Create account";
  $("#aPass").autocomplete = m === "login" ? "current-password" : "new-password";
}

/* ---------------- Map (Leaflet + OpenStreetMap tiles) ---------------- */
function initMap() {
  map = L.map("map", { zoomControl: true }).setView(db.loc ? [db.loc.lat, db.loc.lng] : [20.59, 78.96], db.loc ? 14 : 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
  layer = L.layerGroup().addTo(map);
}
function drawMap(items) {
  if (!map || !db.loc) return;
  items = items || (S.mode === "nearby" ? viewItems() : []);
  layer.clearLayers();
  const pal = PIN[themeName()], c = [db.loc.lat, db.loc.lng];
  circle = L.circle(c, { radius: db.profile.range, color: pal.you, weight: 1.5, opacity: .7, fillColor: pal.you, fillOpacity: .07, interactive: false }).addTo(layer);
  L.circleMarker(c, { radius: 8, color: "#fff", weight: 3, fillColor: pal.you, fillOpacity: 1 }).bindTooltip("You").addTo(layer);
  items.forEach(p => {
    const k = KINDS[p.kind] || KINDS.restaurant;
    L.marker([p.lat, p.lng], { title: p.name, icon: L.divIcon({ className: "pin", html: `<span style="background:${pal[p.kind] || pal.restaurant}">${k.em}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }) })
      .on("click", () => openDetail(p.id)).addTo(layer);
  });
  map.fitBounds(circle.getBounds(), { padding: [10, 10] });
}

/* ---------------- Places (from backend → OpenStreetMap) ---------------- */
async function fetchPlaces() {
  if (!db.loc) return;
  const my = ++reqId;
  $("#status").textContent = "Searching near you…";
  $("#list").innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const d = await api(`/places/nearby?lat=${db.loc.lat}&lng=${db.loc.lng}&radius=${Math.min(10000, Math.max(100, db.profile.range))}`);
    if (my !== reqId) return;
    places = d.places.map(p => ({ ...p, open: openNow(p.hours) }));
    render();
  } catch (e) {
    $("#list").innerHTML = `<div class="glass empty">Couldn’t load places.<br><small>${esc(e.message)}</small></div>`;
    $("#status").textContent = "";
  }
}
function tagsOf(p) {
  return [p.wifi ? (p.wifi === "free" ? "free wifi" : "wifi") : "", p.outdoor ? "outdoor seating" : "", p.veg ? "vegetarian" : "", p.live ? "live music" : "", p.wheel ? "wheelchair accessible" : "", p.cuisine || ""].filter(Boolean);
}

/* ---------------- Filtering + render ---------------- */
function viewItems() {
  let items;
  if (S.mode === "wish") items = db.wish.map(w => ({ ...w, saved: true }));
  else items = places.filter(p => {
    if (!F.types.includes(p.kind)) return false;
    if (distOf(p) > db.profile.range * 1.02) return false;
    if (F.spend !== "any") { const [a, b] = BANDS[F.spend]; if (p.spend == null || p.spend < a || p.spend > b) return false; }
    if (F.rating && (!p.count || p.rating < F.rating)) return false;
    if (F.open && p.open !== true) return false;
    if (F.wifi && !p.wifi) return false;
    if (F.outdoor && !p.outdoor) return false;
    if (F.veg && !p.veg) return false;
    if (F.live && !p.live) return false;
    if (F.wheel && !p.wheel) return false;
    return true;
  });
  const q = S.q.trim().toLowerCase();
  if (q) items = items.filter(p => (p.name + " " + p.addr).toLowerCase().includes(q));
  items = items.map(p => ({ ...p, d: distOf(p) }));
  const s = S.mode === "wish" ? "distance" : F.sort;
  const keys = { distance: p => p.d, popularity: p => -(p.pop || 0), rating: p => -(p.rating || 0), spend: p => p.spend == null ? 99999 : p.spend };
  return items.sort((a, b) => keys[s](a) - keys[s](b));
}
const inWish = id => db.wish.some(w => w.id === id);
const visitedRec = id => db.visited.find(v => v.id === id);
function cardHTML(p) {
  const k = KINDS[p.kind] || KINDS.restaurant;
  const tags = [k.label, p.count ? `★ ${p.rating.toFixed(1)} (${p.count})` : "No reviews yet", p.spend ? `~₹${p.spend}/person` : "", ...tagsOf(p).slice(0, 3)].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join("");
  const open = p.open === true ? '<span class="ok">Open now</span>' : p.open === false ? '<span class="no">Closed</span>' : '<span class="muted">Hours unknown</span>';
  return `<article class="glass card">
   <div class="thumb">${k.em}</div>
   <div class="cb">
    <div class="row"><h3><button class="lnk" data-open="${esc(p.id)}">${esc(p.name)}</button></h3></div>
    <p class="muted">${fmtDist(p.d)} · ${travel(p.d)} · ${open}</p>
    <p class="muted">${esc(p.addr || "Address not listed")}</p>
    <div class="tags">${tags}</div>
    <div class="acts"><button data-wish="${esc(p.id)}" class="${inWish(p.id) ? "on" : ""}" aria-pressed="${inWish(p.id)}">♥ ${inWish(p.id) ? "In wishlist" : "Wishlist"}</button>
     <button data-open="${esc(p.id)}">Details</button></div>
   </div></article>`;
}
function refreshCounts() {
  const wc = $("#wcount"); wc.textContent = db.wish.length; wc.hidden = !db.wish.length;
  const fc = activeFilterCount(), fb = $("#fbadge"); fb.textContent = fc; fb.hidden = !fc;
}
function render() {
  const items = viewItems(), wish = S.mode === "wish";
  const inRange = places.filter(p => distOf(p) <= db.profile.range * 1.02).length;
  $("#status").textContent = wish ? `${items.length} saved place${items.length === 1 ? "" : "s"} in your wishlist`
    : `${items.length} place${items.length === 1 ? "" : "s"} within ${fmtDist(db.profile.range)}${inRange > items.length ? ` (${inRange - items.length} hidden by filters)` : ""}`;
  $("#list").innerHTML = items.length ? items.map(cardHTML).join("")
    : `<div class="glass empty">${wish ? "Your wishlist is empty. Tap ♥ on any place to save it." : "Nothing matches. Try a bigger range or clear some filters."}</div>`;
  $("#wishToggle").setAttribute("aria-pressed", wish);
  refreshCounts(); drawMap(wish ? [] : items);
}

/* ---------------- Filter sheet ---------------- */
function activeFilterCount() {
  return (F.types.length < 3 ? 1 : 0) + (F.spend !== "any" ? 1 : 0) + (F.rating ? 1 : 0) + (F.open ? 1 : 0) + (F.sort !== "distance" ? 1 : 0) + ["wifi", "outdoor", "veg", "live", "wheel"].filter(k => F[k]).length;
}
function renderFilterSheet() {
  const c = (attr, val, label, on) => `<button class="chip" data-fk="${attr}" data-fv="${val}" aria-pressed="${on}">${label}</button>`;
  $("#fbody").innerHTML = `
   <h4>Place type</h4><div class="chips">${Object.entries(KINDS).map(([k, v]) => c("type", k, `${v.em} ${v.label}s`, D.types.includes(k))).join("")}</div>
   <h4>Budget per person (from BREWZA reviews)</h4><div class="chips">${[["100-300", "₹100–300"], ["300-500", "₹300–500"], ["500-99999", "₹500+"]].map(([v, l]) => c("spend", v, l, D.spend === v)).join("")}</div>
   <p class="muted" style="margin-top:6px">Budgets come from what BREWZA users report spending. Places nobody has reviewed yet are hidden while this is on.</p>
   <h4>Minimum rating (BREWZA reviews)</h4><div class="chips">${[[0, "Any"], [3.5, "3.5★+"], [4, "4★+"], [4.5, "4.5★+"]].map(([v, l]) => c("rating", v, l, D.rating === v)).join("")}</div>
   <h4>Hours</h4><div class="chips">${c("open", 1, "🟢 Open now", D.open)}</div>
   <h4>Features (from OpenStreetMap)</h4><div class="chips">${c("wifi", 1, "📶 Wi-Fi", D.wifi)}${c("outdoor", 1, "🌳 Outdoor seating", D.outdoor)}${c("veg", 1, "🥗 Vegetarian", D.veg)}${c("live", 1, "🎶 Live music", D.live)}${c("wheel", 1, "♿ Wheelchair accessible", D.wheel)}</div>
   <p class="muted" style="margin-top:6px">These tags are added by volunteers. A place without a tag may still have the feature.</p>
   <h4>Sort by</h4><div class="chips">${[["distance", "Nearest"], ["popularity", "Most popular on BREWZA"], ["rating", "Top rated"], ["spend", "Lowest spend"]].map(([v, l]) => c("sort", v, l, D.sort === v)).join("")}</div>`;
}
function openFilters() { D = JSON.parse(JSON.stringify(F)); renderFilterSheet(); $("#filters").hidden = false; }

/* ---------------- Detail sheet ---------------- */
async function openDetail(id) {
  let it = places.find(p => p.id === id);
  if (!it) {
    const s = db.wish.find(x => x.id === id) || db.visited.find(x => x.id === id) || db.reviews.map(r => ({ id: r.placeId, name: r.name, kind: r.kind, addr: r.addr, lat: r.lat, lng: r.lng })).find(x => x.id === id);
    if (!s) { toast("Place not found"); return; }
    try { const d = await api(`/places/nearby?lat=${s.lat}&lng=${s.lng}&radius=150`); const f = d.places.find(p => p.id === id); if (f) it = { ...f, open: openNow(f.hours) }; } catch (e) { }
    if (!it) it = { ...s, hours: "", phone: "", website: "", rating: 0, count: 0 };
  }
  current = { ...it, d: distOf(it) };
  renderDetail(); $("#detail").hidden = false; loadCommunity();
}
let rv = { stars: 0, photo: null };
function renderDetail() {
  const p = current, k = KINDS[p.kind] || KINDS.restaurant; rv = { stars: 0, photo: null };
  let site = ""; try { if (p.website && /^https?:$/.test(new URL(p.website).protocol)) site = p.website; } catch (e) { }
  const tags = tagsOf(p);
  $("#dbody").innerHTML = `<button class="x" data-close="detail" aria-label="Close">✕</button>
   <div class="hero">${k.em}</div>
   <h2>${esc(p.name)}</h2>
   <p class="muted">${k.label} · ${p.count ? `<span class="star">${stars(p.rating)}</span> ${p.rating.toFixed(1)} (${p.count} BREWZA review${p.count > 1 ? "s" : ""})` : "No BREWZA reviews yet"}${p.spend ? ` · ~₹${p.spend}/person` : ""} · ${fmtDist(p.d)} · ${travel(p.d)}</p>
   <div class="acts" style="margin:12px 0" id="dActs"></div>
   <div class="info">
    <div><b>Address</b>${esc(p.addr || "Not listed")}</div>
    <div><b>Hours</b>${p.hours ? esc(p.hours) : "Not listed"}<br>${p.open === true ? '<span class="ok">Open now</span>' : p.open === false ? '<span class="no">Closed now</span>' : ""}</div>
    <div><b>Contact</b>${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a><br>` : ""}${site ? `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer">Website</a>` : (p.phone ? "" : "Not listed")}</div>
    <div><b>Good to know</b>${tags.length ? tags.map(esc).join(" · ") : "No extra details listed"}</div>
   </div>
   <p class="muted">Place details are from OpenStreetMap contributors and may be incomplete.</p>
   <h4>BREWZA community reviews <span id="dAvg" class="muted"></span></h4><div id="dCommunity"><p class="muted">Loading…</p></div>
   <h4>Write a review</h4>
   <div class="stars" id="dStars" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button data-star="${n}" aria-label="${n} star">★</button>`).join("")}</div>
   <textarea id="rText" rows="3" maxlength="500" placeholder="What was it like? Food, vibe, service…"></textarea>
   <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap"><input type="number" id="rSpend" min="10" max="20000" placeholder="Spent ₹ per person (optional)" style="width:230px;font:inherit;color:var(--ink);background:var(--chip);border:1px solid var(--edge);border-radius:14px;padding:10px 12px">
    <input type="file" id="rFile" accept="image/*" style="width:auto"><span id="rPv"></span>
    <button class="btn" id="rPost" style="margin-left:auto">Post review</button></div>
   <p class="muted" style="margin-top:6px">Posting a review also adds this place to your visited list. Your spend helps the budget filter.</p>`;
  drawDetailActs();
}
function drawDetailActs() {
  const p = current, v = visitedRec(p.id);
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const osm = `https://www.openstreetmap.org/${{ n: "node", w: "way", r: "relation" }[p.id[0]]}/${p.id.slice(1)}`;
  $("#dActs").innerHTML = `<button data-wish="${esc(p.id)}" class="${inWish(p.id) ? "on" : ""}">♥ ${inWish(p.id) ? "In wishlist" : "Add to wishlist"}</button>
   <button data-visit="${esc(p.id)}" class="${v ? "on" : ""}">✓ ${v ? "Visited " + new Date(v.ts).toLocaleDateString() : "I’ve been here"}</button>
   <a href="${esc(dir)}" target="_blank" rel="noopener noreferrer">🧭 Directions</a>
   <a href="${esc(osm)}" target="_blank" rel="noopener noreferrer">🗺 OpenStreetMap page</a>
   <button data-chatplace="${esc(p.id)}">💬 Chat about this place</button>`;
}
async function loadCommunity() {
  const box = $("#dCommunity"); if (!box || !current) return;
  const id = current.id;
  try {
    const d = await api("/places/" + encodeURIComponent(id) + "/reviews");
    if (!current || current.id !== id || !$("#dCommunity")) return;
    $("#dAvg").textContent = d.count ? `· ★ ${d.avg} from ${d.count}${d.spend ? ` · avg ₹${d.spend}/person` : ""}` : "";
    box.innerHTML = d.reviews.map(r => `<div class="rev"><b>${esc(r.name)}${r.mine ? " (you)" : ""}</b> <span class="star">${stars(r.stars)}</span> <small>${new Date(r.ts).toLocaleDateString()}${r.spend ? " · spent ₹" + r.spend : ""}</small><br>${esc(r.text)}
      ${r.photo && r.photo.startsWith("data:image/jpeg;base64,") ? `<br><img src="${esc(r.photo)}" alt="Review photo" style="max-width:160px;border-radius:12px;margin-top:6px">` : ""}
      <div class="acts">${r.mine ? `<span class="muted">👍 ${r.likes}</span>` : `<button data-like="${r.rid}" class="${r.liked ? "on" : ""}">👍 Helpful · ${r.likes}</button><button data-report="${r.rid}">⚑ Report</button>`}</div></div>`).join("") || '<p class="muted">No reviews yet. Be the first!</p>';
  } catch (e) { box.innerHTML = `<p class="muted">Couldn’t load reviews (${esc(e.message)}).</p>`; }
}
const snap = p => ({ id: p.id, name: p.name, addr: p.addr, kind: p.kind, lat: p.lat, lng: p.lng });
async function toggleWish(id) {
  const i = db.wish.findIndex(w => w.id === id);
  try {
    if (i >= 0) { await api("/wishlist/" + encodeURIComponent(id), "DELETE", {}); db.wish.splice(i, 1); toast("Removed from wishlist"); }
    else {
      const p = places.find(x => x.id === id) || (current && current.id === id ? current : null); if (!p) return;
      await api("/wishlist", "POST", { place: snap(p) }); db.wish.unshift({ ...snap(p), ts: Date.now() }); toast("Saved to wishlist ♥");
    }
    refreshAfterChange();
  } catch (e) { toast(e.message); }
}
async function toggleVisit(id) {
  const i = db.visited.findIndex(v => v.id === id);
  try {
    if (i >= 0) { await api("/visits/" + encodeURIComponent(id), "DELETE", {}); db.visited.splice(i, 1); toast("Removed from visited"); }
    else { await api("/visits", "POST", { place: snap(current) }); db.visited.unshift({ ...snap(current), ts: Date.now() }); toast("Added to your visited places ✓"); }
    refreshAfterChange();
  } catch (e) { toast(e.message); }
}
function refreshAfterChange() {
  if (S.tab === "home") render(); if (S.tab === "profile") renderProfile();
  if (!$("#detail").hidden && current) drawDetailActs();
  refreshCounts();
}
function shrink(file, cb) {
  const rd = new FileReader();
  rd.onload = () => { const im = new Image(); im.onload = () => { const m = 480, s = Math.min(1, m / Math.max(im.width, im.height)), cv = document.createElement("canvas"); cv.width = im.width * s; cv.height = im.height * s; cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); cb(cv.toDataURL("image/jpeg", .7)); }; im.onerror = () => toast("Couldn’t read that image"); im.src = rd.result; };
  rd.readAsDataURL(file);
}
async function postReview() {
  const text = $("#rText").value.trim(), sp = $("#rSpend").value.trim();
  if (!rv.stars) return toast("Pick a star rating first");
  if (text.length < 5) return toast("Write a short review (5+ characters)");
  try {
    const spend = sp ? +sp : null;
    const r = await api("/reviews", "POST", { place: snap(current), stars: rv.stars, spend, text, photo: rv.photo });
    db.reviews.unshift({ rid: r.rid, placeId: current.id, name: current.name, kind: current.kind, addr: current.addr, lat: current.lat, lng: current.lng, stars: rv.stars, spend, text, photo: rv.photo, ts: r.ts });
    if (!visitedRec(current.id)) db.visited.unshift({ ...snap(current), ts: r.ts });
    const pl = places.find(x => x.id === current.id);   // update local stats so lists reflect it right away
    if (pl) { const n = pl.count + 1; pl.rating = Math.round(((pl.rating * pl.count) + rv.stars) / n * 10) / 10; pl.count = n; if (spend) pl.spend = pl.spend ? Math.round((pl.spend * (n - 1) + spend) / n) : spend; current = { ...current, rating: pl.rating, count: pl.count, spend: pl.spend }; }
    renderDetail(); loadCommunity(); refreshAfterChange(); toast("Review posted ☕");
  } catch (e) { toast(e.message); }
}

/* ---------------- Ask BREWZA AI (Gemini free tier via backend) ---------------- */
async function askAI() {
  const text = $("#ask").value.trim(), out = $("#askOut");
  if (!S.ai) { out.innerHTML = '<p class="muted">AI is off. Add a free GEMINI_API_KEY to .env and restart (see README).</p>'; return; }
  if (text.length < 3) return toast("Type what you’re looking for");
  const list = viewItems().sort((a, b) => a.d - b.d).slice(0, 40);
  if (!list.length) { out.innerHTML = '<p class="muted">No places loaded yet, or filters hide everything.</p>'; return; }
  const btn = $("#askGo"); btn.disabled = true; out.innerHTML = '<p class="muted">Thinking…</p>';
  try {
    const r = await api("/ask", "POST", { text, places: list.map(p => ({ id: p.id, name: p.name, kind: p.kind, d: Math.round(p.d), rating: p.rating, count: p.count, spend: p.spend, tags: [...tagsOf(p), p.open === true ? "open now" : ""].filter(Boolean) })) });
    const by = Object.fromEntries(list.map(p => [p.id, p]));
    out.innerHTML = (r.summary ? `<p>${esc(r.summary)}</p>` : "") + r.picks.map(k => by[k.id] ? `<div class="rev"><button class="lnk" data-open="${esc(k.id)}"><b>${esc(by[k.id].name)}</b></button> <small>· ${fmtDist(by[k.id].d)}</small><br>${esc(k.reason)}</div>` : "").join("")
      + '<p class="muted" style="margin-top:6px">AI suggestions can be wrong. Check details before you go.</p>';
  } catch (e) { out.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  btn.disabled = false;
}

/* ---------------- Profile + dashboard ---------------- */
function renderProfile() {
  const g = db.profile.gender, name = db.profile.name || "Guest";
  $("#avatar").textContent = g === "female" ? "👩" : g === "male" ? "👨" : "🙂";
  $("#pName").textContent = name; $("#nameInput").value = db.profile.name;
  $("#pSub").textContent = (db.user ? "@" + db.user.username + " · " : "") + (g === "male" ? "Midnight theme" : "Pastel theme");
  $$("#genderPick button").forEach(b => b.setAttribute("aria-pressed", b.dataset.g === g));
  const rs = db.reviews, avg = rs.length ? (rs.reduce((a, r) => a + r.stars, 0) / rs.length).toFixed(1) : "–";
  $("#stats").innerHTML = [[db.visited.length, "Places visited"], [rs.length, "Reviews written"], [avg, "Avg rating you give"], [db.wish.length, "In wishlist"]]
    .map(([n, l]) => `<div class="glass stat"><b>${n}</b><span>${l}</span></div>`).join("");
  const cnt = { cafe: 0, bar: 0, restaurant: 0 }; db.visited.forEach(v => cnt[v.kind] = (cnt[v.kind] || 0) + 1);
  const max = Math.max(1, ...Object.values(cnt));
  $("#bars").innerHTML = db.visited.length ? Object.entries(KINDS).map(([k, v]) => `<div class="bar"><span>${v.em} ${v.label}s</span><div><i style="width:${cnt[k] / max * 100}%;display:block"></i></div><b>${cnt[k]}</b></div>`).join("")
    : '<p class="muted">Mark places as visited to see your taste breakdown.</p>';
  $("#ptabs").innerHTML = [["visited", "✓ Visited"], ["reviews", "★ My reviews"], ["wish", "♥ Wishlist"]].map(([k, l]) => `<button class="chip" data-ptab="${k}" aria-pressed="${S.ptab === k}">${l}</button>`).join("");
  let html = "";
  const meta = p => `${esc((KINDS[p.kind] || KINDS.restaurant).label)} · ${esc(p.addr || "")}`;
  if (S.ptab === "visited") html = db.visited.slice().sort((a, b) => b.ts - a.ts).map(v => `<div class="glass item"><div><h4><button class="lnk" data-open="${esc(v.id)}">${esc(v.name)}</button></h4><p class="muted">${meta(v)}</p><p class="muted">Visited ${new Date(v.ts).toLocaleDateString()}${db.reviews.some(r => r.placeId === v.id) ? " · reviewed ✓" : ""}</p></div><div class="acts"><button data-open="${esc(v.id)}">Review</button><button data-unvisit="${esc(v.id)}">Remove</button></div></div>`).join("");
  if (S.ptab === "reviews") html = db.reviews.slice().sort((a, b) => b.ts - a.ts).map(r => `<div class="glass item"><div><h4><button class="lnk" data-open="${esc(r.placeId)}">${esc(r.name)}</button></h4><p><span class="star">${stars(r.stars)}</span> <small class="muted">${new Date(r.ts).toLocaleDateString()}${r.spend ? " · spent ₹" + r.spend : ""}</small></p><p style="margin:4px 0;font-size:14px">${esc(r.text)}</p>${r.photo && r.photo.startsWith("data:image/jpeg;base64,") ? `<img src="${esc(r.photo)}" alt="Your photo">` : ""}</div><div class="acts"><button data-delrev="${r.rid}">Delete</button></div></div>`).join("");
  if (S.ptab === "wish") html = db.wish.map(w => `<div class="glass item"><div><h4><button class="lnk" data-open="${esc(w.id)}">${esc(w.name)}</button></h4><p class="muted">${meta(w)}</p></div><div class="acts"><button data-open="${esc(w.id)}">Details</button><button data-wish="${esc(w.id)}">Remove</button></div></div>`).join("");
  $("#plist").innerHTML = html || `<p class="muted">${{ visited: "No visited places yet. Open a place and tap “I’ve been here”.", reviews: "No reviews yet. Open a place and write one.", wish: "Your wishlist is empty." }[S.ptab]}</p>`;
}

/* ---------------- Chat (saved in the database; browser polls every 2 s) ---------------- */
const Chat = { room: "lounge", place: null, timer: null, last: 0 };
function areaRoom() { return db.loc ? `area:${db.loc.lat.toFixed(1)},${db.loc.lng.toFixed(1)}` : "lounge"; }
function roomList() {
  const r = [{ id: "lounge", label: "🌍 Lounge" }];
  if (db.loc) r.push({ id: areaRoom(), label: "📍 Around you" });
  if (Chat.place) r.push({ id: "place:" + Chat.place.id, label: "💬 " + Chat.place.name });
  return r;
}
function drawRooms() { $("#rooms").innerHTML = roomList().map(r => `<button class="chip" data-room="${esc(r.id)}" aria-pressed="${Chat.room === r.id}">${esc(r.label)}</button>`).join(""); }
function addMsg(m) {
  const box = $("#msgs"), d = document.createElement("div");
  d.className = "msg" + (db.user && m.uid === db.user.id ? " me" : "");
  const s = document.createElement("small"); s.textContent = `${m.name} · ${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const t = document.createElement("div"); t.textContent = m.text;
  d.append(s, t); box.append(d);
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}
async function pollChat() {
  if (S.tab !== "chat") return;
  const room = Chat.room;
  try {
    const d = await api(`/chat?room=${encodeURIComponent(room)}&after=${Chat.last}`);
    if (room !== Chat.room) return;
    d.messages.forEach(addMsg);
    if (d.messages.length) Chat.last = d.messages[d.messages.length - 1].id;
    $("#online").textContent = d.online;
  } catch (e) { if (e.status === 401) location.reload(); }
}
function connectRoom(room) {
  Chat.room = room; Chat.last = 0; drawRooms(); $("#msgs").innerHTML = ""; $("#online").textContent = "–";
  clearInterval(Chat.timer); pollChat(); Chat.timer = setInterval(pollChat, 2000);
}
async function sendChat() {
  const inp = $("#chatText"), text = inp.value.trim(); if (!text) return;
  inp.value = "";
  try { await api("/chat", "POST", { room: Chat.room, text }); pollChat(); } catch (e) { toast(e.message); }
}

/* ---------------- Location ---------------- */
function setLoc(lat, lng, label, sub) {
  db.loc = { lat, lng, label, sub }; try { localStorage.setItem(LOCKEY, JSON.stringify(db.loc)); } catch (e) { }
  $("#gate").hidden = true; showLoc();
  if (map) map.setView([lat, lng], 14);
  fetchPlaces();
}
function showLoc() { if (!db.loc) return; $("#locLabel").textContent = "📍 " + db.loc.label; $("#locSub").textContent = db.loc.sub || ""; }
function useGeo() {
  const err = $("#gerr2"); err.hidden = true;
  if (!navigator.geolocation) { err.textContent = "This browser can’t share location. Type an area instead."; err.hidden = false; return; }
  const btn = $("#gGeo"); btn.disabled = true; btn.textContent = "Getting your location…";
  navigator.geolocation.getCurrentPosition(pos => {
    btn.disabled = false; btn.textContent = "📍 Use my precise location";
    setLoc(pos.coords.latitude, pos.coords.longitude, "Your precise location", `accuracy ± ${Math.round(pos.coords.accuracy)} m`);
  }, e => {
    btn.disabled = false; btn.textContent = "📍 Use my precise location";
    err.textContent = ({ 1: "Location permission was denied. Allow it in your browser’s site settings, or type an area below.", 2: "Couldn’t determine your position. Type an area instead.", 3: "Location timed out. Try again or type an area." })[e.code] || "Couldn’t get location."; err.hidden = false;
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
async function searchArea() {
  const q = $("#gArea").value.trim(), err = $("#gerr2"); err.hidden = true; if (!q) return;
  try { const r = await api("/geocode?q=" + encodeURIComponent(q)); setLoc(r.lat, r.lng, r.label, r.sub); }
  catch (e) { err.textContent = e.message; err.hidden = false; }
}

/* ---------------- Tabs + events ---------------- */
function setTab(t) {
  S.tab = t;
  $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  ["home", "chat", "profile"].forEach(x => $("#tab-" + x).hidden = x !== t);
  if (t === "home" && map) { map.invalidateSize(); if (circle) map.fitBounds(circle.getBounds(), { padding: [10, 10] }); }
  if (t === "chat") connectRoom(Chat.room); else clearInterval(Chat.timer);
  if (t === "profile") renderProfile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.addEventListener("click", async e => {
  const t = e.target.closest("button,[data-open]");
  if (!t) { if (e.target.classList && e.target.classList.contains("overlay") && e.target.id !== "gate") e.target.hidden = true; return; }
  const d = t.dataset;
  if (d.tab) return setTab(d.tab);
  if (d.close) { $("#" + d.close).hidden = true; return; }
  if (d.open) return openDetail(d.open);
  if (d.wish) return toggleWish(d.wish);
  if (d.visit) return toggleVisit(d.visit);
  if (d.unvisit) { try { await api("/visits/" + encodeURIComponent(d.unvisit), "DELETE", {}); db.visited = db.visited.filter(v => v.id !== d.unvisit); renderProfile(); } catch (er) { toast(er.message); } return; }
  if (d.delrev) { try { await api("/reviews/" + d.delrev, "DELETE", {}); db.reviews = db.reviews.filter(r => String(r.rid) !== d.delrev); renderProfile(); } catch (er) { toast(er.message); } return; }
  if (d.like) { try { await api(`/reviews/${d.like}/like`, "POST", {}); loadCommunity(); } catch (er) { toast(er.message); } return; }
  if (d.report) { try { await api(`/reviews/${d.report}/report`, "POST", {}); toast("Reported. It’s now hidden for you."); loadCommunity(); } catch (er) { toast(er.message); } return; }
  if (d.ptab) { S.ptab = d.ptab; renderProfile(); return; }
  if (d.star) { rv.stars = +d.star; $$("#dStars button").forEach((b, i) => b.classList.toggle("on", i < rv.stars)); return; }
  if (d.chatplace) { Chat.place = { id: current.id, name: current.name }; Chat.room = "place:" + current.id; $("#detail").hidden = true; setTab("chat"); return; }
  if (d.room) return connectRoom(d.room);
  if (d.auth) return setAuthMode(d.auth);
  if (d.fk) {
    const k = d.fk, v = d.fv;
    if (k === "type") { const i = D.types.indexOf(v); i >= 0 ? D.types.splice(i, 1) : D.types.push(v); if (!D.types.length) D.types = [v]; }
    else if (k === "spend") D.spend = D.spend === v ? "any" : v;
    else if (k === "rating") D.rating = +v;
    else if (k === "sort") D.sort = v;
    else D[k] = !D[k];
    renderFilterSheet(); return;
  }
  if (d.g) {
    db.profile.gender = d.g; applyTheme();
    $$("[data-g]").forEach(b => b.setAttribute("aria-pressed", b.dataset.g === d.g));
    if (S.tab === "profile") renderProfile();
    if (db.user && gateStep !== 1) saveProfile();
    return;
  }
  switch (t.id) {
    case "openFilters": return openFilters();
    case "fApply": F = JSON.parse(JSON.stringify(D)); $("#filters").hidden = true; S.mode = "nearby"; render(); return;
    case "fClear": D = F0(); renderFilterSheet(); return;
    case "wishToggle": S.mode = S.mode === "wish" ? "nearby" : "wish"; render(); return;
    case "askGo": return askAI();
    case "changeLoc": case "pLoc": showGate(2); return;
    case "gateX": $("#gate").hidden = true; return;
    case "aGo": return submitAuth();
    case "gnext1": {
      const er = $("#gerr1");
      if (!db.profile.gender) { er.textContent = "Please pick a style to continue."; er.hidden = false; return; }
      db.profile.name = $("#gname").value.trim() || db.profile.name || "Guest"; er.hidden = true;
      await saveProfile(); renderProfile();
      if (db.loc) { $("#gate").hidden = true; fetchPlaces(); } else showGate(2);
      return;
    }
    case "gGeo": return useGeo();
    case "gAreaGo": return searchArea();
    case "chatSend": return sendChat();
    case "rPost": return postReview();
    case "pLogout": try { await api("/logout", "POST", {}); } catch (er) { } location.reload(); return;
    case "pClear": if (confirm("Delete your wishlist, visited places and reviews from the database?")) { try { await api("/me/data", "DELETE", {}); db.wish = []; db.visited = []; db.reviews = []; renderProfile(); refreshCounts(); toast("Cleared"); } catch (er) { toast(er.message); } } return;
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "range") { db.profile.range = +t.value; $("#rangeVal").textContent = fmtDist(+t.value); }
  else if (t.id === "q") { S.q = t.value; render(); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "range") { saveProfile(); fetchPlaces(); }
  else if (t.id === "nameInput") { db.profile.name = t.value.trim().slice(0, 24) || "Guest"; $("#pName").textContent = db.profile.name; saveProfile(); }
  else if (t.id === "rFile" && t.files[0]) shrink(t.files[0], d => { rv.photo = d; $("#rPv").innerHTML = `<img src="${d}" alt="Preview" style="height:44px;border-radius:8px">`; });
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { ["filters", "detail"].forEach(i => $("#" + i).hidden = true); if (db.user && db.loc && db.profile.gender && gateStep === 2) $("#gate").hidden = true; }
  if (e.key === "Enter") {
    if (e.target.id === "chatText") sendChat();
    if (e.target.id === "gArea") searchArea();
    if (e.target.id === "ask") askAI();
    if (["aUser", "aPass", "aName"].includes(e.target.id)) submitAuth();
  }
});

/* ---------------- Boot ---------------- */
(async function boot() {
  $("#range").value = db.profile.range; $("#rangeVal").textContent = fmtDist(db.profile.range);
  setAuthMode("login"); applyTheme(); showLoc();
  if (typeof L === "undefined") { showSetup("The map library (Leaflet) couldn’t load. Check your internet connection and refresh."); return; }
  let needAuth = false;
  try { const c = await api("/config"); S.ai = !!c.ai; } catch (e) { showSetup("The BREWZA server isn’t running."); return; }
  $("#ask").placeholder = S.ai ? $("#ask").placeholder : "✨ AI is off (add a free GEMINI_API_KEY to .env to enable)";
  try { applyServerData(await api("/me")); } catch (e) { if (e.status === 401) needAuth = true; else { showSetup(e.message); return; } }
  $("#range").value = db.profile.range; $("#rangeVal").textContent = fmtDist(db.profile.range);
  initMap(); applyTheme(); renderProfile(); refreshCounts();
  if (needAuth) showGate(0); else afterLogin();
})();
