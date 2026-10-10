/* Colony Mitra — data backup generator
   Firebase se poora data nikalta hai aur 3 files banata hai:
     1. data-latest.json    -> app ke "Restore" me chalta hai
     2. businesses-latest.html -> kholne layak, photos ke saath
     3. businesses-latest.csv  -> Excel me dekhne layak
   Chalaane ke liye:  node backup.js            */
const fs = require("fs");
const path = require("path");

const BASE = "https://govt-colony-default-rtdb.asia-southeast1.firebasedatabase.app";
const PATHS = ["shops", "photos", "updates", "emergency", "reviews", "app"];
const OUT = path.join(__dirname, "backup");

const d = new Date();
const stamp =
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
  "-" + String(d.getDate()).padStart(2, "0");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const canon = c => String(c || "").trim().replace(/\s+/g, " ");
const codeNum = c => {
  const m = String(c || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};
const normCode = c => {
  const m = String(c || "").match(/(\d+)/);
  return m ? "GC-" + String(parseInt(m[1], 10)).padStart(3, "0") : String(c || "").trim();
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  /* ---- 1. raw JSON ---- */
  const data = {};
  for (const p of PATHS) {
    try {
      const r = await fetch(BASE + "/" + p + ".json");
      data[p] = r.ok ? await r.json() : null;
    } catch (e) {
      data[p] = null;
    }
  }
  data.__backup = { when: new Date().toISOString(), by: "backup.js" };

  fs.writeFileSync(path.join(OUT, "data-latest.json"),
    JSON.stringify(data, null, 1), "utf8");
  console.log("data-latest.json      " +
    (fs.statSync(path.join(OUT, "data-latest.json")).size / 1024).toFixed(1) + " KB");

  /* ---- shops list, code ke hisaab se ---- */
  const shops = Object.entries(data.shops || {}).map(([id, s]) =>
    Object.assign({ id }, s));
  shops.sort((a, b) => {
    const na = codeNum(a.code), nb = codeNum(b.code);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const ph = id => {
    const p = (data.photos || {})[id];
    return Array.isArray(p) ? p : (p ? Object.values(p) : []);
  };

  /* ---- 2. CSV ---- */
  const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  let csv = "Code,Business,Category,Phone,WhatsApp,Address,Timing,Description,Photos\n";
  for (const s of shops) {
    csv += [normCode(s.code), s.name, canon(s.cat), s.phone, s.wa,
            s.addr, s.time, s.desc, ph(s.id).length].map(q).join(",") + "\n";
  }
  fs.writeFileSync(path.join(OUT, "businesses-latest.csv"), "\uFEFF" + csv, "utf8");
  console.log("businesses-latest.csv " + shops.length + " shops");

  /* ---- 3. HTML ---- */
  const rows = shops.map(s => {
    const imgs = ph(s.id);
    return `
  <article class="s">
    <div class="top">
      <div>
        <h3>${esc(s.name)}</h3>
        <div class="meta">
          <span class="cd">${esc(normCode(s.code))}</span>
          ${s.cat ? `<span class="ct">${esc(canon(s.cat))}</span>` : ""}
          ${s.isNew ? `<span class="bg n">NAYI</span>` : ""}
          <span class="bg ${s.isOpen ? "o" : "c"}">${s.isOpen ? "KHULI" : "BAND"}</span>
        </div>
      </div>
    </div>
    ${imgs.length ? `<div class="ph">${imgs.map(p =>
        `<img src="${p}" alt="">`).join("")}</div>` : `<div class="noph">📷 फोटो नाही</div>`}
    <table>
      ${s.phone ? `<tr><td>📞 Mobile</td><td><b>${esc(s.phone)}</b></td></tr>` : ""}
      ${s.wa ? `<tr><td>💬 WhatsApp</td><td><b>${esc(s.wa)}</b></td></tr>` : ""}
      ${s.addr ? `<tr><td>📍 पत्ता</td><td>${esc(s.addr)}</td></tr>` : ""}
      ${s.time ? `<tr><td>🕐 वेळ</td><td>${esc(s.time)}</td></tr>` : ""}
      ${s.desc ? `<tr><td>ℹ️</td><td>${esc(s.desc)}</td></tr>` : ""}
    </table>
    ${(s.items || []).length ? `
    <table class="it">
      <tr><th>Type</th><th>Item</th><th>दाम</th></tr>
      ${s.items.map(i => `<tr><td>${esc(i.cat)}</td><td>${esc(i.name)}</td>
        <td class="pr">${esc(i.price)}</td></tr>`).join("")}
    </table>` : ""}
  </article>`;
  }).join("");

  const ups = Object.entries(data.updates || {}).map(([id, u]) =>
    Object.assign({ id }, u)).sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const html = `<!DOCTYPE html>
<html lang="mr"><head><meta charset="UTF-8">
<title>Colony Mitra — Business यादी (${stamp})</title>
<style>
  body{font-family:"Nirmala UI","Kohinoor Devanagari",system-ui,sans-serif;
    max-width:1000px;margin:0 auto;padding:22px;background:#f8fafc;color:#1c1c1e}
  header{background:#0f766e;color:#fff;
    padding:18px 22px;border-radius:12px;margin-bottom:18px}
  header h1{margin:0;font-size:21pt;color:#fff}
  header .sub{color:#d7fff5;font-size:9.6pt;margin-top:4px}
  .warn{background:#fffbeb;border:1.5px solid #fde68a;border-left:5px solid #f59e0b;
    border-radius:9px;padding:11px 14px;font-size:10.5pt;margin-bottom:18px;line-height:1.55}
  h2{color:#0f766e;border-bottom:2.5px solid #14b8a6;padding-bottom:4px;margin:20px 0 12px}
  .s{background:#fff;border:1px solid #e2e8f0;border-radius:12px;
    padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .s h3{margin:0 0 6px;font-size:14pt}
  .meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .cd{background:#0f766e;color:#fff;padding:2px 9px;border-radius:6px;
    font-size:9.4pt;font-weight:800}
  .ct{background:#ecfdf5;color:#0f766e;border:1px solid #a7f3d0;
    padding:2px 9px;border-radius:6px;font-size:9.4pt;font-weight:700}
  .bg{padding:2px 8px;border-radius:5px;font-size:8.6pt;font-weight:800;color:#fff}
  .bg.n{background:#2563eb}.bg.o{background:#16a34a}.bg.c{background:#6b7280}
  .ph{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:11px 0}
  .ph img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#f1f5f9}
  .noph{background:#f1f5f9;color:#94a3b8;border-radius:8px;padding:16px;
    text-align:center;font-size:10pt;margin:11px 0}
  table{width:100%;border-collapse:collapse;font-size:10pt}
  td{padding:4px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  td:first-child{color:#64748b;width:34%;white-space:nowrap}
  table.it{margin-top:9px}
  table.it th{background:#ecfdf5;color:#0f766e;padding:5px 8px;text-align:left;font-size:9.4pt}
  table.it td{border-bottom:1px solid #f1f5f9}
  table.it .pr{font-weight:800;color:#0f766e;white-space:nowrap}
  .u{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #f59e0b;
    border-radius:9px;padding:10px 13px;margin-bottom:8px}
  .u .dt{font-size:8.8pt;color:#94a3b8;margin-top:3px}
  footer{margin-top:26px;padding-top:12px;border-top:1px solid #e2e8f0;
    text-align:center;color:#94a3b8;font-size:9.4pt;line-height:1.6}
</style></head><body>

<header>
  <h1>🏘️ Colony Mitra — Business यादी</h1>
  <div class="sub">सरकारी कॉलनी, घाटकोपर ईस्ट · मुद्रण: ${d.toLocaleString("en-IN")}</div>
</header>

<div class="warn">
  <b>⚠️ ही माँगणी बॅकअप फाइल आहे</b><br>
  App कधीच बंद पडला तर ही फाइल वापरता येते. <b>App बंद करू नका.</b><br>
  एकूण <b>${shops.length}</b> businesses · <b>${ups.length}</b> updates · सारे फोटो आहेत.
</div>

<h2>🏪 सगळ्या Business ची यादी (code नुसार)</h2>
${rows}

${ups.length ? `<h2>📢 Updates</h2>
${ups.map(u => `<div class="u">${esc(u.text)}
  <div class="dt">${new Date(u.ts || 0).toLocaleString("en-IN")}</div></div>`).join("")}` : ""}

<footer>
  <b>Colony Mitra</b> · सरकारी कॉलनी, घाटकोपर ईस्ट · https://govt-colony.web.app<br>
  ही फाइल आपोआप बदलते रहती है — जब बॅकअप परत चालवाले तो update हो जाईल.
</footer>
</body></html>`;

  fs.writeFileSync(path.join(OUT, "businesses-latest.html"), html, "utf8");
  console.log("businesses-latest.html " +
    (fs.statSync(path.join(OUT, "businesses-latest.html")).size / 1024).toFixed(1) + " KB");

  /* dated copies — history bachta hai */
  for (const f of ["data-latest.json", "businesses-latest.html", "businesses-latest.csv"]) {
    fs.copyFileSync(path.join(OUT, f), path.join(OUT, f.replace("-latest", "-" + stamp)));
  }
  console.log("dated copies bhi bana di: " + stamp);
})();