/* מנוע הערכת שווי.
 * 1. מחיר מבוקש מול מחירון רכב חדש (נתון רשמי – משרד התחבורה).
 * 2. מחיר מבוקש מול הערכת מודל פחת (חישוב המערכת – מסומן תמיד כ"הערכה").
 * 3. השוואה למחירי רכבים דומים – לא מחובר (אין מקור מורשה). */

/** מודל הפחת מהגרסה הקודמת: ~15% בשנה הראשונה, ~10% בכל שנה נוספת, תיקונים לק״מ/ידיים/סוג בעלות */
export function modelEstimate({newPrice, age, km, owners}){
  if (!newPrice || age == null) return null;
  const lines = [];
  const y1 = Math.min(age, 1), rest = Math.max(0, age - 1);
  const base = newPrice * (1 - 0.15 * y1) * Math.pow(0.90, rest);
  lines.push({t: `גיל ${age.toFixed(1)} שנים`, pct: base / newPrice - 1});
  let adj = 0;
  if (km != null && !isNaN(km)){
    const expected = age * 15000, diff = km - expected;
    const k = diff > 0 ? -Math.min(0.12, diff / 10000 * 0.025) : Math.min(0.08, -diff / 10000 * 0.015);
    adj += k; lines.push({t: `ק״מ ${Math.round(km).toLocaleString("he-IL")} (ממוצע לגיל: ${Math.round(expected).toLocaleString("he-IL")})`, pct: k});
  }
  if (owners){
    const handAdj = -Math.min(0.12, Math.max(0, owners.n - 1) * 0.03);
    if (handAdj){ adj += handAdj; lines.push({t: `יד ${owners.n}`, pct: handAdj}); }
    const typeAdj = {"השכרה": -0.12, "ליסינג": -0.08, "חברה": -0.05}[owners.firstType] || 0;
    if (typeAdj){ adj += typeAdj; lines.push({t: `מקור: ${owners.firstType}`, pct: typeAdj}); }
    const c = owners.counts || {};
    const extra = ((c["ליסינג"] || 0) + (c["השכרה"] || 0) + (c["חברה"] || 0)) - (typeAdj ? 1 : 0);
    if (extra > 0){ const a = -Math.min(0.06, extra * 0.03); adj += a; lines.push({t: "בעלויות מסחריות נוספות", pct: a}); }
  }
  const value = base * (1 + adj);
  return {value, low: value * 0.93, high: value * 1.07, lines};
}

export function compareAsking({asking, newPrice, estimate}){
  const out = {asking, items: []};
  if (!asking) return out;
  if (newPrice){
    out.items.push({
      id: "vs_new", status: "verified", src: "mot_prices",
      label: "ביחס למחיר רכב חדש (מחירון יבואן)",
      pct: asking / newPrice.value, text: `${Math.round(asking / newPrice.value * 100)}% ממחיר הרכב כשהיה חדש`
    });
  } else {
    out.items.push({id: "vs_new", status: "unavailable", src: "mot_prices", label: "ביחס למחיר רכב חדש", text: "אין מחיר במחירון לקוד הדגם הזה"});
  }
  if (estimate){
    let verdict, tone;
    if (asking > estimate.high){ verdict = "המחיר המבוקש גבוה מטווח ההערכה"; tone = "warn"; }
    else if (asking < estimate.low * 0.85){ verdict = "המחיר המבוקש נמוך משמעותית מההערכה – כדאי לברר למה"; tone = "warn"; }
    else if (asking < estimate.low){ verdict = "המחיר המבוקש מתחת לטווח ההערכה"; tone = "ok"; }
    else { verdict = "המחיר המבוקש בתוך טווח ההערכה"; tone = "ok"; }
    out.items.push({
      id: "vs_model", status: "estimate", src: "model_value", tone,
      label: "ביחס להערכת מודל הפחת",
      pct: asking / estimate.value - 1, text: verdict
    });
  } else {
    out.items.push({id: "vs_model", status: "unavailable", src: "model_value", label: "ביחס להערכת מודל", text: "אין מספיק נתונים לחישוב (חסר מחיר חדש או תאריך עלייה לכביש)"});
  }
  out.items.push({id: "vs_market", status: "not_connected", src: "market", label: "ביחס לרכבים דומים בשוק", text: "מקור מחירי שוק לא מחובר"});
  return out;
}
