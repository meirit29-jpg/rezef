# בדיקת רכב לפני רכישה (`/car/`)

מודול בתוך ריפו רצף. אפליקציית הכושר (`/index.html`) לא שונתה.

## מבנה
| קובץ | תפקיד |
|---|---|
| `index.html` | ממשק (בדיקה / השוואה / אזור אישי) + עיצוב הדפסה ל-PDF |
| `js/sources.js` | מרשם מקורות המידע וסטטוס כל מקור (פתוח / לא מחובר / הערכה) |
| `js/datagov.js` | גישה ל-data.gov.il (fetch → JSONP) + תאריך עדכון לכל מאגר |
| `js/report.js` | בניית הדוח. כל נתון = ערך + מקור; שדה חסר מסומן "לא קיים במאגר" |
| `js/risk.js` | מדד סיכון 0–100 + אחוז כיסוי. רכיב בלי נתון = "לא נבדק" |
| `js/valuation.js` | מחיר מבוקש מול מחירון חדש (רשמי) ומול מודל פחת (הערכה) |
| `js/recommend.js` | המלצות לקונה לפי הממצאים |
| `js/store.js`, `js/cloud.js` | אזור אישי: מקומי + Supabase (אם מוגדר) |
| `js/plans.js`, `js/config.js` | חבילות. `ENFORCE_PLANS=false` עד חיבור סליקה |
| `js/ocr.js` | זיהוי לוחית מתמונה (הקוד הקודם, ללא שינוי) |
| `admin/` | ממשק ניהול (דורש Supabase + role=admin) |
| `../supabase/car_platform.sql` | סכימה + RLS + פונקציית סטטיסטיקות |

## אירוח ב-Vercel (שלב 0)
1. vercel.com/new ← Import של הריפו `rezef` ← Framework: **Other** ← Deploy. אין צורך בהגדרות build.
2. הפונקציה `api/datagov.js` עולה אוטומטית ומשמשת פרוקסי עם מטמון ל-data.gov.il.
3. אותה כתובת משרתת גם את אפליקציית הכושר (`/`) וגם את בדיקת הרכב (`/car/`).
4. רק אחרי שהכול עובד ב-Vercel: להפוך את הריפו לפרטי. ב-GitHub Pages חינמי ריפו פרטי מפסיק להתפרסם.

הלקוח מנסה קודם את `/api/datagov`. אם הפרוקסי לא קיים (למשל ב-GitHub Pages), הוא פונה ישירות ל-data.gov.il, ולכן שתי הסביבות עובדות.

## בדיקות
`node --test tests/*.test.mjs` (Node 22 ומעלה): לוגיקת הדוח, הסיכון והשווי, והפרוקסי עם fetch מדומה.

## הפעלת ענן וניהול
1. להריץ `supabase/car_platform.sql` ב-SQL Editor.
2. למלא `SB_URL` / `SB_KEY` ב-`js/config.js` (או בהגדרות באזור האישי).
3. `update car_profiles set role='admin' where user_id=(select id from auth.users where email='...');`

## חיבור מקור בתשלום (מרכז הסליקה / רשם המשכונות / מחירון)
רק אחרי הסכם בכתב. מפתחות API לא נכנסים לקוד הלקוח – פונקציית שרת (Vercel `/api`) שקוראת לספק,
ואז משנים את המקור ב-`sources.js` מ-`not_connected` למחובר ומוסיפים את הרכיב ב-`risk.js`.

## גיבוי
התג `backup-before-car-platform-2026-11-16` מצביע על המצב שלפני השינויים.
