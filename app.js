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

/* ---------- 📲 INSTALL — event ko SABSE PEHLE pakdo ----------
   Chrome 'beforeinstallprompt' page load ke dauran bhejta hai.
   Listener init() me baad me lagta tha — event chhoot jaata tha.
   Isliye ye upar hi, turant. */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();          // browser ka apna prompt rok do
  deferredPrompt = e;          // ham apna button se use karenge
});

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
      markSync();
      saveLocal();          // offline copy
      render();
      if (k === "emergency") { renderEmAdmin(); renderQuickAdd(); }
      if (k === "app") { applyLogo(); renderTicker(); }
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
  /* code ke NUMBAR ke hisaab se — GC-01, GC - 07, GC 13 sab theek se */
  return list.sort((a, b) => {
    const na = codeNum(a), nb = codeNum(b);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });
}

/* code se sirf number nikalo — "GC - 07" se 7, "GC 13" se 13 */
function codeNum(s) {
  const m = String((s && s.code) || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/* har code ko ek hi format me laao — GC-01, GC-07, GC-39, GC-47 */
function normCode(c) {
  const m = String(c || "").match(/(\d+)/);
  if (!m) return String(c || "").trim();
  return "GC-" + String(parseInt(m[1], 10)).padStart(2, "0");
}

/* agla apne aap number — GC-001, GC-002 ... */
function nextCode() {
  const used = Object.values(DATA.shops || {})
    .map(s => codeNum(s))
    .filter(n => n !== null);
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return "GC-" + String(n).padStart(2, "0");
}

/* ============================================================
   CATEGORY GROUPING
   "Baby Setting" aur "Baby Sitting" alag-alag chip ban rahe the.
   Ab dono EK hi category — click karne par dono dikhenge.
   ============================================================ */
const CAT_FIX = {
  "baby setting": "Baby Sitting", "babysetting": "Baby Sitting",
  "baby setting & products": "Baby Sitting", "baby products": "Baby Sitting",
  "baby care": "Baby Sitting", "baby sitting": "Baby Sitting",
  "baby siting": "Baby Sitting", "babysitting": "Baby Sitting",

  "ladies tailor": "Ladies Tailor", "ladies tailors": "Ladies Tailor",
  "ladies tailoring": "Ladies Tailor", "tailor": "Ladies Tailor",
  "tailors": "Ladies Tailor", "ladies boutique": "Ladies Tailor",

  "saloon/beauty": "Saloon / Beauty", "saloon /beauty": "Saloon / Beauty",
  "saloon and beauty": "Saloon / Beauty", "beauty parlour": "Saloon / Beauty",
  "beauty salon": "Saloon / Beauty", "salon": "Saloon / Beauty",
  "saloon/ beauty/mehandi": "Saloon / Beauty", "saloon/beauty/mehandi": "Saloon / Beauty",
  "saloon beauty mehandi": "Saloon / Beauty", "mehandi": "Saloon / Beauty",
  "mehndi": "Saloon / Beauty", "bridal": "Saloon / Beauty",
  "makeover": "Saloon / Beauty", "beauty": "Saloon / Beauty",

  /* ज्वेलरी — spelling bahut alag log likhte hain, sab ek jodo */
  "jewellery": "Jewellery", "jewellers": "Jewellery", "jewellers ": "Jewellery",
  "jwellery": "Jewellery", "jwelary": "Jewellery", "jewelery": "Jewellery",
  "jwelley": "Jewellery", "jewellar": "Jewellery", "jewellery shop": "Jewellery",
  "jwellery shop": "Jewellery", "imitation jewellery": "Jewellery",
  "artificial jewellery": "Jewellery", "fashion jewellery": "Jewellery",
  "jewelers": "Jewellery", "jewellery and accessories": "Jewellery",

  "groceries and diary": "Groceries & Dairy", "groceries & dairy": "Groceries & Dairy",
  "grocery": "Groceries & Dairy", "kirana": "Groceries & Dairy",
  "kirana and dairy": "Groceries & Dairy", "general store": "Groceries & Dairy",
  "kirana / grocery": "Groceries & Dairy", "kirana/grocery": "Groceries & Dairy",
  "grocery and dairy": "Groceries & Dairy", "grocery shop": "Groceries & Dairy",
  "kirana store": "Groceries & Dairy", "provision store": "Groceries & Dairy",

  /* कपड़े + साडी + garment — सब एक ही category */
  "cloth/garments": "Cloth / Saree / Garments", "cloth and garments": "Cloth / Saree / Garments",
  "cloth": "Cloth / Saree / Garments", "clothes": "Cloth / Saree / Garments",
  "clothing": "Cloth / Saree / Garments", "cloth and fashion": "Cloth / Saree / Garments",
  "fashion": "Cloth / Saree / Garments", "fashion collection": "Cloth / Saree / Garments",
  "garments": "Cloth / Saree / Garments", "readymade garments": "Cloth / Saree / Garments",
  "sarees": "Cloth / Saree / Garments", "saree": "Cloth / Saree / Garments",
  "saree shop": "Cloth / Saree / Garments", "saree and dress": "Cloth / Saree / Garments",
  "saree collection": "Cloth / Saree / Garments", "saree and fashion": "Cloth / Saree / Garments",
  "saree & dress": "Cloth / Saree / Garments", "saree boutique": "Cloth / Saree / Garments",
  "saree and fashion collection": "Cloth / Saree / Garments",
  "suit": "Cloth / Saree / Garments", "kurti": "Cloth / Saree / Garments",
  "woollen": "Cloth / Saree / Garments", "woolen": "Cloth / Saree / Garments",
  "woollen": "Cloth / Saree / Garments",

  /* dresses — apni alag category */
  "dresses": "Dresses", "dress": "Dresses", "dress shop": "Dresses",
  "dress and bakery": "Dresses", "ladies dress": "Dresses",
  "frock": "Dresses", "frock and dress": "Dresses",

  "coaching": "Coaching", "coaching classes": "Coaching",
  "classes": "Coaching", "tuition": "Coaching", "coaching class": "Coaching",
  "home tutor": "Coaching", "tution": "Coaching", "tutor": "Coaching",
  "academy": "Coaching", "institute": "Coaching",

  /* drawing — coaching से अलग category */
  "drawing and sketching": "Drawing / Sketching", "drawing": "Drawing / Sketching",
  "sketching": "Drawing / Sketching", "drawing classes": "Drawing / Sketching",
  "drawing class": "Drawing / Sketching", "art classes": "Drawing / Sketching",
  "sketching classes": "Drawing / Sketching", "sketch": "Drawing / Sketching",
  "drawing and sketch": "Drawing / Sketching",

  "chadar": "Chadar / Bed Linen", "chadar bedding": "Chadar / Bed Linen",
  "bed linen": "Chadar / Bed Linen", "chadar and pillow": "Chadar / Bed Linen",

  /* एक ही shop दो काम — दोनों category में दिखे */
  "atta chakki": "Atta Chakki", "attachakki": "Atta Chakki",
  "atta": "Atta Chakki", "chakki": "Atta Chakki",
  "flour mill": "Atta Chakki", " atta chakki": "Atta Chakki",
  "masala": "Masale", "spices": "Masale", "masale shop": "Masale",

  "bakery": "Bakery / Cake", "cake": "Bakery / Cake", "cake shop": "Bakery / Cake",
  "bakery and cake": "Bakery / Cake", "bakery shop": "Bakery / Cake",
  "cakes": "Bakery / Cake", "pastry": "Bakery / Cake",

  "rangoli": "Rangoli", "rangoli and pipe cleaner": "Rangoli",

  /* नई categories — 45 shops के हिसाब से */
  "tiffin": "Tiffin / Mess", "mess": "Tiffin / Mess",
  "tiffin service": "Tiffin / Mess", "tiffin and mess": "Tiffin / Mess",
  "catering": "Tiffin / Mess", "tiffin / mess": "Tiffin / Mess",
  "shampoo": "Shampoo", "shampoo shop": "Shampoo",
  "sanitary pad": "Sanitary Pad", "sanitary pads": "Sanitary Pad",

  "life insurance": "Insurance", "lic mutual fund": "Insurance",
  "mutual fund": "Insurance", "insurance": "Insurance",
  "lic": "Insurance", "lic mutual": "Insurance",

  /* NOTE: "Kruvi Aari work" aur "Crochet_Cuddle_Story" ko APNI ALAG
     category me rakhna hai — isliye yahan koi mapping nahi */

  "chaat": "Food / Snacks", "snacks": "Food / Snacks",
  "food": "Food / Snacks", "fast food": "Food / Snacks",
  "sweet dish": "Bakery / Cake", "sweets": "Bakery / Cake",

  "digital": "Digital Media", "digital media": "Digital Media",
  "photo studio": "Digital Media", "photography": "Digital Media",

  "cosmetic": "Saloon / Beauty", "cosmetics": "Saloon / Beauty",
  "make up": "Saloon / Beauty", "makeup": "Saloon / Beauty",
  "makeup artist": "Saloon / Beauty", "make up artist": "Saloon / Beauty"
};

/* ============================================================
   KNOWN CATEGORIES  —  jinhe slash se alag karke split kar sakte hain
   "Bakery /dresses" → Bakery + Dresses (dono alag)
   "Cloth / Garments" → ek hi (dono ek hi category)
   ============================================================ */
const KNOWN_CATS = new Set([
  "Baby Sitting", "Ladies Tailor", "Saloon / Beauty", "Jewellery",
  "Groceries & Dairy", "Cloth / Saree / Garments", "Dresses",
  "Coaching", "Drawing / Sketching", "Chadar / Bed Linen", "Atta Chakki",
  "Masale", "Bakery / Cake", "Rangoli", "Tiffin / Mess",
  "Shampoo", "Sanitary Pad",
  "Insurance", "Food / Snacks", "Digital Media"
]);

function catKey(c) {
  return String(c || "").trim().toLowerCase()
    .replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
}
function canonCat(c) {
  const k = catKey(c);
  if (!k) return "";
  return CAT_FIX[k] || String(c).trim().replace(/\s+/g, " ");
}
/* ---------------- EXISTING CATEGORIES: one-tap pick ----------------
   Admin category khud type karta hai to spellings bigad jaati hain
   ("Jewellery" vs "Jwellery" → 2 chips). Yahan tap karne se
   bilkul wahi spelling lag jaati hai jo pehle se hai. */
function renderCatPick() {
  const box = $("#catPick");
  if (!box) return;
  const set = new Set();
  allShops().forEach(s => catList(s.cat).forEach(c => set.add(c)));
  const cats = [...set].sort();
  if (!cats.length) { box.innerHTML = ""; return; }
  box.innerHTML =
    `<div class="cp-h">पहले से मौजूद:</div>` +
    cats.map(c => `<button type="button" class="cp" data-cp="${esc(c)}">${esc(c)}</button>`).join("");
}

function sameCat(a, b) {
  return catList(a).includes(canonCat(b));
}

/* ek shop ek se zyada category me ho sakti hai —
   "Cloth / Garments, Jewellery"  →  dono chips me dikhega
   "Bakery /dresses"              →  Bakery + Dresses (dono alag)
   "Cloth / Garments"             →  ek hi (dono ek hi category) */
function catList(c) {
  const out = [];
  String(c || "").split(",").forEach(part => {
    const p = part.trim();
    if (!p) return;

    /* slash se parts — par sirf tab split karo jab dono parts
       JAANU-HUA alag-alag categories hon */
    const bits = p.split("/").map(x => x.trim()).filter(Boolean);
    if (bits.length > 1) {
      const mapped = bits.map(b => canonCat(b));
      const alag = new Set(mapped);
      if (mapped.every(m => KNOWN_CATS.has(m)) && alag.size > 1) {
        mapped.forEach(m => out.push(m));
        return;
      }
    }
    out.push(canonCat(p));
  });
  return [...new Set(out)];
}

/* sirf admin: sabhi codes GC-001 format me theek karo */
async function fixAllCodes() {
  if (!unlocked) return toast("🔒 Sirf admin");
  const list = allShops();
  const used = new Set();
  let n = 0, changed = 0;
  for (const s of list) {
    while (used.has("GC-" + String(n + 1).padStart(2, "0"))) n++;
    n++;
    const want = "GC-" + String(n).padStart(2, "0");
    used.add(want);
    if (String(s.code || "").trim() !== want) {
      if (FB_DB) await FB_DB.ref("shops/" + s.id + "/code").set(want).catch(() => {});
      else { s.code = want; saveLocal(); }
      changed++;
    }
  }
  render();
  toast(changed
    ? "✅ " + changed + " codes ठीक हो गए (GC-001 …)"
    : "✅ सारे codes पहले से ठीक हैं");
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
  /* ek jaisi categories ko jodo — "Baby Setting" + "Baby Sitting" = 1 chip */
  const seen = new Map();
  allShops().forEach(s => {
    catList(s.cat).forEach(c => seen.set(c, (seen.get(c) || 0) + 1));
  });
  const cats = [...seen.keys()].sort();

  /* agar abhi jo chip chuna hai wo ab nahi hai to reset */
  if (cat !== "all" && !cats.includes(cat)) cat = "all";

  const box = $("#catChips");
  box.innerHTML = ["all", ...cats].map(c => {
    const n = seen.get(c) || 0;
    return `<button class="chip ${cat === c ? "on" : ""}" data-c="${esc(c)}">
      ${c === "all" ? "✨ Sab" : esc(c)}${n > 1 ? `<b class="cnt">${n}</b>` : ""}
     </button>`;
  }).join("");
}

function renderShops() {
  $("#areaName").textContent = "📍 " + SETTINGS.colony;
  document.title = SETTINGS.appName + " · " + SETTINGS.colony;

  const q = query.toLowerCase().trim();

  /* SEARCH TEXT — pehle sirf naam + raw category dekhta tha.
     Isliye "jewellery" likhne par "Jwellery" wali shop nahi milti thi.
     Ab canonical category, code, address aur price bhi dhoondhe jaata hai. */
  const searchText = s => {
    const bits = [s.name, normCode(s.code), s.desc, s.addr, s.time];
    catList(s.cat).forEach(c => bits.push(c));          // merged/clean category
    const items = Array.isArray(s.items) ? s.items : [];
    items.forEach(i => {
      if (i && typeof i === "object") bits.push(i.cat, i.name, i.price);
    });
    return bits.filter(x => x != null && x !== "").join(" ").toLowerCase();
  };

  let list;
  try {
    /* har shabd alag se match ho — "baby sitting" aur "sitting baby" dono */
    const words = q ? q.split(/\s+/).filter(Boolean) : [];

    /* pehle wahi shop jisme SAARE shabd hain */
    let hit = allShops().filter(s => {
      const t = searchText(s);
      return words.every(w => t.includes(w));
    });

    /* ek shabd bhi na mile to kam se kam ek shabd wala dikhao */
    if (!hit.length && words.length > 1) {
      hit = allShops().filter(s => {
        const t = searchText(s);
        return words.some(w => t.includes(w));
      });
    }

    list = hit.filter(s => cat === "all" || catList(s.cat).includes(cat));
  } catch (e) {
    /* ek kharab shop se poori list khaali ho gayi — sirf dikhao */
    console.warn("[shops] filter:", e);
    list = allShops();
  }

  $("#shopCount").textContent = DATA.shops
    ? Object.keys(DATA.shops).length + " Business" : "0 Business";

  $("#homeEmpty").style.display = list.length ? "none" : "block";
  if (!list.length && query) {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const hit = allShops().filter(s => {
      const t = [s.name, s.desc].filter(Boolean).join(" ").toLowerCase();
      return words.some(w => t.includes(w));
    }).slice(0, 6);
    $("#homeEmpty").innerHTML =
      `<b>😕 "${esc(query)}" kuch nahi mila</b><br><br>` +
      (hit.length
        ? `Kya aap ye dhundh rahe ho?<br>` +
          hit.map(s => `<div class="sug" data-go="${esc(s.id)}">🔍 ${esc(s.name)}</div>`).join("")
        : `Shabd thoda chhota try karo — jaise <b>jewellery</b>, <b>cake</b>, <b>tailor</b>, <b>coaching</b>`);
  }

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
        ${s.code ? `<span class="code">${esc(normCode(s.code))}</span>` : ""}
      </div>
      <h3>${esc(s.name)}</h3>
      ${s.cat ? catList(s.cat).map(c => `<span class="cat">${esc(c)}</span>`).join(" ") : ""}
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

  const tag = { offer:     ["🎁 Offer",                    "#f59e0b"],
                sale:      ["🪑 जूने सामान / विक्री",        "#7c3aed"],
                property:  ["🏠 Property",                  "#0891b2"],
                new:       ["🆕 Naya Business",             "#2563eb"],
                event:     ["🎉 कार्यक्रम / सभा",           "#db2777"],
                notice:    ["📌 Notice",                    "#6b7280"] };

  $("#updateList").innerHTML = list.map(u => {
    const [label, color] = tag[u.type] || tag.notice;

    /* photos — naya format (photos[]) + purana (photo) dono */
    const shots = (u.photos && u.photos.length) ? u.photos
                : (u.photo ? [u.photo] : []);
    const gallery = shots.length
      ? `<div class="upgal ${shots.length > 1 ? "multi" : ""}">` +
        shots.map(p => `<img src="${p}" alt="" loading="lazy">`).join("") + `</div>`
      : "";

    /* contact — sirf 10 digit */
    const num = String(u.contact || "").replace(/[^\d]/g, "");
    const acts = num.length === 10 ? `<div class="upact">
        <a class="act act-call" href="tel:+${num}">📞 Call</a>
        <a class="act act-wa" href="https://wa.me/${num}" target="_blank" rel="noopener">💬 WhatsApp</a>
      </div>` : "";

    return `<div class="post">
      ${unlocked ? `<button class="del-post" data-updel="${esc(u.id)}">🗑️ हटाओ</button>` : ""}
      <span class="tag" style="color:${color}">${label}</span>
      <p>${esc(u.text)}</p>
      ${gallery}
      ${acts}
      <div class="date">${fmtTime(u.ts)}</div>
    </div>`;
  }).join("");
}

function render() { renderChips(); renderShops(); renderUpdates(); renderEmergency(); renderUnread(); renderTicker(); }

/* ============================================================
   📤 SHARE BUSINESS  —  naam + number WhatsApp par bhejo
   ============================================================ */
function shareBusiness(id) {
  const s = (DATA.shops || {})[id];
  if (!s) return toast("Business nahi mila");

  const wa  = waNumber(s);
  const num = wa || s.phone || "";
  const lines = [
    "🏪 " + (s.name || "Business"),
    num ? "📞 " + num : "",
    s.addr ? "📍 " + s.addr : "",
    s.time ? "🕐 " + s.time : "",
    "",
    "📲 Colony Mitra App मध्ये हे Business:",
    location.origin + "/"
  ].filter(Boolean);

  const text = lines.join("\n");
  const title = s.name || "Colony Mitra Business";

  /* 1) Native share menu — WhatsApp, SMS, copy sab */
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => {});
    return;
  }

  /* 2) Fallback — WhatsApp khud kholo */
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

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
      ${s.code ? "🔢 Shop Code: <b>" + esc(normCode(s.code)) + "</b><br>" : ""}
      ${s.cat ? "🏷️ " + esc(catList(s.cat).join(" · ")) + "<br>" : ""}
      ${s.addr ? "📍 " + esc(s.addr) + "<br>" : ""}
      ${s.time ? "🕐 " + esc(s.time) + "<br>" : ""}
      ${s.phone ? "📞 " + esc(s.phone) : ""}
    </div>

    <div class="acts">
      ${waLink ? `<a class="act act-wa" href="${waLink}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}
      ${tel ? `<a class="act act-call" href="tel:+${tel}">📞 Call</a>` : ""}
      <button class="act act-share" data-share-shop="${s.id}">📤 Share</button>
      ${unlocked ? `<button class="act act-edit" data-edit="${s.id}">✏️ Edit</button>` : ""}
      ${unlocked ? `<button class="act act-del" data-del-shop="${s.id}">🗑️ Delete</button>` : ""}
    </div>

    ${!unlocked ? `
      <button class="admin-hint" data-gotoadmin>
        🔐 Business बदलणे/फोटो बदलणे आहे? — इथे Login करा
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
   (deferredPrompt file ke shuru me hi declare hai — line ~58)
   ============================================================ */
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
  /* 🎉 DIRECT INSTALL — Chrome का अपना dialog */
  const firePrompt = () => {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(choice => {
      deferredPrompt = null;
      hideInstallBar();
      renderHomeInstall();
      if (choice && choice.outcome === "accepted") {
        toast("🎉 App install ho gaya!");
      } else {
        toast("⏳ रद्द केले — पुन्हा प्रयत्न करा");
      }
    });
  };

  if (deferredPrompt) { firePrompt(); return; }

  /* Chrome ने अभी event नहीं भेजा.
     यहाँ TAP ही user-engagement है — Chrome अब eligibility check करता है.
     थोड़ा इंतज़ार करके event आने दो (ज़्यादातर यहीं आ जाता है). */
  const btn = $("#ilBtn");               // सिर्फ ऊपर वाली install bar का button
  if (btn) { btn.disabled = true; btn.textContent = "⏳…"; }
  toast("⏳ Install तयार होत आहे…");

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (deferredPrompt) {
      clearInterval(t);
      if (btn) { btn.disabled = false; btn.textContent = "Install करा"; }
      firePrompt();
    } else if (tries >= 12) {            // ≈ 6 second
      clearInterval(t);
      if (btn) { btn.disabled = false; btn.textContent = "Install करा"; }
      /* Chrome ने फिर भी event नहीं दिया — steps दिखाओ */
      showInstallHelp();
    }
  }, 500);
}

