/* ============================================================
   COLONY MITRA  —  PWA + Firebase Realtime Database
   ============================================================ */

/* ============================================================
   ⚙️  APP SETTINGS  —  yahan badal sakte ho
   ============================================================ */
const SETTINGS = {
  appName:   "Colony Mitra",
  colony:    "Govt Colony, Ghatkopar East",
  state:     "Maharashtra",
  ownerName: "",         // e.g. "Aapka Naam"

  /* sirf ADMIN_EMAIL wala user hi edit kar sakta hai.
     Rules database me bhi ye check karte hain — UI sirf dikhne ke liye. */
  adminEmail: "colonymitra.admin@gmail.com"
};

/* ---------- CONFIG (Firebase optional) ---------- */
const HAS_FB = !!(window.firebaseConfig && window.firebaseConfig.apiKey);
let FB_DB = null;
if (HAS_FB) {
  firebase.initializeApp(window.firebaseConfig);
  FB_DB = firebase.database();
}

const KEY = "colony_shops_v1";
const REVIEWED_KEY = "colony_reviewed";
const MIGRATED_KEY = "colony_migrated";

/* Default emergency contacts — Admin se badal sakte ho */
const DEFAULT_EM = [
  { id:"e1", icon:"🚓", label:"Police",        num:"100",           color:"blue"   },
  { id:"e2", icon:"🚑", label:"Ambulance",     num:"108",           color:"red"    },
  { id:"e3", icon:"🚒", label:"Fire Brigade",  num:"101",           color:"red"    },
  { id:"e4", icon:"👮", label:"Society Guard", num:"",              color:"blue"   },
  { id:"e5", icon:"🏥", label:"Near Hospital", num:"",              color:"green"  },
  { id:"e6", icon:"👩", label:"Women Helpline",num:"1091",          color:"red"    },
  { id:"e7", icon:"💧", label:"Water Supply",  num:"",              color:"orange" },
  { id:"e8", icon:"🔌", label:"BESB Complaint",num:"19122",         color:"orange" }
];

let DATA = { shops: {}, updates: {}, reviews: {}, emergency: {}, app: {} };
let NEW_PHOTOS = [];
let NEW_THUMB = null;
let CUR_SHOP = null;   // shop modal me khuli hai
let PICK_STARS = 0;
let NEW_LOGO = null;

/* ---------- STATE ---------- */
let cat = "all";
let query = "";

/* ---------- HELPERS ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("on"), 2200);
}

function fmtTime(ts) {
  const d = new Date(ts), n = new Date();
  const days = Math.floor((n - d) / 864e5);
  if (days === 0) return "Aaj " + d.toLocaleTimeString("hi-IN", {hour:"numeric",minute:"2-digit"});
  if (days === 1) return "Kal";
  if (days < 7)   return days + " din pehle";
  return d.toLocaleDateString("hi-IN", {day:"numeric", month:"short"});
}

/* WhatsApp number: remove non-digits, default 91 (India) */
function waNumber(shop) {
  let n = String(shop.wa || shop.phone || "").replace(/\D/g, "");
  if (!n) return null;
  if (n.length === 10) n = "91" + n;
  return n;
}

/* ---------- DATA LAYER ---------- */
/* cloud se aane se PEHLE phone me kitna data tha — migration check ke liye */
let LOCAL_PRE = 0;
function captureLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) || "{}";
    LOCAL_PRE = Object.keys(raw.shops || {}).length
               + Object.keys(raw.updates || {}).length
               + Object.keys(raw.reviews || {}).length;
  } catch { LOCAL_PRE = 0; }
}

function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) || {};
    // har key ka default object — purana data bhi safe rahe
    ["shops", "updates", "reviews", "emergency", "app"].forEach(k => {
      DATA[k] = (raw[k] && typeof raw[k] === "object") ? raw[k] : {};
    });
  } catch { /* ignore */ }
}
function saveLocal() {
  localStorage.setItem(KEY, JSON.stringify(DATA));
}

/* Load + live subscribe. Firebase auto-pushes changes to every phone. */
function sync() {
  const badge = $("#syncBadge");

  // 1) PEHLE phone me saved data turant dikha do — blank screen mat dikhaao
  captureLocal();
  loadLocal();
  render();
  applyLogo();
  renderEmAdmin();

  if (!FB_DB) {
    badge.textContent = "📱 Local";
    badge.classList.remove("cloud");
    return;
  }

  badge.textContent = "☁️ Cloud";
  badge.classList.add("cloud");

  const onErr = err => {
    // permission denied / database missing
    console.warn("[cloud]", err && err.message);
    badge.textContent = "⚠️ Fix karo";
    badge.classList.remove("cloud");
    badge.title = "Cloud error — Firebase me Realtime Database bana hai?";
    toast("⚠️ Cloud connect nahi hua. Firebase me Realtime Database bana hai?");
  };

  const root = FB_DB.ref();
  ["shops", "updates", "reviews", "emergency", "app"].forEach(k => {
    root.child(k).on("value", snap => {
      DATA[k] = snap.val() || {};
      saveLocal();          // offline copy
      render();
      if (k === "emergency") { renderEmAdmin(); renderQuickAdd(); }
      if (k === "app") applyLogo();
    }, onErr);
  });

  // connection status
  root.child(".info/connected").on("value", s => {
    if (s.val()) {
      badge.textContent = "☁️ Cloud";
      badge.classList.add("cloud");
    } else {
      badge.textContent = "📴 Offline";
      badge.classList.remove("cloud");
    }
  });

  // kitne log use kar rahe hain (admin hi padh sakta hai)
  if (unlocked) {
    root.child("stats").on("value", snap => {
      DATA.stats = snap.val() || {};
      saveLocal();
      renderStats();
    });
  }

  trackVisit();

  // pehli baar cloud connect ho raha hai?
  if (!localStorage.getItem(MIGRATED_KEY)) {
    setTimeout(() => offerMigration(), 900);
  }
}

/* ---------- PHOTOS  (alag jagah — taaki list halki rahe) ---------- */
const PHOTOS = {};                 // shopId -> [full photo urls]
const thumbOf = s => s.thumb || (s.photos && s.photos[0]) || null;

async function savePhotos(shopId, list) {
  PHOTOS[shopId] = list;
  if (!FB_DB) return;              // local mode me DATA me hi hai
  const ref = FB_DB.ref("photos/" + shopId);
  await ref.remove().catch(() => {});
  if (list.length) await ref.set(list).catch(e => console.warn("photos", e.message));
}

async function loadPhotos(shopId) {
  if (PHOTOS[shopId]) return PHOTOS[shopId];
  const s = (DATA.shops || {})[shopId];
  if (s && s.photos && s.photos.length) { PHOTOS[shopId] = s.photos; return PHOTOS[shopId]; }
  if (!FB_DB) { PHOTOS[shopId] = []; return []; }
  try {
    const snap = await FB_DB.ref("photos/" + shopId).once("value");
    const list = snap.val() || [];
    PHOTOS[shopId] = Array.isArray(list) ? list : [];
  } catch { PHOTOS[shopId] = []; }
  return PHOTOS[shopId];
}

function write(path, value) {
  if (FB_DB) {
    FB_DB.ref(path).set(value)
      .catch(e => {
        console.warn("[write]", path, e && e.message);
        toast("⚠️ Save nahi hua — Cloud check karo");
      });
  }
  else {
    const [a, b] = path.split("/");
    DATA[a][b] = value;
    saveLocal();
    render();
  }
}
function removeAt(path) {
  if (FB_DB) FB_DB.ref(path).remove();
  else {
    const [a, b] = path.split("/");
    delete DATA[a][b];
    saveLocal();
    render();
  }
}

