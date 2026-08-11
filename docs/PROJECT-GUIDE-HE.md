# CityScan — מדריך הפרויקט

מסמך עזר: מה יש בפרויקט, איך הוא בנוי, ומה כל קובץ עושה.

עדכון אחרון: אוגוסט 2026 · ~7,000 שורות קוד · 46 בדיקות

---

## 1. מה זה

אפליקציית Web לדיווח על מפגעים עירוניים. תושב לוחץ על מפה, בוחר סוג מפגע, מצלם ומדווח. הדיווחים מוצגים לכולם, ולעירייה יש פאנל ניהול.

**מה שמעניין טכנית:** מניעת דיווחים כפולים בשתי רמות — שאילתה גאוגרפית תופסת את המקרה הוודאי במילישניות, ו-LLM מכריע רק במקרים המעורפלים.

---

## 2. שלושה שירותים

| שירות | טכנולוגיה | פורט | תפקיד |
|---|---|---|---|
| `frontend/` | React 19, Vite, Leaflet | 5173 | ממשק המשתמש והמפה |
| `backend/` | Node.js, Express 5, TypeScript | 5000 | ה-API, הלוגיקה העסקית |
| `ai-service/` | Python, FastAPI, Gemini | 8001 | הכרעת כפילויות וניתוח תמונות |

בנוסף: **MongoDB** לאחסון. בפיתוח רץ בקונטיינר Docker מקומי, בייצור זה Atlas.

`npm run dev` בשורש מריץ את שלושתם יחד.

---

## 3. הארכיטקטורה — שני צירים

זו הנקודה הכי חשובה להבין. יש **מחסנית אנכית** של שכבות, ויש **צינור אופקי** שרץ לפניה. הם לא אותו דבר.

```
                    ┌────────────────────────────────────┐
  בקשת HTTP  ─────► │  middleware/   צינור אופקי         │
                    │  רץ על כל בקשה. לא יודע כלום       │
                    │  על מפגעים או על משתמשים           │
                    └─────────────────┬──────────────────┘
                                      │
                 ╔════════════════════▼═══════════════════╗
                 ║   routes/          מיפוי URL           ║
                 ║       ↓                                ║
                 ║   controllers/     תרגום HTTP          ║   ציר
                 ║       ↓                                ║   אנכי
                 ║   logic/           ★ הליבה ★           ║
                 ║       ↓                                ║
                 ║   repositories/    שאילתות             ║
                 ║       ↓                                ║
                 ║   data/            MongoDB             ║
                 ╚════════════════════════════════════════╝
                                      ▲
                    ┌─────────────────┴──────────────────┐
                    │  boundaries/  converters/          │
                    │  errors/      config/              │
                    │  רוחביים — משרתים את כל השכבות     │
                    └────────────────────────────────────┘
```

**חוק הזהב: חץ אחד למטה.** `data/` לא יודע ש-`logic/` קיים. `logic/` לא יודע ש-HTTP קיים. הקונטרולרים מכירים רק **ממשקים**, לא מימושים.

התוצאה המעשית: אפשר לבדוק את הלוגיקה העסקית בלי להרים שרת, ואפשר להחליף את ספק ה-LLM בלי לגעת בה.

### המקבילה ב-Spring Boot

המבנה מועתק מפרויקט SmartCollect, כולל מוסכמות השמות:

| CityScan | SmartCollect |
|---|---|
| `boundaries/` | `boundaries/` (DTOs) |
| `controllers/` | `controllers/` |
| `converters/` | `converters/` |
| `data/` | `data/` (`@Entity`) |
| `errors/` | `errors/` (`@ResponseStatus`) |
| `logic/` + `logic/impl/` | `logic/` + `logic/impl/` |
| `repositories/` | `repositories/` (Spring Data) |
| `config/` | *(אין — הכל ב-`application.properties`)* |
| `middleware/` | *(אין — ספרינג מספק מובנה)* |
| `container.ts` | *(אין — ספרינג עושה אוטומטית)* |

שירותים ברבים (`HazardsService`), קונטרולרים וישויות ביחיד (`HazardController`, `HazardEntity`) — בדיוק כמו שם.

---

## 4. הזרימה המלאה — דיווח על מפגע

