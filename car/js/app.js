import { esc, nis, num, fmtPlate, fmtDate, fmtDateTime, cleanPlate } from "./util.js";
import { SOURCES, resourceUrl } from "./sources.js";
import { buildReport } from "./report.js";
import { riskScore } from "./risk.js";
import { modelEstimate, compareAsking } from "./valuation.js";
import { recommendations } from "./recommend.js";
import { loadTesseract, loadImage, recognizePlate } from "./ocr.js";
import * as store from "./store.js";
import * as cloud from "./cloud.js";
import { PLANS, FEATURE_NAMES, can, priceLabel } from "./plans.js";

const $ = id => document.getElementById(id);
const UI = {report: null, snapshotOf: null, profile: null};

/* ================= ניווט ================= */
function tab(name){
  document.querySelectorAll("[data-view]").forEach(v => v.hidden = v.dataset.view !== name);
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
  if (name === "me") renderMe();
  if (name === "compare") renderCompareSlots();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => tab(b.dataset.tab));

/* ================= רכיבי תצוגה ================= */
const srcDate = (r, id) => {
  const s = r.sources && r.sources[id];
  return s && s.updated ? fmtDate(s.updated) : "תאריך עדכון לא ידוע";
};
const srcTag = (r, id) => {
  const S = SOURCES[id]; if (!S) return "";
  if (S.status === "open") return `<div class="src">${esc(S.short)} · ${esc(srcDate(r, id))}</div>`;
  if (S.status === "model") return `<div class="src est">${esc(S.short)} · הערכה</div>`;
  return `<div class="src na">${esc(S.short)} · לא מחובר</div>`;
};
const fact = (r, f) => `<div class="kv">
  <div class="k">${esc(f.k)}</div>
  <div class="v${f.missing ? " na" : ""}">${f.missing ? (sourceDown(r, f.src) ? "המקור לא זמין כרגע" : "לא קיים במאגר") : esc(f.v)}</div>
  ${srcTag(r, f.src)}</div>`;
const sourceDown = (r, id) => r.sources && r.sources[id] && r.sources[id].state === "error";

function notConnected(ids){
  return ids.map(id => {
    const S = SOURCES[id];
    return `<div class="nc">
      <div class="nc-h"><span class="badge na">לא נבדק</span><b>${esc(S.covers)}</b></div>
      <div class="sub">מקור: ${esc(S.name)} — <b>לא מחובר למערכת</b>. ${esc(S.how)}</div>
      ${S.url ? `<a class="lnk sm noprint" href="${S.url}" target="_blank" rel="noopener" data-copy>לבדיקה במקור הרשמי ←</a>` : ""}
    </div>`;
  }).join("");
}

/* ================= בדיקה ================= */
$("f").onsubmit = e => {
  e.preventDefault();
  const p = cleanPlate($("plate").value);
  if (p.length < 5 || p.length > 8) return show(`<div class="card err">יש להזין מספר רישוי תקין (7–8 ספרות)</div>`);
  run(p);
};
function show(html){ $("out").innerHTML = html; }

async function run(plate){
  $("go").disabled = true;
  show(`<div class="card"><span class="spin"></span> מחפש במאגרי משרד התחבורה…</div>`);
  try{
    const r = await buildReport(plate);
    if (!r){ show(`<div class="card err">לא נמצא רכב עם מספר ${fmtPlate(plate)} במאגרי משרד התחבורה</div>`); return; }
    UI.report = r; UI.snapshotOf = null;
    store.addHistory(r); renderHist();
    renderReport(r);
    cloud.logEvent("check");
  }catch(e){
    show(`<div class="card err">${esc(e.message)}. נסו שוב בעוד רגע.</div>`);
  }finally{ $("go").disabled = false; }
}