/* ---------- IMAGE COMPRESS ----------
   Do size banate hain:
   • thumb  — chhoti, sirf list card me (~12 KB)
   • full   — badi, sirf dukaan kholne par (~80 KB)
   Isse app hamesha halki rehti hai. */
function renderImage(file, max, quality) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        let { width:w, height:h } = im;
        if (w > max || h > max) {
          const s = max / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(im, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", quality));
      };
      im.onerror = () => res(null);
      im.src = fr.result;
    };
    fr.onerror = () => res(null);
    fr.readAsDataURL(file);
  });
}

const thumb =  f => renderImage(f, 340, .55);   // card ke liye
const full   =  f => renderImage(f, 900, .72);   // detail ke liye

async function handleFiles(files, cb) {
  const out = [];
  for (const f of [...files].slice(0, 12)) {
    const d = await full(f);
    if (d) out.push(d);
  }
  cb(out);
}
/* pehli photo ka chhota version */
async function makeThumb(files, current) {
  if (current && current.length) return current[0];   // pehle se hai
  const f = files[0];
  return f ? thumb(f) : null;
}

/* ============================================================
   RENDER — HOME
   ============================================================ */
function allShops() {
  const list = Object.values(DATA.shops || {});
  // jiska code hai wo pehle (code ke hisaab se), phir naya business
  return list.sort((a, b) => {
    const ca = a.code || "", cb = b.code || "";
    if (ca && cb) return ca.localeCompare(cb, undefined, { numeric: true });
    if (ca) return -1;
    if (cb) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/* agla apne aap number — GC-001, GC-002 ... */
function nextCode() {
  const used = Object.values(DATA.shops || {})
    .map(s => String(s.code || ""))
    .filter(c => /^GC-?\d+$/i.test(c))
    .map(c => parseInt(c.replace(/\D/g, ""), 10));
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return "GC-" + String(n).padStart(3, "0");
}

/* ---------- LOCAL → CLOUD MIGRATION ---------- */
/* Firebase pehle connect karne se PEHLE jo businesses phone me bani thin,
   wo cloud pe nahi hoti. Ye unhe bhej deta hai taaki data na ude. */
function offerMigration() {
  const cloudCount = Object.keys(DATA.shops || {}).length
                   + Object.keys(DATA.updates || {}).length;

  // Sirf tabhi poochho jab phone me kuch hai jo cloud me nahi hai
  if (LOCAL_PRE <= cloudCount) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }

  const extra = LOCAL_PRE - cloudCount;
  if (!confirm(`☁️ Cloud connected!\n\nIs phone par ${extra} cheez(ें) hain jo cloud me nahi hain.\n\nKya unhe cloud par bhej dein?`)) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }
  migrate();
}

async function migrate() {
  toast("☁️ Bheja ja raha hai…");
  let n = 0;
  for (const [id, s] of Object.entries(DATA.shops || {}))   { await setPath("shops/" + id, s);   n++; }
  for (const [id, u] of Object.entries(DATA.updates || {})) { await setPath("updates/" + id, u); n++; }
  for (const [sid, rs] of Object.entries(DATA.reviews || {}))
    for (const [rid, r] of Object.entries(rs || {}))        { await setPath("reviews/" + sid + "/" + rid, r); n++; }
  for (const [id, e] of Object.entries(DATA.emergency || {})) { await setPath("emergency/" + id, e); n++; }

  localStorage.setItem(MIGRATED_KEY, "1");
  toast("✅ " + n + " cheezein cloud par bhej di");
}

/* set with promise (SDK synchronous, but wrapper future-proof) */
function setPath(path, val) {
  return new Promise(res => FB_DB.ref(path).set(val).then(res).catch(res));
}

/* ---------- LOGO ---------- */
function applyLogo() {
  const src = (DATA.app && DATA.app.logo) || "icons/icon-192.png";
  $("#appLogo").src = src;
  const pv = $("#logoPreview");
  if (pv) pv.src = src;
}
function setLogo(src) {
  const app = Object.assign({}, DATA.app, { logo: src });
  write("app/logo", src);
  DATA.app = app;
  applyLogo();
}

/* ---------- REVIEWS ---------- */
function revsOf(shopId) {
  return Object.values((DATA.reviews || {})[shopId] || {})
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function ratingOf(shopId) {
  const r = revsOf(shopId);
  if (!r.length) return { avg: 0, n: 0 };
  const sum = r.reduce((t, x) => t + (x.stars || 0), 0);
  return { avg: Math.round((sum / r.length) * 10) / 10, n: r.length };
}
function starRow(v) {
  const full = Math.round(v);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(Math.max(0, 5 - full))}</span>`;
}
function alreadyReviewed(shopId) {
  try { return JSON.parse(localStorage.getItem(REVIEWED_KEY) || "[]").includes(shopId); }
  catch { return false; }
}
function markReviewed(shopId) {
  const a = JSON.parse(localStorage.getItem(REVIEWED_KEY) || "[]");
  if (!a.includes(shopId)) { a.push(shopId); localStorage.setItem(REVIEWED_KEY, JSON.stringify(a)); }
}

/* ============================================================
   RENDER — EMERGENCY
   ============================================================ */
function emList() {
  const e = Object.values(DATA.emergency || {});
  return e.length ? e : DEFAULT_EM.map(x => Object.assign({}, x));
}

function renderEmergency() {
  const list = emList();
  $("#emEmpty").style.display = list.length ? "none" : "block";

  $("#emList").innerHTML = list.map(e => {
    const num = String(e.num || "").replace(/\D/g, "");
    const href = num ? `tel:+${num}` : "#";
    return `<a class="em c-${esc(e.color || "red")}" href="${href}"
               ${num ? "" : 'onclick="event.preventDefault();toast(\'Number add nahi hai\')"'}>
      <span class="ic">${esc(e.icon || "📞")}</span>
      <span class="lb">${esc(e.label)}</span>
      <span class="nu">${esc(e.num || "—")}</span>
    </a>`;
  }).join("");
}

function renderEmAdmin() {
  const box = $("#emAdminList");
  if (!box) return;
  const list = Object.values(DATA.emergency || {});
  if (!list.length) {
    box.innerHTML = `<div class="hintbox">Abhi koi custom number nahi. Neeche default list se shuru karo —
      <b>Default list</b> button dabao, phir Society Guard / Near Hospital ka number bharto.</div>`;
    return;
  }
  box.innerHTML = list.map(e => `<div class="em-row">
      <span class="ic">${esc(e.icon || "📞")}</span>
      <div class="tx"><b>${esc(e.label)}</b><span>${esc(e.num)}</span></div>
      <button class="mini ed" data-emedit="${e.id}" title="Badlo">✏️</button>
      <button class="mini" data-emedel="${e.id}" title="Hatao">✕</button>
    </div>`).join("");
}

function renderChips() {
  const cats = [...new Set(allShops().map(s => s.cat).filter(Boolean))].sort();
  const box = $("#catChips");
  box.innerHTML = ["all", ...cats].map(c =>
    `<button class="chip ${cat === c ? "on" : ""}" data-c="${esc(c)}">
      ${c === "all" ? "✨ Sab" : esc(c)}
     </button>`).join("");
}

function renderShops() {
  $("#areaName").textContent = "📍 " + SETTINGS.colony;
  document.title = SETTINGS.appName + " · " + SETTINGS.colony;

  const q = query.toLowerCase();
  const list = allShops().filter(s => {
    const okCat = cat === "all" || s.cat === cat;
    const txt = (s.name + " " + s.cat + " " + s.desc + " " +
      (s.items || []).map(i => i.name + " " + i.cat).join(" ")
    ).toLowerCase();
    return okCat && (!q || txt.includes(q));
  });

  $("#shopCount").textContent = DATA.shops
    ? Object.keys(DATA.shops).length + " Business" : "0 Business";

  $("#homeEmpty").style.display = list.length ? "none" : "block";
  if (!list.length && query) $("#homeEmpty").textContent = "Kuch nahi mila. Dusra word try karo.";

  $("#shopList").innerHTML = list.map(s => {
    const badges = [];
    if (s.isNew)  badges.push('<span class="badge b-new">NAYI</span>');
    badges.push(s.isOpen
      ? '<span class="badge b-open">KHULI</span>'
      : '<span class="badge b-off">BAND</span>');

    const img = thumbOf(s);
    const r = ratingOf(s.id);
    return `<article class="shop" data-id="${s.id}">
      <div class="picwrap">
        ${img ? `<img class="pic" src="${img}" alt="" loading="lazy" decoding="async">` : `<div class="pic">🏪</div>`}
        ${s.code ? `<span class="code">${esc(s.code)}</span>` : ""}
      </div>
      <h3>${esc(s.name)}</h3>
      ${s.cat ? `<span class="cat">${esc(s.cat)}</span>` : ""}
      <div class="badges">${badges.join("")}</div>
      ${s.desc ? `<p class="desc">${esc(s.desc)}</p>` : ""}
      ${r.n ? `<div class="rating">${starRow(r.avg)} <b>${r.avg}</b> (${r.n})</div>`
            : `<div class="rating">${starRow(0)} <span>Abhi review nahi</span></div>`}
    </article>`;
  }).join("");
}

/* ============================================================
   RENDER — UPDATES FEED
   ============================================================ */
function renderUpdates() {
  // Firebase me id object ke andar nahi hoti — wo KEY hoti hai
  const list = Object.entries(DATA.updates || {})
    .map(([id, u]) => Object.assign({ id }, u))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  $("#updatesEmpty").style.display = list.length ? "none" : "block";

  const tag = { offer: ["🎁 Offer", "#f59e0b"], new: ["🆕 Naya Business", "#2563eb"],
                notice: ["📌 Notice", "#6b7280"] };

  $("#updateList").innerHTML = list.map(u => {
    const [label, color] = tag[u.type] || tag.notice;
    return `<div class="post">
      ${unlocked ? `<button class="del-post" data-updel="${esc(u.id)}" title="Delete">✕</button>` : ""}
      <span class="tag" style="color:${color}">${label}</span>
      <p>${esc(u.text)}</p>
      ${u.photo ? `<img src="${u.photo}" alt="">` : ""}
      <div class="date">${fmtTime(u.ts)}</div>
    </div>`;
  }).join("");
}

function render() { renderChips(); renderShops(); renderUpdates(); renderEmergency(); renderUnread(); }

/* ============================================================
   SHOP DETAIL MODAL
   ============================================================ */
function openShop(id) {
  const s = DATA.shops[id];
  if (!s) return;
  CUR_SHOP = id;
  PICK_STARS = 0;

  const wa = waNumber(s);
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(
      "Namaste " + s.name + "! " + (s.addr ? "(" + s.addr + ") " : "") + "Main Colony Mitra app se aaya hoon.") }` : "";
  const tel = String(s.phone || "").replace(/\D/g, "");

  // group items by category
  const groups = {};
  (s.items || []).forEach(i => {
    const k = i.cat || "Saman";
    (groups[k] = groups[k] || []).push(i);
  });

  const th = thumbOf(s);
  const html = `
    ${th ? `<img class="hero" id="heroImg" src="${th}" alt="">` : `<div class="hero">🏪</div>`}

    <h2>${esc(s.name)}</h2>
    <div class="meta">
      ${s.code ? "🔢 Shop Code: <b>" + esc(s.code) + "</b><br>" : ""}
      ${s.cat ? "🏷️ " + esc(s.cat) + "<br>" : ""}
      ${s.addr ? "📍 " + esc(s.addr) + "<br>" : ""}
      ${s.time ? "🕐 " + esc(s.time) + "<br>" : ""}
      ${s.phone ? "📞 " + esc(s.phone) : ""}
    </div>

    <div class="acts">
      ${waLink ? `<a class="act act-wa" href="${waLink}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}
      ${tel ? `<a class="act act-call" href="tel:+${tel}">📞 Call</a>` : ""}
      ${waLink ? `<a class="act act-msg" href="https://wa.me/${wa}" target="_blank" rel="noopener">💬 Chat only</a>` : ""}
      ${unlocked ? `<button class="act act-edit" data-edit="${s.id}">✏️ Edit</button>` : ""}
    </div>

    ${!unlocked ? `
      <button class="admin-hint" data-gotoadmin>
        🔐 दुकान बदलणे/फोटो बदलणे आहे? — इथे Login करा
      </button>`
    : `
      <div class="admin-on">
        <span>🔓 Admin login चालू आहे</span>
        <button class="mini" id="shopLogout" title="Logout">Logout</button>
      </div>`}

    ${s.desc ? `<div class="sec"><h3>Kya karta hai</h3><p>${esc(s.desc)}</p></div>` : ""}

    ${Object.keys(groups).length ? `
      <div class="sec"><h3>Saman &amp; Daam</h3>
        ${Object.entries(groups).map(([g, arr]) => `
          <div class="mgroup"><h4>${esc(g)}</h4>
            ${arr.map(i => `<div class="mitem"><span>${esc(i.name)}</span><span class="p">${esc(i.price)}</span></div>`).join("")}
          </div>`).join("")}
      </div>` : ""}

    ${unlocked ? `
      <div class="photo-admin">
        <input type="file" id="phFile" accept="image/*" multiple hidden>
        <button class="pbtn" id="phSet">🔄 सारी फोटो बदला</button>
        <button class="pbtn" id="phAdd">➕ आणखी फोटो जोडा</button>
        <button class="pbtn danger" id="phDelAll">🗑️ सारी फोटो हटवा</button>
      </div>
      <div class="ph-hint" style="margin:-4px 0 12px">
        Photo हटाने के लिए नीचे <b>✕</b> बटन दबाओ.
      </div>` : ""}

    ${s.photos && s.photos.length > 1 ? `
      <div class="sec"><h3>Photos</h3>
        <div class="gallery">${s.photos.map(p => `<img src="${p}" data-full="${p}">`).join("")}</div>
      </div>` : ""}

    <div class="sec" id="revSec">
      <h3>⭐ Reviews &amp; Rating</h3>
      ${ratingHTML(id)}
    </div>
  `;

  $("#shopBody").innerHTML = html;
  $("#shopModal").classList.add("on");
  $("#shopBody").scrollTop = 0;
  window.scrollTo(0, 0);

  /* abhi sirf chhoti photo thi — ab asli badi photo laa do */
  loadPhotos(id).then(list => {
    if (CUR_SHOP !== id || !list.length) return;
    const hero = $("#heroImg");
    if (hero && list[0]) hero.src = list[0];
    let gal = $("#shopBody .gallery");
    if (!gal) {
      gal = document.createElement("div");
      gal.className = "gallery";
      const rev = $("#revSec");
      if (rev && list.length > 1) rev.parentNode.insertBefore(gal, rev);
    }
    if (gal) gal.innerHTML = list.map((p, i) =>
      `<div class="ph"><img src="${p}" data-full="${p}" alt="Photo ${i+1}">${
        unlocked ? `<button class="x" data-pdel="${i}" title="Hatao">✕</button>` : ""
      }</div>`).join("");
  });
}

/* ---------- PHOTO UPDATE (sirf admin, seedha modal se) ---------- */
let PHOTO_MODE = "add";           // "add" | "set"

async function handlePhotoPick(files) {
  const id = CUR_SHOP;
  if (!id || !files || !files.length) return;
  toast("📸 Photo upload ho rahi hai…");

  const newOnes = [];
  for (const f of [...files].slice(0, 12)) {
    const d = await full(f);
    if (d) newOnes.push(d);
  }
  if (!newOnes.length) return toast("❌ Photo load nahi hui");

  const cur = (PHOTOS[id] || []).slice();
  let list;
  if (PHOTO_MODE === "set") {
    list = newOnes.slice(0, 12);
  } else {
    list = cur.concat(newOnes).slice(0, 12);
  }

  await savePhotos(id, list);

  /* chhoti thumbnail bhi banao (list me dikhne ke liye) */
  const th = await renderImageFromDataUrl(list[0], 340, .55);
  if (th) {
    try { await FB_DB.ref("shops/" + id + "/thumb").set(th); } catch(e) { /* local */ }
    const sh = DATA.shops[id] = Object.assign({}, DATA.shops[id], { thumb: th });
    saveLocal();
  }

  openShop(id);
  render();
  toast("✅ " + newOnes.length + " photo update ho gayi");
}

function renderImageFromDataUrl(src, max, q) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      let w = im.width, h = im.height;
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w*s); h = Math.round(h*s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(im, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", q));
    };
    im.onerror = () => res(null);
    im.src = src;
  });
}

/* ---------- REVIEWS UI ---------- */
function ratingHTML(shopId) {
  const { avg, n } = ratingOf(shopId);
  const list = revsOf(shopId);
  const done = alreadyReviewed(shopId);

  const summary = `
    <div class="rating-box">
      <div style="text-align:center">
        <div class="big">${avg || "–"}</div>
        ${starRow(avg)}
        <div class="meta" style="margin-top:4px">${n} review${n === 1 ? "" : "s"}</div>
      </div>
      <div class="meta" style="flex:1">
        ${[5,4,3,2,1].map(star => {
          const c = list.filter(x => x.stars === star).length;
          const pct = n ? Math.round(c / n * 100) : 0;
          return `<div style="display:flex;gap:6px;align-items:center;margin-bottom:3px">
            <span style="width:10px">${star}</span>
            <div style="flex:1;height:6px;background:var(--card);border-radius:99px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:#f59e0b"></div>
            </div>
            <span style="width:20px;text-align:right">${c}</span>
          </div>`;
        }).join("")}
      </div>
    </div>`;

  const form = done ? `
    <div class="hintbox" style="text-align:center">✅ Aapne is business ko review kar diya hai. Dhanyavaad!</div>`
  : `
    <div class="card" style="box-shadow:none;background:var(--bg);margin-bottom:14px">
      <label style="margin-top:0">Apna rating do</label>
      <div class="star-pick" id="starPick">
        ${[1,2,3,4,5].map(i => `<button type="button" data-star="${i}">☆</button>`).join("")}
      </div>
      <input id="rvName" placeholder="Aapka naam" maxlength="30">
      <label style="margin-top:10px">Kya raha?</label>
      <textarea id="rvText" rows="3" placeholder="Bohot acchi service, jaldi mila. / Daam thoda zyada tha." maxlength="400"></textarea>
      <button class="btn primary" id="rvSend" style="margin-top:10px">Post review</button>
    </div>`;

  const items = list.map(r => `
    <div class="rev">
      <div class="top">
        <span class="nm">${esc(r.name || "Anonymous")}</span>
        ${starRow(r.stars)}
        <span class="dt">${fmtTime(r.ts)}</span>
        ${unlocked ? `<button class="mini" data-revdel="${shopId}|${r.id}" title="Delete">✕</button>` : ""}
      </div>
      <p>${esc(r.text)}</p>
    </div>`).join("");

  return summary + form + (items || `<p class="muted" style="text-align:center">Abhi koi review nahi. Pehle aap likho!</p>`);
}

function sendReview(shopId) {
  const text  = $("#rvText").value.trim().slice(0, 500);
  const name  = $("#rvName").value.trim().slice(0, 40) || "Anonymous";
  if (!PICK_STARS) return toast("Pehle ⭐ rating do");
  if (!text)     return toast("Thoda likho bhi");

  const id = "r" + Date.now();
  const r = { id, name, stars: PICK_STARS, text, ts: Date.now() };

  if (FB_DB) FB_DB.ref("reviews/" + shopId + "/" + id).set(r);
  else {
    DATA.reviews[shopId] = DATA.reviews[shopId] || {};
    DATA.reviews[shopId][id] = r;
    saveLocal(); render();
  }
  markReviewed(shopId);
  openShopRefresh(shopId);
  trimReviews(shopId);
  toast("⭐ Review post ho gaya!");
}

/* ek business par 50 se zyada reviews mat rakho — storage bachane ke liye.
   poore business ko hatane se behtar hai. */
function trimReviews(shopId) {
  const list = revsOf(shopId);            // naye pehle
  if (list.length <= 50) return;
  list.slice(50).forEach(r => {
    if (FB_DB) FB_DB.ref("reviews/" + shopId + "/" + r.id).remove();
    else delete DATA.reviews[shopId][r.id];
  });
}

function openShopRefresh(shopId) {
  if (!$("#revSec")) return;
  $("#revSec").innerHTML = ratingHTML(shopId);
}

function delReview(shopId, revId) {
  if (!confirm("Ye review delete karna hai?")) return;
  if (FB_DB) FB_DB.ref("reviews/" + shopId + "/" + revId).remove();
  else {
    delete DATA.reviews[shopId][revId];
    saveLocal(); render();
  }
  openShopRefresh(shopId);
  toast("🗑️ Review hat gaya");
}

/* ---------- parse items textarea ---------- */
function parseItems(raw) {
  return raw.split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 200)                       // ek business par 200 items se zyada nahi
    .map(l => {
      const p = l.split("|").map(x => x.trim());
      return { cat: (p[0] || "Saman").slice(0, 40),
               name: (p[1] || p[0] || "").slice(0, 60),
               price: (p[2] || "").slice(0, 30) };
    })
    .filter(i => i.name);
}

/* ============================================================
   📊 USERS  —  kitne log app use kar rahe hain
   Har phone ka ek unique id. Naam/number KABHI nahi bachte.
   Sirf count — koi personal data nahi.
   ============================================================ */
const DEV_KEY = "cm_device";

function deviceId() {
  let id = localStorage.getItem(DEV_KEY);
  if (!id) {
    id = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(DEV_KEY, id);
  }
  return id;
}

/* Roz ek baar likho — isse Firebase ke free writes bache rehte hain */
function trackVisit() {
  if (!FB_DB) return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem("cm_last_seen") === today) return;
  localStorage.setItem("cm_last_seen", today);

  const id = deviceId();
  FB_DB.ref("stats/devices/" + id).update({ f: Date.now(), l: Date.now() })
    .catch(() => {});
}

/* ============================================================
   📢 UNREAD UPDATES  —  user ko pata chale naya kuch aaya hai
   ============================================================ */
const SEEN_KEY = "cm_seen_upd";

function lastSeen() { return Number(localStorage.getItem(SEEN_KEY)) || 0; }

function unreadUpdates() {
  return Object.values(DATA.updates || {})
    .filter(u => (u.ts || 0) > lastSeen())
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function renderUnread() {
  const n     = unreadUpdates().length;
  const badge = $("#updBadge");
  const strip = $("#updStrip");

  if (badge) {
    badge.textContent = n > 9 ? "9+" : n;
    badge.hidden = n === 0;
    const tab = badge.closest(".tab");
    if (tab) tab.classList.toggle("has-new", n > 0);
  }

  if (strip) {
    const list = unreadUpdates();
    strip.hidden = list.length === 0;
    if (list.length) {
      $("#usTitle").textContent =
        list.length === 1 ? "नवीन अपडेट" : list.length + " नवीन अपडेट";
      $("#usText").textContent = list[0].text;
    }
  }
}

/* user ne Updates tab khol liya -> sab padha hua */
function markUpdatesSeen() {
  const all = Object.values(DATA.updates || {});
  const newest = all.reduce((m, u) => Math.max(m, u.ts || 0), 0);
  if (newest) localStorage.setItem(SEEN_KEY, String(newest));
  renderUnread();
}

/* ============================================================
   📊 USERS  —  kitne log app use kar rahe hain
   Har phone ka ek unique id. Naam/number KABHI nahi bachte.
   Sirf count — koi personal data nahi.
   ============================================================ */
function renderStats() {
  const box = $("#statBox");
  if (!box) return;
  const devs = Object.values((DATA.stats || {}).devices || {});
  if (!devs.length) {
    box.innerHTML = `<div class="hintbox">Abhi koi data nahi. Jaise hi koi app kholega,
      yahan count dikhne lagega.</div>`;
    return;
  }
  const now = Date.now(), DAY = 864e5;
  const today  = devs.filter(d => (now - (d.l || 0)) < DAY).length;
  const week   = devs.filter(d => (now - (d.l || 0)) < 7 * DAY).length;
  const month  = devs.filter(d => (now - (d.l || 0)) < 30 * DAY).length;
  const fresh  = devs.filter(d => (now - (d.f || 0)) < 7 * DAY).length;

  // last 7 days ka chhota graph
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const from = now - (i + 1) * DAY, to = now - i * DAY;
    days.push(devs.filter(d => (d.l > from && d.l <= to)).length);
  }
  const maxD = Math.max(1, ...days);

  box.innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${devs.length}</b><span>Total phones</span></div>
      <div class="kpi"><b>${today}</b><span>Aaj</span></div>
      <div class="kpi"><b>${week}</b><span>Is hafte</span></div>
      <div class="kpi"><b>${month}</b><span>Is mahine</span></div>
    </div>
    <div class="label">Pichhle 7 din</div>
    <div class="bars">${days.map((n, i) => `
      <div class="bar"><div class="fill" style="height:${Math.round(n / maxD * 100)}%"></div>
      <span>${n}</span></div>`).join("")}
    </div>
    <div class="label">Naye phones (7 din me): <b>${fresh}</b></div>
    <div class="lastseen">
      ${devs.sort((a, b) => (b.l || 0) - (a.l || 0)).slice(0, 6)
        .map(d => `<div><i></i> ${fmtTime(d.l)}</div>`).join("")}
    </div>
    <div class="hintbox" style="margin-top:10px">
      🔒 Sirf count — koi naam, number ya location nahi jode jaati.
    </div>`;
}

/* ============================================================
   INSTALL  —  app ko home screen par kaise lagayein
   ============================================================ */
let deferredPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
/* WhatsApp / Instagram ka apna in-app browser — wahan install nahi hota */
function inAppBrowser() {
  const ua = navigator.userAgent;
  return /WhatsApp|FBAN|FBAV|Instagram|Line\/|GSA\//i.test(ua);
}

/* install bar sirf tab dikhao jab app abhi standalone nahi hai */
function showInstallBar() {
  if (isStandalone()) return;                       // already installed
  if (localStorage.getItem("installbar_closed")) return;
  const bar = $("#installBar");
  if (!bar) return;

  if (inAppBrowser()) {
    $("#installBar").classList.add("warn");
    $("#ilTitle").textContent = "Asli browser me kholein";
    $("#ilSub").textContent   = isIOS()
      ? "Safari me kholein — install tabhi hoga"
      : "Chrome me kholein — install tabhi hoga";
    $("#ilBtn").textContent   = "Kaise karein";
    bar.classList.add("on");
    return;
  }

  if (deferredPrompt) {
    $("#ilTitle").textContent = "App ko phone me install karo";
    $("#ilSub").textContent   = "Ek tap me — bilkul app jaisa khulega";
    $("#ilBtn").textContent   = "Install";
  } else if (isIOS()) {
    $("#ilTitle").textContent = "App ko home screen par daalo";
    $("#ilSub").textContent   = "Safari → Share ⬆️ → Add to Home Screen";
    $("#ilBtn").textContent   = "Kaise karein";
  } else {
    $("#ilTitle").textContent = "App ko phone me install karo";
    $("#ilSub").textContent   = "Chrome ka ⋮ menu → Install app";
    $("#ilBtn").textContent   = "Kaise karein";
  }
  bar.classList.add("on");
}

function install() {
  if (inAppBrowser()) {
    const ua = navigator.userAgent;
    const steps = /iPhone|iPad|iPod/i.test(ua)
      ? "Aapne WhatsApp ke andar khola hai.\nWhatsApp ka apna browser app install nahi kar sakta.\n\n✅ Ye karo:\n\n1️⃣  Upar-right corner me ⋮ ya ↗️ dabao\n2️⃣  \"Open in Safari\" chuno\n3️⃣  Ab asli Safari khulega\n4️⃣  Neeche Share (⬆️) → \"Add to Home Screen\"\n5️⃣  \"Add\" dabao — app ban gayi ✅"
      : "Aapne WhatsApp ke andar khola hai.\nWhatsApp ka apna browser app install nahi kar sakta.\n\n✅ Ye karo:\n\n1️⃣  Upar-right corner me ⋮ menu dabao\n2️⃣  \"Open in Chrome\" chuno\n3️⃣  Ab asli Chrome khulega\n4️⃣  Neeche yellow bar me \"Install\" dabao\n5️⃣  \"Install\" / \"Add\" par confirm karo\n\n✅ Home screen par app ka icon aa jayega";
    alert(steps);
    return;
  }
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      hideInstallBar();
      toast("🎉 App install ho gaya!");
    });
    return;
  }
  // iOS / unsupported — step by step batao
  const steps = isIOS()
    ? "Safari me link kholo\n\n1️⃣  Neeche Share button (⬆️) dabao\n2️⃣  \"Add to Home Screen\" chuno\n3️⃣  Upar se \"Add\" dabao\n\n⚠️ iPhone par sirf Safari se hota hai, Chrome se nahi."
    : "Chrome ka menu (⋮) kholo\n\n1️⃣  \"Install app\" ya \"Add to Home screen\" chuno\n2️⃣  \"Install\" / \"Add\" dabao\n\n✅ Phone ke home screen par icon aa jayega";
  alert(steps);
}