function hideInstallBar() { $("#installBar").classList.remove("on"); }

/* ---------- INSTALL HELP — in-app panel (alert nahi) ---------- */
function showInstallHelp() {
  const sheet = $("#installHelp");
  if (!sheet) return;
  const ios = isIOS();
  const inApp = inAppBrowser();

  let title = "📲 App कसा Install करावा";
  let body = "";

  if (inApp) {
    title = "⚠️ Asli browser मध्ये उघडा";
    body = `<div class="hs-big">🔗 WhatsApp/Instagram का अपना browser
      App <b>install नहीं कर सकता</b>.</div>
      <div class="hs-step"><b>1</b><div>${ios
        ? "ऊपर right corner में <b>⋮</b> दबाओ → <b>\"Open in Safari\"</b>"
        : "ऊपर right corner में <b>⋮</b> दबाओ → <b>\"Open in Chrome\"</b>"}</div></div>
      <div class="hs-step"><b>2</b><div>अब खुले Chrome/Safari में <b>नीचे हरा \"Install करा\"</b> दबाओ</div></div>
      <div class="hs-step"><b>3</b><div>\"Install\" / \"Add\" दबाओ → <b>बस! 🏠</b></div></div>`;
  } else if (ios) {
    title = "🍎 iPhone — Safari से Install करा";
    body = `<div class="hs-step"><b>1</b><div>नीचे <b>Share</b> button (⬆️) दबाओ</div></div>
      <div class="hs-step"><b>2</b><div>नीचे scroll करून <b>\"Add to Home Screen\"</b> निवडा</div></div>
      <div class="hs-step"><b>3</b><div>उपरून <b>\"Add\"</b> दबाओ → <b>बस! 🏠</b></div></div>
      <div class="hs-note">⚠️ iPhone वर फक्त <b>Safari</b> वापरा, Chrome नाही.</div>`;
  } else {
    title = "🤖 Android — Chrome में Install करा";
    body = `<div class="hs-step"><b>1</b><div>ऊपर तीन ठिपके <b>⋮</b> (menu) दबाओ</div></div>
      <div class="hs-step"><b>2</b><div>खाली <b>\"Install app\"</b> किंवा <b>\"Add to Home screen\"</b> निवडा</div></div>
      <div class="hs-step"><b>3</b><div>\"Install\" / \"Add\" दबाओ → <b>बस! 🏠</b></div></div>
      <div class="hs-note">ℹ️ Chrome थोड़ी देराने install देता है —
        पहली बार App खोलकर <b>३० सेकंड उपयोग करा</b>, फिर हरा
        \"Install करा\" दबाओ। दूसरे कोशिश में सीधे install हो जाएगा।<br><br>
        या App खोलने से पहले नीचे <b>⋮ मेनू → \"Install app\"</b> दबा लो।</div>`;
  }

  $("#hsTitle").textContent = title;
  $("#hsBody").innerHTML = body;
  sheet.hidden = false;
}

