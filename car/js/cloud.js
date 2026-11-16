/* חיבור ל-Supabase (REST + Auth) – אותו דפוס כמו באפליקציית הכושר, עם מפתחות אחסון נפרדים.
 * כל הפונקציות שקטות: אם אין חיבור, הן מחזירות null ולא שוברות את הבדיקה. */
import { SB_URL, SB_KEY } from "./config.js";

const CFG = "rezef_car_sb_cfg", SESS = "rezef_car_sb_session", FIT_CFG = "rezef_sb_cfg";
const read = k => { try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch{ return null; } };
const write = (k, v) => { try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); }catch{} };

export function cfg(){
  const c = read(CFG) || read(FIT_CFG) || {};
  return {url: String(SB_URL || c.url || "").replace(/\/+$/, ""), key: String(SB_KEY || c.key || "")};
}
export const configured = () => { const c = cfg(); return !!(c.url && c.key); };
export const saveCfg = (url, key) => write(CFG, {url: url.trim(), key: key.trim()});
export const session = () => read(SESS);
export const signedIn = () => !!(configured() && session());

async function http(url, opt){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try{ return await fetch(url, {...opt, signal: ctl.signal}); } finally { clearTimeout(t); }
}
function err(msg, status){ const e = new Error(msg); e.status = status; return e; }

async function auth(path, body){
  const c = cfg();
  if (!c.url || !c.key) throw err("הענן לא מוגדר", 0);
  const r = await http(c.url + "/auth/v1/" + path, {method: "POST", headers: {apikey: c.key, "Content-Type": "application/json"}, body: JSON.stringify(body)});
  let j = {}; try{ j = await r.json(); }catch{}
  if (!r.ok) throw err(j.error_description || j.msg || j.message || ("HTTP " + r.status), r.status);
  if (!j.access_token) return {pending: true}; // הרשמה שדורשת אימות מייל
  const s = {access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    uid: j.user && j.user.id, email: (j.user && j.user.email) || body.email || ""};
  if (!s.uid){ const old = session(); if (old){ s.uid = old.uid; s.email = s.email || old.email; } }
  write(SESS, s); return s;
}
export const signIn = (email, password) => auth("token?grant_type=password", {email, password});
export const signUp = (email, password) => auth("signup", {email, password});
export const signOut = () => write(SESS, null);

let refreshing = null;
async function token(force){
  const s = session();
  if (!s) throw err("לא מחובר", 401);
  if (!force && s.expires_at - 60 > Date.now() / 1000) return s;
  refreshing ||= auth("token?grant_type=refresh_token", {refresh_token: s.refresh_token})
    .catch(e => { if ([400, 401, 403].includes(e.status)) signOut(); throw e; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** קריאת REST. anon=true מאפשר קריאה גם בלי משתמש מחובר (למשל רישום אירוע אנונימי) */
export async function rest(method, path, body, {anon = false, headers = {}} = {}){
  const c = cfg();
  if (!c.url || !c.key) throw err("הענן לא מוגדר", 0);
  for (let attempt = 0; attempt < 2; attempt++){
    let bearer = c.key;
    if (session()) bearer = (await token(attempt > 0)).access_token;
    else if (!anon) throw err("לא מחובר", 401);
    const r = await http(c.url + "/rest/v1/" + path, {method,
      headers: {apikey: c.key, Authorization: "Bearer " + bearer, "Content-Type": "application/json", ...headers},
      body: body ? JSON.stringify(body) : undefined});
    if (r.status === 401 && attempt === 0 && session()) continue;
    if (!r.ok){ let t = ""; try{ t = await r.text(); }catch{} throw err("HTTP " + r.status + (t ? " " + t : ""), r.status); }
    if (r.status === 204) return null;
    const txt = await r.text(); return txt ? JSON.parse(txt) : null;
  }
}

/* ---- פעולות ברמת המוצר ---- */
export async function logEvent(kind){
  if (!configured()) return;
  const s = session();
  try{ await rest("POST", "car_events", {kind, user_id: s ? s.uid : null}, {anon: true, headers: {Prefer: "return=minimal"}}); }catch{}
}
export async function myProfile(){
  if (!signedIn()) return null;
  try{ const rows = await rest("GET", "car_profiles?select=plan,role,credits&user_id=eq." + session().uid); return rows && rows[0] || null; }
  catch{ return null; }
}
export async function cloudSaveReport(entry){
  if (!signedIn()) return false;
  await rest("POST", "car_saved_reports", {id: entry.id, plate: entry.plate, label: entry.label, report: entry.report},
    {headers: {Prefer: "resolution=merge-duplicates,return=minimal"}});
  return true;
}
export async function cloudListReports(){
  if (!signedIn()) return null;
  return rest("GET", "car_saved_reports?select=id,plate,label,report,created_at&order=created_at.desc&limit=100");
}
export async function cloudDeleteReport(id){
  if (!signedIn()) return;
  await rest("DELETE", "car_saved_reports?id=eq." + encodeURIComponent(id));
}
export async function cloudFavorites(){
  if (!signedIn()) return null;
  return rest("GET", "car_favorites?select=plate,label,created_at&order=created_at.desc");
}
export async function cloudSetFavorite(plate, label, on){
  if (!signedIn()) return;
  if (on) await rest("POST", "car_favorites", {plate, label}, {headers: {Prefer: "resolution=merge-duplicates,return=minimal"}});
  else await rest("DELETE", "car_favorites?plate=eq." + encodeURIComponent(plate));
}
export const adminStats = () => rest("POST", "rpc/car_admin_stats", {});

export function friendly(e){
  const m = String((e && e.message) || "");
  if (/api key|apikey/i.test(m)) return "מפתח ה-API שגוי";
  if (e && [400, 401, 403].includes(e.status)) return "אימייל או סיסמה שגויים, או שאין הרשאה";
  if ((e && e.name === "AbortError") || /failed to fetch|network|load failed/i.test(m)) return "אין חיבור, או שהכתובת שגויה";
  return m || "שגיאה";
}