```
 ①  cors               מקור מותר?
 ②  helmet             כותרות אבטחה
 ③  express.json       פענוח גוף, מקסימום 8mb
 ④  rateLimiter        לא חרגת ממכסה?
 ⑤  optionalAuth       יש טוקן? → req.user
 ⑥  demoRestrict       אדמין-דמו? → חסום כתיבה
     ───── עד כאן גלובלי. מכאן לפי נתיב ─────
 ⑦  authMiddleware     חייב טוקן, אחרת 401
 ⑧  validate(schema)   Zod. נכשל → BadRequestException
     ═════ נכנסים לשכבות ═════
 ⑨  HazardController.create        3 שורות
 ⑩  HazardsServiceImpl.create      ★ כל הכללים ★
       ├─ repository.findNearbyUnresolved()   $geoWithin, 50 מ׳
       ├─ אותו סוג ברדיוס? → ConflictException (409)
       ├─ סוג אחר? → ai.checkDuplicate()  ← נופל בחן
       ├─ photos.saveMany()  → WebP, ניקוי EXIF
       ├─ repository.create() → MongoDB
       └─ events.emit()  → SSE לכל הדפדפנים
 ⑪  converter.toBoundary()   entity → JSON נקי
 ⑫  res.status(201).json()
```

**וכשמשהו נכשל, בכל עומק:**

```
HazardsServiceImpl זורק ConflictException
        ↓  asyncHandler תופס
   errorHandler       ← קופצים לסוף הצינור
        ↓
{ message, status: 409, code: "DUPLICATE_HAZARD", timestamp, path }
```

**אף מקום בפרויקט חוץ מ-`errorHandler` לא כותב תשובת שגיאה.**

### זיהוי כפילויות — שתי רמות

**רמה 1, דטרמיניסטית:** מפגע לא פתור מ*אותו סוג* ברדיוס 50 מטר הוא כפילות. שאילתת `$geoWithin` על אינדקס `2dsphere`. בלי AI, בלי השהיה, עובד אופליין.

**רמה 2, שיפוט:** רצה רק כשיש מפגעים מ*סוג אחר* בסביבה — "פסולת" ו"הצפה" במרחק חמישה מטרים עשויים להיות אותה בעיה. השאלה הולכת ל-Gemini.

**רמה 2 נופלת בחן.** אם שירות ה-AI לא זמין, הדיווח עובר. תושב חייב תמיד להיות מסוגל לדווח.

---

## 5. Backend — כל תיקייה, כל קובץ

`backend/src/` — 74 קבצים, ~3,900 שורות.

### `config/` — תצורה וסביבות

| קובץ | שורות | תפקיד |
|---|---|---|
| `loadEnv.ts` | 71 | **חייב להיות הייבוא הראשון.** טוען `.env.{פרופיל}` ואז `.env`. ערך ריק = "לא סופק" |
| `env.ts` | 222 | מקור האמת היחיד לתצורה. מאומת ב-Zod, מוקפא. מסרב לעלות בפרודקשן בלי סוד |
| `db.ts` | 33 | חיבור Mongoose. זורק שגיאה, לא `process.exit` |

**כלל שנאכף בכל הפרויקט:** אף מודול לא קורא `process.env` בזמן ייבוא. כולם מייבאים `config`.

### `data/` — ישויות ו-enums

| קובץ | שורות | תפקיד |
|---|---|---|
| `hazard.entity.ts` | 76 | סכמת המפגע. מחזיק `latitude`/`longitude` שטוחים **וגם** `location` בפורמט GeoJSON עם אינדקס `2dsphere`. hook שומר אותם מסונכרנים |
| `user.entity.ts` | 35 | משתמש. `password` עם `select: false` |
| `log.entity.ts` | 33 | טבלת אודיט |
| `enums.ts` | 26 | `HAZARD_TYPES`, `HAZARD_STATUSES`, `USER_ROLES` — מוגדרים פעם אחת |
| `demoFixtures.ts` | 180 | 15 מפגעי הדמו בתל אביב |

> **המלכודת ב-GeoJSON:** הסדר הוא `[longitude, latitude]` — הפוך מהאינטואיציה.

### `boundaries/` — חוזה ה-JSON

כל קובץ מייצא גם סכמת Zod וגם את הטיפוס, כש-`z.infer` גוזר את השני מהראשון — כך שהוולידציה והטיפוס לא יכולים להתפצל.

