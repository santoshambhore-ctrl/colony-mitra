/* ============================================================
   FIREZBASE CONFIG  (OPTIONAL — app bina iske bhi chalega)

   Abhi ye khali hai  →  data sirf AAPKE phone mein save hoga.
   Bhookar ke phone pe dukaan nahi dikhegi.

   Share mode chahiye? Ye 5 minute ka kaam hai:
   ---------------------------------------------------------
   1. https://console.firebase.google.com  →  "Add project"
      (naam kuch bhi, e.g. colony-mitra)
   2. Left menu → "Realtime Database" → "Create Database"
      → Location: asia-south1  → Start in LOCKED mode → Done
   3. "Rules" tab → neeche diya hua rule paste karo → Publish
   4. Project settings (⚙️ gear) → "Add app" → Web (</>)
      → config copy karo aur neeche paste kar do
   ---------------------------------------------------------
   Bas. Ab har phone pe LIVE same dukaanein dikhenge.

   NOTE: Ye file sabke phone pe chalti hai. Security ke liye
   niche "rules mein sab khula" rakha hai, kyunki aapka data
   sirf padhne layak hai (padha hai toh sab dekh sakte hain).
   ============================================================ */

window.firebaseConfig = {
  apiKey: "AIzaSyA00nCCN51Kqu4xOYIqZigm7F6I1WbGW-k",
  authDomain: "govt-colony.firebaseapp.com",
  databaseURL: "https://govt-colony-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "govt-colony",
  storageBucket: "govt-colony.firebasestorage.app",
  messagingSenderId: "817524469883",
  appId: "1:817524469883:web:5576815154f4aea71e72de",
  measurementId: "G-CZEM8J76GG"
};

/* NOTE: Analytics chalu nahi kiya — colony app me tracking ki zaroorat nahi.
   Google Analytics tab me khud dekh sakte ho. */

/* ============================================================
   🔐 REALTIME DATABASE RULES  —  ADMIN-ONLY (reviews open)

   Rules tab me ye POORA paste karo, purana sab hata ke:

   {
     "rules": {
       "shops": {
         ".read": true,
         ".write": "auth != null && auth.token.email === 'colonymitra.admin@gmail.com'"
       },
       "updates": {
         ".read": true,
         ".write": "auth != null && auth.token.email === 'colonymitra.admin@gmail.com'"
       },
       "emergency": {
         ".read": true,
         ".write": "auth != null && auth.token.email === 'colonymitra.admin@gmail.com'"
       },
       "app": {
         ".read": true,
         ".write": "auth != null && auth.token.email === 'colonymitra.admin@gmail.com'"
       },
       "photos": {
         ".read": true,
         ".write": "auth != null && auth.token.email === 'colonymitra.admin@gmail.com'"
       },
       "reviews": {
         ".read": true,
         ".write": true
       },
       "stats": {
         ".read": "auth != null && auth.token.email === 'colonymitra.admin@gmail.com'",
         ".write": true
       }
     }
   }

   ── Kya hota hai ──────────────────────────────────────────
   ✅ SAB koi padh sakta hai (app dikhna chahiye)
   ✅ Reviews SABKE LIYE khule — koi bhi likh sakta hai
   🔒 Dukaan / Updates / Emergency / Logo — SIRF admin badal sakta hai

   Email aapka apna hai. Koi aur account bana ke rules nahi tod
   sakta, kyunki Firebase email verify karta hai.

   ── Setup: sirf EK cheez ──────────────────────────────────
   Console → Authentication → Sign-in method
   → "Email/Password" → Enable
   (Anonymous ki zaroorat nahi)
   ============================================================ */