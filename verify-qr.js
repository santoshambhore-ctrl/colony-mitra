/* QR code VERIFY — bana hua QR sach me sahi URL deta hai ya nahi
   Chalaane ke liye:  node verify-qr.js            */
const fs = require("fs");
const { PNG } = require("pngjs");
const jsQR = require("jsqr");

const URL_EXPECT = "https://govt-colony.web.app";

function decode(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return { url: res ? res.data : null, w: png.width, h: png.height };
}

let fail = 0;
["qr-app.png", "qr-app-small.png"].forEach(f => {
  const p = __dirname + "/" + f;
  if (!fs.existsSync(p)) { console.log("MISS  " + f); fail++; return; }
  const d = decode(p);
  if (!d.url) { console.log("DECODE FAIL  " + f); fail++; return; }
  const ok = d.url === URL_EXPECT;
  if (!ok) fail++;
  console.log((ok ? "  OK   " : "  FAIL ") + f.padEnd(22) +
    d.w + "x" + d.h + "  ->  " + d.url);
});

console.log(fail ? "\n" + fail + " problem" : "\nQR verify: dono sahi URL de rahe hain");