function hideInstallBar() { $("#installBar").classList.remove("on"); }

/* ============================================================
   AUTH  —  Sirf admin email se login

   Baaki sab log bina kuch ke app use karte hain:
   • read public hai
   • reviews public hain
   • login sirf ADMIN tab dekhne ke liye chahiye

   Asli protection Firebase rules me hai (auth.token.email check).
   ============================================================ */
let unlocked = false;          // UI ke liye: admin panel khula hai ya nahi

function isAdminUser(u) {
  return !!(u && u.email && u.email.toLowerCase() === SETTINGS.adminEmail.toLowerCase());
}

/* Auth SDK (~100 KB) tabhi load karo jab Admin tab khola jaaye.
   Isse normal users ke phone par app jaldi khulega. */
let authReady = null;
function loadAuthSDK() {
  if (authReady) return authReady;
  authReady = new Promise((resolve, reject) => {
    if (window.firebase && firebase.auth) return resolve();
    const s = document.createElement("script");
    s.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("auth sdk load nahi hua"));
    document.head.appendChild(s);
  });
  return authReady;
}

/* ---------- EMERGENCY: edit ---------- */
let EM_EDIT_ID = null;
function editEm(id) {
  const e = (DATA.emergency || {})[id];
  if (!e) return;
  EM_EDIT_ID = id;
  $("#emIcon").value  = e.icon || "";
  $("#emLabel").value = e.label || "";
  $("#emNum").value   = e.num || "";
  $("#emColor").value = e.color || "red";
  $("#emForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#emLabel").focus();
  toast("✏️ Badal raha hai — neeche number badal kar Add dabao");
}

