/* בניית דוח רכב.
 * buildReport – שולף מהמאגרים (async, דפדפן).
 * assembleReport – פונקציה טהורה שהופכת נתונים גולמיים לדוח מובנה. כל נתון = {k, v, src, missing}.
 * כלל ברזל: אם שדה לא קיים במאגר, הוא מסומן missing ולא מוחלף בניחוש. */
import { byPlate, search, resourceMeta } from "./datagov.js";
import { ownersInfo } from "./owners.js";
import { fmtDate, parseDate, pick, present, num } from "./util.js";

const STATUS = {
  active:    {label: "פעיל",                       src: "mot_active"},
  inactive:  {label: "לא פעיל",                    src: "mot_inactive"},
  cancelled: {label: "ירד מהכביש (ביטול סופי)",     src: "mot_cancelled"}
};

export async function buildReport(plate){
  const errors = [];
  let car = null, statusKind = null;
  for (const kind of ["active", "inactive", "cancelled"]){
    try{
      car = (await byPlate(STATUS[kind].src, plate))[0];
    }catch(e){
      errors.push({src: STATUS[kind].src, msg: e.message});
      if (kind === "active") throw new Error("אין גישה למאגרי משרד התחבורה כרגע (" + e.message + ")");
    }
    if (car){ statusKind = kind; break; }
  }
  if (!car) return null;

  const tz = Number(car.tozeret_cd), dg = Number(car.degem_cd);
  const safe = (p, id) => p.then(v => ({ok: true, v}), e => { errors.push({src: id, msg: e.message}); return {ok: false, v: null}; });

  const [owners, tech, prices, spec] = await Promise.all([
    safe(byPlate("mot_owners", plate), "mot_owners"),
    safe(byPlate("mot_tech", plate), "mot_tech"),
    tz && dg ? safe(search("mot_prices", {tozeret_cd: tz, degem_cd: dg}, 200), "mot_prices") : Promise.resolve({ok: true, v: []}),
    tz && dg ? safe(search("mot_models", {tozeret_cd: tz, degem_cd: dg}, 100), "mot_models") : Promise.resolve({ok: true, v: []})
  ]);

  const used = [STATUS[statusKind].src, "mot_owners", "mot_tech", "mot_prices", "mot_models"];
  const metas = Object.fromEntries(await Promise.all(used.map(async id => [id, await resourceMeta(id)])));

  return assembleReport({
    plate, car, statusKind,
    owners: owners.v, ownersOk: owners.ok,
    tech: tech.v, techOk: tech.ok,
    priceRows: prices.v, pricesOk: prices.ok,
    specRows: spec.v, specOk: spec.ok,
    metas, errors, checkedAt: new Date().toISOString()
  });
}

