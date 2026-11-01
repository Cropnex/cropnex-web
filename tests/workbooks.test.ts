import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Field } from "@/types/field";
import type { ActivityPlan, ActivityPlanProduct } from "@/types/planning";
import type { Activity } from "@/types/activity";
import type { Equipment } from "@/types/equipment";
import type { FinancialTransaction } from "@/types/financial";
import type { InventoryItem } from "@/types/inventory";
import type { TransportAllocation, TransportLoad } from "@/types/transport";
import { buildDieselLogbook } from "@/lib/diesel-workbook";
import { downloadManagementWorkbook } from "@/lib/management-workbook";
import {
  downloadMasterDataWorkbook,
  readMasterDataWorkbook,
} from "@/lib/master-data-workbook";
import {
  downloadPlanningWorkbook,
  readPlanningWorkbook,
} from "@/lib/planning-workbook";
import {
  downloadTransportWorkbook,
  readTransportWorkbook,
} from "@/lib/transport-workbook";
import { makeWorkbookFile, stubDownloads } from "./workbook-test-utils";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("diesel workbook", () => {
  it("writes headers, formulas, and optional row values to a valid XLSX buffer", async () => {
    const buffer = await buildDieselLogbook([
      {
        date: "2026-03-04",
        equipment: "Tractor",
        litres: 35,
        price: 24.5,
        hours: 2,
      },
      {
        date: "2026-03-05",
        equipment: "Truck",
        litres: 0,
        price: 0,
        hours: 0,
        meter: 0,
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Diesel Logbook");

    expect(sheet?.getCell("A1").value).toBe("CropNex Diesel Logbook");
    expect(sheet?.getCell("B3").value).toMatchObject({
      formula: "SUM(G6:G10005)",
    });
    expect(sheet?.getCell("A6").value).toBeInstanceOf(Date);
    expect(sheet?.getCell("B6").value).toBe("Tractor");
    expect(sheet?.getCell("G6").value).toBe(35);
    expect(sheet?.getCell("H6").value).toBe(2);
    expect(sheet?.getCell("K6").value).toMatchObject({ formula: "G6*J6" });
    expect(sheet?.getCell("M6").value).toBe("");
    expect(sheet?.getCell("G7").value).toBe(0);
    expect(sheet?.getCell("H7").value).toBeNull();
    expect(sheet?.getCell("I7").value).toBeNull();
  });

  it("supports an empty logbook", async () => {
    const buffer = await buildDieselLogbook([]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet("Diesel Logbook")?.rowCount).toBe(5);
  });
});

describe("master data workbook", () => {
  it("round-trips optional values, applies defaults, and skips blank product rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Master Data");
    sheet.addRow(["Title"]);
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([
      "record-1",
      "A-1",
      "Maize seed",
      "",
      "Seed",
      "White Maize",
      "",
      "",
      "",
      "Approved",
    ]);
    sheet.addRow([
      "record-2",
      "A-2",
      "Fertiliser",
      "Maker",
      "",
      "",
      "25",
      25,
      "kg",
      "Inactive",
    ]);
    sheet.addRow(["", "", "ignored"]);
    const operations = workbook.addWorksheet("Operations");
    operations.addRow(["Title"]);
    operations.addRow([]);
    operations.addRow([]);
    operations.addRow([
      "operation-1",
      "CNO-1",
      "Spraying",
      "",
      "",
      "Apply spray",
      15,
      "Supplier",
      "No",
    ]);
    operations.addRow(["operation-2", "CNO-2", "Harvest"]);
    operations.addRow(["", "", "ignored"]);
    const rows = await readMasterDataWorkbook(await makeWorkbookFile(workbook));

    expect(rows).toEqual({
      products: [
        {
          id: "record-1",
          catalogue_code: "A-1",
          name: "Maize seed",
          manufacturer: null,
          product_class: "Seed",
          crop_type: "White Maize",
          formulation: null,
          pack_size: null,
          pack_unit: null,
          status: "Approved",
          description: null,
        },
        {
          id: "record-2",
          catalogue_code: "A-2",
          name: "Fertiliser",
          manufacturer: "Maker",
          product_class: "Unclassified",
          crop_type: "Not applicable",
          formulation: "25",
          pack_size: 25,
          pack_unit: "kg",
          status: "Inactive",
          description: null,
        },
      ],
      operations: [
        {
          id: "operation-1",
          catalogue_code: "CNO-1",
          name: "Spraying",
          unit: "ha",
          category: "Other",
          description: "Apply spray",
          unit_cost: 15,
          supplier: "Supplier",
          active: false,
        },
        {
          id: "operation-2",
          catalogue_code: "CNO-2",
          name: "Harvest",
          unit: "ha",
          category: "Other",
          description: null,
          unit_cost: 0,
          supplier: null,
          active: true,
        },
      ],
    });
  });

  it("rejects a workbook without the expected worksheet", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Other");
    await expect(
      readMasterDataWorkbook(await makeWorkbookFile(workbook)),
    ).rejects.toThrow("This is not a CropNex Master Data workbook.");
  });

  it("exports the maintenance template and product values", async () => {
    const downloads = stubDownloads();
    await downloadMasterDataWorkbook(
      [
        {
          id: "record-1",
          catalogue_code: "A-1",
          name: "Maize seed",
          manufacturer: null,
          product_class: "Seed",
          crop_type: "White Maize",
          formulation: null,
          pack_size: 10,
          pack_unit: "bag",
          status: "Approved",
          description: null,
        },
        {
          id: "record-2",
          catalogue_code: "A-2",
          name: "Fertiliser",
          manufacturer: "",
          product_class: "Fertiliser",
          crop_type: "Multi-crop",
          formulation: "",
          pack_size: null,
          pack_unit: null,
          status: "Inactive",
          description: null,
        },
      ],
      [
        {
          id: "operation-1",
          catalogue_code: "CNO-1",
          name: "Spraying",
          unit: "ha",
          category: "Crop care",
          description: "Apply spray",
          unit_cost: 15,
          supplier: "Supplier",
          active: true,
        },
        {
          id: "operation-2",
          catalogue_code: "CNO-2",
          name: "Harvest",
          unit: "ha",
          category: "Other",
          description: null,
          unit_cost: 0,
          supplier: null,
          active: false,
        },
      ],
    );
    expect(downloads.click).toHaveBeenCalledOnce();
    expect(downloads.blobs).toHaveLength(1);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await downloads.blobs[0].arrayBuffer());
    const sheet = workbook.getWorksheet("Master Data");
    expect(sheet?.getCell("A4").value).toBe("record-1");
    expect(sheet?.getCell("B4").value).toBe("A-1");
    expect(sheet?.getCell("C4").value).toBe("Maize seed");
    expect(sheet?.getCell("G5").value).toBe("");
    expect(sheet?.getCell("E4").dataValidation.type).toBe("list");
    expect(sheet?.getCell("A503").value).toBeNull();
    const operationSheet = workbook.getWorksheet("Operations");
    expect(operationSheet?.getCell("A4").value).toBe("operation-1");
    expect(operationSheet?.getCell("B4").value).toBe("CNO-1");
    expect(operationSheet?.getCell("I4").value).toBe("Yes");
    expect(operationSheet?.getCell("F5").value).toBe("");
    expect(operationSheet?.getCell("H5").value).toBe("");
    expect(operationSheet?.getCell("I5").value).toBe("No");
    expect(operationSheet?.getCell("D4").dataValidation.type).toBe("list");
  });

  it("rejects non-numeric product pack sizes and operation costs", async () => {
    const productWorkbook = new ExcelJS.Workbook();
    const products = productWorkbook.addWorksheet("Master Data");
    products.addRow([]);
    products.addRow([]);
    products.addRow([]);
    products.addRow(["record-1", "A-1", "Seed", "", "Seed", "", "", "many"]);
    await expect(
      readMasterDataWorkbook(await makeWorkbookFile(productWorkbook)),
    ).rejects.toThrow("Row 4: Pack Size must be a number.");

    const operationWorkbook = new ExcelJS.Workbook();
    operationWorkbook.addWorksheet("Master Data");
    const operations = operationWorkbook.addWorksheet("Operations");
    operations.addRow([]);
    operations.addRow([]);
    operations.addRow([]);
    operations.addRow(["operation-1", "CNO-1", "Spraying", "", "", "", "many"]);
    await expect(
      readMasterDataWorkbook(await makeWorkbookFile(operationWorkbook)),
    ).rejects.toThrow("Operations row 4: Unit Cost must be a number.");
  });

  it("defaults blank product and operation fields during import", async () => {
    const workbook = new ExcelJS.Workbook();
    const products = workbook.addWorksheet("Master Data");
    for (let i = 0; i < 3; i++) products.addRow([]);
    products.addRow(["product-1", "", "Seed"]);
    const operations = workbook.addWorksheet("Operations");
    for (let i = 0; i < 3; i++) operations.addRow([]);
    operations.addRow(["operation-1", "", "Harvest", "", "", "", "", "", "No"]);

    const result = await readMasterDataWorkbook(
      await makeWorkbookFile(workbook),
    );

    expect(result.products[0]).toMatchObject({
      product_class: "Unclassified",
      crop_type: "Not applicable",
      status: "Approved",
    });
    expect(result.operations[0]).toMatchObject({
      unit: "ha",
      category: "Other",
      description: null,
      unit_cost: 0,
      supplier: null,
      active: false,
    });
  });
});