| קובץ | שורות |
|---|---|
| `hazard.boundary.ts` | 144 |
| `common.boundary.ts` | 40 — מזהה ObjectId, מבנה השגיאה |
| `user.boundary.ts` | 40 |
| `auth.boundary.ts` | 38 |
| `log.boundary.ts` | 29 |

### `repositories/` — שאילתות בלבד

| קובץ | שורות | תפקיד |
|---|---|---|
| `hazard.repository.ts` | 150 | **הגאוגרפיה חיה כאן.** `findNearbyOpen(lng, lat, מטרים)` — השירות לא יודע מה זה רדיאן |
| `user.repository.ts` | 37 | `findByEmailWithPassword` הוא הנתיב היחיד שטוען סיסמה |
| `log.repository.ts` | 16 | |

### `logic/` — ממשקים

מה אפשר לעשות, בלי גוף.

| קובץ | שורות |
|---|---|
| `hazards.service.ts` | 51 |
| `ai.service.ts` | 47 — הממשק שמאפשר להחליף Gemini ב-Groq |
| `events.service.ts` | 37 — פרסום אירועים ל-SSE |
| `demo.service.ts` | 29 |
| `photoStorage.service.ts` | 25 — היום דיסק, מחר S3 |
| `auth.service.ts` | 24 |
| `users.service.ts` · `logs.service.ts` | 9 · 8 |

### `logic/impl/` — המימושים

| קובץ | שורות | תפקיד |
|---|---|---|
| `hazards.service.impl.ts` | **292** | **הקובץ החשוב ביותר.** כל הלוגיקה העסקית: כפילויות, תזמור AI, תמונות, הרשאות בעלות |
| `gemini.ai.service.impl.ts` | 122 | לקוח ל-ai-service |
| `localDisk.photoStorage.impl.ts` | 119 | `sharp` → WebP, ניקוי EXIF |
| `auth.service.impl.ts` | 109 | bcrypt, JWT, חשבון האורח |
| `demo.service.impl.ts` | 106 | איפוס לתצורת המקור |
| `emitter.events.service.impl.ts` | 37 | `EventEmitter` פנימי |
| `users.service.impl.ts` · `logs.service.impl.ts` | 38 · 28 | |

### `converters/` — entity ⇄ boundary

| קובץ | שורות | תפקיד |
|---|---|---|
| `hazard.converter.ts` | 83 | משטח את `populate`, בונה URLs לתמונות, מסתיר `location` ו-`__v` |
| `user.converter.ts` | 41 | **בונה שדה-בשדה.** ל-`UserBoundary` אין שדה סיסמה, אז היא לא יכולה לדלוף |
| `log.converter.ts` | 26 | |

### `errors/` — חריגות עם קוד HTTP

`app.exception.ts` (35) הוא הבסיס; שש תת-מחלקות של 8 שורות כל אחת: `BadRequest` (400), `Unauthorized` (401), `Forbidden` (403), `NotFound` (404), `Conflict` (409), `ServiceUnavailable` (503).

### `middleware/` — הצינור האופקי

| קובץ | שורות | המקבילה בספרינג |
|---|---|---|
| `errorHandler.ts` | 145 | `@ControllerAdvice` |
| `validate.ts` | 82 | `@Valid` + `jakarta.validation` |
| `auth.middleware.ts` | 78 | Spring Security Filter Chain |
| `demoRestrict.ts` | 50 | — |
| `requireRole.ts` | 36 | `@PreAuthorize` |
| `rateLimiter.ts` | 32 | — |
| `asyncHandler.ts` | 20 | — |

### `controllers/` — HTTP בלבד

בלי `try/catch`, בלי בחירת קודי שגיאה.

| קובץ | שורות |
|---|---|
| `hazard.controller.ts` | 135 — כולל נקודת ה-SSE |
| `demo.controller.ts` | 46 |
| `auth.controller.ts` | 27 |
| `log.controller.ts` · `user.controller.ts` | 20 · 19 |

### `routes/` — מיפוי ושומרים

**מדיניות ההרשאות קריאה מהקבצים האלה לבד:**

```ts
router.get('/admin/list', authMiddleware, requireRole('admin'), controller.listForAdmin)
```

| קובץ | שורות |
|---|---|
| `hazard.routes.ts` | 72 |
| `health.routes.ts` | 35 |
| `demo.routes.ts` | 32 |
| `auth.routes.ts` · `log.routes.ts` · `user.routes.ts` | 17 · 15 · 15 |

### קבצי השורש