/* deferredPrompt नसेल तर — कडी आणि पुन्हा प्रयत्न */
function showInstallHelpAfterTap() {
  const s = $("#installHelp");
  if (s) s.hidden = true;
  const isHelpOpen = s && !s.hidden;
  if (isHelpOpen) return;
  showInstallHelp();
}

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

/* ---------- BUSINESS DELETE (sirf admin) ---------- */
async function delShop(id) {
  if (!unlocked) return toast("🔒 Sirf admin");

  const s = (DATA.shops || {})[id];
  if (!s) return toast("Ye business mila nahi");

  /* photo count + review count batao — user ko pata chale kya jayega */
  const nPhotos = (PHOTOS[id] || s.photos || []).length;
  const nRev = Object.keys((DATA.reviews || {})[id] || {}).length;

  const msg =
    "🗑️  " + s.name + "  मिटवायची?\n\n" +
    "• Business ची नोंद हटेल\n" +
    (nPhotos ? "• " + nPhotos + " फोटो हटतील\n" : "") +
    (nRev   ? "• " + nRev + " review हटतील\n" : "") +
    "\n⚠️ हे सगळं परत आणता येणार नाही. खात्री आहे?";

  if (!confirm(msg)) return;

  const name = s.name;

  if (FB_DB) {
    await FB_DB.ref("shops/" + id).remove().catch(() => {});
    await FB_DB.ref("photos/" + id).remove().catch(() => {});
    await FB_DB.ref("reviews/" + id).remove().catch(() => {});
  } else {
    removeAt("shops/" + id);
    removeAt("reviews/" + id);
  }

  delete PHOTOS[id];
  delete DATA.reviews[id];

  /* modal band + list refresh */
  $("#shopModal").classList.remove("on");
  CUR_SHOP = null;
  render();
  toast("🗑️ " + name + " delete ho gayi");
}