/* Common colony numbers — ek tap me form bhar jaata hai */
const QUICK = [
  { icon:"💧", label:"Water Man",    color:"orange", ph:"पाण्याचा नंबर" },
  { icon:"🛗", label:"Lift Man",     color:"blue",   ph:"Lift service नंबर" },
  { icon:"🧹", label:"Cleaning Staff",color:"green", ph:"सफाईचा नंबर" },
  { icon:"👮", label:"Society Guard",color:"blue",   ph:"Guard चा नंबर" },
  { icon:"⚡", label:"BESB / Electricity", color:"orange", ph:"Power complaint" },
  { icon:"🗑️", label:"Garbage / Municipal", color:"orange", ph:"कचरा नंबर" },
  { icon:"🏥", label:"Nearest Hospital", color:"red",  ph:"Hospital चा नंबर" },
  { icon:"🚓", label:"Police Chowki",  color:"blue",   ph:"Police station" },
  { icon:"🔥", label:"Gas Agency",    color:"orange", ph:"Gas agency" },
  { icon:"🐕", label:"Animal Control",color:"green",  ph:"Animal helpline" }
];

function renderQuickAdd() {
  const box = $("#qaChips");
  if (!box) return;
  const have = Object.values(DATA.emergency || {}).map(e => (e.label || "").toLowerCase());
  box.innerHTML = QUICK.map((q, i) => {
    const done = have.some(h => h.indexOf(q.label.toLowerCase().split(" ")[0]) > -1);
    return `<button type="button" class="qa ${done ? "done" : ""}" data-qa="${i}">
      ${q.icon} ${q.label}${done ? " ✓" : ""}
    </button>`;
  }).join("");
}

