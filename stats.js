/* Kitne UNIQUE logon ne app khola — dedupe (har phone 1 baar)
   $env:CM_PASS = '...'   →   node stats.js  */
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

(async () => {
  const tok = await login();
  const stats = await (await fetch(API + "/stats.json?auth=" + tok)).json();
  const devs = Object.entries((stats || {}).devices || []).map(([id, d]) => ({ id, f: d.f || 0, l: d.l || 0 }));
  const installs = Object.keys((stats || {}).installs || {});

  const now = Date.now(), DAY = 864e5;
  const today = devs.filter(d => now - d.l < DAY).length;
  const week  = devs.filter(d => now - d.l < 7 * DAY).length;
  const month = devs.filter(d => now - d.l < 30 * DAY).length;

  console.log("=== UNIQUE PHONES (har phone = 1) ===");
  console.log("  Kul        :", devs.length);
  console.log("  Aaj        :", today);
  console.log("  7 din      :", week);
  console.log("  30 din     :", month);
  console.log("  Install ki :", installs.length);
  console.log("\n=== Roz-wise ===");
  for (let i = 6; i >= 0; i--) {
    const from = now - (i + 1) * DAY, to = now - i * DAY;
    const n = devs.filter(d => d.l > from && d.l <= to).length;
    const lab = new Date(to).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
    console.log("  " + lab.padEnd(11) + " " + String(n).padStart(3) + "  " + "#".repeat(n));
  }
})();