/* ============================================================
   📢 LIVE SCROLLING ANNOUNCEMENT  —  home screen par
   Admin jo update add karega, wahi yahan scroll hoga.
   Sirf admin hi badal sakta hai (Firebase rules).
   ============================================================ */
const TK_DEF = { mode: "scroll", speed: "fast", show: "always" };
let TICKER = { ...TK_DEF };

function loadTickerSettings() {
  /* Firebase se (sabko same) — warna phone se */
  const t = (DATA.app && DATA.app.ticker) || null;
  if (t && typeof t === "object") { TICKER = { ...TK_DEF, ...t }; return; }
  try {
    const s = localStorage.getItem("cm_ticker");
    if (s) TICKER = { ...TK_DEF, ...JSON.parse(s) };
  } catch (e) { /* ignore */ }
}

const TK_SPEED = { slow: 26, normal: 12, fast: 6 };

function renderTicker() {
  const box = $("#ticker");
  const track = $("#tkTrack");
  if (!box || !track) return;

  loadTickerSettings();

  if (TICKER.show === "off") { box.hidden = true; return; }

  const list = Object.entries(DATA.updates || {})
    .map(([id, u]) => Object.assign({ id }, u))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  if (!list.length) { box.hidden = true; return; }

  const u = list[0];
  const txt = String(u.text || "").replace(/\s+/g, " ").trim();
  if (!txt) { box.hidden = true; return; }

  /* "नया आल्यावर" mode — sirf unread update par dikhao */
  if (TICKER.show === "new" && (u.ts || 0) <= lastSeen()) { box.hidden = true; return; }

  const mode = TICKER.mode || "scroll";

  /* lamba message — ticker me chhota dikhao, pura message Updates tab me */
  const short = txt.length > 140 ? txt.slice(0, 140).trim() + "…" : txt;

  track.innerHTML = (mode === "static")
    ? `<span class="tk-item">${esc(short)}</span>`
    : `<span class="tk-item">${esc(short)}</span><span class="tk-item">${esc(short)}</span>`;

  if (mode === "static") {
    track.style.animation = "none";
  } else {
    const base = TK_SPEED[TICKER.speed] || TK_SPEED.normal;
    /* speed ka farak lamba message me bhi bana rahe */
    const dur = Math.max(base, Math.min(90, Math.round(base * (1 + txt.length / 250))));
    track.style.animation = `tkScroll ${dur}s linear infinite`;
    /* "tap" mode — user ke tap tak ruka hua */
    track.style.animationPlayState = (mode === "tap") ? "paused" : "running";
  }

  box.hidden = false;
  box.dataset.mode = mode;
}

