/* המלצות לקונה – כללים פשוטים על בסיס הממצאים. כל המלצה מפנה לממצא שיצר אותה. */
export function recommendations(r, risk, valuation, extra = {}){
  const out = [];
  const add = (level, text) => out.push({level, text});

  add("must", "בדקו שעבודים ומשכונות ברשם המשכונות ביום התשלום עצמו – לא מספיק אישור ישן.");
  add("must", "הפיקו דוח היסטוריית תביעות ממרכז הסליקה של חברות הביטוח (תאונות, אובדן גמור, ירידת ערך).");
  add("must", "בצעו בדיקה מקצועית במכון בדיקה מורשה לפני העברת כסף.");

  if (r.statusKind !== "active") add("high", `הרכב רשום כ"${r.statusLabel}" – ודאו מול משרד הרישוי שאפשר להעביר בעלות ולהעלות לכביש.`);
  if (r.licenseExpired) add("high", "רישיון הרכב לא בתוקף – סכמו מי משלם על טסט וחידוש, והתנו את העסקה במעבר טסט.");
  const o = r.owners || {};
  if (["השכרה", "ליסינג"].includes(o.firstType)) add("high", `הרכב הגיע מ${o.firstType} – בקשו תיעוד טיפולים מלא ובדקו בלאי (מצמד, בלמים, ריפוד).`);
  const km = risk.components.find(c => c.id === "km");
  if (km && km.scored && km.points >= 10) add("high", "ק״מ גבוה ביחס לגיל – בדקו מצב מנוע, תיבת הילוכים ומתלים.");
  if (km && km.scored && /חריג/.test(km.explain)) add("high", "ק״מ נמוך באופן חריג – בקשו הוכחות (חשבוניות טיפולים עם ק״מ) כדי לשלול שינוי מונה.");
  const ch = risk.components.find(c => c.id === "changes");
  if (ch && ch.scored && ch.points > 0) add("mid", "נרשמו שינויי מבנה/צבע – שאלו את המוכר מה בוצע ובקשו לראות את האישורים.");
  if (o.hasHistory && o.n >= 4) add("mid", `הרכב עבר ${o.n} ידיים – שאלו על סיבות המכירה הקודמות.`);
  const vm = valuation && valuation.items && valuation.items.find(i => i.id === "vs_model");
  if (vm && vm.status === "estimate" && vm.tone === "warn") add("mid", vm.text + ". השוו גם למחירון מסחרי לפני משא ומתן.");
  if (extra.devaluePct){
    const target = extra.devaluedAsking ? (Math.round(extra.devaluedAsking.after / 500) * 500).toLocaleString("he-IL") : null;
    const t = target ? ` יעד למשא ומתן לפי המחיר המבוקש: כ-₪ ${target}, אם המוכר לא כבר כלל את ירידת הערך במחיר.` : "";
    add("high", `הוזנה ירידת ערך של ${extra.devaluePct}%. בקשו את דוח השמאי ואת חשבוניות התיקון, ובדקו במכון שהתיקון בוצע כראוי.${t}`);
  }
  add("info", "בקשו מהמוכר ספר טיפולים וחשבוניות – אין מאגר ציבורי להיסטוריית טיפולים.");
  return out;
}
