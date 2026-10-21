/* Ek shop ka category fix (multi-category jodne ke liye)
   $env:CM_PASS = '...'   →   node fix-swati.js <shopId> "<naya category>"  */
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

const [,, id, newCat] = process.argv;
if (!id || !newCat) { console.log('usage: node fix-swati.js <shopId> "<category>"'); process.exit(1); }

(async () => {
  const tok = await login();
  const before = await (await fetch(API + "/shops/" + id + ".json")).json();
  if (!before) { console.log("SHOP nahi mila:", id); process.exit(1); }
  const w = await fetch(API + "/shops/" + id + "/cat.json?auth=" + tok, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newCat) });
  if (!w.ok) { console.log("WRITE FAIL:", w.status, await w.text()); process.exit(1); }
  const after = await (await fetch(API + "/shops/" + id + ".json")).json();
  console.log("naam :", after.name);
  console.log("cat  : [" + before.cat + "]  ->  [" + after.cat + "]");
  console.log("baaki safe?", after.name === before.name && after.phone === before.phone
    && JSON.stringify(after.items) === JSON.stringify(before.items) ? "HAAN" : "NAHI");
})();
