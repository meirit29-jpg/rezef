// בדיקות לפרוקסי api/datagov.js עם fetch מדומה. הרצה: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const handler = createRequire(import.meta.url)("../api/datagov.js");

function mockRes(){
  const r = {statusCode: 200, headers: {}, body: ""};
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = b => { r.body = b || ""; };
  return r;
}
const ACTIVE = "053cea08-09bc-40ec-8f7a-156f0677aff3";

test("rejects unknown resource, unknown action, bad filters, non-GET", async () => {
  for (const [method, query, code] of [
    ["GET", {action: "datastore_search", resource_id: "evil"}, 400],
    ["GET", {action: "package_search"}, 400],
    ["GET", {action: "datastore_search", resource_id: ACTIVE, filters: "[1,2]"}, 400],
    ["GET", {action: "datastore_search", resource_id: ACTIVE, filters: "{oops"}, 400],
    ["POST", {}, 405]
  ]){
    const res = mockRes(); await handler({method, query}, res);
    assert.equal(res.statusCode, code, JSON.stringify(query));
    assert.equal(res.headers["cache-control"], "no-store");
  }
});

test("forwards allowed query, caps limit, caches success, never logs plate", async () => {
  const calls = [], logs = [];
  const origFetch = globalThis.fetch, origLog = console.log;
  globalThis.fetch = async (url) => { calls.push(url); return new Response(JSON.stringify({success: true, result: {records: [{a: 1}]}}), {status: 200}); };
  console.log = s => logs.push(s);
  try{
    const res = mockRes();
    await handler({method: "GET", query: {action: "datastore_search", resource_id: ACTIVE, filters: JSON.stringify({mispar_rechev: 5442830}), limit: "9999"}}, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["cache-control"], /s-maxage=/);
    assert.equal(JSON.parse(res.body).result.records.length, 1);
    const u = new URL(calls[0]);
    assert.equal(u.hostname, "data.gov.il");
    assert.equal(u.searchParams.get("limit"), "200");
    assert.equal(JSON.parse(u.searchParams.get("filters")).mispar_rechev, 5442830);
    assert.ok(!logs.join("").includes("5442830"), "plate must not be logged");
  } finally { globalThis.fetch = origFetch; console.log = origLog; }
});

test("upstream failure -> 502/504, not cached", async () => {
  const origFetch = globalThis.fetch, origLog = console.log; console.log = () => {};
  try{
    globalThis.fetch = async () => new Response("oops", {status: 500});
    let res = mockRes(); await handler({method: "GET", query: {action: "resource_show", id: ACTIVE}}, res);
    assert.equal(res.statusCode, 502); assert.equal(res.headers["cache-control"], "no-store");
    globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
    res = mockRes(); await handler({method: "GET", query: {action: "resource_show", id: ACTIVE}}, res);
    assert.equal(res.statusCode, 504);
  } finally { globalThis.fetch = origFetch; console.log = origLog; }
});

test("allowlist matches car/js/sources.js", async () => {
  const { SOURCES } = await import("../car/js/sources.js");
  const ids = Object.values(SOURCES).filter(s => s.resource).map(s => s.resource).sort();
  assert.deepEqual([...handler.ALLOWED].sort(), ids);
});