function renderTkStatus() {
  const el = $("#tkStatus");
  if (!el) return;
  const m = { scroll: "Scroll होता रहेगा", tap: "Tap करने पर ही चलेगा", static: "स्थिर रहेगा" };
  const s = { slow: "धीमी", normal: "ठीक", fast: "तेज़" };
  const w = { always: "हमेशा दिखेगा", new: "नया update आने पर ही", off: "बंद है" };
  el.innerHTML = "अभी: <b>" + (m[TICKER.mode] || m.scroll) + "</b> · " +
    "<b>" + (s[TICKER.speed] || s.normal) + "</b> speed · <b>" + (w[TICKER.show] || w.always) + "</b>";
}

/* ============================================================
   CLOUD INFO  —  badge par tap karo to pata chale data kahan hai
   ============================================================ */
let LAST_SYNC = Number(localStorage.getItem("cm_last_sync")) || 0;

function markSync() {
  LAST_SYNC = Date.now();
  localStorage.setItem("cm_last_sync", String(LAST_SYNC));
}
function agoTime(t) {
  if (!t) return "अभी तक नहीं";
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return s + " सेकंड पहले";
  const m = Math.round(s / 60);
  if (m < 60) return m + " मिनट पहले";
  const h = Math.round(m / 60);
  if (h < 24) return h + " घंटे पहले";
  return Math.round(h / 24) + " दिन पहले";
}

