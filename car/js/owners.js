/* סיווג בעלויות – הלוגיקה מהגרסה הקודמת, ללא שינוי התנהגות */
import { pick } from "./util.js";

export function classifyOwner(t){
  t = String(t || "");
  if (/ליסינג/.test(t)) return "ליסינג";
  if (/השכר/.test(t)) return "השכרה";
  if (/חבר|תאגיד|ממשל|מסחר/.test(t)) return "חברה";
  if (/פרטי/.test(t)) return "פרטי";
  return t ? "אחר" : "פרטי";
}

export function ownersInfo(owners, car){
  const rows = (owners || [])
    .map(o => ({date: pick(o, /baalut_dt|_dt$|date/i), type: o.baalut ?? pick(o, /baalut(?!_dt)/i)}))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const counts = {"פרטי":0, "ליסינג":0, "השכרה":0, "חברה":0, "אחר":0};
  rows.forEach(r => counts[classifyOwner(r.type)]++);
  return {
    rows, n: rows.length || 1, counts,
    hasHistory: rows.length > 0,
    firstType: rows.length ? classifyOwner(rows[0].type) : classifyOwner(car && car.baalut)
  };
}
