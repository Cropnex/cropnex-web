import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url), root = new URL("../", import.meta.url), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(new URL(file, root), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const execute = new Function("require", "module", "exports", code);
  execute(name => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name), module, module.exports);
  return module.exports;
}
const { calculateStripResults, trialWorkspaceReducer: reduce, initialTrialWorkspace: initial } = load("lib/trial-results.ts");
const { trialRequest } = load("lib/trial-request.ts");
const { createTrialsWorkbook } = load("lib/trials-workbook.ts");
const trial = (id = "trial-a", price = 5000) => ({ id, name: id, field_id: "field-a", season: "2026/2027", user_id: "owner", crop_price_per_tonne: price, objective: "Nutrition comparison", crop: "Maize" });
const strip = (id = "strip-a", values = {}) => ({ id, trial_id: "trial-a", user_id: "owner", strip_name: id, area_ha: 2, operation_cost_per_ha: 50, harvested: true, tonnes: 8, yield_source: "Manual", record_date: "2026-10-30", ...values });
const input = (id = "input-a", values = {}) => ({ id, trial_id: "trial-a", strip_id: "strip-a", product_name: "Product A", input_type: "Product", rate: 2, rate_unit: "L/ha", unit_price: 100, ...values });
const empty = () => ({ strips: [], inputs: [], visits: [], photos: [] });

test("each strip has independent costs and uses its main trial SAFEX price", () => {
  const rows = calculateStripResults(trial(), [strip(), strip("strip-b", { area_ha: 10, tonnes: 30, operation_cost_per_ha: 0 })], [input(), input("input-b", { strip_id: "strip-b", rate: 3, unit_price: 90 })]);
  assert.equal(rows[0].costPerHa, 250); assert.equal(rows[0].yieldPerHa, 4);
  assert.equal(rows[0].revenuePerHa, 20000); assert.equal(rows[0].marginPerHa, 19750); assert.equal(rows[0].totalMargin, 39500);
  assert.equal(rows[1].costPerHa, 270); assert.equal(rows[1].yieldPerHa, 3); assert.equal(rows[1].marginPerHa, 14730);
});
test("changing the trial price recalculates every harvested strip", () => {
  const [row] = calculateStripResults(trial("trial-a", 6000), [strip()], [input()]);
  assert.equal(row.revenuePerHa, 24000); assert.equal(row.marginPerHa, 23750);
});
test("pending and old field-average estimates do not become harvested profit", () => {
  const rows = calculateStripResults(trial(), [strip("pending", { harvested: false }), strip("estimate", { yield_source: "Field average" })], []);
  for (const row of rows) { assert.equal(row.yieldPerHa, null); assert.equal(row.marginPerHa, null); assert.equal(row.totalRevenue, null); }
});
test("a confirmed zero harvest is a real result with negative recorded margin", () => {
  const [row] = calculateStripResults(trial(), [strip("strip-a", { tonnes: 0 })], [input()]);
  assert.equal(row.yieldPerHa, 0); assert.equal(row.marginPerHa, -250);
});
test("other trial records and archived group templates never inflate strip costs", () => {
  const rows = calculateStripResults(trial(), [strip(), strip("foreign", { trial_id: "trial-b" })], [input(), input("other", { trial_id: "trial-b", rate: 999 }), input("template", { legacy_template: true, rate: 999 })]);
  assert.equal(rows.length, 1); assert.equal(rows[0].costPerHa, 250);
});
test("a second created trial is listed and stays selected without losing the first", () => {
  let state = reduce(initial, { type: "saved", trial: trial() });
  state = reduce(state, { type: "saved", trial: trial("trial-b") });
  assert.equal(state.trials.length, 2); assert.equal(state.selectedId, "trial-b"); assert.equal(state.details, null);
  state = reduce(state, { type: "saved", trial: trial("trial-b", 6000) });
  assert.equal(state.trials.length, 2); assert.equal(state.selectedId, "trial-b");
});
test("a late response from the previous trial cannot overwrite the newly selected trial", () => {
  let state = reduce(initial, { type: "saved", trial: trial() });
  state = reduce(state, { type: "loading", id: "trial-a", requestId: 1 });
  state = reduce(state, { type: "saved", trial: trial("trial-b") });
  state = reduce(state, { type: "loading", id: "trial-b", requestId: 2 });
  const second = { ...empty(), visits: [{ title: "Second trial visit" }] };
  state = reduce(state, { type: "loaded", id: "trial-b", requestId: 2, details: second });
  state = reduce(state, { type: "loaded", id: "trial-a", requestId: 1, details: empty() });
  assert.equal(state.selectedId, "trial-b"); assert.equal(state.details.visits[0].title, "Second trial visit");
});
test("stale refreshes of the same trial cannot overwrite newer records", () => {
  let state = reduce(initial, { type: "saved", trial: trial() });
  state = reduce(state, { type: "loading", id: "trial-a", requestId: 1 });
  state = reduce(state, { type: "loading", id: "trial-a", requestId: 2 });
  const data = { ...empty(), strips: [strip()] };
  state = reduce(state, { type: "loaded", id: "trial-a", requestId: 2, details: data });
  state = reduce(state, { type: "failed", id: "trial-a", requestId: 1, error: "Old error" });
  assert.equal(state.details.strips.length, 1); assert.equal(state.detailError, null);
});
test("request timeout aborts a stalled query instead of leaving a spinner", async () => {
  let signal;
  await assert.rejects(trialRequest(s => { signal = s; return new Promise(() => {}); }, undefined, 5), /respond/);
  assert.equal(signal.aborted, true);
});
test("switching trials cancels the abandoned request", async () => {
  const controller = new AbortController(); let signal;
  const request = trialRequest(s => { signal = s; return new Promise(() => {}); }, controller.signal);
  controller.abort(); await assert.rejects(request, /cancelled/); assert.equal(signal.aborted, true);
});
test("successful and failed requests settle normally", async () => {
  assert.equal(await trialRequest(() => Promise.resolve(42)), 42);
  await assert.rejects(trialRequest(() => Promise.reject(new Error("Permission denied"))), /Permission denied/);
});
test("export keeps one tab per trial, independent strip data, visits and embedded graphs", async () => {
  const a = trial(), b = { ...trial("trial-b"), name: "TRIAL-A" };
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const details = { "trial-a": { strips: [strip(), strip("pending", { harvested: false })], inputs: [input()], visits: [{ visit_date: "2026-10-30", title: "Flowering visit", notes: "Growth recorded" }], photos: [] }, "trial-b": empty() };
  const book = createTrialsWorkbook({ trials: [a, b], fields: [{ id: "field-a", field_name: "WO1", farm_name: "Sample Farm" }], details, chartRenderer: () => png });
  assert.equal(book.worksheets.length, 3); assert.equal(new Set(book.worksheets.map(s => s.name.toLowerCase())).size, 3);
  const summary = book.getWorksheet("Trials Summary"), trialSheet = book.worksheets[1];
  assert.equal(summary.getCell("I5").value, 4); assert.equal(summary.getCell("L5").value, 19750);
  assert.equal(summary.getCell("I6").value, null); assert.equal(summary.getCell("L6").value, null);
  assert.equal(trialSheet.getImages().length, 2);
  assert.ok(trialSheet.getSheetValues().some(row => row?.includes("Flowering visit")));
  const bytes = await book.xlsx.writeBuffer(); const ExcelJS = require("exceljs"); const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes); assert.equal(reopened.worksheets.length, 3); assert.equal(reopened.worksheets[1].getImages().length, 2);
});
