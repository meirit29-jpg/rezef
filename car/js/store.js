/* אזור אישי: היסטוריה, בדיקות שמורות ומועדפים.
 * תמיד נשמר במכשיר. אם המשתמש מחובר לענן – נשמר גם ב-Supabase ומוצג משם. */
import * as cloud from "./cloud.js";
import { slimReport } from "./report.js";

const K = {hist: "carHist", saved: "carSaved_v1", fav: "carFav_v1"}; // carHist – אותו מפתח כמו בגרסה הקודמת
const read = k => { try{ return JSON.parse(localStorage.getItem(k) || "[]"); }catch{ return []; } };
const write = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch{ return false; } };

export const labelOf = r => `${r.title} ${r.year || ""}`.trim();

/* היסטוריה – כל בדיקה שבוצעה (תאימות לאחור: {p, label}) */
export function history(){ return read(K.hist); }
export function addHistory(r){
  const h = read(K.hist).filter(x => x.p !== r.plate);
  h.unshift({p: r.plate, label: labelOf(r), at: r.checkedAt});
  write(K.hist, h.slice(0, 30));
}
export function clearHistory(){ write(K.hist, []); }

/* בדיקות שמורות – תמונת מצב של הדוח ביום הבדיקה */
export function savedLocal(){ return read(K.saved); }
export async function saveReport(r){
  const entry = {id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), plate: r.plate, label: labelOf(r), savedAt: new Date().toISOString(), report: slimReport(r)};
  const list = read(K.saved); list.unshift(entry);
  const okLocal = write(K.saved, list.slice(0, 50));
  let okCloud = false;
  try{ okCloud = await cloud.cloudSaveReport(entry); }catch{}
  return {okLocal, okCloud};
}
export async function listSaved(){
  if (cloud.signedIn()){
    try{
      const rows = await cloud.cloudListReports();
      if (rows) return {where: "cloud", items: rows.map(x => ({id: x.id, plate: x.plate, label: x.label, savedAt: x.created_at, report: x.report}))};
    }catch{}
  }
  return {where: "local", items: savedLocal()};
}
export async function deleteSaved(id){
  write(K.saved, read(K.saved).filter(x => x.id !== id));
  try{ await cloud.cloudDeleteReport(id); }catch{}
}

/* מועדפים */
export function favLocal(){ return read(K.fav); }
export const isFav = plate => favLocal().some(f => f.plate === plate);
export async function toggleFav(plate, label){
  const on = !isFav(plate);
  const list = favLocal().filter(f => f.plate !== plate);
  if (on) list.unshift({plate, label, at: new Date().toISOString()});
  write(K.fav, list);
  try{ await cloud.cloudSetFavorite(plate, label, on); }catch{}
  return on;
}
export async function listFav(){
  if (cloud.signedIn()){
    try{ const rows = await cloud.cloudFavorites(); if (rows) return {where: "cloud", items: rows.map(x => ({plate: x.plate, label: x.label, at: x.created_at}))}; }catch{}
  }
  return {where: "local", items: favLocal()};
}