function initAuth() {
  return loadAuthSDK().then(() => new Promise(resolve => {
    const a = firebase.auth();

    /* Login browser me save rahe — 30 din tak. Har baar email-password
       daalne ki zaroorat na pade. */
    a.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(() => {});

    a.onAuthStateChanged(u => {
      unlocked = isAdminUser(u);
      applyAdminUI();
      if (unlocked && FB_DB) {
        FB_DB.ref("stats").on("value", snap => {
          DATA.stats = snap.val() || {};
          renderStats();
        });
      }
      resolve(u);
    });
  }));
}

function applyAdminUI() {
  const gate = $("#pinGate"), panel = $("#adminPanel");
  if (!gate || !panel) return;
  gate.style.display   = unlocked ? "none" : "block";
  panel.style.display = unlocked ? "block" : "none";
  const out = $("#adminOut");
  if (out) out.textContent = unlocked ? "✅ Aap admin ke roop me login hain." : "";
}

function adminLogin() {
  const email = $("#adminEmail").value.trim();
  const pass  = $("#adminPass").value;
  const err   = $("#pinErr");
  err.textContent = "";
  if (!email || !pass) return err.textContent = "Email aur password daalein";

  loadAuthSDK()
    .then(() => firebase.auth().signInWithEmailAndPassword(email, pass))
    .then(cred => {
      if (!isAdminUser(cred.user)) {
        firebase.auth().signOut();
        err.textContent = "Ye admin account nahi hai";
        $("#adminPass").value = "";
        return;
      }
      unlocked = true;
      applyAdminUI();
      refreshOpenShop();
      toast("🔓 Admin login ho gaya");
    })
    .catch(e => {
      err.textContent =
          e.code === "auth/invalid-credential" ? "Email ya password galat hai"
        : e.code === "auth/operation-not-allowed"  ? "Console me Email/Password login ON nahi hai"
        : e.code === "auth/network-request-failed"  ? "Internet check karo"
        : "Login nahi hua: " + e.message;
      $("#adminPass").value = "";
    });
}