function showSyncSheet() {
  const sheet = $("#syncSheet");
  const online = navigator.onLine;
  const nShops = Object.keys(DATA.shops || {}).length;
  const nUpd   = Object.keys(DATA.updates || {}).length;
  const nEm    = Object.keys(DATA.emergency || {}).length;
  const nRev   = Object.values(DATA.reviews || {}).reduce((s, r) => s + Object.keys(r || {}).length, 0);
  const nPh    = Object.keys(PHOTOS).length;

  $("#ssTitle").innerHTML = FB_DB
    ? (online ? "☁️ कॉलनी से जुड़ा है" : "📴 Offline — इंटरनेट नहीं")
    : "📱 सिर्फ इस फोन में";

  /* non-admin ko technical baat nahi — sirf kaam ki baat */
  $("#ssBody").innerHTML = `
    <div class="ss-grid">
      <div><b>${nShops}</b><span>Business</span></div>
      <div><b>${nUpd}</b><span>Updates</span></div>
      <div><b>${nEm}</b><span>Emergency</span></div>
      <div><b>${nRev}</b><span>Reviews</span></div>
    </div>

    <div class="ss-rows">
      <div><span>जानकारी कहाँ से आती है</span>
        <b>${FB_DB ? "कॉलनी के सर्वर से ☁️" : "इस फोन से 📱"}</b></div>
      <div><span>इंटरनेट</span>
        <b>${online ? "चालू ✅" : "बंद ❌"}</b></div>
      <div><span>आखिरी बदलाव</span>
        <b>${agoTime(LAST_SYNC)}</b></div>
      ${unlocked ? `
      <div><span>सर्वर (Firebase)</span><b>govt-colony ☁️</b></div>
      <div><span>खुली photos (इस फोन में)</span><b>${nPh || "—"}</b></div>` : ""}
    </div>

    <div class="ss-msg">
      ${FB_DB
        ? "☁️ कोई नया Business, फोटो, दर या अपडेट आए तो यहाँ 👆 tap करके ताज़ा कर लो. इंटरनेट न हो तो भी पुराना data दिखता रहेगा."
        : "📱 इंटरनेट आते ही अपने आप जुड़ जाएगा."}
    </div>

    <div class="ss-btns">
      <button type="button" class="btn primary" id="ssRefresh">🔄 नया data लो</button>
      ${unlocked
        ? `<button type="button" class="btn" id="ssBackup">⬇️ Backup लो</button>
           <button type="button" class="btn" id="ssStats">📊 Users</button>`
        : ""}
    </div>`;

  sheet.hidden = false;

  $("#ssClose").onclick = () => { sheet.hidden = true; };

  /* sirf padhne wala kaam — kuch bhi badalta nahi, safe */
  $("#ssRefresh").onclick = async () => {
    const btn = $("#ssRefresh");
    btn.disabled = true; btn.textContent = "⏳ आ रहा है…";
    try {
      if (FB_DB) {
        for (const k of ["shops", "updates", "reviews", "emergency", "app"]) {
          const s = await FB_DB.ref(k).once("value");
          DATA[k] = s.val() || {};
        }
        markSync(); saveLocal(); render();
      }
      toast("✅ नया data आ गया");
      sheet.hidden = true;
    } catch (e) {
      toast("⚠️ नहीं आया — इंटरनेट देखो");
    } finally {
      btn.disabled = false; btn.textContent = "🔄 नया data लो";
    }
  };

  const bk = $("#ssBackup");
  if (bk) bk.onclick = () => { sheet.hidden = true; exportData(); };
  const st = $("#ssStats");
  if (st) st.onclick = () => { sheet.hidden = true; switchTab("admin"); };
}

