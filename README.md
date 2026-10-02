# 🏘️ Colony Mitra — Govt Colony, Ghatkopar East

Colony ki saari dukaanein, daam, reviews aur emergency numbers — ek app me.
**Free hai. Koi Play Store nahi. Koi kharcha nahi.**

---

## 📱 Abhi kaise chalayein (test)

Same WiFi par laptop aur phone:

```
http://192.168.0.102:8080
```

iPhone par install karne ke liye **Safari** use karein (Chrome se nahi hota):
Safari → link kholo → Share button (⬆️) → **Add to Home Screen**

Android par Chrome me: Menu (⋮) → **Install app** ya **Add to Home screen**

---

## ✅ Features

| Feature | Detail |
|---|---|
| 🏠 Dukaan list | Search + category filter (Kirana, Salon, Clinic...) |
| 💬 WhatsApp button | Ek tap pe WhatsApp chat (naam + address ke saath) |
| 📞 Call button | Direct dial |
| 📦 Saman & daam | Category-wise price list |
| 🖼️ Photos | Ek dukaan ki 12 photos tak, auto-compress |
| 🆕 Nayi dukaan badge | Naya khila hua highlight |
| 🟢/🔴 Khuli/Band | Manual ya time se |
| 🚨 Emergency tab | Police 100, Ambulance 108, Guard, Hospital — ek tap call |
| ⭐ Reviews & Rating | Log star + comment de sakte hain, average rating dikhta hai |
| 📢 Updates feed | Offer / Nayi dukaan / Notice |
| 🖼️ Custom logo | Apni society ki logo upload karo |
| 🌙 Dark mode | Raat ko aankhon ko araam |
| 📤 Backup | Ek file me poora data download |
| 🔐 Admin PIN | 4-digit lock |

---

## 🔥 Firebase connect karo (5 min) — ZAROORI

**Abhi data sirf AAPKE phone me hai.** Ye karo taaki 500 logo ko bhi dikhe.

### Step 1 — Project banao
1. <https://console.firebase.google.com> kholo
2. **Add project** → naam do `colony-mitra` → **Continue**
3. Google Analytics **off** rakho → **Create project**

### Step 2 — Database banao
1. Left menu → **Realtime Database** (Build section me)
2. **Create Database**
3. Location: **asia-south1** (Mumbai ke paas)
4. **Start in LOCKED mode** → **Enable**

### Step 3 — Rules change karo (zaroori!)
1. **Rules** tab click karo
2. Sab hatao aur ye paste karo:

```json
{ "rules": {
  "shops":     { ".read": true, ".write": true },
  "updates":   { ".read": true, ".write": true },
  "reviews":   { ".read": true, ".write": true },
  "emergency": { ".read": true, ".write": true },
  "app":       { ".read": true, ".write": true }
} }
```

3. **Publish** click karo

### Step 4 — Config copy karo
1. Project **Settings** (⚙️ gear) → **General** → scroll down
2. **Your apps** → **`</>` Web app** icon → nickname do `colony-mitra`
3. **Register app**
4. Jo `firebaseConfig` dikhega, uska **poora copy** karo

### Step 5 — Mjhe de do
Config yahan paste karo:
`C:\Users\santo\OneDrive\Documents\Default Project\firebase-config.js`

Uske neeche already ek `window.firebaseConfig = null;` likha hai — usko mila do.

**Ho gaya! Ab badge 📱 Local → ☁️ Cloud ho jayega** aur har edit sab phones pe turant dikhega.

---

## 🌐 Free hosting (10 min)

Firebase ke baad link chahiye jo 500 logon ko bhej sakte ho:

1. <https://app.netlify.com/drop> kholo
2. Ye **poora folder** drag & drop karo
3. 10 second me link mil jayega (jaise `colony-mitra-abc123.netlify.app`)
4. Wahi link WhatsApp group me daal do

⚠️ Netlify `firebase-config.js` ko bhi upload karta hai — wo **public** hota hai.
Isliye config paste karne ke baad Netlify pe **dobara upload** karna mat bhoolna.

---

## ⚙️ Settings badalna

Sab kuch ek jagah: **`app.js`** ke top par

```js
const SETTINGS = {
  appName:   "Colony Mitra",
  colony:    "Govt Colony, Ghatkopar East",
  state:     "Maharashtra",
  ownerName: ""
};
```

---

## 📝 Admin kaise use karein

1. **⚙️ Admin** tab kholo
2. Pehli baar PIN set karne ka option aayega (default: koi nahi, direct khulega)
3. **🖼️ App Logo** → society logo upload → **Logo badlo**
4. **➕ Nayi Dukaan** → details bharo → **Save**
5. **🚨 Emergency Numbers** → guard/hospital ka number add karo
6. **📢 Naya Update** → offer ya notice post karo

### Saman & daam kaise likhein

Format: `Category | Item | Price` — har line ek item

```
Sabzi | Aloo | 30/kg
Sabzi | Pyaaz | 25/kg
Kirana | Atta 5kg | 280
Kirana | Sarson Tail 1L | 145
```

Shop ke andar automatically category wise group ho jayega.

---

## 💾 Backup (zaroori!)

Phone badalne se pehle: **Admin → ⬇️ Backup lo**
→ `colony-mitra-backup-2026-09-30.json` file download hogi

Naye phone par: **⬆️ Restore** → wo file select karo

---

## ❓ Common problems

| Problem | Solution |
|---|---|
| Badge **📱 Local** dikh raha hai | Firebase config paste nahi hua |
| WhatsApp button nahi khul raha | Number 10 digit ka daalo, ya `wa` field bharo |
| Photos nahi dikh rahe | Firebase me storage full — purani photos hatao |
| iPhone pe install nahi ho raha | **Safari** use karo, Chrome se nahi hota |
| Data khatam ho gaya | Admin → `Sab mitao` mat dabana 😅 |

---

## 📁 Files

```
index.html            → Page structure
style.css             → Design
app.js                → Saara logic (settings upar)
firebase-config.js    → Firebase connection + rules
manifest.json         → PWA info (app naam, icon)
sw.js                 → Offline ke liye
icons/                → App icons
```

---

## 🔒 Security yaad rakhein

Abhi rules **"sab kuch public"** hain — matlab koi bhi padh sakta hai aur koi bhi
dukaan edit kar sakta hai. Colony ke liye theek hai, lekin agar kabhi paisa/sensitive
data rakhna ho toh Firebase Authentication zaroor add karna hoga.

**Admin tab ka PIN sirf aapke phone me hai** — wo servernice protection nahi hai.
Data ki asli safety Firebase rules se aati hai.