function adminLogout() {
  if (!window.firebase || !firebase.auth) {          // SDK load hi nahi hua
    unlocked = false; applyAdminUI(); return;
  }
  firebase.auth().signOut().then(() => {
    unlocked = false;
    applyAdminUI();
    toast("🔒 Logout ho gaye");
  });
}

function saveShop() {
  const id = $("#fId").value || "s" + Date.now();
  const old = DATA.shops[id] || {};
  const shop = {
    id,
    name:    $("#fName").value.trim(),
    cat:     $("#fCategory").value.trim(),
    code:    ($("#fCode").value.trim() || nextCode()).toUpperCase().slice(0, 12),
    phone:   $("#fPhone").value.trim(),
    wa:      $("#fWa").value.trim(),
    addr:    $("#fAddr").value.trim(),
    time:    $("#fTime").value.trim(),
    desc:    $("#fDesc").value.trim(),
    items:   parseItems($("#fItems").value),
    thumb:   (NEW_THUMB || thumbOf(old) || null),   // sirf chhoti photo list me
    isNew:   $("#fNew").checked,
    isOpen:  $("#fOpen").checked,
    createdAt: old.createdAt || Date.now()
  };
  if (!shop.name || !shop.phone) return toast("Naam aur number zaroori hai");

  // input sanity — bahut bada ya tampered text na jaaye
  shop.name = shop.name.slice(0, 80);
  shop.cat  = shop.cat.slice(0, 40);
  shop.phone = shop.phone.replace(/[^\d+ ]/g, "").slice(0, 20);
  shop.wa   = shop.wa.replace(/[^\d+ ]/g, "").slice(0, 20);
  shop.desc = shop.desc.slice(0, 500);

  write("shops/" + id, shop);
  savePhotos(id, NEW_PHOTOS.length ? NEW_PHOTOS : (PHOTOS[id] || (old.photos || [])));
  resetForm();
  toast("✅ " + shop.name + " save ho gayi");
}

function resetForm() {
  $("#shopForm").reset();
  $("#fId").value = "";
  NEW_PHOTOS = [];
  NEW_THUMB = null;
  $("#photoPreview").innerHTML = "";
  $("#adminTitle").textContent = "➕ Naya Business";
  $("#cancelEdit").style.display = "none";
}