| קובץ | שורות | תפקיד |
|---|---|---|
| `server.ts` | 48 | **נקודת הכניסה.** סדר הייבוא קריטי — `loadEnv` ראשון |
| `container.ts` | 96 | מרכיב את כל גרף התלויות. ההזרקה של ספרינג, ידנית |
| `app.ts` | 102 | `createApp()` — בונה את Express. בלי `listen`, בלי dotenv |

### `scripts/`

`seedDemo.ts` (55) — `npm run seed:demo`. `clearReports.ts` (48) — מחיקת כל הדיווחים.

---

## 6. Frontend — כל קובץ

`frontend/src/` — 13 קבצים, ~2,900 שורות.

| קובץ | שורות | תפקיד |
|---|---|---|
| `main.tsx` | 69 | נקודת כניסה, Router, AuthProvider |
| `App.tsx` | 67 | המסך הראשי. מטפל בבקשת מיקום GPS ובנפילה למרכז ברירת מחדל |
| `api/client.ts` | **398** | **הכל ביחד:** קונפיגורציה, שכבת HTTP, ניהול טוקן, וכל קריאות ה-API |
| `contexts/AuthContext.tsx` | 104 | מצב אימות גלובלי |
| `data/demoFixtures.ts` | 98 | 15 המפגעים לדמו בדפדפן |
| `components/MapComponent.tsx` | 398 | המפה, הסמנים, לחיצות |
| `components/ReportSidebar.tsx` | **602** | טופס הדיווח — הקובץ הגדול ביותר |
| `components/NavBar.tsx` | 293 | ניווט + חיפוש כתובות (Nominatim) |
| `components/DemoBanner.tsx` | 27 | הפס הצהוב במצב דמו |
| `pages/AdminPage.tsx` | 541 | פאנל הניהול |
| `pages/LoginPage.tsx` | 131 | התחברות + כפתורי הדמו |
| `pages/MyReportsPage.tsx` | 118 | הדיווחים שלי |
| `pages/RegisterPage.tsx` | 83 | הרשמה |

> **הערה כנה על המבנה:** `pages/` תואם ל-SmartCollect, אבל `api/client.ts` מחזיק לבדו את מה שב-SmartCollect מפוצל ל-`core/` (config, http, session) ול-`services/` (לפי דומיין). זו החלטה מודעת להשאיר כרגע — הפיצול מתוכנן אבל לא בוצע.

---

## 7. AI Service

`ai-service/app/main.py` — 237 שורות. שני נתיבים מוגנים ב-`X-API-Key`:

| נתיב | תפקיד |
|---|---|
| `POST /check-duplicate` | מקבל מפגעים קיימים + דיווח חדש, מחזיר `is_duplicate` |
| `POST /analyze` | מקבל תמונה ב-base64, מחזיר תיאור |
| `GET /health` | בדיקת חיים |

המודל מוגדר ב-`GEMINI_MODEL` — כרגע `gemini-3.5-flash`, **מקובע בכוונה** ולא alias נייד.

---

## 8. בדיקות

46 בדיקות אינטגרציה מול MongoDB אמיתי שעולה נקי בכל ריצה (`mongodb-memory-server`) — בלי צורך ב-Docker.

| קובץ | שורות | מכסה |
|---|---|---|
| `hazards.test.ts` | 301 | חוזה ה-JSON, כפילויות, תמונות, הרשאות, שגיאות |
| `auth.test.ts` | 150 | הרשמה, התחברות, רגרסיית JWT, הגבלת הדמו |
| `demoReset.test.ts` | 150 | האיפוס והשומרים שלו |
| `fixtureSync.test.ts` | 97 | ששתי רשימות ה-fixtures לא נפרדו |
| `sse.test.ts` | 95 | זרם אירועים חי |
| `support/base.ts` · `helpers.ts` | 77 · 53 | תשתית משותפת |

**בדיקות ששוות אזכור:** שמייל לא קיים וסיסמה שגויה מחזירים **בדיוק אותה הודעה**, כדי שאי אפשר יהיה לגלות אילו כתובות רשומות. ושהטוקן **לא** מתאמת מול הסוד הישן — רגרסיה לבאג שתוקן.

---

## 9. הכלים ולמה

