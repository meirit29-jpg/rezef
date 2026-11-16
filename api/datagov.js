/* Vercel Serverless Function – פרוקסי ל-data.gov.il
 * למה: מטמון ב-CDN (פחות עומס, תשובה מהירה), מקום אחד להוסיף בעתיד מכסות ומפתחות של ספקים בתשלום,
 * ולוג תפעולי. הלקוח (car/js/datagov.js) נופל חזרה לקריאה ישירה אם הפרוקסי לא קיים (למשל GitHub Pages).
 *
 * GET /api/datagov?action=datastore_search&resource_id=<id>&filters=<json>&limit=<n>
 * GET /api/datagov?action=resource_show&id=<id>
 *
 * פרטיות: מספר הרכב לא נכתב ללוג.
 */
const UPSTREAM = "https://data.gov.il/api/3/action/";

// רק המאגרים שהמערכת משתמשת בהם (זהה ל-car/js/sources.js)
const ALLOWED = new Set([
  "053cea08-09bc-40ec-8f7a-156f0677aff3", // כלי רכב פעילים
  "f6efe89a-fb3d-43a4-bb61-9bf12a9b9099", // לא פעילים
  "851ecab1-0622-4dbe-a6c7-f950cf82abf9", // ביטול סופי
  "bb2355dc-9ec7-4f06-9c3f-3344672171da", // היסטוריית בעלויות
  "56063a99-8a3e-4ff4-912e-5966c0279bad", // ק"מ ושינויי מבנה
  "39f455bf-6db0-4926-859d-017f34eacbcb", // מחירון רכב חדש
  "142afde2-6228-49f9-8a29-9b6c3a0cbe40"  // תוצרים ודגמים
]);

const CACHE = "public, s-maxage=21600, stale-while-revalidate=86400"; // 6 שעות ב-CDN
const MAX_LIMIT = 200;

function bad(res, status, msg){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({success: false, error: msg}));
}

function buildUpstream(q){
  const action = String(q.action || "");
  if (action === "datastore_search"){
    const rid = String(q.resource_id || "");
    if (!ALLOWED.has(rid)) return {error: "resource not allowed"};
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.limit, 10) || 100));
    const params = new URLSearchParams({resource_id: rid, limit: String(limit)});
    if (q.filters != null){
      try{
        const f = JSON.parse(String(q.filters));
        if (!f || typeof f !== "object" || Array.isArray(f)) return {error: "bad filters"};
        params.set("filters", JSON.stringify(f));
      }catch{ return {error: "bad filters"}; }
    }
    return {url: UPSTREAM + "datastore_search?" + params, resource: rid, action};
  }
  if (action === "resource_show"){
    const id = String(q.id || "");
    if (!ALLOWED.has(id)) return {error: "resource not allowed"};
    return {url: UPSTREAM + "resource_show?" + new URLSearchParams({id}), resource: id, action};
  }
  return {error: "unknown action"};
}

async function handler(req, res){
  if (req.method !== "GET") return bad(res, 405, "method not allowed");
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const up = buildUpstream(q);
  if (up.error) return bad(res, 400, up.error);

  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try{
    const r = await fetch(up.url, {signal: ctl.signal, headers: {"Accept": "application/json", "User-Agent": "rezef-car/1.0"}});
    const body = await r.text();
    console.log(JSON.stringify({evt: "datagov", action: up.action, resource: up.resource.slice(0, 8), status: r.status, ms: Date.now() - t0}));
    if (!r.ok) return bad(res, 502, "upstream " + r.status);
    let j; try{ j = JSON.parse(body); }catch{ return bad(res, 502, "upstream invalid json"); }
    if (!j.success) return bad(res, 502, "upstream error");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", CACHE);
    res.end(body);
  }catch(e){
    console.log(JSON.stringify({evt: "datagov", action: up.action, resource: up.resource.slice(0, 8), error: e.name === "AbortError" ? "timeout" : "network", ms: Date.now() - t0}));
    bad(res, 504, e.name === "AbortError" ? "upstream timeout" : "upstream unreachable");
  }finally{ clearTimeout(timer); }
}

module.exports = handler;
module.exports.buildUpstream = buildUpstream;
module.exports.ALLOWED = ALLOWED;
