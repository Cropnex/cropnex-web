import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTrialsWorkbook,
  renderTrialReportChart,
} from "@/lib/trials-workbook";
import type { Field } from "@/types/field";
import type {
  Trial,
  TrialDetails,
  TrialInput,
  TrialStrip,
} from "@/types/trial";

const makeTrial = (id: string, name: string): Trial => ({
  id,
  user_id: "user-1",
  field_id: `field-${id}`,
  season: "2026/27",
  name,
  crop: "Maize",
  cultivar: "Hybrid",
  objective: "Compare treatments",
  start_date: "2026-10-01",
  end_date: null,
  crop_price_per_tonne: 100,
  notes: "Trial notes",
  created_at: "2026-10-01T00:00:00.000Z",
});

const makeStrip = (
  id: string,
  overrides: Partial<TrialStrip> = {},
): TrialStrip => ({
  id,
  trial_id: "trial-1",
  user_id: "user-1",
  strip_name: id,
  description: "Strip description",
  area_ha: 1,
  operation_cost_per_ha: 10,
  harvested: false,
  tonnes: 0,
  moisture: null,
  record_date: null,
  notes: null,
  yield_source: "Manual",
  treatment_id: null,
  ...overrides,
});

const makeInput = (
  id: string,
  stripId: string | null,
  overrides: Partial<TrialInput> = {},
): TrialInput => ({
  id,
  trial_id: "trial-1",
  user_id: "user-1",
  strip_id: stripId,
  input_type: "Product",
  product_name: id,
  rate: 1,
  rate_unit: "kg/ha",
  unit_price: 2,
  notes: null,
  ...overrides,
});

const details: TrialDetails = {
  strips: [
    makeStrip("Harvested", {
      harvested: true,
      tonnes: 4,
      moisture: 12.5,
      record_date: "2026-11-01",
    }),
    makeStrip("Pending"),
  ],
  inputs: [
    makeInput("Seed", "Harvested"),
    makeInput("Unassigned", null),
    makeInput("Old template", null, { legacy_template: true }),
  ],
  visits: [
    {
      id: "visit-1",
      trial_id: "trial-1",
      user_id: "user-1",
      visit_date: "2026-10-15",
      title: "Emergence check",
      notes: null,
      created_at: "2026-10-15T00:00:00.000Z",
    },
  ],
  photos: [
    {
      id: "photo-1",
      trial_id: "trial-1",
      user_id: "user-1",
      object_path: "photo.png",
      caption: "Emergence",
      visit_id: "visit-1",
      strip_id: "Harvested",
      taken_date: "2026-10-15",
    },
    {
      id: "photo-2",
      trial_id: "trial-1",
      user_id: "user-1",
      object_path: "another.png",
      caption: null,
      visit_id: "missing-visit",
      strip_id: "missing-strip",
      taken_date: null,
    },
  ],
};

