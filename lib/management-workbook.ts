import type { Activity } from "@/types/activity";
import type { Equipment } from "@/types/equipment";
import type { Field } from "@/types/field";
import type { FinancialTransaction } from "@/types/financial";
import type { InventoryItem } from "@/types/inventory";

type Cell = string | number | null | undefined;
type Sheet = { name: string; rows: Cell[][] };
export type RainfallExportRow = { gauge_id: string; reading_date: string; rainfall_mm: number; notes: string | null };
export type RainGaugeExportRow = { id: string; name: string; farm_name: string | null };

const xmlEscape = (value: Cell) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function cell(value: Cell, header = false) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  const style = header ? ' ss:StyleID="Header"' : numeric ? ' ss:StyleID="Number"' : "";
  return `<Cell${style}><Data ss:Type="${numeric ? "Number" : "String"}">${xmlEscape(value)}</Data></Cell>`;
}

function worksheet(sheet: Sheet) {
  const safeName = sheet.name.slice(0, 31).replace(/[\\/?*\[\]:]/g, "-");
  return `<Worksheet ss:Name="${xmlEscape(safeName)}"><Table>${sheet.rows.map((row, index) => `<Row>${row.map(value => cell(value, index === 0)).join("")}</Row>`).join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
}

export function downloadManagementWorkbook({ fields, activities, transactions, inventory, equipment, rainfall = [], gauges = [], performance = [], commitments = [] }: {
  fields: Field[];
  activities: Activity[];
  transactions: FinancialTransaction[];
  inventory: InventoryItem[];
  equipment: Equipment[];
  rainfall?: RainfallExportRow[];
  gauges?: RainGaugeExportRow[];
  performance?: { field_id: string; planning_cost: number; remaining_planned_cost: number; actualised_cost: number; additional_expenses: number; total_cost: number; harvested_tonnes: number; projected_income: number; projected_margin: number }[];
  commitments?: { source: string; category: string; name: string; season: string | null; seasonal_amount: number }[];
}) {
  const income = transactions.filter(item => item.transaction_type === "Income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = transactions.filter(item => item.transaction_type === "Expense").reduce((sum, item) => sum + item.amount, 0);
  const stockValue = inventory.reduce((sum, item) => sum + item.quantity * (item.unit_cost || 0), 0);
  const assetValue = equipment.reduce((sum, item) => sum + (item.purchase_price || 0), 0);
  const totalArea = fields.reduce((sum, item) => sum + item.area_ha, 0);

  const months = new Map<string, { income: number; expenses: number }>();
  transactions.forEach(item => {
    const month = item.transaction_date.slice(0, 7);
    const current = months.get(month) || { income: 0, expenses: 0 };
    current[item.transaction_type === "Income" ? "income" : "expenses"] += item.amount;
    months.set(month, current);
  });
  let runningBalance = 0;
  const cashFlowRows: Cell[][] = [["Month", "Income (R)", "Expenses (R)", "Net movement (R)", "Running balance (R)"]];
  Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([month, totals]) => {
    const net = totals.income - totals.expenses;
    runningBalance += net;
    cashFlowRows.push([month, totals.income, totals.expenses, net, runningBalance]);
  });

  const fieldRows: Cell[][] = [["Farmer", "Farm", "Field", "Season", "Crop", "Cultivar", "Area (ha)", "Projected income (R)", "Total field cost (R)", "Cost/ha (R)", "Projected margin (R)", "Harvest (t)", "Actualised cost (R)", "Remaining planned cost (R)", "Additional field expenses (R)"]];
  fields.forEach(field => {
    const linked = transactions.filter(item => item.field_id === field.id);
    const report = performance.find(item => item.field_id === field.id);
    const fieldIncome = Number(report?.projected_income ?? linked.filter(item => item.transaction_type === "Income").reduce((sum, item) => sum + item.amount, 0));
    const fieldExpenses = Number(report?.total_cost ?? linked.filter(item => item.transaction_type === "Expense").reduce((sum, item) => sum + item.amount, 0));
    fieldRows.push(["", field.farm_name, field.field_name, field.season, field.crop, field.cultivar, field.area_ha, fieldIncome, fieldExpenses, field.area_ha ? fieldExpenses / field.area_ha : 0, Number(report?.projected_margin ?? fieldIncome - fieldExpenses), Number(report?.harvested_tonnes ?? 0), Number(report?.actualised_cost ?? 0), Number(report?.remaining_planned_cost ?? 0), Number(report?.additional_expenses ?? 0)]);
  });

  const sheets: Sheet[] = [
    { name: "Executive Summary", rows: [
      ["CropNex Management Summary", "Value"],
      ["Exported", new Date().toLocaleString("en-ZA")],
      ["Fields", fields.length], ["Farmed area (ha)", totalArea],
      ["Income (R)", income], ["Expenses (R)", expenses], ["Gross margin (R)", income - expenses],
      ["Inventory value (R)", stockValue], ["Asset purchase value (R)", assetValue],
    ]},
    { name: "Cash Flow", rows: cashFlowRows },
    { name: "Field Margins", rows: fieldRows },
    { name: "Business Commitments", rows: [["Source", "Category", "Commitment", "Applies to", "Annual or seasonal amount (R)"], ...commitments.map(item => [item.source, item.category, item.name, item.season || "Every season", Number(item.seasonal_amount)])] },
    { name: "Activity Detail", rows: [["Date", "Farm", "Field", "Crop", "Activity", "Area (ha)", "Notes"], ...activities.map(item => {
      const field = fields.find(candidate => candidate.field_name === item.field_name);
      return [item.date, field?.farm_name, item.field_name, item.crop || field?.crop, item.activity_type, item.area_ha, item.notes];
    })] },
    { name: "Transactions", rows: [["Date", "Type", "Category", "Description", "Quantity", "Unit", "Unit price (R)", "Amount (R)", "Supplier or customer", "Reference"], ...transactions.map(item => [item.transaction_date, item.transaction_type, item.category, item.description, item.quantity, item.unit, item.unit_price, item.amount, item.supplier_or_customer, item.reference])] },
    { name: "Inventory", rows: [["Product", "Category", "Unit", "Quantity", "Unit cost (R)", "Stock value (R)", "Minimum", "Location", "Supplier", "Status"], ...inventory.map(item => [item.name, item.category, item.unit, item.quantity, item.unit_cost, item.quantity * (item.unit_cost || 0), item.minimum_quantity, item.location, item.supplier, item.status])] },
    { name: "Assets", rows: [["Asset", "Category", "Brand", "Model", "Year", "Purchase date", "Purchase price (R)", "Engine hours", "Status", "Registration", "Serial number"], ...equipment.map(item => [item.name, item.category, item.brand, item.model, item.year, item.purchase_date, item.purchase_price, item.engine_hours, item.status, item.registration, item.serial_number])] },
    { name: "Rainfall", rows: [["Date", "Gauge", "Farm", "Rainfall (mm)", "Notes"], ...rainfall.map(row => { const gauge = gauges.find(item => item.id === row.gauge_id); return [row.reading_date, gauge?.name || "Gauge", gauge?.farm_name, Number(row.rainfall_mm), row.notes]; })] },
  ];

  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Aptos" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#315D22" ss:Pattern="Solid"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="#,##0.00"/></Style></Styles>${sheets.map(worksheet).join("")}</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `CropNex-management-report-${new Date().toISOString().slice(0, 10)}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}