function renderReport(r, opts = {}){
  const risk = riskScore(r);
  const fav = store.isFav(r.plate);
  const o = r.owners;
  let h = "";

  if (opts.snapshot) h += `<div class="card banner noprint">📁 דוח שמור מ-${esc(fmtDateTime(r.checkedAt))}. הנתונים נכונים ליום הבדיקה.
    <button class="btn sm" id="rerun">בדוק שוב עכשיו</button></div>`;

  /* --- כותרת --- */
  h += `<div class="card head">
    <div class="print-only ph">דוח בדיקת רכב לפני רכישה</div>
    <div class="row between"><span class="pl">${fmtPlate(r.plate)}</span>
      <span class="badge ${r.statusKind === "active" ? "ok" : "bad"}">${esc(r.statusLabel)}</span></div>
    <p class="big">${esc(r.title || "—")}</p>
    <div class="sub">${esc(r.subtitle)}</div>
    <div class="sub small">תאריך הבדיקה: ${esc(fmtDateTime(r.checkedAt))}</div>
    <div class="actions noprint">
      <button class="btn" id="aFav">${fav ? "★ במועדפים" : "☆ למועדפים"}</button>
      <button class="btn" id="aSave">💾 שמור בדיקה</button>
      <button class="btn" id="aCmp">⚖️ להשוואה</button>
      <button class="btn pri" id="aPdf">📄 דוח PDF</button>
    </div>
  </div>`;

  /* --- מדד סיכון --- */
  h += `<div class="card">
    <h2>מדד סיכון</h2>
    <div class="risk ${risk.level.id}">
      <div class="score">${risk.score}<small>/100</small></div>
      <div><b>${esc(risk.level.label)}</b>
        <div class="sub">כיסוי הבדיקה: ${risk.coverage}% מהרכיבים נבדקו</div>
        <div class="bar"><i style="width:${risk.coverage}%"></i></div></div>
    </div>
    ${risk.coverage < 100 ? `<div class="warnbox">⚠ הציון לא כולל רכיבים שלא נבדקו (תאונות, שעבודים). ציון נמוך אינו אומר שהרכב "נקי".</div>` : ""}
    <div class="comps">${risk.components.map(c => `<div class="comp${c.scored ? "" : " off"}">
      <div class="row between"><b>${esc(c.label)}</b>
        <span class="${c.scored ? (c.points ? "neg" : "pos") : "mute"}">${c.scored ? `${c.points}/${c.max}` : "לא נבדק"}</span></div>
      <div class="sub">${esc(c.explain)}</div>${srcTag(r, c.src)}</div>`).join("")}</div>
    <div class="note">0 = לא נמצאו סימני סיכון בנתונים שנבדקו, 100 = סיכון גבוה מאוד. הניקוד מבוסס רק על נתונים ממקורות רשמיים פתוחים.</div>
  </div>`;

  /* --- פרטי רכב --- */
  h += `<div class="card"><h2>פרטי הרכב</h2>
    <div class="grid">${r.facts.identity.map(f => fact(r, f)).join("")}</div>
    <h3>מפרט</h3>
    <div class="grid">${r.facts.specs.map(f => fact(r, f)).join("")}</div>
    ${r.specApprox ? `<div class="note warn">נתוני המפרט נלקחו מאותו קוד דגם בשנת ייצור אחרת (אין רשומה לשנה הזו).</div>` : ""}
  </div>`;

  /* --- רישום ובעלות --- */
  h += `<div class="card"><h2>רישום ובעלות</h2>
    <div class="grid">${r.facts.registration.map(f => fact(r, f)).join("")}</div>`;
  if (o.hasHistory){
    const chips = Object.entries(o.counts).filter(([, v]) => v).map(([k, v]) => `<span class="chip ${k === "פרטי" ? "ok" : "bad"}">${k} × ${v}</span>`).join("");
    h += `<h3>היסטוריית בעלויות</h3><div class="chips">${chips}</div>
      <table><tr><th>#</th><th>מתאריך</th><th>סוג בעלות</th></tr>
      ${o.rows.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(fmtDate(x.date))}</td><td>${esc(x.type || "—")}</td></tr>`).join("")}</table>
      ${srcTag(r, "mot_owners")}`;
  } else {
    h += `<div class="note warn">${sourceDown(r, "mot_owners") ? "מאגר היסטוריית הבעלויות לא זמין כרגע." : "אין היסטוריית בעלויות במאגר לרכב הזה."}</div>`;
  }
  h += `<div class="note">${esc(SOURCES.mot_owners.coverage)}.</div></div>`;

  /* --- טכני / ק״מ --- */
  h += `<div class="card"><h2>קילומטראז׳ ומבנה</h2>
    <div class="grid">${r.facts.tech.map(f => fact(r, f)).join("")}</div>
    <div class="note">${esc(SOURCES.mot_tech.coverage)}. היסטוריית ק״מ מלאה אינה זמינה במקורות ציבוריים.</div></div>`;

  /* --- עבר הרכב --- */
  h += `<div class="card"><h2>עבר הרכב: תאונות, תביעות, טיפולים</h2>
    ${notConnected(["claims", "service"])}</div>`;

  /* --- שעבודים --- */
  h += `<div class="card"><h2>שעבודים, עיקולים והגבלות</h2>
    ${notConnected(["liens", "seizures"])}</div>`;

  /* --- שווי --- */
  const np = r.newPrice;
  h += `<div class="card" id="valCard"><h2>הערכת שווי</h2>
    <h3>מחירון רכב חדש</h3>
    ${np ? `<div class="price">${np.min !== np.max ? `${nis(np.min)} – ${nis(np.max)}` : nis(np.value)}</div>
      <div class="sub">${esc(np.name || "")} · שנת ${np.year}${np.importer ? " · " + esc(np.importer) : ""}</div>
      ${np.approx ? `<div class="note warn">אין מחיר לשנת ${r.year} – מוצג מחיר שנת ${np.year} של אותו קוד דגם.</div>` : ""}
      ${srcTag(r, "mot_prices")}`
      : `<div class="warn">${sourceDown(r, "mot_prices") ? "המחירון לא זמין כרגע." : "לא נמצא מחיר לקוד הדגם הזה במחירון הממשלתי (דגם ישן, יבוא אישי או שלא דווח)."}</div>`}
    <div class="note">${esc(SOURCES.mot_prices.coverage)}.</div>
    <h3>השוואת מחיר מבוקש</h3>
    <div class="grid">
      <label class="kv"><div class="k">מחיר מבוקש (₪)</div><input class="inp" id="vAsk" inputmode="numeric" placeholder="הזינו מחיר"></label>
      <label class="kv"><div class="k">ק״מ נוכחי</div><input class="inp" id="vKm" inputmode="numeric" value="${r.km ?? ""}" placeholder="${r.km == null ? "לא במאגר" : ""}"></label>
    </div>
    <div id="vOut"></div>
  </div>`;

  /* --- המלצות --- */
  h += `<div class="card"><h2>המלצות לקונה</h2><ul class="recs" id="recs"></ul></div>`;

  /* --- מקורות --- */
  h += `<div class="card"><h2>מקורות המידע בדוח</h2><table class="srcs">
    <tr><th>מקור</th><th>מצב</th><th>עודכן</th></tr>
    ${Object.entries(r.sources).map(([id, s]) => `<tr><td>${s.package_id ? `<a href="${resourceUrl(s, SOURCES[id])}" target="_blank" rel="noopener">${esc(SOURCES[id].name)}</a>` : esc(SOURCES[id].name)}</td>
      <td>${s.state === "ok" ? `<span class="pos">נשלף</span>` : s.state === "empty" ? `<span class="mute">אין רשומה לרכב</span>` : `<span class="neg">לא זמין כרגע</span>`}</td>
      <td>${s.updated ? esc(fmtDate(s.updated)) : "לא ידוע"}</td></tr>`).join("")}
    ${["claims", "liens", "seizures", "service", "market"].map(id => `<tr><td>${esc(SOURCES[id].name)}</td><td><span class="neg">לא מחובר</span></td><td>—</td></tr>`).join("")}
    <tr><td>${esc(SOURCES.model_value.name)}</td><td><span class="mute">חישוב / הערכה</span></td><td>—</td></tr>
  </table>
  <div class="note">הדוח מבוסס על מאגרי מידע פתוחים של משרד התחבורה (data.gov.il) נכון לתאריך הבדיקה. הוא אינו מחליף בדיקה במכון מורשה, בדיקת שעבודים ודוח תביעות ביטוח. המערכת אינה מציגה מידע ממקורות שאינם מחוברים.</div></div>`;

  if (r.raw) h += `<div class="card noprint"><details><summary>נתונים גולמיים מהמאגרים</summary><pre>${esc(JSON.stringify(r.raw, null, 2))}</pre></details></div>`;

  show(h);

  /* --- אינטראקציה --- */
  const updVal = () => {
    const asking = Number(($("vAsk").value || "").replace(/\D/g, "")) || null;
    const kmTxt = ($("vKm").value || "").replace(/\D/g, "");
    const km = kmTxt === "" ? null : Number(kmTxt);
    const est = r.newPrice ? modelEstimate({newPrice: r.newPrice.value, age: r.age, km, owners: r.owners}) : null;
    const cmp = compareAsking({asking, newPrice: r.newPrice, estimate: est});
    const pct = x => (x > 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
    let v = "";
    if (est){
      v += `<h3>הערכת מודל <span class="badge est">הערכה – לא מחירון</span></h3>
        <div class="price">${nis(Math.round(est.value / 500) * 500)}</div>
        <div class="sub">טווח: ${nis(Math.round(est.low / 500) * 500)} – ${nis(Math.round(est.high / 500) * 500)}</div>
        <table>${est.lines.map(l => `<tr><td>${esc(l.t)}</td><td class="num ${l.pct < 0 ? "neg" : "pos"}">${pct(l.pct)}</td></tr>`).join("")}</table>
        <div class="note">${esc(SOURCES.model_value.how)}</div>`;
    }
    if (asking){
      v += `<h3>מחיר מבוקש: ${nis(asking)}</h3>` + cmp.items.map(i => `<div class="cmpi">
        <div class="row between"><b>${esc(i.label)}</b>${i.status === "verified" ? `<span class="badge ok">נתון רשמי</span>` : i.status === "estimate" ? `<span class="badge est">הערכה</span>` : `<span class="badge na">${i.status === "not_connected" ? "לא מחובר" : "אין נתון"}</span>`}</div>
        <div class="${i.tone === "warn" ? "warn" : "sub"}">${esc(i.text)}${i.id === "vs_model" && i.status === "estimate" ? ` (${pct(i.pct)})` : ""}</div></div>`).join("");
    } else v += `<div class="note">הזינו מחיר מבוקש כדי לקבל השוואה.</div>`;
    $("vOut").innerHTML = v;
    $("recs").innerHTML = recommendations(r, risk, cmp).map(x => `<li class="${x.level}">${esc(x.text)}</li>`).join("");
  };
  $("vAsk").oninput = $("vKm").oninput = updVal; updVal();

  $("aFav").onclick = async () => { const on = await store.toggleFav(r.plate, store.labelOf(r)); $("aFav").textContent = on ? "★ במועדפים" : "☆ למועדפים"; };
  $("aSave").onclick = async () => {
    if (!gate("save")) return;
    $("aSave").disabled = true;
    const res = await store.saveReport(r);
    $("aSave").textContent = res.okCloud ? "✓ נשמר בענן" : res.okLocal ? "✓ נשמר במכשיר" : "השמירה נכשלה";
    cloud.logEvent("save");
  };
  $("aCmp").onclick = () => { addToCompare(r.plate); tab("compare"); };
  $("aPdf").onclick = () => { if (!gate("pdf")) return; cloud.logEvent("pdf"); window.print(); };
  if ($("rerun")) $("rerun").onclick = () => { $("plate").value = fmtPlate(r.plate); run(r.plate); };
  document.querySelectorAll("[data-copy]").forEach(a => a.addEventListener("click", () => { try{ navigator.clipboard.writeText(r.plate); }catch{} }));
}

function gate(feature){
  if (can(feature, UI.profile)) return true;
  alert(`${FEATURE_NAMES[feature]} זמין בחבילה בתשלום. פרטים באזור האישי ← חבילות.`);
  return false;
}

/* ================= היסטוריה מהירה ================= */
function renderHist(){
  $("hist").innerHTML = store.history().slice(0, 8).map(x => `<button data-p="${x.p}">${fmtPlate(x.p)} · ${esc(x.label || "")}</button>`).join("");
  $("hist").querySelectorAll("button").forEach(b => b.onclick = () => { $("plate").value = fmtPlate(b.dataset.p); run(b.dataset.p); });
}

/* ================= OCR (ללא שינוי) ================= */
$("photo").onchange = async e => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const st = $("ocr");
  st.innerHTML = `<span class="spin"></span> מזהה מספר מהתמונה… (בפעם הראשונה לוקח כמה שניות)`;
  try{
    const [img] = await Promise.all([loadImage(file), loadTesseract()]);
    const {plate, preview} = await recognizePlate(img, window.Tesseract);
    const prev = `<img id="ocrPrev" src="${preview.toDataURL("image/jpeg", 0.7)}" style="max-height:90px">`;
    if (plate){ $("plate").value = fmtPlate(plate); st.innerHTML = `זוהה: <b>${fmtPlate(plate)}</b> — אם לא נכון, תקנו ולחצו בדוק${prev}`; run(plate); }
    else st.innerHTML = `<span class="err">לא הצלחתי לזהות מספר.</span> נסו צילום קרוב וישר יותר, או הקלידו ידנית${prev}`;
  }catch(err){ st.innerHTML = `<span class="err">שגיאה בזיהוי: ${esc(err.message || err)}</span>`; }
};

/* ================= השוואה (עד 3) ================= */
const CMP_KEY = "carCmp_v1";
const cmpGet = () => { try{ return JSON.parse(sessionStorage.getItem(CMP_KEY) || '["","",""]'); }catch{ return ["", "", ""]; } };
const cmpSet = v => { try{ sessionStorage.setItem(CMP_KEY, JSON.stringify(v)); }catch{} };
function addToCompare(p){
  const s = cmpGet();
  if (s.includes(p)) return;
  const i = s.findIndex(x => !x); s[i >= 0 ? i : 2] = p; cmpSet(s);
}
function renderCompareSlots(){
  const s = cmpGet();
  document.querySelectorAll(".cmpIn").forEach((inp, i) => inp.value = s[i] ? fmtPlate(s[i]) : "");
}
$("cmpForm").onsubmit = async e => {
  e.preventDefault();
  if (!gate("compare")) return;
  const plates = [...document.querySelectorAll(".cmpIn")].map(i => cleanPlate(i.value)).filter(p => p.length >= 5);
  const uniq = [...new Set(plates)].slice(0, 3);
  cmpSet([...uniq, "", "", ""].slice(0, 3));
  if (uniq.length < 2){ $("cmpOut").innerHTML = `<div class="card err">הזינו לפחות שני מספרי רישוי</div>`; return; }
  $("cmpOut").innerHTML = `<div class="card"><span class="spin"></span> בודק ${uniq.length} רכבים…</div>`;
  const reps = await Promise.all(uniq.map(p => buildReport(p).then(r => r || {missing: p}, e => ({error: p, msg: e.message}))));
  const ok = reps.filter(r => r.plate);
  const bad = reps.filter(r => !r.plate);
  const rows = [
    ["דגם", r => r.title], ["שנה", r => r.year], ["רמת גימור", r => val(r, "identity", "רמת גימור")],
    ["נפח מנוע", r => val(r, "specs", "נפח מנוע (סמ״ק)")], ["סטטוס", r => r.statusLabel],
    ["יד", r => r.owners.hasHistory ? r.owners.n : "אין נתון"], ["מקור", r => r.owners.firstType],
    ["ק״מ (טסט אחרון)", r => r.km != null ? num(r.km) : "אין נתון"],
    ["ק״מ לשנה", r => r.km != null && r.age ? num(Math.round(r.km / r.age)) : "—"],
    ["תוקף רישיון", r => val(r, "registration", "תוקף רישיון")],
    ["מחיר חדש (מחירון)", r => r.newPrice ? nis(r.newPrice.value) + (r.newPrice.approx ? "*" : "") : "אין נתון"],
    ["מדד סיכון", r => { const k = riskScore(r); return `${k.score}/100 · ${k.level.label}`; }],
    ["כיסוי בדיקה", r => riskScore(r).coverage + "%"]
  ];
  $("cmpOut").innerHTML = (bad.length ? `<div class="card err">${bad.map(b => `${fmtPlate(b.missing || b.error)}: ${b.msg ? esc(b.msg) : "לא נמצא במאגר"}`).join("<br>")}</div>` : "")
    + (ok.length ? `<div class="card"><h2>השוואת רכבים</h2><div class="tscroll"><table class="cmpT">
      <tr><th></th>${ok.map(r => `<th><button class="linkbtn" data-p="${r.plate}">${fmtPlate(r.plate)}</button></th>`).join("")}</tr>
      ${rows.map(([k, f]) => `<tr><th>${k}</th>${ok.map(r => `<td>${esc(f(r) ?? "—")}</td>`).join("")}</tr>`).join("")}
      </table></div>
      <div class="note">מקור: מאגרי משרד התחבורה (data.gov.il) נכון ל-${esc(fmtDateTime(new Date()))}. * מחיר משנת דגם קרובה. תאונות ושעבודים לא נבדקו (מקורות לא מחוברים).</div></div>` : "");
  $("cmpOut").querySelectorAll("[data-p]").forEach(b => b.onclick = () => { tab("check"); $("plate").value = fmtPlate(b.dataset.p); run(b.dataset.p); });
  cloud.logEvent("compare");
};
const val = (r, g, k) => { const f = r.facts[g].find(x => x.k === k); return f && !f.missing ? f.v : "אין נתון"; };
$("cmpClear").onclick = () => { cmpSet(["", "", ""]); renderCompareSlots(); $("cmpOut").innerHTML = ""; };

/* ================= אזור אישי ================= */
async function renderMe(){
  const box = $("meOut");
  const s = cloud.session();
  let acct;
  if (!cloud.configured()){
    acct = `<div class="sub">החשבון והסנכרון לענן עוד לא הוגדרו. הבדיקות נשמרות במכשיר הזה בלבד.</div>
      <details class="mt"><summary>הגדרת חיבור לענן (Supabase)</summary>
        <input class="field ltr" id="cfgUrl" placeholder="https://xxxx.supabase.co">
        <input class="field ltr" id="cfgKey" placeholder="anon / publishable key">
        <button class="btn" id="cfgSave">שמור</button></details>`;
  } else if (!s){
    acct = `<div class="sub">התחברו כדי לשמור בדיקות בענן ולגשת אליהן מכל מכשיר.</div>
      <input class="field ltr" id="em" type="email" autocomplete="email" placeholder="אימייל">
      <input class="field ltr" id="pw" type="password" autocomplete="current-password" placeholder="סיסמה">
      <div class="row gap"><button class="btn pri" id="si">התחברות</button><button class="btn" id="su">הרשמה</button></div>
      <div id="authMsg" class="sub"></div>`;
  } else {
    UI.profile = await cloud.myProfile();
    const p = UI.profile;
    acct = `<div class="row between"><div><b>${esc(s.email)}</b>
      <div class="sub">חבילה: ${esc((PLANS[p && p.plan] || PLANS.free).name)}${p && p.credits ? ` · ${p.credits} בדיקות מלאות` : ""}</div></div>
      <button class="btn sm" id="so">התנתקות</button></div>
      ${p && p.role === "admin" ? `<a class="lnk" href="admin/">🛠 ממשק ניהול</a>` : ""}`;
  }

  box.innerHTML = `<div class="card"><h2>החשבון שלי</h2>${acct}</div>
    <div class="card"><h2>בדיקות שמורות</h2><div id="svList"><span class="spin"></span></div></div>
    <div class="card"><h2>רכבים מועדפים</h2><div id="fvList"><span class="spin"></span></div></div>
    <div class="card"><h2>היסטוריית בדיקות</h2><div id="hsList"></div></div>
    <div class="card"><h2>חבילות</h2>${Object.values(PLANS).map(p => `<div class="plan">
      <div class="row between"><b>${esc(p.name)}</b><span class="mute">${esc(priceLabel(p))}</span></div>
      <div class="sub">${esc(p.blurb)}</div>
      <div class="chips">${p.features.map(f => `<span class="chip ok">${esc(FEATURE_NAMES[f])}</span>`).join("")}</div></div>`).join("")}
      <div class="note">התשלום עוד לא מחובר. כרגע כל היכולות פתוחות.</div></div>`;

  /* חשבון */
  if ($("cfgSave")) $("cfgSave").onclick = () => { cloud.saveCfg($("cfgUrl").value, $("cfgKey").value); renderMe(); };
  const doAuth = fn => async () => {
    $("authMsg").textContent = "…";
    try{ const res = await fn($("em").value.trim(), $("pw").value); $("authMsg").textContent = res.pending ? "נשלח מייל אימות. אחרי האימות התחברו." : ""; if (!res.pending) renderMe(); }
    catch(e){ $("authMsg").textContent = cloud.friendly(e); }
  };
  if ($("si")) $("si").onclick = doAuth(cloud.signIn);
  if ($("su")) $("su").onclick = doAuth(cloud.signUp);
  if ($("so")) $("so").onclick = () => { cloud.signOut(); UI.profile = null; renderMe(); };

  /* שמורות */
  const sv = await store.listSaved();
  $("svList").innerHTML = sv.items.length ? sv.items.map(x => `<div class="li"><button class="linkbtn" data-id="${esc(x.id)}">${fmtPlate(x.plate)} · ${esc(x.label)}</button>
      <span class="mute small">${esc(fmtDateTime(x.savedAt))}</span><button class="x" data-del="${esc(x.id)}" aria-label="מחיקה">✕</button></div>`).join("")
    + `<div class="note">${sv.where === "cloud" ? "מסונכרן לענן" : "נשמר במכשיר הזה בלבד"}</div>`
    : `<div class="sub">עוד לא נשמרו בדיקות. בדוח רכב לחצו "שמור בדיקה".</div>`;
  $("svList").querySelectorAll("[data-id]").forEach(b => b.onclick = () => {
    const it = sv.items.find(x => x.id === b.dataset.id); if (!it) return;
    tab("check"); UI.report = it.report; renderReport(it.report, {snapshot: true});
  });
  $("svList").querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (confirm("למחוק את הבדיקה השמורה?")){ await store.deleteSaved(b.dataset.del); renderMe(); } });

  /* מועדפים */
  const fv = await store.listFav();
  $("fvList").innerHTML = fv.items.length ? fv.items.map(x => `<div class="li"><button class="linkbtn" data-p="${x.plate}">★ ${fmtPlate(x.plate)} · ${esc(x.label || "")}</button></div>`).join("")
    : `<div class="sub">אין מועדפים עדיין.</div>`;

  /* היסטוריה */
  const hs = store.history();
  $("hsList").innerHTML = hs.length ? hs.map(x => `<div class="li"><button class="linkbtn" data-p="${x.p}">${fmtPlate(x.p)} · ${esc(x.label || "")}</button>
      <span class="mute small">${x.at ? esc(fmtDateTime(x.at)) : ""}</span></div>`).join("") + `<button class="btn sm mt" id="hsClr">ניקוי היסטוריה</button>`
    : `<div class="sub">אין בדיקות עדיין.</div>`;
  if ($("hsClr")) $("hsClr").onclick = () => { store.clearHistory(); renderHist(); renderMe(); };

  box.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { tab("check"); $("plate").value = fmtPlate(b.dataset.p); run(b.dataset.p); });
}

/* ================= אתחול ================= */
renderHist();
cloud.myProfile().then(p => UI.profile = p);
// קישור ישיר: /car/#54428303 (נתמך גם בגרסה הקודמת)
const h0 = location.hash.replace(/\D/g, "");
if (h0){ $("plate").value = fmtPlate(h0); run(h0); }