export function assembleReport(raw){
  const {plate, car, statusKind, metas = {}, errors = [], checkedAt} = raw;
  const mainSrc = STATUS[statusKind].src;
  const specRows = raw.specRows || [];
  const specExact = specRows.find(r => Number(pick(r, /shnat_yitzur/i)) === Number(car.shnat_yitzur));
  const spec = specExact || specRows[0] || null;
  const specApprox = !!spec && !specExact;
  const tech = (raw.tech || [])[0] || null;
  const own = ownersInfo(raw.owners, car);

  const F = (k, v, src) => ({k, v: present(v) ? v : null, src, missing: !present(v)});
  const yn = v => v == null ? null : (Number(v) === 1 ? "כן" : "לא");

  const engineVol = pick(spec, /nefah/i);
  const hp = pick(spec, /koah_sus|horse/i);
  const gear = pick(spec, /automatic_ind|tkina_gir|gir/i);
  const doors = pick(spec, /mispar_dlatot/i);
  const seats = pick(spec, /mispar_moshavim/i);
  const kmRaw = pick(tech, /kilometer|km|nesua/i);
  const km = present(kmRaw) && !isNaN(Number(kmRaw)) ? Number(kmRaw) : null;

  const rd = parseDate(car.moed_aliya_lakvish) || (Number(car.shnat_yitzur) ? new Date(Number(car.shnat_yitzur), 5, 15) : null);
  const now = new Date(checkedAt || Date.now());
  const age = rd ? Math.max(0, (now - rd) / (365.25 * 864e5)) : null;
  const licenseUntil = parseDate(car.tokef_dt);

  const facts = {
    identity: [
      F("יצרן", car.tozeret_nm, mainSrc),
      F("דגם (כינוי מסחרי)", car.kinuy_mishari, mainSrc),
      F("שם דגם", car.degem_nm, mainSrc),
      F("רמת גימור", car.ramat_gimur, mainSrc),
      F("שנת ייצור", car.shnat_yitzur, mainSrc),
      F("עלייה לכביש", present(car.moed_aliya_lakvish) ? fmtDate(car.moed_aliya_lakvish) : null, mainSrc),
      F("צבע", car.tzeva_rechev, mainSrc),
      F("מספר שלדה (VIN)", car.misgeret, mainSrc)
    ],
    specs: [
      F("נפח מנוע (סמ״ק)", present(engineVol) ? num(engineVol) : null, "mot_models"),
      F("קוד מנוע", car.degem_manoa, mainSrc),
      F("סוג דלק", car.sug_delek_nm, mainSrc),
      F("כוח סוס", hp, "mot_models"),
      F("תיבת הילוכים", gear == null ? null : (String(gear) === "1" ? "אוטומטית" : String(gear) === "0" ? "ידנית" : gear), "mot_models"),
      F("דלתות", doors, "mot_models"),
      F("מושבים", seats, "mot_models"),
      F("רמת אבזור בטיחותי", car.ramat_eivzur_betihuty, mainSrc),
      F("קבוצת זיהום", car.kvutzat_zihum, mainSrc)
    ],
    registration: [
      F("סטטוס במאגר", STATUS[statusKind].label, mainSrc),
      F("סוג בעלות נוכחית", car.baalut, mainSrc),
      F("מספר יד", own.hasHistory ? own.n : null, "mot_owners"),
      F("טסט אחרון", present(car.mivchan_acharon_dt) ? fmtDate(car.mivchan_acharon_dt) : null, mainSrc),
      F("תוקף רישיון", present(car.tokef_dt) ? fmtDate(car.tokef_dt) : null, mainSrc)
    ],
    tech: [
      F("ק״מ בטסט האחרון", km != null ? num(km) : null, "mot_tech"),
      F("שינוי צבע", tech ? yn(tech.shinui_zeva_ind) : null, "mot_tech"),
      F("שינוי מידת צמיג", tech ? yn(tech.shnui_zmig_ind) : null, "mot_tech"),
      F("מקוריות", tech ? tech.mkoriut_nm : null, "mot_tech")
    ]
  };

  const sources = {};
  const state = (ok, has) => ok === false ? "error" : has ? "ok" : "empty";
  sources[mainSrc]     = {...(metas[mainSrc] || {}), state: "ok"};
  sources.mot_owners   = {...(metas.mot_owners || {}), state: state(raw.ownersOk, own.hasHistory)};
  sources.mot_tech     = {...(metas.mot_tech || {}),   state: state(raw.techOk, !!tech)};
  sources.mot_prices   = {...(metas.mot_prices || {}), state: state(raw.pricesOk, (raw.priceRows || []).length > 0)};
  sources.mot_models   = {...(metas.mot_models || {}), state: state(raw.specOk, !!spec)};

  return {
    v: 1, plate, checkedAt: checkedAt || new Date().toISOString(),
    statusKind, statusLabel: STATUS[statusKind].label, mainSrc,
    title: `${car.tozeret_nm || ""} ${car.kinuy_mishari || car.degem_nm || ""}`.trim(),
    subtitle: [car.ramat_gimur, car.shnat_yitzur].filter(present).join(" · "),
    year: Number(car.shnat_yitzur) || null,
    age, km, licenseExpired: licenseUntil ? licenseUntil < now : null,
    owners: own, specApprox,
    tech: tech ? {colorChange: tech.shinui_zeva_ind, originality: tech.mkoriut_nm} : null,
    newPrice: newPriceOf(car, raw.priceRows),
    facts, sources, errors,
    raw: {car, spec, tech, owners: raw.owners || []}
  };
}

/** מחיר רכב חדש לפי מחירון היבואן – אותה שנה, ואם אין – השנה הקרובה (מסומן approx) */
export function newPriceOf(car, rows){
  if (!rows || !rows.length) return null;
  const year = Number(car.shnat_yitzur);
  const exact = rows.filter(r => Number(r.shnat_yitzur) === year);
  let chosen = exact, approx = false;
  if (!exact.length){
    const nearest = rows.map(r => Number(r.shnat_yitzur)).sort((a, b) => Math.abs(a - year) - Math.abs(b - year))[0];
    chosen = rows.filter(r => Number(r.shnat_yitzur) === nearest); approx = true;
  }
  const ps = [...new Set(chosen.map(r => Number(r.mehir)).filter(Boolean))];
  if (!ps.length) return null;
  return {
    value: Math.round(ps.reduce((a, b) => a + b) / ps.length),
    min: Math.min(...ps), max: Math.max(...ps),
    year: Number(chosen[0].shnat_yitzur), approx,
    importer: chosen[0].shem_yevuan || null,
    name: chosen[0].kinuy_mishari || null
  };
}

/** עותק קל לשמירה (בלי נתונים גולמיים) */
export const slimReport = r => { const {raw, ...rest} = r; return rest; };