| כלי | למה הוא ולא אחר |
|---|---|
| **TypeScript** | מופעל עם `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` — ההגדרות הקפדניות |
| **Express 5** | מינימלי. השכבות נבנו ידנית ולכן מפורשות |
| **MongoDB + Mongoose** | השאילתה המרכזית גאוגרפית. `2dsphere` נותן `$geoWithin` נייטיב |
| **Zod** | `z.infer` גוזר את הטיפוס מהסכמה — לא יכולים להתפצל |
| **JWT + bcrypt** | Stateless. 10 סבבי גיבוב |
| **sharp** | WebP + הסרת EXIF. תמונה של 1.5MB → ~150KB |
| **SSE** | חד-כיווני מספיק. קל בהרבה מ-socket.io |
| **Vitest + mongodb-memory-server** | DB אמיתי חד-פעמי, בלי Docker |
| **Leaflet + OpenStreetMap** | 0$, בלי מפתח API |
| **Nominatim** | גיאוקודינג חינמי, בלי מפתח |

---

## 10. מצב דמו — איך זה עובד

יש **שני** מנגנונים נפרדים:

**א. כספת localStorage** (`VITE_IS_DEMO=true`) — האפליקציה רצה בלי Backend בכלל. זה מה שרץ באתר ב-Vercel. 15 המפגעים נזרעים בטעינה ראשונה, וחסימת הכפילויות ברמה 1 מחושבת בדפדפן.

**ב. חשבון אורח** (`POST /auth/demo-login`) — חשבון אמיתי מול Backend אמיתי. זה מה שרץ מקומית.

> **למה AI לא עובד בדמו:** הוא דורש מפתח Gemini. כל משתנה שמתחיל ב-`VITE_` **מוטמע לתוך קובץ ה-JavaScript** ונקרא ע"י כל אחד. לכן ניתוח התמונות והכרעת רמה 2 מושבתים בדמו ומחזירים הודעה מפורשת.

---

## 11. מה חי ומה לא

| רכיב | מצב |
|---|---|
| Frontend ב-Vercel | **חי** — `city-scan-tawny.vercel.app`, מצב דמו |
| Backend | **לא פרוס.** רץ רק מקומית |
| ai-service | **לא פרוס.** רץ רק מקומית |
| MongoDB Atlas | קלסטר קיים, ריק |
| CI ב-GitHub Actions | **פעיל** — build + 46 בדיקות בכל push |
| איפוס דמו לילי | קוד מוכן, ממתין לפריסת Backend |

---

## 12. איך להריץ

```bash
# פעם אחת אחרי אתחול מחשב — MongoDB מקומי
cd backend && npm run db:up

# נתונים למפה
npm run seed:demo

# שלושת השירותים יחד (מהשורש)
npm run dev
```

`http://localhost:5173` → **Sign in as Admin (Demo)**.

להדגמת חסימת כפילויות: לחץ על המפה ברחוב דיזנגוף ליד סמן קיים, ודווח על **בור** נוסף.

```bash
npm test --prefix backend      # 46 בדיקות
npm run build --prefix backend # קומפילציה
```

---

## 13. סביבות עבודה

`NODE_ENV` בוחר את הפרופיל. סדר הטעינה: משתני מערכת ← `.env.{פרופיל}` ← `.env`.

| | `development` | `production` | `test` |
|---|---|---|---|
| מסד נתונים | Docker מקומי | Atlas | בזיכרון |
| `JWT_SECRET` | אופציונלי, מזהיר | **חובה ≥32 תווים** | נקבע בבדיקות |
| CORS | הכל מותר | **חובה** | — |
| גוף שגיאה | כולל stack | הודעה גנרית | כולל stack |
| AI | localhost:8001 | רשת Docker | מכובה |

---

## 14. מה נשאר

**אבטחה, דחוף:** XSS מאוחסן ב-`MapComponent.tsx` — ה-popup נבנה עם `innerHTML` ומזריק תיאור מפגע בלי escaping.

**Frontend:** מעבר ל-SSE במקום פוליטציה כל 8 שניות · אירוח עצמי של אייקוני המפה (נטענים מ-GitHub ומ-cdnjs) · clustering לסמנים · פיצול `client.ts` ל-`core/` ו-`services/`

**פריסה:** `Dockerfile` + `docker-compose.yml` · Azure B1s · DuckDNS · Nginx Proxy Manager עם `proxy_buffering off` ל-SSE

**מאוחר יותר:** פאגינציה אמיתית (יש תקרת 500) · Redis אם אי פעם יהיה יותר מ-instance אחד
