/* Ek update post delete — sirf admin
   $env:CM_PASS = '...'   →   node delete-update.js <updateId>  */
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

const id = process.argv[2];
(async () => {
  const tok = await login();
  const all = await (await fetch(API + "/updates.json")).json();
  const keys = Object.keys(all || {});
  console.log("abhi " + keys.length + " update(s):");
  keys.forEach(k => console.log("  " + k + "  [" + all[k].type + "]  " + String(all[k].text).replace(/\s+/g, " ").slice(0, 60)));
  const target = id || keys[0];
  if (!target || !all[target]) { console.log("id nahi mila:", target); process.exit(1); }
  const w = await fetch(API + "/updates/" + target + ".json?auth=" + tok, { method: "DELETE" });
  if (!w.ok) { console.log("DELETE FAIL:", w.status, await w.text()); process.exit(1); }
  const check = await (await fetch(API + "/updates/" + target + ".json")).json();
  console.log("verify:", check === null ? "hat gaya" : "STILL HAI");
})();
