import { describe, expect, it } from "vitest";
import {
  calculateStripResults,
  initialTrialWorkspace,
  trialWorkspaceReducer,
} from "@/lib/trial-results";
import type { Trial, TrialDetails, TrialInput, TrialStrip } from "@/types/trial";

const trial = (id = "trial-1"): Trial => ({
  id,
  user_id: "user-1",
  field_id: "field-1",
  season: "2026/27",
  name: `Trial ${id}`,
  crop: "Maize",
  cultivar: null,
  objective: null,
  start_date: null,
  end_date: null,
  crop_price_per_tonne: 100,
  notes: null,
  created_at: "2026-01-01",
});

const strip = (id: string, overrides: Partial<TrialStrip> = {}): TrialStrip => ({
  id,
  trial_id: "trial-1",
  user_id: "user-1",
  strip_name: id,
  description: null,
  area_ha: 2,
  operation_cost_per_ha: 5,
  harvested: false,
  tonnes: 0,
  moisture: null,
  record_date: null,
  notes: null,
  yield_source: "Manual",
  treatment_id: null,
  ...overrides,
});

const input = (
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
  rate: 2,
  rate_unit: "kg/ha",
  unit_price: 3,
  notes: null,
  ...overrides,
});

const details: TrialDetails = {
  strips: [],
  inputs: [],
  visits: [],
  photos: [],
};

describe("calculateStripResults", () => {
  it("calculates manual harvested yields, costs, and margins for matching inputs", () => {
    const harvested = strip("strip-1", {
      harvested: true,
      tonnes: 8,
      operation_cost_per_ha: 5,
    });
    const results = calculateStripResults(
      trial(),
      [harvested, strip("another-trial", { trial_id: "other" })],
      [
        input("seed", "strip-1"),
        input("legacy", "strip-1", { legacy_template: true }),
        input("unassigned", null),
        input("other-trial", "strip-1", { trial_id: "other" }),
      ],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      strip: harvested,
      products: [input("seed", "strip-1")],
      area: 2,
      inputCostPerHa: 6,
      costPerHa: 11,
      totalCost: 22,
      harvested: true,
      tonnes: 8,
      yieldPerHa: 4,
      revenuePerHa: 400,
      marginPerHa: 389,
      totalRevenue: 800,
      totalMargin: 778,
    });
  });

  it("leaves yield and revenue blank for unharvested, non-manual, or zero-area strips", () => {
    const results = calculateStripResults(
      trial(),
      [
        strip("pending"),
        strip("automatic", {
          harvested: true,
          yield_source: "Machine",
          tonnes: 9,
        }),
        strip("zero-area", { harvested: true, area_ha: 0, tonnes: 9 }),
      ],
      [],
    );

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.harvested).toBe(false);
      expect(result.tonnes).toBeNull();
      expect(result.yieldPerHa).toBeNull();
      expect(result.revenuePerHa).toBeNull();
      expect(result.marginPerHa).toBeNull();
      expect(result.totalRevenue).toBeNull();
      expect(result.totalMargin).toBeNull();
    }
  });

  it("defaults missing operation cost and crop price to zero", () => {
    const result = calculateStripResults(
      { ...trial(), crop_price_per_tonne: 0 },
      [strip("free", { harvested: true, tonnes: 0, operation_cost_per_ha: 0 })],
      [],
    )[0];

    expect(result).toMatchObject({
      costPerHa: 0,
      harvested: true,
      tonnes: 0,
      yieldPerHa: 0,
      revenuePerHa: 0,
      marginPerHa: 0,
      totalMargin: 0,
    });
  });
});

describe("trialWorkspaceReducer", () => {
  it("selects trials, tracks only the latest request, and retains matching details", () => {
    const selected = trialWorkspaceReducer(initialTrialWorkspace, {
      type: "select",
      id: "trial-1",
    });
    expect(selected).toMatchObject({
      selectedId: "trial-1",
      detailLoading: true,
      details: null,
      detailError: null,
    });
    expect(
      trialWorkspaceReducer(selected, { type: "select", id: "trial-1" }),
    ).toBe(selected);
    expect(
      trialWorkspaceReducer(selected, {
        type: "loading",
        id: "other",
        requestId: 1,
      }),
    ).toBe(selected);

    const loading = trialWorkspaceReducer(selected, {
      type: "loading",
      id: "trial-1",
      requestId: 2,
    });
    expect(loading.requestId).toBe(2);
    const loaded = trialWorkspaceReducer(loading, {
      type: "loaded",
      id: "trial-1",
      requestId: 1,
      details,
    });
    expect(loaded).toBe(loading);
    const withDetails = trialWorkspaceReducer(loading, {
      type: "loaded",
      id: "trial-1",
      requestId: 2,
      details,
    });
    expect(withDetails).toMatchObject({
      details,
      detailLoading: false,
      detailError: null,
    });
    expect(
      trialWorkspaceReducer(withDetails, {
        type: "failed",
        id: "trial-1",
        requestId: 1,
        error: "stale",
      }),
    ).toBe(withDetails);
    expect(
      trialWorkspaceReducer(withDetails, {
        type: "failed",
        id: "trial-1",
        requestId: 2,
        error: "network",
      }),
    ).toMatchObject({ detailLoading: false, detailError: "network" });
  });

  it("synchronizes the list, inserts saved trials, and resets selection safely", () => {
    const first = trial("trial-1");
    const second = trial("trial-2");
    const state = {
      ...initialTrialWorkspace,
      trials: [first],
      selectedId: first.id,
      details,
      detailLoading: false,
      detailError: "old error",
    };

    const retained = trialWorkspaceReducer(state, {
      type: "list",
      trials: [first, second],
    });
    expect(retained).toMatchObject({
      selectedId: first.id,
      details,
      trials: [first, second],
    });
    const cleared = trialWorkspaceReducer(retained, {
      type: "list",
      trials: [second],
    });
    expect(cleared).toMatchObject({
      selectedId: null,
      details: null,
      trials: [second],
    });

    const savedNew = trialWorkspaceReducer(cleared, {
      type: "saved",
      trial: first,
    });
    expect(savedNew).toMatchObject({
      trials: [first, second],
      selectedId: first.id,
      details: null,
      detailLoading: true,
      detailError: null,
    });
    const savedExisting = trialWorkspaceReducer(
      { ...state, detailLoading: true },
      { type: "saved", trial: { ...first, name: "Updated" } },
    );
    expect(savedExisting).toMatchObject({
      trials: [{ name: "Updated" }],
      selectedId: first.id,
      details,
      detailLoading: true,
      detailError: null,
    });

    expect(
      trialWorkspaceReducer(state, { type: "select", id: null }),
    ).toMatchObject({
      selectedId: null,
      details: null,
      detailLoading: false,
      detailError: null,
    });
    expect(
      trialWorkspaceReducer(state, { type: "reset" }),
    ).toBe(initialTrialWorkspace);
  });
});
