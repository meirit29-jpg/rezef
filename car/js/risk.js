/* מדד סיכון 0–100 (0 = לא נמצאו סימני סיכון, 100 = סיכון גבוה מאוד).
 * עקרונות:
 *  - כל רכיב מבוסס רק על נתון מאומת ממקור פתוח. אם הנתון חסר – הרכיב "לא נבדק" ולא מקבל ניקוד.
 *  - רכיבים שהמקור שלהם לא מחובר (תאונות, שעבודים) מוצגים במפורש כ"לא נבדק".
 *  - הכיסוי (כמה מהבדיקה בוצעה) מוצג ליד הציון, כדי שציון נמוך לא ייקרא כ"רכב נקי".
 */
export const LEVELS = [
  {max: 19, id: "low",  label: "סיכון נמוך"},
  {max: 44, id: "mid",  label: "סיכון בינוני"},
  {max: 100, id: "high", label: "סיכון גבוה"}
];

export function riskScore(r){
  const C = [];
  const add = (c) => C.push(c);

  // 1. סטטוס במאגר
  add({
    id: "status", label: "סטטוס הרכב במאגר", max: 30, src: r.mainSrc, scored: true,
    points: r.statusKind === "cancelled" ? 30 : r.statusKind === "inactive" ? 20 : 0,
    explain: r.statusKind === "cancelled" ? "הרכב רשום כמי שירד מהכביש בביטול סופי – לא ניתן לרשום אותו מחדש כרגיל."
           : r.statusKind === "inactive" ? "הרכב רשום כלא פעיל. יש לברר מדוע (הורדה זמנית מהכביש, אובדן, ייצוא)."
           : "הרכב רשום כפעיל."
  });

  // 2. מקור הרכב (סוג הבעלות הראשונה)
  const o = r.owners || {};
  const originPts = {"השכרה": 15, "ליסינג": 10, "חברה": 6}[o.firstType] || 0;
  add({
    id: "origin", label: "מקור הרכב", max: 15, src: o.hasHistory ? "mot_owners" : r.mainSrc, scored: true,
    points: originPts,
    explain: (originPts ? `הבעלות הראשונה הייתה ${o.firstType}. רכבים כאלה צוברים בדרך כלל יותר ק״מ ונהגים שונים.` : "הבעלות הראשונה הייתה פרטית.")
      + (o.hasHistory ? "" : " (לפי סוג הבעלות הנוכחי – אין היסטוריית בעלויות במאגר.)")
  });

  // 3. מספר ידיים
  if (o.hasHistory){
    const pts = Math.min(12, Math.max(0, o.n - 1) * 3);
    add({id: "hands", label: "מספר ידיים", max: 12, src: "mot_owners", scored: true, points: pts,
      explain: `יד ${o.n}. כל החלפת בעלות מעבר לראשונה מוסיפה 3 נקודות (עד 12).`});
  } else {
    add({id: "hands", label: "מספר ידיים", max: 12, src: "mot_owners", scored: false, points: 0,
      explain: "אין היסטוריית בעלויות במאגר לרכב הזה (המאגר מכסה רכבים פרטיים פעילים מ-2017)."});
  }

  // 4. ק״מ ביחס לגיל
  if (r.km != null && r.age != null && r.age >= 0.5){
    const perYear = r.km / r.age;
    let pts = 0, note = "";
    if (perYear > 25000){ pts = 15; note = "שימוש אינטנסיבי מאוד"; }
    else if (perYear > 20000){ pts = 10; note = "שימוש גבוה מהממוצע"; }
    else if (perYear > 17000){ pts = 5; note = "מעט מעל הממוצע"; }
    else if (perYear < 3000 && r.age > 3){ pts = 5; note = "נמוך באופן חריג – כדאי לוודא שהמונה לא שונה"; }
    else note = "בטווח הרגיל";
    add({id: "km", label: "ק״מ ביחס לגיל", max: 15, src: "mot_tech", scored: true, points: pts,
      explain: `כ-${Math.round(perYear).toLocaleString("he-IL")} ק״מ לשנה לפי הטסט האחרון – ${note}.`});
  } else {
    add({id: "km", label: "ק״מ ביחס לגיל", max: 15, src: "mot_tech", scored: false, points: 0,
      explain: "אין נתון ק״מ במאגר לרכב הזה."});
  }

  // 5. שינויי מבנה
  if (r.tech){
    let pts = 0; const why = [];
    if (Number(r.tech.colorChange) === 1){ pts += 4; why.push("נרשם שינוי צבע"); }
    if (r.tech.originality && !/מקורי/.test(r.tech.originality)){ pts += 6; why.push(`מקוריות: ${r.tech.originality}`); }
    add({id: "changes", label: "שינויי מבנה", max: 10, src: "mot_tech", scored: true, points: Math.min(10, pts),
      explain: why.length ? why.join(" · ") + "." : "לא נרשמו שינויי צבע או מבנה."});
  } else {
    add({id: "changes", label: "שינויי מבנה", max: 10, src: "mot_tech", scored: false, points: 0,
      explain: "אין נתוני מבנה במאגר לרכב הזה."});
  }

  // 6. תוקף רישיון
  if (r.licenseExpired != null){
    add({id: "license", label: "תוקף רישיון רכב", max: 8, src: r.mainSrc, scored: true,
      points: r.licenseExpired ? 8 : 0,
      explain: r.licenseExpired ? "רישיון הרכב אינו בתוקף. אי אפשר לנסוע ברכב עד חידוש וטסט." : "רישיון הרכב בתוקף."});
  }

  // 7–8. מקורות לא מחוברים – לא נבדק
  add({id: "accidents", label: "תאונות ותביעות ביטוח", max: 25, src: "claims", scored: false, points: 0,
    explain: "לא נבדק – מקור המידע (מרכז הסליקה) לא מחובר. חובה להפיק דוח לפני רכישה."});
  add({id: "liens", label: "שעבודים ועיקולים", max: 30, src: "liens", scored: false, points: 0,
    explain: "לא נבדק – רשם המשכונות לא מחובר. חובה לבדוק לפני תשלום."});

  const scored = C.filter(c => c.scored);
  const score = Math.min(100, scored.reduce((a, c) => a + c.points, 0));
  const maxAll = C.reduce((a, c) => a + c.max, 0);
  const coverage = Math.round(scored.reduce((a, c) => a + c.max, 0) / maxAll * 100);
  const level = LEVELS.find(l => score <= l.max);
  return {score, level, coverage, components: C};
}