function editShop(id) {
  const s = DATA.shops[id];
  if (!s) return;
  $("#fId").value = s.id;
  $("#fName").value = s.name || "";
  $("#fCategory").value = s.cat || "";
  $("#fCode").value = s.code || "";
  $("#fPhone").value = s.phone || "";
  $("#fWa").value = s.wa || "";
  $("#fAddr").value = s.addr || "";
  $("#fTime").value = s.time || "";
  $("#fDesc").value = s.desc || "";
  $("#fItems").value = (s.items || []).map(i => `${i.cat} | ${i.name} | ${i.price}`).join("\n");
  $("#fNew").checked = !!s.isNew;
  $("#fOpen").checked = !!s.isOpen;
  NEW_THUMB = s.thumb || (s.photos && s.photos[0]) || null;
  loadPhotos(id).then(list => { NEW_PHOTOS = list.slice(); showThumbs(); });
  $("#adminTitle").textContent = "✏️ Edit: " + s.name;
  $("#cancelEdit").style.display = "block";
  $("#shopModal").classList.remove("on");
  switchTab("admin");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showThumbs() {
  const box = $("#photoPreview");
  if (!box) return;
  if (!NEW_PHOTOS.length) {
    box.innerHTML = `<div class="ph-hint" style="grid-column:1/-1">
      Kahi photo nahi — upar se photo chuno.</div>`;
    return;
  }
  box.innerHTML = NEW_PHOTOS.map((p, i) =>
    `<div class="ph"><img src="${p}" alt="Photo ${i+1}">
       <button type="button" class="x" data-del="${i}" title="Hatao">✕</button></div>`
  ).join("");
}

/* ---------- PHOTO DELETE (sirf admin) ---------- */
async function delPhotoAt(idx, fromModal) {
  const id = CUR_SHOP || $("#fId").value;
  const list = (fromModal ? (PHOTOS[id] || []) : NEW_PHOTOS) || [];
  if (!list[idx]) return;

  if (!confirm("Ye photo delete karni hai?\n\nBaad me wapas nahi aayegi.")) return;

  if (fromModal) {
    const rest = list.slice();
    rest.splice(idx, 1);
    await savePhotos(id, rest);
    await refreshThumb(id, rest);
    delete PHOTOS[id];
    PHOTOS[id] = rest;
    openShop(id);
    render();
    toast("🗑️ Photo delete ho gayi");
  } else {
    NEW_PHOTOS.splice(idx, 1);
    if (!NEW_PHOTOS.length) NEW_THUMB = null;
    showThumbs();
    toast("🗑️ Photo hat gayi — Save dabao");
  }
}

async function delAllPhotos() {
  if (!NEW_PHOTOS.length) return toast("Kahi photo nahi hai");
  if (!confirm("सारी " + NEW_PHOTOS.length + " photos delete करनी हैं?\n\nSave दबाने के बाद हटेंगी।")) return;
  NEW_PHOTOS = [];
  NEW_THUMB = null;
  showThumbs();
  toast("🗑️ सारी photos हट गई — Save दबाओ");
}

/* thumb banao — phir se (pehli photo badli ho to) */
async function refreshThumb(id, list) {
  if (!id || !FB_DB) return;
  if (!list.length) {
    await FB_DB.ref("shops/" + id + "/thumb").remove().catch(() => {});
    const sh = Object.assign({}, DATA.shops[id]); delete sh.thumb;
    DATA.shops[id] = sh; saveLocal(); render();
    return;
  }
  const th = await renderImageFromDataUrl(list[0], 340, .55);
  if (th) {
    await FB_DB.ref("shops/" + id + "/thumb").set(th).catch(() => {});
    const sh = DATA.shops[id] = Object.assign({}, DATA.shops[id], { thumb: th });
    saveLocal(); render();
  }
}

function delShop(id) {
  if (!confirm("Ye business delete karni hai?")) return;
  removeAt("shops/" + id);
  if (FB_DB) FB_DB.ref("photos/" + id).remove().catch(() => {});
  delete PHOTOS[id];
  toast("🗑️ Delete ho gayi");
}

/* ---------- BACKUP ---------- */
function exportData() {
  const out = JSON.parse(JSON.stringify(DATA));
  // photos bhi saath le lo
  out._photos = {};
  Object.keys(PHOTOS).forEach(k => { if (PHOTOS[k] && PHOTOS[k].length) out._photos[k] = PHOTOS[k]; });
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "colony-mitra-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  toast("⬇️ Backup download ho gaya");
}

/* ============================================================
   TABS + EVENTS
   ============================================================ */
function switchTab(name) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + name));
}