/* ---------- BACKUP ---------- */
async function exportData() {
  const btn = $("#exportBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Photos jod rahe hain…"; }
  try {
    const out = JSON.parse(JSON.stringify(DATA));

    /* ---- photos: HAR business ki, chahe app me kabhi khuli na ho ----
       (pehle sirf memory se leti thi — unopened shops ki photos chhoot jati thi) */
    out._photos = {};
    if (FB_DB) {
      try {
        const snap = await FB_DB.ref("photos").once("value");
        const all = snap.val() || {};
        Object.keys(all).forEach(id => {
          const p = all[id];
          out._photos[id] = Array.isArray(p) ? p.filter(Boolean) : Object.values(p || {}).filter(Boolean);
        });
      } catch (e) { console.warn("[export] photos:", e && e.message); }
    }
    /* local mode me memory se bhi jodo */
    Object.keys(PHOTOS).forEach(k => {
      if (PHOTOS[k] && PHOTOS[k].length && !out._photos[k]) out._photos[k] = PHOTOS[k];
    });

    const nShops = Object.keys(out.shops || {}).length;
    const nPh    = Object.keys(out._photos).length;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "colony-mitra-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    toast("⬇️ Backup mil gaya — " + nShops + " Business, " + nPh + " photos");
  } catch (e) {
    console.warn("[export]", e);
    toast("⚠️ Backup nahi ban paaya — dobara try karo");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "⬇️ Backup lo"; }
  }
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
  // "kuch nahi mila" ke suggestions par tap
  $("#homeEmpty").onclick = e => {
    const g = e.target.closest("[data-go]");
    if (g) { openShop(g.getAttribute("data-go")); }
  };
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

    /* business share — WhatsApp par naam + number bhejo */
    const shp = e.target.closest("[data-share-shop]");
    if (shp) {
      e.stopPropagation();
      return shareBusiness(shp.dataset.shareShop);
    }

    /* business delete — admin only */
    const ds = e.target.closest("[data-del-shop]");
    if (ds) {
      if (!unlocked) return toast("🔒 Sirf admin");
      e.stopPropagation();
      return delShop(ds.dataset.delShop);
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

  // ---- announcement bar settings (admin only) ----
  const tkSave = $("#tkSave");
  const tkPrev = $("#tkPreview");
  const segs = { mode: "#tkMode", speed: "#tkSpeed", show: "#tkShow" };

  const readSeg = sel => {
    const b = document.querySelector(sel + " button.on");
    return b ? b.getAttribute("data-v") : null;
  };
  const paintSeg = (sel, val) => {
    document.querySelectorAll(sel + " button").forEach(b =>
      b.classList.toggle("on", b.getAttribute("data-v") === val));
  };

  if (tkSave) {
    loadTickerSettings();
    Object.keys(segs).forEach(k => paintSeg(segs[k], TICKER[k]));

    Object.keys(segs).forEach(k => {
      const box = document.querySelector(segs[k]);
      if (!box) return;
      box.onclick = e => {
        const b = e.target.closest("button");
        if (!b) return;
        paintSeg(segs[k], b.getAttribute("data-v"));
        TICKER[k] = b.getAttribute("data-v");
        renderTicker();
        renderTkStatus();
      };
    });

    tkSave.onclick = () => {
      if (!unlocked) return toast("🔒 Pehle admin login karo");
      const cfg = {
        mode:  readSeg(segs.mode)  || TK_DEF.mode,
        speed: readSeg(segs.speed) || TK_DEF.speed,
        show:  readSeg(segs.show)  || TK_DEF.show
      };
      TICKER = cfg;
      try { localStorage.setItem("cm_ticker", JSON.stringify(cfg)); } catch (e) {}
      write("app/ticker", cfg);
      renderTicker();
      renderTkStatus();
      toast("💾 Save ho gaya — sabke phone par lagega");
    };
  }

  if (tkPrev) tkPrev.onclick = () => {
    switchTab("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderTicker();
  };

  renderTkStatus();

  // shop codes theek karo (admin only)
  $("#fixCodes").onclick = () => {
    if (!unlocked) return toast("🔒 Pehle admin login karo");
    if (!confirm("Sabhi shop codes ko GC-001, GC-002 … format me theek karun?\n\nBusiness ka naam, photo, number — kuch nahi badlega.")) return;
    fixAllCodes();
  };

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

    /* photos — 4 tak */
    let photos = [];
    const files = $("#uPhoto").files;
    if (files && files.length) {
      toast("📸 Photos upload ho rahi hain…");
      await handleFiles([...files].slice(0, 4), r => photos = r || []);
    }

    /* contact — sirf 10 digit, +91 bina */
    const contact = $("#uContact").value.replace(/[^\d]/g, "").slice(0, 10);

    write("updates/u" + Date.now(), {
      text,
      type: $("#uType").value,
      photo:  photos[0] || null,      /* purane posts ke liye */
      photos: photos.length ? photos : null,
      contact: /^\d{10}$/.test(contact) ? contact : null,
      ts: Date.now()
    });
    e.target.reset();
    toast("📢 Post ho gaya — sabko dikhega");
  };

  // backup
  $("#exportBtn").onclick = exportData;

  // cloud badge par tap -> data kahan hai, kitna hai, refresh + backup
  $("#syncBadge").onclick = showSyncSheet;

  // announcement bar par tap -> Updates tab
  const tk = $("#ticker");
  if (tk) tk.onclick = () => { switchTab("updates"); markUpdatesSeen(); };

  // category quick-pick — spelling galti na ho
  const cpb = $("#catPick");
  if (cpb) {
    cpb.onclick = e => {
      const b = e.target.closest("[data-cp]");
      if (!b) return;
      const cur = $("#fCategory").value.trim();
      const pick = b.getAttribute("data-cp");
      /* ek jaisi category dobara jod do — split aur jodo */
      const parts = cur ? cur.split(",").map(x => canonCat(x)).filter(Boolean) : [];
      if (!parts.includes(pick)) parts.push(pick);
      $("#fCategory").value = [...new Set(parts)].join(", ");
      toast("➕ " + pick + " जोड़ा");
    };
    renderCatPick();
  }
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

  // install — event upar (file ke shuru) hi pakda jaata hai
  window.addEventListener("appinstalled", () => {
    hideInstallBar();
    localStorage.setItem("installbar_closed", "1");
    /* 🎉 INSTALL track — ab install ki ginnati ho sakti hai */
    if (FB_DB) {
      FB_DB.ref("stats/installs/" + deviceId())
        .set({ ts: Date.now(), when: new Date().toISOString() })
        .catch(() => {});
    }
    toast("🎉 App install ho gaya!");
  });
  $("#ilBtn").onclick = install;
  const hsC = $("#hsClose");
  if (hsC) hsC.onclick = () => { $("#installHelp").hidden = true; };
  const hsO = $("#installHelp");
  if (hsO) hsO.onclick = e => { if (e.target === hsO) hsO.hidden = true; };
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