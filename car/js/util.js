/* כלי עזר משותפים – ללא תלות ב-DOM, כדי שאפשר יהיה לבדוק אותם ב-Node */

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const nis = n => "₪ " + Math.round(Number(n)).toLocaleString("he-IL");
export const num = n => Number(n).toLocaleString("he-IL");
export const cleanPlate = s => String(s ?? "").replace(/\D/g, "");

export const fmtPlate = p => p.length === 8 ? `${p.slice(0,3)}-${p.slice(3,5)}-${p.slice(5)}`
  : p.length === 7 ? `${p.slice(0,2)}-${p.slice(2,5)}-${p.slice(5)}` : p;

/** תאריכים במאגרי משרד התחבורה מגיעים בכמה פורמטים: 202306, 2023-6, ISO */
export function fmtDate(v){
  if (v == null || v === "") return "—";
  const s = String(v);
  if (/^\d{6}$/.test(s)) return s.slice(4) + "/" + s.slice(0,4);
  if (/^\d{4}-\d{1,2}$/.test(s)) { const [y,m] = s.split("-"); return m.padStart(2,"0") + "/" + y; }
  const d = new Date(s);
  if (!isNaN(d)) return d.toLocaleDateString("he-IL");
  return s;
}
export function fmtDateTime(v){
  const d = new Date(v);
  return isNaN(d) ? "—" : d.toLocaleString("he-IL", {dateStyle:"short", timeStyle:"short"});
}

/** מחזיר Date מתאריך מאגר (חודש/שנה או ISO) או null */
export function parseDate(v){
  if (v == null || v === "") return null;
  const s = String(v);
  let m = s.match(/^(\d{4})(\d{2})$/); if (m) return new Date(+m[1], +m[2]-1, 15);
  m = s.match(/^(\d{4})-(\d{1,2})$/);   if (m) return new Date(+m[1], +m[2]-1, 15);
  const d = new Date(s); return isNaN(d) ? null : d;
}

/** בחירת שדה לפי תבנית שם – המאגרים משנים לפעמים שמות עמודות */
export const pick = (rec, re) => {
  if (!rec) return undefined;
  const k = Object.keys(rec).find(k => re.test(k));
  return k ? rec[k] : undefined;
};
export const present = v => v !== undefined && v !== null && String(v).trim() !== "";