const fields: Field[] = [
  {
    id: "field-trial-1",
    field_name: "North",
    farm_name: "Farm One",
    crop: "Maize",
    season: null,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTrialsWorkbook", () => {
  it("exports trial summaries, detailed sheets, linked photos, and chart images", async () => {
    const chartRenderer = vi.fn(
      (
        title: string,
        rows: { name: string; value: number }[],
        currency: boolean,
      ) => `${title}:${rows.length}:${currency}`,
    );
    const workbook = createTrialsWorkbook({
      trials: [
        makeTrial("trial-1", "North/Trial"),
        makeTrial("trial-2", "North/Trial"),
        makeTrial("trial-3", "''"),
      ],
      fields,
      details: { "trial-1": details },
      chartRenderer,
      photoImages: {
        "photo-1":
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgU0AAAAASUVORK5CYII=",
      },
    });
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Trials Summary",
      "North-Trial",
      "North-Trial 2",
      "Trial",
    ]);
    expect(workbook.getWorksheet("Trials Summary")?.getRow(5).values).toEqual(
      expect.arrayContaining(["Harvested", 1, 12, 4, 4, 100, 400, 388, 388]),
    );

    const trialSheet = workbook.getWorksheet("North-Trial");
    expect(trialSheet?.getCell("B2").value).toBe("Farm One · North · 2026/27");
    expect(trialSheet?.getCell("B3").value).toBe("Maize · Hybrid");
    expect(trialSheet?.getImages()).toHaveLength(3);
    expect(
      trialSheet?.getRows(1, trialSheet.rowCount)?.some((row) => {
        const values = row.values;
        return (
          Array.isArray(values) &&
          values.includes(
            "UNASSIGNED LEGACY INPUTS — excluded from strip costs until allocated",
          )
        );
      }),
    ).toBe(true);
    expect(chartRenderer).toHaveBeenCalledTimes(6);
    expect(chartRenderer.mock.calls[0][1]).toEqual([
      { name: "Harvested", value: 4 },
    ]);
    expect(chartRenderer.mock.calls[1][2]).toBe(true);
  });

  it("uses safe fallback values and omits charts when the renderer has no image", () => {
    const chartRenderer = vi.fn(() => undefined);
    const workbook = createTrialsWorkbook({
      trials: [makeTrial("missing", "Invalid:?Name")],
      fields: [],
      details: {},
      chartRenderer,
    });

    expect(workbook.getWorksheet("Invalid--Name")?.getCell("B2").value).toBe(
      " ·  · 2026/27",
    );
    expect(workbook.getWorksheet("Invalid--Name")?.getCell("B3").value).toBe(
      "Maize · Hybrid",
    );
    expect(
      workbook.getWorksheet("Trials Summary")?.getCell("B5").value,
    ).toBeNull();
    expect(chartRenderer).toHaveBeenCalledTimes(2);
    expect(chartRenderer).toHaveBeenCalledWith(
      "Yield by strip (t/ha)",
      [],
      false,
    );
  });

  it("uses blank-safe fallbacks when trial and strip details are missing", () => {
    const trial = makeTrial("empty", "Empty trial");
    trial.crop = null;
    trial.cultivar = null;
    trial.objective = null;
    trial.start_date = null;
    trial.end_date = null;
    trial.crop_price_per_tonne = 0;
    trial.notes = null;
    const workbook = createTrialsWorkbook({
      trials: [trial],
      fields: [],
      details: {
        [trial.id]: {
          strips: [
            makeStrip("Empty strip", {
              trial_id: trial.id,
              description: null,
              operation_cost_per_ha: 0,
            }),
          ],
          inputs: [],
          visits: [],
          photos: [],
        },
      },
      chartRenderer: () => undefined,
    });
    const sheet = workbook.getWorksheet("Empty trial");
    const rows = sheet ? (sheet.getRows(1, sheet.rowCount) ?? []) : [];
    const stripDescription = rows.find(
      (row) =>
        row.getCell(1).value === "Description" && row.getCell(2).value === "",
    );
    const operationCost = rows.find(
      (row) => row.getCell(1).value === "Additional operation R/ha",
    );

    expect(sheet?.getCell("B3").value).toBe(" · ");
    expect(sheet?.getCell("B4").value).toBe("");
    expect(sheet?.getCell("B5").value).toBe(0);
    expect(sheet?.getCell("B6").value).toBe("— to —");
    expect(sheet?.getCell("B7").value).toBe("");
    expect(stripDescription?.getCell(2).value).toBe("");
    expect(operationCost?.getCell(2).value).toBe(0);
  });
});

describe("renderTrialReportChart", () => {
  it("returns no image when the browser canvas or its rendering context is unavailable", () => {
    vi.stubGlobal("document", undefined);
    expect(renderTrialReportChart("Yield", [], false)).toBeUndefined();

    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => null }),
    });
    expect(renderTrialReportChart("Yield", [], false)).toBeUndefined();
  });

  it("renders empty and mixed-sign chart data without assuming positive values", () => {
    const calls: string[] = [];
    const context = {
      fillStyle: "",
      font: "",
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => calls.push(text)),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => "data:image/png;base64,test",
    };
    vi.stubGlobal("document", { createElement: () => canvas });

    expect(renderTrialReportChart("Yield", [], false)).toBe(
      "data:image/png;base64,test",
    );
    expect(calls).toContain("Results pending harvest");
    expect(
      renderTrialReportChart(
        "Margin",
        [
          {
            name: "A very long strip name that should be shortened",
            value: -3,
          },
          { name: "Positive", value: 7 },
        ],
        true,
      ),
    ).toBe("data:image/png;base64,test");
    expect(
      renderTrialReportChart("Zero", [{ name: "Zero", value: 0 }], false),
    ).toBe("data:image/png;base64,test");
    expect(
      calls.some(
        (text) => text.startsWith("A very long") && text.endsWith("…"),
      ),
    ).toBe(true);
    expect(calls).toContain("R -3");
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.fillRect).toHaveBeenCalled();
  });
});
