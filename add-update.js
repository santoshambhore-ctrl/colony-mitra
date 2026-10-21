/* Updates me naya post — sirf admin
   $env:CM_PASS = '...'   →   node add-update.js "notice" "text..."  */
const API = "https://govt-colony-default-rtdb.asia-southeast1.firebasedatabase.app";
const KEY = "AIzaSyA00nCCN51Kqu4xOYIqZigm7F6I1WbGW-k";
const EMAIL = "colonymitra.admin@gmail.com";
const PASS = process.env.CM_PASS || "";
if (!PASS) { console.error("CM_PASS set karo pehle"); process.exit(1); }

async function login() {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + KEY,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) { console.log("LOGIN FAIL:", j.error && j.error.message); process.exit(1); }
  return j.idToken;
}

const type = process.argv[2] || "notice";
const text = process.argv[3];
if (!text) { console.log('usage: node add-update.js "notice" "text..."'); process.exit(1); }

(async () => {
  const tok = await login();
  const id = "u" + Date.now();
  const w = await fetch(API + "/updates/" + id + ".json?auth=" + tok, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, type, ts: Date.now() }) });
  if (!w.ok) { console.log("WRITE FAIL:", w.status, await w.text()); process.exit(1); }
  const all = await (await fetch(API + "/updates.json")).json();
  console.log("post id:", id, "| verify:", all[id] ? "OK" : "FAIL", "| ab updates:", Object.keys(all || {}).length);
})();
