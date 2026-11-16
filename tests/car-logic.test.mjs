// בדיקות לוגיקה לפלטפורמת בדיקת הרכב. הרצה: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleReport } from "../car/js/report.js";
import { riskScore } from "../car/js/risk.js";
import { modelEstimate, compareAsking } from "../car/js/valuation.js";
import { recommendations } from "../car/js/recommend.js";

const car = { mispar_rechev: 5442830, tozeret_cd: 413, degem_cd: 1234, tozeret_nm: "טויוטה", kinuy_mishari: "קורולה", degem_nm: "ZRE", ramat_gimur: "SUN", shnat_yitzur: 2019, moed_aliya_lakvish: "2019-3", tzeva_rechev: "לבן", sug_delek_nm: "בנזין", baalut: "פרטי", mivchan_acharon_dt: "2025-03-01", tokef_dt: "2026-03-01", degem_manoa: "2ZR" };
const full = () => assembleReport({
  plate: "5442830", car, statusKind: "active",
  owners: [{baalut_dt: 201903, baalut: "השכרה"}, {baalut_dt: 202102, baalut: "פרטי"}, {baalut_dt: 202304, baalut: "פרטי"}], ownersOk: true,
  tech: [{kilometer_test_aharon: 140000, shinui_zeva_ind: 1, mkoriut_nm: "מקורי"}], techOk: true,
  priceRows: [{shnat_yitzur: 2019, mehir: 120000}, {shnat_yitzur: 2019, mehir: 130000}], pricesOk: true,
  specRows: [{shnat_yitzur: 2019, nefah_manoa: 1598}], specOk: true,
  metas: {mot_active: {updated: "2026-11-15T03:00:00", package_id: "pkg"}},
  checkedAt: "2026-11-16T12:00:00Z"
});

test("report: fields with source; missing fields are never guessed", () => {
  const r = full();
  assert.equal(r.owners.n, 3);
  assert.equal(r.owners.firstType, "השכרה");
  assert.equal(r.km, 140000);
  assert.equal(r.newPrice.value, 125000);
  assert.equal(r.licenseExpired, true);
  assert.equal(r.sources.mot_active.updated, "2026-11-15T03:00:00");
  const vin = r.facts.identity.find(f => f.k === "מספר שלדה (VIN)");
  assert.equal(vin.missing, true); assert.equal(vin.v, null);
  for (const g of Object.values(r.facts)) for (const f of g) assert.ok(f.src, "every fact has a source: " + f.k);
});

test("risk: only verified data scored; unconnected sources not scored", () => {
  const k = riskScore(full());
  const c = id => k.components.find(x => x.id === id);
  assert.equal(c("origin").points, 15);
  assert.equal(c("hands").points, 6);
  assert.equal(c("km").points, 5);
  assert.equal(c("accidents").scored, false);
  assert.equal(c("liens").scored, false);
  assert.ok(k.coverage < 100);
  assert.ok(k.score >= 0 && k.score <= 100);
});

test("risk: source down -> component not checked, no invented points", () => {
  const r = assembleReport({plate: "1234567", car: {shnat_yitzur: 2010, baalut: "פרטי"}, statusKind: "cancelled",
    owners: [], ownersOk: false, tech: [], techOk: true, priceRows: [], pricesOk: true, specRows: [], specOk: true,
    checkedAt: "2026-11-16T12:00:00Z"});
  assert.equal(r.sources.mot_owners.state, "error");
  assert.equal(r.newPrice, null);
  const k = riskScore(r);
  assert.equal(k.components.find(c => c.id === "km").scored, false);
  assert.equal(k.score, 30);
});

test("valuation: market comparison is marked not connected; no data -> unavailable", () => {
  const r = full();
  const est = modelEstimate({newPrice: r.newPrice.value, age: r.age, km: r.km, owners: r.owners});
  const cmp = compareAsking({asking: 90000, newPrice: r.newPrice, estimate: est});
  assert.equal(cmp.items.find(i => i.id === "vs_new").status, "verified");
  assert.equal(cmp.items.find(i => i.id === "vs_model").status, "estimate");
  assert.equal(cmp.items.find(i => i.id === "vs_market").status, "not_connected");
  assert.equal(compareAsking({asking: 1, newPrice: null, estimate: null}).items[0].status, "unavailable");
  assert.ok(recommendations(r, riskScore(r), cmp).some(x => x.level === "must"));
});

test("devaluation: parse, apply to estimate, deduct from asking price", async () => {
  const { parseDevaluation, applyDevaluation, devaluedAsking } = await import("../car/js/valuation.js");
  assert.deepEqual(parseDevaluation(""), {pct: null});
  assert.equal(parseDevaluation("12.5%").pct, 12.5);
  assert.equal(parseDevaluation("7,5").pct, 7.5);
  assert.ok(parseDevaluation("0").error);
  assert.ok(parseDevaluation("150").error);
  const est = {value: 100000, low: 93000, high: 107000, lines: [{t: "גיל", pct: -0.3}]};
  const d = applyDevaluation(est, 10);
  assert.equal(d.before, 100000);
  assert.equal(d.value, 90000);
  assert.equal(Math.round(d.low), 83700);
  assert.equal(d.lines.at(-1).manual, true);
  assert.equal(applyDevaluation(est, null), est);
  assert.deepEqual(devaluedAsking(80000, 10), {after: 72000, cut: 8000});
  assert.equal(devaluedAsking(null, 10), null);
  // the adjusted estimate drives the verdict
  const tone = e => compareAsking({asking: 100000, newPrice: {value: 200000}, estimate: e}).items.find(i => i.id === "vs_model").tone;
  assert.equal(tone(est), "ok");   // 100,000 inside 93k-107k
  assert.equal(tone(d), "warn");   // after 10%: range tops at 96,300
});
