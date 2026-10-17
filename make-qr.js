/* App ka QR code banao — logo ke saath
   Chalaane ke liye:  node make-qr.js            */
const fs = require("fs");
const path = require("path");
const QR = require("qrcode");

const URL_APP = "https://govt-colony.web.app";
const OUT = __dirname;

(async () => {
  /* ---- 1. plain QR (print / sticker / flyer) ---- */
  await QR.toFile(path.join(OUT, "qr-app.png"), URL_APP, {
    width: 1000,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#0f766eff", light: "#ffffffff" }
  });
  console.log("qr-app.png           1000px");

  /* ---- 2. chota QR (business card / chat me) ---- */
  await QR.toFile(path.join(OUT, "qr-app-small.png"), URL_APP, {
    width: 420,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#0f766eff", light: "#ffffffff" }
  });
  console.log("qr-app-small.png      420px");

  /* ---- 3. SVG (print ke liye best quality) ---- */
  const svg = await QR.toString(URL_APP, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: { dark: "#0f766e", light: "#ffffff" }
  });
  fs.writeFileSync(path.join(OUT, "qr-app.svg"), svg, "utf8");
  console.log("qr-app.svg            vector");

  /* ---- 4. plain text QR list for sharing ---- */
  console.log("\nURL: " + URL_APP);
  console.log("Scan karke seedha app khulega.");
})();