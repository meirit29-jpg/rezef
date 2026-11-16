/* מרשם מקורות המידע.
 * כל נתון בדוח מצביע על מקור מכאן. סטטוס:
 *   open          – מאגר ממשלתי פתוח שמחובר ונשלף בזמן אמת
 *   not_connected – מקור רשמי קיים, אבל אין למערכת גישה (נדרש הסכם / API). לא מציגים נתון, רק הפניה
 *   model         – חישוב של המערכת עצמה (הערכה, לא נתון מאומת)
 *
 * כדי לחבר מקור בתשלום בעתיד: לשנות status ל-"api", להוסיף מימוש ב-providers/ ולעדכן כאן.
 */
export const DATAGOV = "https://data.gov.il";

export const SOURCES = {
  mot_active: {
    name: "משרד התחבורה – כלי רכב פעילים",
    short: "משרד התחבורה",
    status: "open", resource: "053cea08-09bc-40ec-8f7a-156f0677aff3"
  },
  mot_inactive: {
    name: "משרד התחבורה – כלי רכב לא פעילים",
    short: "משרד התחבורה",
    status: "open", resource: "f6efe89a-fb3d-43a4-bb61-9bf12a9b9099"
  },
  mot_cancelled: {
    name: "משרד התחבורה – כלי רכב שירדו מהכביש (ביטול סופי)",
    short: "משרד התחבורה",
    status: "open", resource: "851ecab1-0622-4dbe-a6c7-f950cf82abf9"
  },
  mot_owners: {
    name: "משרד התחבורה – היסטוריית בעלויות",
    short: "היסטוריית בעלויות",
    status: "open", resource: "bb2355dc-9ec7-4f06-9c3f-3344672171da",
    coverage: "רכבים פרטיים פעילים מ-2017 ואילך; תאריכים לפי רבעון"
  },
  mot_tech: {
    name: "משרד התחבורה – ק״מ ושינויי מבנה",
    short: "נתוני טסט",
    status: "open", resource: "56063a99-8a3e-4ff4-912e-5966c0279bad",
    coverage: "ק״מ שנרשם בטסט האחרון בלבד – לא היסטוריה מלאה"
  },
  mot_prices: {
    name: "משרד התחבורה – מחירון רכב חדש (דיווח יבואן)",
    short: "מחירון יבואן",
    status: "open", resource: "39f455bf-6db0-4926-859d-017f34eacbcb",
    coverage: "מחיר רכב חדש בשנת הדגם – לא שווי רכב משומש"
  },
  mot_models: {
    name: "משרד התחבורה – תוצרים ודגמים (מפרט ו-WLTP)",
    short: "מפרט דגם",
    status: "open", resource: "142afde2-6228-49f9-8a29-9b6c3a0cbe40"
  },

  /* ---- מקורות רשמיים שאינם מחוברים (אין API ציבורי) ---- */
  claims: {
    name: "מרכז הסליקה של חברות הביטוח – היסטוריית תביעות",
    short: "מרכז הסליקה",
    status: "not_connected",
    covers: "תאונות, תביעות ביטוח, אובדן גמור, גניבה וירידת ערך (7 שנים אחרונות)",
    how: "הדוח מופק באתר מרכז הסליקה תמורת תשלום סמלי. אין API ציבורי – נדרש הסכם עסקי.",
    url: "https://infocar.co.il/"
  },
  liens: {
    name: "רשם המשכונות (מרשם הבטוחות, רשות התאגידים)",
    short: "רשם המשכונות",
    status: "not_connected",
    covers: "שעבודים ומשכונות על הרכב",
    how: "עיון במרשם בתשלום אגרה דרך שירות 'עיון במרשם המשכונות' ב-gov.il או בסניף. אין API ציבורי לשאילתות.",
    url: null /* להשלים קישור רשמי מאומת לשירות העיון */
  },
  seizures: {
    name: "רשות האכיפה והגבייה – עיקולים",
    short: "הוצאה לפועל",
    status: "not_connected",
    covers: "עיקולים והגבלות מכוח הוצאה לפועל",
    how: "אין מאגר פתוח לשאילתה לפי מספר רכב. יש לבקש מהמוכר אישור/תדפיס עדכני.",
    url: null
  },
  service: {
    name: "היסטוריית טיפולים",
    short: "טיפולים",
    status: "not_connected",
    covers: "טיפולים ותיקונים במוסכים",
    how: "אין מאגר ציבורי בישראל. יש לבקש מהמוכר ספר טיפולים וחשבוניות.",
    url: null
  },
  market: {
    name: "מחירי עסקאות / מודעות של רכבים דומים",
    short: "מחירי שוק",
    status: "not_connected",
    covers: "מחירי רכבים דומים בשוק",
    how: "מחירונים מסחריים (לוי יצחק, icar וכד׳) דורשים רישיון שימוש. לא מחובר.",
    url: "https://www.levi-itzhak.co.il/"
  },

  /* ---- חישובי המערכת ---- */
  model_value: {
    name: "מודל פחת כללי של המערכת",
    short: "הערכת מודל",
    status: "model",
    how: "חישוב לפי גיל, ק״מ, מספר ידיים וסוג בעלות. זו הערכה, לא נתון מאומת ולא מחירון."
  },
  model_risk: {
    name: "מדד הסיכון של המערכת",
    short: "חישוב המערכת",
    status: "model",
    how: "ניקוד שקוף שמבוסס רק על נתונים מאומתים מהמקורות הפתוחים."
  }
};

export const resourceUrl = (meta, src) =>
  meta && meta.package_id ? `${DATAGOV}/dataset/${meta.package_id}/resource/${src.resource}` : DATAGOV;
