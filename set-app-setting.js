/* App ka koi bhi setting likho (admin)
   $env:CM_PASS = '...'   →   node set-app-setting.js ticker '{"mode":"scroll","speed":"fast","show":"always"}'  */

const API = "https://govt-colony-default-rtdb.asia-southeast1.firebasedatabase.app";
const KEY = "AIzaSyA00nCCN51Kqu4xOYIqZigm7F6I1WbGW-k";
const EMAIL = "colonymitra.admin@gmail.com";
const PASS = process.env.CM_PASS || "";
if (!PASS) { console.error("CM_PASS set karo pehle"); process.exit(1); }

const [,, key, jsonArg] = process.argv;
const json = jsonArg || process.env.SET_JSON;
if (!key || !json) { console.log("usage: node set-app-setting.js <key> <json>   (ya $env:SET_JSON='{...}')"); process.exit(1); }

(async () => {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + KEY,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) { console.log("LOGIN FAIL:", j.error && j.error.message); process.exit(1); }

  let val;
  try { val = JSON.parse(json); } catch (e) { console.log("JSON galat hai:", e.message); process.exit(1); }

  const w = await fetch(API + "/app/" + key + ".json?auth=" + j.idToken, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(val) });
  if (!w.ok) { console.log("WRITE FAIL:", w.status, await w.text()); process.exit(1); }

  const check = await (await fetch(API + "/app/" + key + ".json")).json();
  console.log("app/" + key + " =", JSON.stringify(check));
})();