describe("planning workbook", () => {
  it("imports valid fields and reports action, required-value, and custom-product errors", async () => {
    const workbook = new ExcelJS.Workbook();
    const custom = workbook.addWorksheet("New Products");
    custom.addRow([]);
    custom.addRow([]);
    custom.addRow([]);
    custom.addRow([]);
    custom.addRow(["Product name"]);
    custom.addRow([
      "My custom seed",
      "Seed Co",
      "Seed",
      "Wheat",
      "bag",
      "REG-1",
      "note",
    ]);
    const farm = workbook.addWorksheet("Farm Farm Plan");
    farm.addRow(["Farm Farm Plan"]);
    for (let i = 1; i < 5; i++) farm.addRow([]);
    farm.addRow([
      "Add",
      "North",
      "Planting",
      "2026-03-01",
      "Product",
      "Seed",
      "",
      2,
      "kg",
      "Wheat",
      "",
      "",
      "note",
      "",
      "",
    ]);
    farm.addRow([
      "Bad",
      "",
      "Planting",
      "",
      "Product",
      "",
      "",
      0,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    farm.addRow([
      "Update",
      "North",
      "",
      "",
      "Product",
      "+ Custom product - enter details on New Products tab",
      "Missing product",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    farm.addRow([
      "Add",
      "North",
      "Planting",
      "",
      "Product",
      "+ Custom product - enter details on New Products tab",
      "My custom seed",
      1,
      "bag",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    farm.addRow([
      "Keep",
      "South",
      "",
      "",
      "None",
      "",
      "",
      "",
      "",
      "Soybean",
      "",
      "",
      "",
      "plan-1",
      "",
    ]);
    farm.addRow([
      "Delete",
      "",
      "",
      "",
      "None",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "plan-delete",
      "",
    ]);

    const rows = await readPlanningWorkbook(await makeWorkbookFile(workbook));

    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      row: 6,
      sheet: "Farm Farm Plan",
      action: "Add",
      fieldLabel: "Farm · North",
      item: "Seed",
      rate: 2,
      errors: [],
    });
    expect(rows[1].errors).toContain("Farm Farm Plan: Choose a valid Action.");
    expect(rows[1].errors).toContain("Farm Farm Plan: Field is required.");
    expect(rows[1].errors).toContain(
      "Farm Farm Plan: Choose a product or operation.",
    );
    expect(rows[2].errors).toContain("Farm Farm Plan: Activity is required.");
    expect(rows[2].errors).toContain(
      "Farm Farm Plan: Add this custom product to New Products using exactly the same name.",
    );
    expect(rows[3]).toMatchObject({
      action: "Add",
      item: "My custom seed",
      customProduct: {
        name: "My custom seed",
        manufacturer: "Seed Co",
        cropType: "Wheat",
        unit: "bag",
      },
    });
    expect(rows[4]).toMatchObject({
      action: "Keep",
      fieldLabel: "Farm · South",
      planId: "plan-1",
    });
    expect(rows[5]).toMatchObject({
      action: "Delete",
      fieldLabel: "Farm · ",
      errors: ["Farm Farm Plan: Field is required."],
    });
  });

  it("rejects workbooks without a farm plan sheet", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Start Here");
    workbook.addWorksheet("Plan Summary");
    workbook.addWorksheet("New Products");
    workbook.addWorksheet("Lists");
    await expect(
      readPlanningWorkbook(await makeWorkbookFile(workbook)),
    ).rejects.toThrow("This is not a CropNex Farm Plan workbook.");
  });

  it("exports base sheets and farm sheets with a unique safe worksheet name", async () => {
    const downloads = stubDownloads();
    const fields: Field[] = [
      {
        id: "field-1",
        field_name: "North",
        farm_name: "Farm/One",
        crop: "White Maize",
        season: null,
        planting_date: null,
        cultivar: null,
        soil_type: null,
        expected_yield: null,
        status: null,
        area_ha: 1,
        notes: null,
        boundary: null,
      },
      {
        id: "field-2",
        field_name: "South",
        farm_name: "Farm:One",
        crop: null,
        season: null,
        planting_date: null,
        cultivar: null,
        soil_type: null,
        expected_yield: null,
        status: null,
        area_ha: 1,
        notes: null,
        boundary: null,
      },
      {
        id: "field-3",
        field_name: "East",
        farm_name: "Farm/One",
        crop: "Wheat",
        season: null,
        planting_date: null,
        cultivar: null,
        soil_type: null,
        expected_yield: null,
        status: null,
        area_ha: 1,
        notes: null,
        boundary: null,
      },
    ];
    const plans: ActivityPlan[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        field_id: "field-1",
        farmer_name: "Farmer",
        farm_name: "Farm/One",
        field_name: "North",
        activity_type: "Planting",
        crop: "White Maize",
        cultivar: null,
        season: "2026/27",
        planned_date: "2026-10-01",
        planned_area_ha: 1,
        status: "Planned",
        notes: null,
        planned_total: 0,
        actual_date: null,
        actual_total: 0,
        actual_notes: null,
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ];
    const planWithoutInputs: ActivityPlan = {
      ...plans[0],
      id: "plan-2",
      field_id: "field-3",
      field_name: "East",
      crop: "Wheat",
    };
    const products: ActivityPlanProduct[] = [
      {
        id: "input-1",
        plan_id: "plan-1",
        inventory_item_id: "inventory-1",
        product_name: "Hybrid seed",
        unit: "bag",
        planned_rate_per_ha: 1,
        planned_quantity: 1,
        planned_unit_price: 15,
        planned_cost: 15,
        actual_rate_per_ha: null,
        actual_quantity: null,
        actual_unit_price: null,
        actual_cost: null,
      },
      {
        id: "input-2",
        plan_id: "plan-1",
        inventory_item_id: "inventory-2",
        product_name: "Fertiliser",
        unit: "kg",
        planned_rate_per_ha: 20,
        planned_quantity: 20,
        planned_unit_price: 0,
        planned_cost: 0,
        actual_rate_per_ha: null,
        actual_quantity: null,
        actual_unit_price: null,
        actual_cost: null,
      },
      {
        id: "input-3",
        plan_id: "plan-1",
        inventory_item_id: "inventory-3",
        product_name: "Uncatalogued input",
        unit: "unit",
        planned_rate_per_ha: 1,
        planned_quantity: 1,
        planned_unit_price: 0,
        planned_cost: 0,
        actual_rate_per_ha: null,
        actual_quantity: null,
        actual_unit_price: null,
        actual_cost: null,
      },
    ];
    await downloadPlanningWorkbook({
      season: "2026/27",
      fields,
      plans: [...plans, planWithoutInputs],
      products,
      planOperations: [
        {
          id: "operation-1",
          plan_id: "plan-1",
          operation_id: null,
          operation_name: "Spraying",
          unit: "ha",
          planned_rate_per_ha: 1,
          planned_unit_price: 10,
        },
      ],
      catalogue: [
        {
          id: "catalogue-1",
          name: "Hybrid seed",
          category: "Seed",
          product_class: "Seed",
          crop_type: "White Maize",
          pack_unit: "bag",
          inventory_price: 15,
        },
        {
          id: "catalogue-2",
          name: "Fertiliser",
          category: "Fertiliser",
          product_class: "Fertiliser",
          crop_type: null,
          pack_unit: "kg",
          inventory_price: 0,
        },
      ],
      operations: [
        { id: "operation-1", name: "Spraying", unit: "ha", unit_cost: 10 },
      ],
      activities: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await downloads.blobs[0].arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Start Here",
      "Plan Summary",
      "New Products",
      "Lists",
      "Farm-One",
      "Farm-One 2",
    ]);
    const farmSheet = workbook.getWorksheet("Farm-One");
    expect(farmSheet?.getCell("A6").value).toBe("Keep");
    expect(farmSheet?.getCell("B6").value).toBe("North");
    expect(farmSheet?.getCell("E6").value).toBe("Product");
    expect(farmSheet?.getCell("J6").value).toMatchObject({
      result: "White Maize",
    });
    expect(farmSheet?.getCell("K6").value).toMatchObject({
      result: "Shed price",
    });
    expect(farmSheet?.getCell("K7").value).toMatchObject({
      result: "Price needed",
    });
    expect(farmSheet?.getCell("K8").value).toMatchObject({
      result: "Price needed",
    });
    expect(farmSheet?.getCell("K9").value).toMatchObject({
      result: "Operation price",
    });
    expect(farmSheet?.getCell("E10").value).toBe("None");
    expect(workbook.getWorksheet("Plan Summary")?.getCell("C4").value).toBe(5);
    expect(workbook.getWorksheet("Plan Summary")?.getCell("D4").value).toBe(2);
  });
});

describe("transport workbook", () => {
  it("imports valid rows and reports invalid values while allowing deletion without required fields", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transport Log");
    for (let i = 0; i < 5; i++) sheet.addRow([]);
    sheet.addRow([
      "Add",
      "",
      "",
      "",
      "LOAD-1",
      new Date(2026, 2, 4),
      "Farm · North",
      "Wheat",
      "Cultivar",
      "Mill",
      "TRK-1",
      "",
      "",
      "",
      "T-1",
      10,
      8,
      7,
      1,
      12,
      "WM1",
      "Reconciled",
      "Yes",
      new Date(2026, 2, 5),
      "note",
    ]);
    sheet.addRow([
      "Update",
      "",
      "",
      "",
      "LOAD-2",
      "not a date",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      0,
      0,
      "",
      "",
      "",
      "BAD",
      "Unknown",
      "true",
      "",
      "",
    ]);
    sheet.addRow([
      "Delete",
      "",
      "allocation-3",
      "",
      "LOAD-3",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      0,
      0,
      "",
      "",
      "",
      "",
      "Planned",
      "No",
      "",
      "",
    ]);
    sheet.addRow([
      "",
      "",
      "",
      "",
      "LOAD-4",
      "2026-03-05",
      "Farm · South",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      1,
      1,
      "",
      "",
      "",
      "",
      "",
      "no",
      "",
      "",
    ]);
    sheet.addRow([
      "Add",
      "",
      "",
      "",
      "LOAD-5",
      45292,
      "Farm · East",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      1,
      1,
      "",
      "",
      "",
      "",
      "Planned",
      "No",
      "",
      "",
    ]);
    sheet.addRow([
      "Add",
      "",
      "",
      "",
      "LOAD-6",
      "March 5, 2026",
      "Farm · West",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      1,
      1,
      "",
      "",
      "",
      "",
      "Planned",
      "No",
      "",
      "",
    ]);
    sheet.addRow([
      "Keep",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    const rows = await readTransportWorkbook(await makeWorkbookFile(workbook));

    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      loadNumber: "LOAD-1",
      loadDate: "2026-03-04",
      net: 10,
      allocated: 8,
      harvestComplete: true,
      completionDate: "2026-03-05",
      errors: [],
    });
    expect(rows[1].errors).toEqual(
      expect.arrayContaining([
        "Row 7: Field is required",
        "Row 7: Choose a valid date from the dropdown",
        "Row 7: Nett Weight must be greater than zero",
        "Row 7: Allocated tonnes must be greater than zero",
        "Row 7: Invalid status",
        "Row 7: A field can only be completed on a Reconciled load",
        "Row 7: Choose a completion date from the dropdown",
      ]),
    );
    expect(rows[2].errors).toEqual([]);
    expect(rows[2].action).toBe("Delete");
    expect(rows[3]).toMatchObject({
      action: "Add",
      status: "Planned",
      loadDate: "2026-03-05",
      harvestComplete: false,
      errors: [],
    });
    expect(rows[4].loadDate).toBe("2024-01-01");
    expect(rows[5].loadDate).toBe("2026-03-05");
  });

  it("validates crop-specific grades and rejects unrepresentable Excel dates safely", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transport Log");
    for (let i = 0; i < 5; i++) sheet.addRow([]);
    const addRow = (
      loadNumber: string,
      crop: string,
      grade: string,
      date: Date | number = new Date("2026-03-05T00:00:00"),
    ) =>
      sheet.addRow([
        "Add",
        "",
        "",
        "",
        loadNumber,
        date,
        "Farm · North",
        crop,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        1,
        1,
        "",
        "",
        "",
        grade,
        "Planned",
        "No",
        "",
        "",
      ]);

    addRow("WHITE", "White Maize", "WM1");
    addRow("YELLOW", "Yellow Maize", "YM3");
    addRow("SUNFLOWER", "Sunflower", "FHO");
    addRow("SOY", "Soybean", "SBU");
    addRow("OTHER", "Barley", "SB");
    addRow("BLANK", "Wheat", "");
    addRow("INVALID", "White Maize", "YM1");
    addRow("BAD-DATE", "White Maize", "WM2", Number.MAX_SAFE_INTEGER);

    const rows = await readTransportWorkbook(await makeWorkbookFile(workbook));

    expect(rows.slice(0, 6).every((row) => row.errors.length === 0)).toBe(true);
    expect(rows[6].errors).toContain(
      "Row 12: Grade is not valid for the selected crop",
    );
    expect(rows[7].errors).toContain(
      "Row 13: Choose a valid date from the dropdown",
    );
  });

  it("rejects workbooks without a transport log sheet", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Other");
    await expect(
      readTransportWorkbook(await makeWorkbookFile(workbook)),
    ).rejects.toThrow("This is not a CropNex Transport Logsheet.");
  });

  it("exports empty transport sheets and empty-load summaries", async () => {
    const downloads = stubDownloads();
    await downloadTransportWorkbook({
      fields: [],
      loads: [],
      allocations: [],
      destinations: [],
      vehicles: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await downloads.blobs[0].arrayBuffer());
    expect(workbook.getWorksheet("Transport Log")?.getCell("A6").value).toBe(
      "Add",
    );
    expect(workbook.getWorksheet("Summary")?.getCell("A2").value).toBe(
      "Exported loads",
    );
    expect(workbook.getWorksheet("Summary")?.getCell("B2").value).toBe(0);
  });

  it("skips allocations without a matching load and uses allocation snapshot details", async () => {
    const downloads = stubDownloads();
    const load: TransportLoad = {
      id: "load-1",
      user_id: "user-1",
      load_number: "LOAD-1",
      load_date: "2026-03-01",
      destination_name: null,
      truck_registration: null,
      trailer_registration: null,
      driver_name: null,
      transporter: null,
      ticket_number: null,
      gross_tonnes: null,
      tare_tonnes: null,
      net_tonnes: 5,
      accepted_tonnes: null,
      rejected_tonnes: null,
      moisture_percent: null,
      grade: null,
      status: "Planned",
      notes: null,
      source: "manual",
    };
    const allocation: TransportAllocation = {
      id: "allocation-1",
      user_id: "user-1",
      load_id: "load-1",
      field_id: "deleted-field",
      allocated_tonnes: 5,
      crop_snapshot: "Maize",
      cultivar_snapshot: "Hybrid",
      season_snapshot: "2026",
      field_harvest_complete: false,
      completion_date: null,
      notes: null,
    };
    const unmatched = {
      ...allocation,
      id: "allocation-2",
      load_id: "missing-load",
    };

    await downloadTransportWorkbook({
      fields: [],
      loads: [load],
      allocations: [allocation, unmatched],
      destinations: [],
      vehicles: [],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await downloads.blobs[0].arrayBuffer());
    const log = workbook.getWorksheet("Transport Log");
    expect(log?.rowCount).toBe(506);
    expect(log?.getCell("G6").value).toBe("Missing field");
    expect(log?.getCell("H6").value).toMatchObject({
      formula: expect.stringContaining("MATCH(G6"),
    });
    expect(workbook.getWorksheet("Summary")?.getCell("B3").value).toBe(10);
  });

  it("exports matched field details and zero or completed allocation values", async () => {
    const downloads = stubDownloads();
    const field: Field = {
      id: "field-1",
      field_name: "North",
      farm_name: "Farm One",
      crop: "Maize",
      season: "2026",
      planting_date: null,
      cultivar: "Hybrid",
      soil_type: null,
      expected_yield: null,
      status: null,
      area_ha: 1,
      notes: null,
      boundary: null,
    };
    const load: TransportLoad = {
      id: "load-1",
      user_id: "user-1",
      load_number: "LOAD-1",
      load_date: "2026-03-01",
      destination_name: null,
      truck_registration: null,
      trailer_registration: null,
      driver_name: null,
      transporter: null,
      ticket_number: null,
      gross_tonnes: null,
      tare_tonnes: null,
      net_tonnes: 0,
      accepted_tonnes: null,
      rejected_tonnes: null,
      moisture_percent: null,
      grade: null,
      status: "Reconciled",
      notes: null,
      source: "manual",
    };
    const allocation: TransportAllocation = {
      id: "allocation-1",
      user_id: "user-1",
      load_id: "load-1",
      field_id: "field-1",
      allocated_tonnes: 0,
      crop_snapshot: null,
      cultivar_snapshot: null,
      season_snapshot: "2026",
      field_harvest_complete: true,
      completion_date: "2026-03-02",
      notes: null,
    };

    await downloadTransportWorkbook({
      fields: [field],
      loads: [load],
      allocations: [allocation],
      destinations: [],
      vehicles: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await downloads.blobs[0].arrayBuffer());
    const log = workbook.getWorksheet("Transport Log");

    expect(log?.getCell("G6").value).toBe("Farm One · North");
    expect(log?.getCell("H6").value).toMatchObject({
      formula: expect.stringContaining("Lists!$J$2"),
    });
    expect(log?.getCell("I6").value).toMatchObject({
      formula: expect.stringContaining("Lists!$K$2"),
    });
    expect(workbook.getWorksheet("Lists")?.getCell("J2").value).toBe("Maize");
    expect(workbook.getWorksheet("Lists")?.getCell("K2").value).toBe("Hybrid");
    expect(log?.getCell("P6").value).toBe("");
    expect(log?.getCell("W6").value).toBe("Yes");
    expect(log?.getCell("X6").value).toBeInstanceOf(Date);
    expect(workbook.getWorksheet("Summary")?.getCell("B3").value).toBe(0);
  });
});

describe("management workbook", () => {
  it("exports calculations, fallback values, and escaped SpreadsheetML", async () => {
    const downloads = stubDownloads();
    const fields: Field[] = [
      {
        id: "field-1",
        field_name: "North <1>",
        farm_name: "Farm & Sons",
        crop: "Maize",
        season: "2026",
        planting_date: null,
        cultivar: null,
        soil_type: null,
        expected_yield: null,
        status: null,
        area_ha: 2,
        notes: null,
        boundary: null,
      },
    ];
    const activities: Activity[] = [
      {
        id: "activity-1",
        activity_type: "Planting",
        field_name: "North <1>",
        date: "2026-10-01",
        notes: "A&B",
        created_at: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "activity-2",
        activity_type: "Spraying",
        field_name: "Unknown",
        crop: "Wheat",
        date: "2026-10-02",
        notes: null,
        created_at: "2026-10-02T00:00:00.000Z",
      },
    ];
    const transactions: FinancialTransaction[] = [
      {
        id: "transaction-1",
        field_id: "field-1",
        transaction_date: "2026-01-15",
        transaction_type: "Income",
        category: "Grain",
        description: "Maize",
        quantity: 1,
        unit: "tonne",
        unit_price: 100,
        amount: 100,
        supplier_or_customer: "Buyer",
        reference: "R-1",
        notes: null,
      },
      {
        id: "transaction-2",
        field_id: "field-1",
        transaction_date: "2026-01-15",
        transaction_type: "Expense",
        category: "Seed",
        description: "Seed",
        quantity: 1,
        unit: "bag",
        unit_price: 40,
        amount: 40,
        supplier_or_customer: "Supplier",
        reference: "R-2",
        notes: null,
      },
      {
        id: "transaction-3",
        field_id: null,
        transaction_date: "2026-02-15",
        transaction_type: "Income",
        category: "Other",
        description: "Other income",
        quantity: null,
        unit: null,
        unit_price: null,
        amount: 25,
        supplier_or_customer: null,
        reference: null,
        notes: null,
      },
    ];
    const inventory: InventoryItem[] = [
      {
        id: "inventory-1",
        name: "Seed <A>",
        category: "Seed",
        unit: "bag",
        quantity: 3,
        minimum_quantity: 1,
        unit_cost: 10,
        supplier: "Supplier",
        batch_number: null,
        expiry_date: null,
        location: null,
        status: "Available",
        notes: null,
      },
      {
        id: "inventory-2",
        name: "Uncosted stock",
        category: "Other",
        unit: "unit",
        quantity: 2,
        minimum_quantity: null,
        unit_cost: null,
        supplier: null,
        batch_number: null,
        expiry_date: null,
        location: null,
        status: "Available",
        notes: null,
      },
    ];
    const equipment: Equipment[] = [
      {
        id: "equipment-1",
        name: "Tractor",
        category: "Tractor",
        brand: "Brand",
        model: "Model",
        registration: null,
        serial_number: null,
        year: null,
        purchase_date: null,
        purchase_price: 200,
        engine_hours: 100,
        service_interval: null,
        last_service_hours: null,
        fuel_type: null,
        status: "Active",
        notes: null,
        installment_amount: null,
        installment_frequency: null,
        finance_start_date: null,
        finance_term_seasons: null,
        finance_notes: null,
      },
      {
        id: "equipment-2",
        name: "Unpriced asset",
        category: "Equipment",
        brand: null,
        model: null,
        registration: null,
        serial_number: null,
        year: null,
        purchase_date: null,
        purchase_price: null,
        engine_hours: 0,
        service_interval: null,
        last_service_hours: null,
        fuel_type: null,
        status: "Active",
        notes: null,
        installment_amount: null,
        installment_frequency: null,
        finance_start_date: null,
        finance_term_seasons: null,
        finance_notes: null,
      },
    ];
    downloadManagementWorkbook({
      fields,
      activities,
      transactions,
      inventory,
      equipment,
    });
    const xml = await downloads.blobs[0].text();
    expect(xml).toContain("Farm &amp; Sons");
    expect(xml).toContain("North &lt;1&gt;");
    expect(xml).toContain("A&amp;B");
    expect(xml).toContain("Seed &lt;A&gt;");
    expect(xml).toContain('<Data ss:Type="Number">2</Data>');
    expect(xml).toContain('<Data ss:Type="Number">100</Data>');
    expect(xml).toContain('<Data ss:Type="Number">40</Data>');
    expect(xml).toContain('<Data ss:Type="Number">60</Data>');
    expect(xml).toContain('<Data ss:Type="Number">30</Data>');
    expect(xml).toContain('ss:Name="Executive Summary"');
    expect(xml).toContain('ss:Name="Cash Flow"');
    expect(xml).toContain('ss:Name="Field Margins"');
    expect(xml).toContain('ss:Name="Activity Detail"');
    expect(xml).toContain('ss:Name="Transactions"');
    expect(xml).toContain('ss:Name="Inventory"');
    expect(xml).toContain('ss:Name="Assets"');
  });

  it("uses supplied performance values and avoids dividing by a zero-area field", async () => {
    const downloads = stubDownloads();
    downloadManagementWorkbook({
      fields: [
        {
          id: "field-zero",
          field_name: "Zero",
          farm_name: "Farm",
          crop: "Wheat",
          season: "2026",
          planting_date: null,
          cultivar: null,
          soil_type: null,
          expected_yield: null,
          status: null,
          area_ha: 0,
          notes: null,
          boundary: null,
        },
      ],
      activities: [],
      transactions: [],
      inventory: [],
      equipment: [],
      performance: [
        {
          field_id: "field-zero",
          planning_cost: 10,
          remaining_planned_cost: 7,
          actualised_cost: 3,
          additional_expenses: 2,
          total_cost: 5,
          harvested_tonnes: 4,
          projected_income: 20,
          projected_margin: 15,
        },
      ],
    });

    const xml = await downloads.blobs[0].text();
    expect(xml).toContain('ss:Name="Field Margins"');
    expect(xml).toContain('<Data ss:Type="Number">15</Data>');
    expect(xml).toContain('<Data ss:Type="Number">4</Data>');
  });
});
