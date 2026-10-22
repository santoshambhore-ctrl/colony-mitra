/* Sabhi shop codes ko saaf format me likho — GC-01, GC-07, GC-39
   Sirf 'code' field badlega — baaki sab safe
   $env:CM_PASS = '...'   →   node fix-codes.js              */

const API = "https://govt-colony-default-rtdb.asia-southeast1.firebasedatabase.app";
const KEY = "AIzaSyA00nCCN51Kqu4xOYIqZigm7F6I1WbGW-k";
const EMAIL = "colonymitra.admin@gmail.com";
const PASS = process.env.CM_PASS || "";
if (!PASS) { console.error("CM_PASS set karo pehle"); process.exit(1); }

(async () => {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + KEY,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) { console.log("LOGIN FAIL:", j.error && j.error.message); process.exit(1); }
  const tok = j.idToken;

  const shops = await (await fetch(API + "/shops.json")).json();
  const list = Object.entries(shops || {}).map(([id, s]) => Object.assign({ id }, s));

  /* code number ke hisaab se sort */
  const num = c => { const m = String(c || "").match(/(\d+)/); return m ? parseInt(m[1], 10) : 1e9; };
  list.sort((a, b) => num(a.code) - num(b.code));

  let changed = 0;
  for (const s of list) {
    const n = num(s.code);
    if (n >= 1e9) continue;
    const want = "GC-" + String(n).padStart(2, "0");
    if (String(s.code || "").trim() !== want) {
      const w = await fetch(API + "/shops/" + s.id + "/code.json?auth=" + tok, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(want) });
      if (!w.ok) { console.log("FAIL", s.name, w.status); continue; }
      changed++;
      console.log("  " + String(s.code).padEnd(10) + " -> " + want + "   " + s.name.slice(0, 30));
    }
  }

  const after = await (await fetch(API + "/shops.json")).json();
  const codes = Object.values(after || {}).map(s => s.code);
  console.log("\nchanged:", changed);
  console.log("ab total:", codes.length);
  console.log("duplicates:", codes.length - new Set(codes).size);
  console.log("sample:", codes.slice(0, 6).join(", "), "...", codes.slice(-3).join(", "));
})();