function init() {
  renderEmAdmin();
  renderQuickAdd();
  applyLogo();
  applyAdminUI();

  // theme
  if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");
  $("#themeBtn").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
    $("#themeBtn").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
  };
  $("#themeBtn").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";

  // tabs — admin tab kholte hi auth SDK load karo
  $$(".tab").forEach(t => t.onclick = () => {
    switchTab(t.dataset.tab);
    if (t.dataset.tab === "admin") initAuth().catch(() => {});
    if (t.dataset.tab === "updates") markUpdatesSeen();
  });

  // home page ka update strip -> Updates tab
  const strip = $("#updStrip");
  if (strip) strip.onclick = () => {
    switchTab("updates");
    markUpdatesSeen();
    window.scrollTo(0, 0);
  };

  // search + chips
  $("#search").oninput = e => { query = e.target.value; renderShops(); };
  $("#catChips").onclick = e => {
    const c = e.target.closest(".chip"); if (!c) return;
    cat = c.dataset.c; renderChips(); renderShops();
  };

  // open shop card
  $("#shopList").onclick = e => {
    const card = e.target.closest(".shop"); if (!card) return;
    openShop(card.dataset.id);
  };

  // modal
  $("#closeShop").onclick = () => $("#shopModal").classList.remove("on");
  $("#shopModal").onclick = e => { if (e.target.id === "shopModal") e.currentTarget.classList.remove("on"); };
  $("#shopBody").onclick = async e => {
    const ed = e.target.closest("[data-edit]");
    if (ed) return editShop(ed.dataset.edit);

    /* photo delete — admin only */
    const pd = e.target.closest("[data-pdel]");
    if (pd) {
      if (!unlocked) return toast("🔒 Sirf admin");
      e.stopPropagation();
      return delPhotoAt(+pd.dataset.pdel, true);
    }

    const full = e.target.closest("[data-full]");
    if (full) return window.open(full.dataset.full, "_blank");

    const st = e.target.closest("[data-star]");
    if (st) {
      PICK_STARS = +st.dataset.star;
      [...$("#starPick").children].forEach((b, i) => b.textContent = i < PICK_STARS ? "★" : "☆");
      return;
    }

    if (e.target.id === "rvSend") return sendReview(CUR_SHOP);

    if (e.target.id === "shopLogout") { adminLogout(); return; }

    // dukaan kholte hi admin tab pe bhejo login ke liye
    const ga = e.target.closest("[data-gotoadmin]");
    if (ga) {
      $("#shopModal").classList.remove("on");
      switchTab("admin");
      loadAuthSDK().then(() => initAuth()).catch(() => {});
      window.scrollTo(0, 0);
      setTimeout(() => { const e2 = $("#adminEmail"); if (e2) e2.focus(); }, 400);
      return;
    }

    const rd = e.target.closest("[data-revdel]");
    if (rd) {
      const [shopId, revId] = rd.dataset.revdel.split("|");
      return delReview(shopId, revId);
    }

    if (e.target.id === "phSet") {
      if (confirm("सारी फोटो नवीन करणी आहेत? जुनी फोटो हटतील.")) {
        PHOTO_MODE = "set";
        const f = $("#phFile"); if (f) { f.value = ""; f.click(); }
      }
      return;
    }
    if (e.target.id === "phAdd") {
      PHOTO_MODE = "add";
      const f = $("#phFile"); if (f) { f.value = ""; f.click(); }
      return;
    }
    if (e.target.id === "phDelAll") {
      const id = CUR_SHOP;
      const list = (PHOTOS[id] || []).slice();
      if (!list.length) return toast("Kahi photo nahi hai");
      if (!confirm("सारी " + list.length + " photos हटानी हैं?\n\nहा दुसरे वेळ परत येणार नाहीत.")) return;
      await savePhotos(id, []);
      delete PHOTOS[id];
      await refreshThumb(id, []);
      openShop(id);
      render();
      toast("🗑️ सारी photos हट गई");
      return;
    }
  };

  /* photo file change */
  $("#shopBody").addEventListener("change", e => {
    if (e.target.id === "phFile") handlePhotoPick(e.target.files);
  });

  /* ---- logo ---- */
  $("#logoFile").onchange = async e => {
    if (!e.target.files[0]) return;
    const d = await compress(e.target.files[0], 400);
    if (!d) return toast("Image load nahi hui");
    NEW_LOGO = d;
    $("#logoPreview").src = d;
    e.target.value = "";
  };
  $("#logoSave").onclick = () => {
    if (!NEW_LOGO) return toast("Pehle image choose karo");
    setLogo(NEW_LOGO);
    NEW_LOGO = null;
    toast("🖼️ Logo badal gaya — sab phones pe dikhega");
  };
  $("#logoReset").onclick = () => {
    if (!confirm("Default logo wapas karein?")) return;
    setLogo(null);
    NEW_LOGO = null;
    toast("↩️ Default logo");
  };

  /* ---- emergency admin ---- */
  $("#emForm").onsubmit = e => {
    e.preventDefault();
    const label = $("#emLabel").value.trim();
    const num   = $("#emNum").value.trim();
    if (!label || !num) return toast("Label aur number dono chahiye");

    const id = EM_EDIT_ID || ("e" + Date.now());
    write("emergency/" + id, {
      id, icon: $("#emIcon").value.trim() || "📞",
      label, num, color: $("#emColor").value
    });
    EM_EDIT_ID = null;
    e.target.reset();
    renderEmAdmin();
    toast("🚨 " + label + " — number save ho gaya");
  };
  $("#emReset").onclick = () => {
    if (!confirm("Default emergency list load karein? Purani custom numbers rehengi.")) return;
    DEFAULT_EM.forEach(x => {
      if (!x.num) return;                       // khali number mat daalo
      write("emergency/" + x.id, x);
    });
    renderEmAdmin();
    toast("↩️ Default list aa gayi");
  };
  // quick add chips
  $("#qaChips").onclick = e => {
    const b = e.target.closest("[data-qa]");
    if (!b) return;
    const q = QUICK[+b.getAttribute("data-qa")];
    const ex = Object.values(DATA.emergency || {}).find(x => x.label === q.label);
    if (ex) return editEm(ex.id);
    EM_EDIT_ID = null;
    $("#emIcon").value  = q.icon;
    $("#emLabel").value = q.label;
    $("#emNum").value   = "";
    $("#emNum").placeholder = q.ph;
    $("#emColor").value = q.color;
    $("#emNum").focus();
    toast("👉 अता फक्त नंबर भरा");
  };

  $("#emAdminList").onclick = e => {
    const d = e.target.closest("[data-emedel]");
    if (d) { removeAt("emergency/" + d.dataset.emedel); renderEmAdmin(); toast("🗑️ Hat gaya"); return; }
    const ed = e.target.closest("[data-emedit]");
    if (ed) editEm(ed.dataset.emedit);
  };

  // admin login
  $("#pinBtn").onclick = adminLogin;
  $("#adminPass").onkeydown = e => { if (e.key === "Enter") adminLogin(); };
  $("#logoutBtn").onclick = adminLogout;
  $("#changePin").onclick = () => {
    if (!unlocked) return toast("Pehle admin login karo");
    const v = $("#newPin").value.trim();
    if (v.length < 6) return toast("Kam se kam 6 characters");
    const cur = firebase.auth().currentUser;
    if (!cur) return toast("Pehle login karo");
    cur.updatePassword(v)
      .then(() => { $("#newPin").value = ""; toast("🔐 Password badal gaya"); })
      .catch(e => toast("Password nahi badla: " + e.message));
  };

  // shop form
  $("#shopForm").onsubmit = e => { e.preventDefault(); saveShop(); };
  $("#cancelEdit").onclick = () => { resetForm(); toast("Cancel"); };
  $("#fPhotos").onchange = async e => {
    const files = [...e.target.files];
    await handleFiles(files, imgs => {
      NEW_PHOTOS = NEW_PHOTOS.concat(imgs).slice(0, 12);
      showThumbs();
    });
    if (!NEW_THUMB && files[0]) NEW_THUMB = await thumb(files[0]);
    e.target.value = "";
  };
  $("#photoPreview").onclick = e => {
    const x = e.target.closest("[data-del]");
    if (!x) return;
    delPhotoAt(+x.dataset.del, false);
  };
  const dab = $("#delAllPhotos");
  if (dab) dab.onclick = delAllPhotos;

  // updates delete (admin only)
  $("#updateList").onclick = e => {
    const d = e.target.closest("[data-updel]");
    if (!d) return;
    const id = d.dataset.updel;
    const u = (DATA.updates || {})[id];
    if (!u) return;
    if (!confirm("Ye update delete karna hai?\n\n\"" + String(u.text).slice(0, 60) + "\"")) return;
    removeAt("updates/" + id);
    toast("🗑️ Update hat gaya");
  };

  // updates form
  $("#updateForm").onsubmit = async e => {
    e.preventDefault();
    const text = $("#uText").value.trim();
    if (!text) return;
    let photo = null;
    if ($("#uPhoto").files[0]) {
      await handleFiles([$("#uPhoto").files[0]], r => photo = r[0] || null);
    }
    write("updates/u" + Date.now(), { text, type: $("#uType").value, photo, ts: Date.now() });
    e.target.reset();
    toast("📢 Post ho gaya — sabko dikhega");
  };

  // backup
  $("#exportBtn").onclick = exportData;
  $("#importFile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        ["shops", "updates", "reviews", "emergency", "app"].forEach(k => {
          Object.keys(d[k] || {}).forEach(id => write(k + "/" + id, d[k][id]));
        });
        Object.keys(d._photos || {}).forEach(async id => {
          await savePhotos(id, d._photos[id]);
        });
        renderEmAdmin();
        toast("✅ Restore ho gaya");
      } catch { toast("❌ File galat hai"); }
    };
    fr.readAsText(f);
    e.target.value = "";
  };
  $("#wipeBtn").onclick = () => {
    if (!confirm("SAB data mita jayega. Pakka?")) return;
    if (!confirm("Dobaara socho. Ye wapas nahi aayega.")) return;
    Object.keys(DATA.shops || {}).forEach(k => removeAt("shops/" + k));
    Object.keys(DATA.updates || {}).forEach(k => removeAt("updates/" + k));
    Object.keys(DATA.emergency || {}).forEach(k => removeAt("emergency/" + k));
    Object.keys(DATA.reviews || {}).forEach(shop => {
      Object.keys(DATA.reviews[shop] || {}).forEach(r => removeAt("reviews/" + shop + "/" + r));
    });
    if (FB_DB) FB_DB.ref("photos").remove().catch(() => {});
    Object.keys(PHOTOS).forEach(k => delete PHOTOS[k]);
    resetForm();
    renderEmAdmin();
    toast("🗑️ Sab saaf");
  };

  sync();

  // install prompt
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBar();
  });
  window.addEventListener("appinstalled", () => {
    hideInstallBar();
    localStorage.setItem("installbar_closed", "1");
    toast("🎉 App install ho gaya!");
  });
  $("#ilBtn").onclick = install;
  $("#ilClose").onclick = () => {
    hideInstallBar();
    localStorage.setItem("installbar_closed", "1");
  };
  // fallback — agar event na aaye (Safari ya purana Chrome)
  setTimeout(showInstallBar, 1800);
}

/* service worker — install prompt ke liye zaroori hai */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then(() => navigator.serviceWorker.ready)
      .catch(() => {});
  });
}

document.addEventListener("DOMContentLoaded", init);