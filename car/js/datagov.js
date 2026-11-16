/* גישה ל-data.gov.il (CKAN).
 * fetch רגיל, ואם CORS נחסם – JSONP (כמו בגרסה הקודמת שעבדה).
 * לכל משאב נשלף גם תאריך העדכון האחרון שלו (resource_show) ונשמר בזיכרון ל-6 שעות. */
import { DATAGOV, SOURCES } from "./sources.js";

const API = DATAGOV + "/api/3/action/";

async function call(action, params){
  const url = API + action + "?" + new URLSearchParams(params).toString();
  try{
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, {signal: ctl.signal}); clearTimeout(t);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (!j.success) throw new Error("API error");
    return j.result;
  }catch(e){
    return jsonp(url);
  }
}

function jsonp(url){
  return new Promise((res, rej) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const done = () => { delete window[cb]; s.remove(); };
    const t = setTimeout(() => { done(); rej(new Error("timeout")); }, 15000);
    window[cb] = j => { clearTimeout(t); done(); j && j.success ? res(j.result) : rej(new Error("API error")); };
    s.onerror = () => { clearTimeout(t); done(); rej(new Error("network")); };
    s.src = url + "&callback=" + cb;
    document.head.appendChild(s);
  });
}

export async function search(sourceId, filters, limit = 100){
  const src = SOURCES[sourceId];
  const r = await call("datastore_search", {resource_id: src.resource, filters: JSON.stringify(filters), limit});
  return r.records || [];
}
export const byPlate = (sourceId, plate) => search(sourceId, {mispar_rechev: Number(plate)});

/* ---- מטא-דאטה: תאריך עדכון של כל מאגר ---- */
const META_KEY = "carMeta_v1", META_TTL = 6 * 3600e3;
let metaMem = null;
function metaCache(){
  if (metaMem) return metaMem;
  try{ metaMem = JSON.parse(sessionStorage.getItem(META_KEY) || "{}"); }catch{ metaMem = {}; }
  return metaMem;
}
export async function resourceMeta(sourceId){
  const c = metaCache(), hit = c[sourceId];
  if (hit && Date.now() - hit.at < META_TTL) return hit.meta;
  try{
    const r = await call("resource_show", {id: SOURCES[sourceId].resource});
    const meta = {
      updated: r.last_modified || r.metadata_modified || null,
      package_id: r.package_id || null
    };
    c[sourceId] = {at: Date.now(), meta};
    try{ sessionStorage.setItem(META_KEY, JSON.stringify(c)); }catch{}
    return meta;
  }catch{
    return {updated: null, package_id: null, error: true};
  }
}
