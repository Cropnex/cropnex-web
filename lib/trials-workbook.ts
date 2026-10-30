import ExcelJS from "exceljs";
import type { Field } from "@/types/field";
import type { Trial, TrialDetails } from "@/types/trial";
import { calculateStripResults } from "@/lib/trial-results";

type ChartRow = { name: string; value: number };
type ChartRenderer = (title: string, rows: ChartRow[], currency: boolean) => string | undefined;
type WorkbookOptions = {
  trials: Trial[]; fields: Field[]; details: Record<string, TrialDetails>;
  chartRenderer?: ChartRenderer; photoImages?: Record<string, string>;
};
function uniqueSheetName(name: string, workbook: ExcelJS.Workbook) {
  const base = name.replace(/[\\/?*\[\]:\x00-\x1f]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 27) || "Trial";
  let result = base, index = 2;
  while (workbook.worksheets.some(sheet => sheet.name.toLowerCase() === result.toLowerCase())) result = `${base.slice(0, 25)} ${index++}`.slice(0, 31);
  return result;
}
function header(sheet: ExcelJS.Worksheet, values: (string | number | null)[]) {
  const row = sheet.addRow(values);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF234D38" } };
  row.height = 30;
  return row;
}
function finishSheet(sheet: ExcelJS.Worksheet) {
  sheet.eachRow(row => row.eachCell(cell => { cell.alignment = { vertical: "top", wrapText: true }; if (typeof cell.value === "number") cell.numFmt = "#,##0.00;[Red](#,##0.00)"; }));
  sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

export function createTrialsWorkbook({ trials, fields, details, chartRenderer = renderTrialReportChart, photoImages = {} }: WorkbookOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CropNex"; workbook.created = new Date();
  const summary = workbook.addWorksheet("Trials Summary");
  summary.addRow(["CropNex · Trial strip results"]); summary.getRow(1).font = { size: 18, bold: true };
  summary.addRow(["Results are snapshots of recorded strip harvests, valued at each trial’s average SAFEX price."]);
  summary.addRow(["Pending harvest results are blank. Gross margin excludes costs not entered on the strip."]);
  header(summary, ["Trial", "Field", "Crop", "Strip", "Status", "Area ha", "Cost R/ha", "Tonnes", "Yield t/ha", "Average SAFEX R/t", "Value R/ha", "Gross margin R/ha", "Total gross margin R"]);
  summary.columns = [{ width: 28 }, { width: 21 }, { width: 18 }, { width: 28 }, { width: 20 }, ...Array.from({ length: 8 }, () => ({ width: 19 }))];
  summary.views = [{ state: "frozen", ySplit: 4 }];
  for (const trial of trials) {
    const data = details[trial.id] || { strips: [], inputs: [], visits: [], photos: [] };
    const field = fields.find(row => row.id === trial.field_id);
    const rows = calculateStripResults(trial, data.strips, data.inputs);
    for (const row of rows) summary.addRow([trial.name, field?.field_name || "", trial.crop || "", row.strip.strip_name, row.harvested ? "Harvested" : "Pending harvest", row.area, row.costPerHa, row.tonnes, row.yieldPerHa, Number(trial.crop_price_per_tonne || 0), row.revenuePerHa, row.marginPerHa, row.totalMargin]);
    const sheet = workbook.addWorksheet(uniqueSheetName(trial.name, workbook));
    sheet.columns = [{ width: 29 }, { width: 30 }, ...Array.from({ length: 7 }, () => ({ width: 21 }))];
    sheet.addRow([trial.name]); sheet.getRow(1).font = { bold: true, size: 18 };
    sheet.addRow(["Field / season", `${field?.farm_name || ""} · ${field?.field_name || ""} · ${trial.season}`]);
    sheet.addRow(["Crop / cultivar", `${trial.crop || ""} · ${trial.cultivar || ""}`]);
    sheet.addRow(["Description", trial.objective || ""]);
    sheet.addRow(["Average SAFEX price (R/t)", Number(trial.crop_price_per_tonne || 0)]);
    sheet.addRow(["Trial dates", `${trial.start_date || "—"} to ${trial.end_date || "—"}`]);
    sheet.addRow(["Trial notes", trial.notes || ""]);
    header(sheet, ["Strip", "Status", "Area ha", "Cost R/ha", "Tonnes", "Yield t/ha", "Value R/ha", "Gross margin R/ha", "Total gross margin R"]);
    for (const row of rows) sheet.addRow([row.strip.strip_name, row.harvested ? "Harvested" : "Pending harvest", row.area, row.costPerHa, row.tonnes, row.yieldPerHa, row.revenuePerHa, row.marginPerHa, row.totalMargin]);
    for (const row of rows) {
      sheet.addRow([]); header(sheet, [`STRIP · ${row.strip.strip_name}`]);
      sheet.addRow(["Description", row.strip.description || ""]);
      sheet.addRow(["Additional operation R/ha", Number(row.strip.operation_cost_per_ha || 0)]);
      sheet.addRow(["Harvest date / moisture", `${row.strip.record_date || "—"} · ${row.strip.moisture ?? "—"}%`]);
      sheet.addRow(["Strip notes", row.strip.notes || ""]);
      header(sheet, ["Type", "Product / seed / operation", "Rate per ha", "Rate unit", "Unit price R", "Cost R/ha", "Notes"]);
      for (const input of row.products) sheet.addRow([input.input_type, input.product_name, Number(input.rate), input.rate_unit, Number(input.unit_price), Number(input.rate) * Number(input.unit_price), input.notes || ""]);
      sheet.addRow(["TOTAL INPUT + OPERATION R/HA", row.costPerHa]);
    }
    const unassigned = data.inputs.filter(row => !row.strip_id && !row.legacy_template);
    if (unassigned.length) {
      sheet.addRow([]); header(sheet, ["UNASSIGNED LEGACY INPUTS — excluded from strip costs until allocated"]);
      for (const input of unassigned) sheet.addRow([input.input_type, input.product_name, input.rate, input.rate_unit, input.unit_price, Number(input.rate) * Number(input.unit_price), input.notes || ""]);
    }
    sheet.addRow([]); header(sheet, ["TRIAL VISITS", "Description", "Observations"]);
    for (const visit of data.visits) sheet.addRow([visit.visit_date, visit.title, visit.notes || ""]);
    sheet.addRow([]); header(sheet, ["PHOTOS", "Caption", "Strip", "Visit"]);
    for (const photo of data.photos) {
      const visit = data.visits.find(row => row.id === photo.visit_id), strip = data.strips.find(row => row.id === photo.strip_id);
      const captionRow = sheet.addRow([photo.taken_date || "", photo.caption || "", strip?.strip_name || "Whole trial", visit ? `${visit.visit_date} · ${visit.title}` : ""]);
      const image = photoImages[photo.id];
      if (image) { const imageId = workbook.addImage({ base64: image, extension: "png" }); sheet.addImage(imageId, { tl: { col: 0, row: captionRow.number }, ext: { width: 400, height: 250 } }); for (let i = 0; i < 14; i++) sheet.addRow([]); }
    }
    const harvested = rows.filter(row => row.harvested);
    for (const [index, metric] of ["yield", "margin"].entries()) {
      const chart = chartRenderer(metric === "yield" ? "Yield by strip (t/ha)" : "Gross margin by strip (R/ha)", harvested.map(row => ({ name: row.strip.strip_name, value: metric === "yield" ? row.yieldPerHa! : row.marginPerHa! })), metric === "margin");
      if (chart) { const imageId = workbook.addImage({ base64: chart, extension: "png" }); const height = Math.max(220, harvested.length * 45 + 80); sheet.addImage(imageId, { tl: { col: 10, row: index * (Math.ceil(height / 20) + 2) + 1 }, ext: { width: 720, height } }); }
    }
    sheet.views = [{ state: "frozen", ySplit: 8 }]; finishSheet(sheet);
  }
  finishSheet(summary);
  return workbook;
}

/** Canvas charts are embedded in the downloaded workbook as actual images. */
export function renderTrialReportChart(title: string, rows: ChartRow[], currency: boolean) {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = Math.max(300, 110 + rows.length * 70);
  const ctx = canvas.getContext("2d"); if (!ctx) return undefined;
  ctx.fillStyle = "#f6f8f4"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#193d29"; ctx.font = "bold 28px sans-serif"; ctx.fillText(`CropNex · ${title}`, 25, 45);
  if (!rows.length) { ctx.font = "20px sans-serif"; ctx.fillText("Results pending harvest", 25, 125); return canvas.toDataURL("image/png"); }
  const min = Math.min(0, ...rows.map(row => row.value)), max = Math.max(0, ...rows.map(row => row.value)), range = max - min || 1;
  const start = 310, width = 650, zero = start + (-min / range) * width;
  ctx.strokeStyle = "#9aac9b"; ctx.beginPath(); ctx.moveTo(zero, 70); ctx.lineTo(zero, canvas.height - 20); ctx.stroke();
  rows.forEach((row, index) => {
    const y = 85 + index * 70, end = start + ((row.value - min) / range) * width;
    ctx.fillStyle = "#183726"; ctx.font = "20px sans-serif"; ctx.fillText(row.name.length > 27 ? `${row.name.slice(0, 26)}…` : row.name, 25, y + 25);
    ctx.fillStyle = row.value < 0 ? "#c96552" : "#6b9f3e"; ctx.fillRect(Math.min(zero, end), y, Math.max(2, Math.abs(end - zero)), 38);
    ctx.fillStyle = "#183726"; ctx.font = "bold 18px sans-serif"; ctx.fillText(`${currency ? "R " : ""}${row.value.toLocaleString("en-ZA", { maximumFractionDigits: 3 })}`, 980, y + 25);
  });
  return canvas.toDataURL("image/png");
}
