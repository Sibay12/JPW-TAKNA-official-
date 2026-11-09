# JPW Bot — काम का Summary / Continuity Log

इस फाइल को हर बार अपडेट किया जाएगा। नई चैट में काम आगे बढ़ाने के लिए
यही फाइल (और प्रोजेक्ट का latest zip) Claude को दे दें — पूरा context मिल जाएगा।

## प्रोजेक्ट क्या है
- Node.js/Express + MongoDB बैकएंड (`server.js`, 4100+ lines)
- Telegram bot (`bot.js`) + WhatsApp (Baileys) module (`whatsapp.js`)
- Web/app portal: `public/index.html`, `public/admin.html`, `public/mobile_app.html`
- Package/order/offers system with reseller panel, Google Sheets export, payment gateway hook
- पहले से मौजूद patterns: Maintenance Mode (admin panel से on/off), Keep-alive pinger

## बेचने का तरीका (फ़ाइनल हो चुका)
सिर्फ एक बार license/activation key डालकर बेचना है — **code हर कस्टमर के लिए same रहेगा**,
बस हर कस्टमर को एक अलग license key दी जाएगी (central server की ज़रूरत नहीं)।

## अब तक हुआ काम
1. **`utils/license.js`** — नया module: HMAC-SHA256 से sign किया हुआ license key बनाना/verify करना।
   - key format: `JPW-<base64url payload>.<hmac-sha256 hex>`
   - key में: customer name, domain (optional lock, `*` = कोई lock नहीं), expiry (optional, 0 = lifetime)
   - Tamper की हुई key, expired key, गलत domain — सब reject होती है (test किया, pass)
2. **`scripts/generate-license.js`** — सेलर (आप) के लिए CLI टूल, नई key बनाने के लिए:
   `node scripts/generate-license.js "Customer Name" "domain.com|*" [days]`
3. **`server.js`** में hook लगाया (maintenance-mode वाले pattern जैसा ही):
   - `LICENSE_KEY` env var से key पढ़ता है
   - Startup पर signature+expiry check करके log करता है
   - हर request पर middleware: license invalid/domain mismatch होने पर पूरा सर्वर block
     (सिर्फ `/health` और `/api/license-status` खुले रहते हैं)
   - नया endpoint: `GET /api/license-status`
4. **`.env.example`** में `LICENSE_KEY` और `LICENSE_SECRET` जोड़े

## अभी तक नहीं किया (जो सोचना है)
- `LICENSE_SECRET` का default value अभी placeholder है (`CHANGE-THIS-SECRET-BEFORE-SELLING-JPW-2026`)
  — बेचने से पहले इसे अपने private secret से बदलना ज़रूरी है, वरना कोई भी बिना खरीदे key बना सकता है।
- Admin panel (`public/admin.html`, 157KB) में अभी license status दिखाने के लिए कोई UI नहीं जोड़ा —
  सिर्फ API है (`/api/license-status`)। चाहें तो अगले step में admin panel में एक छोटा सा
  "License: Customer X, valid till ..." widget जोड़ सकते हैं।
- Multi-customer packaging अभी manual है — हर customer को अलग zip देना है या नहीं, decide नहीं हुआ
  (अभी एक ही codebase है, बस अलग-अलग key).
- Enterprise selling के बाकी हिस्से (screenshots, install docs, min requirements — जैसा
  script-marketplace-listing में पहले से नोट है) अभी शुरू नहीं हुए।

## अगला step (सुझाव)
1. अपना असली `LICENSE_SECRET` decide करें (और इसे `utils/license.js` में डालें या `.env` में रखें — `.env` ज़्यादा सुरक्षित है)
2. एक test key बनाकर local/staging पर चला के देखें
3. बताएं अगर admin panel में license status widget चाहिए
4. बताएं कि क्या हर customer को अलग zip/branding चाहिए या सिर्फ key अलग

---

## 2. ऑर्डर फ्लो: Telegram → WhatsApp (server-side queue) — DONE

पहले orders Telegram userbot (@JPWREACHEDBOT) के ज़रिए third-party को जाते थे, queue third-party के पास
रहता था। अब:
- एक नया WhatsApp connection `waOrders` (नाम `ord`, Admin Panel में "WhatsApp Orders (Selected Number)")
  — यही third-party को orders forward करता है।
- **Target number** (जिसे orders जाते हैं) Admin Panel से set होता है (`/api/admin/ordwa/target`,
  MongoDB Setting key `wa_orders_target_number`) — कोई env var नहीं चाहिए।
- **Server-side queue**: नया order बनते ही सिर्फ 'Pending' रहता है; `scheduleWaOrderQueue()` उसे
  worker नंबर पर भेजता है — पर एक बार में सिर्फ एक order भेजा जाता है, अगले order के लिए तब तक रुकता है
  जब तक पहले वाले का **पहला reply** न आ जाए (`waFirstReplyAt`)। हर 20 सेकंड एक safety-net sweep भी चलता
  है (reconnect / target-number-set-बाद-में जैसे cases के लिए)।
- Reply आने पर status वही पुराना classification logic इस्तेमाल करता है (Completed/Rejected/In Progress
  वगैरह) — customer message, commission credit, Google Sheet log, admin notify सब पहले जैसा ही काम
  करता है, बस transport WhatsApp है।
- पुराना Telegram userbot relay (`forwardOrderToTargetBot`, `TARGET_THIRD_PARTY_BOT`, userbot bridge)
  code में **हटाया नहीं गया** (safety के लिए) — बस अब `placeOrder()` उसे call नहीं करता, इसलिए वो dead
  code है। अगर आप पूरी तरह हटवाना चाहें तो बता दीजिएगा।
- Admin Panel में नया card जोड़ा: "WhatsApp Orders (Selected Number)" (Connections tab) — QR connect,
  test message, target number input/save, सब वहीं से।

### अभी नहीं हुआ / ध्यान देने वाली बातें
- Code अभी **syntax-check** और manual logic-review तक हुआ है — असली WhatsApp नंबर/third-party के साथ
  live test नहीं हुआ (यहाँ container में न MongoDB है न WhatsApp लॉगिन चल सकता है)। पहली बार deploy करने
  के बाद एक test order ज़रूर चला के देखें।
- अगर third-party अब भी सिर्फ Telegram पर उपलब्ध है (WhatsApp पर उनका कोई bot/नंबर नहीं है), तो ये पूरा
  feature तभी काम करेगा जब third-party WhatsApp पर भी available हो — कृपया confirm कर दें कि third-party
  की तरफ से WhatsApp नंबर मिल चुका है।
