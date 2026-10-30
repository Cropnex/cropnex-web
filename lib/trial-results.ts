import type { Trial, TrialDetails, TrialInput, TrialStrip } from "@/types/trial";

export function calculateStripResults(trial: Trial, strips: TrialStrip[], inputs: TrialInput[]) {
  return strips.filter(strip => strip.trial_id === trial.id).map(strip => {
    const products = inputs.filter(input => input.trial_id === trial.id && input.strip_id === strip.id && !input.legacy_template);
    const inputCostPerHa = products.reduce((sum, input) => sum + Number(input.rate) * Number(input.unit_price), 0);
    const costPerHa = inputCostPerHa + Number(strip.operation_cost_per_ha || 0);
    const area = Number(strip.area_ha);
    const harvested = strip.harvested && strip.yield_source === "Manual" && area > 0;
    const tonnes = harvested ? Number(strip.tonnes) : null;
    const yieldPerHa = tonnes === null ? null : tonnes / area;
    const price = Number(trial.crop_price_per_tonne || 0);
    const revenuePerHa = yieldPerHa === null ? null : yieldPerHa * price;
    const marginPerHa = revenuePerHa === null ? null : revenuePerHa - costPerHa;
    return { strip, products, area, inputCostPerHa, costPerHa, totalCost: costPerHa * area,
      harvested, tonnes, yieldPerHa, revenuePerHa, marginPerHa,
      totalRevenue: revenuePerHa === null ? null : revenuePerHa * area,
      totalMargin: marginPerHa === null ? null : marginPerHa * area };
  });
}
export type StripResult = ReturnType<typeof calculateStripResults>[number];

export type TrialWorkspaceState = {
  trials: Trial[]; selectedId: string | null; details: TrialDetails | null;
  detailLoading: boolean; detailError: string | null; requestId: number;
};
export const initialTrialWorkspace: TrialWorkspaceState = {
  trials: [], selectedId: null, details: null, detailLoading: false, detailError: null, requestId: 0,
};
type Action =
  | { type: "list"; trials: Trial[] }
  | { type: "saved"; trial: Trial }
  | { type: "select"; id: string | null }
  | { type: "loading"; id: string; requestId: number }
  | { type: "loaded"; id: string; requestId: number; details: TrialDetails }
  | { type: "failed"; id: string; requestId: number; error: string }
  | { type: "reset" };

export function trialWorkspaceReducer(state: TrialWorkspaceState, action: Action): TrialWorkspaceState {
  switch (action.type) {
    case "reset": return initialTrialWorkspace;
    case "list": {
      const selectedId = action.trials.some(t => t.id === state.selectedId) ? state.selectedId : null;
      return { ...state, trials: action.trials, selectedId, details: selectedId ? state.details : null };
    }
    case "saved": return { ...state,
      trials: [action.trial, ...state.trials.filter(t => t.id !== action.trial.id)],
      selectedId: action.trial.id,
      details: state.selectedId === action.trial.id ? state.details : null,
      detailLoading: state.selectedId !== action.trial.id || state.detailLoading, detailError: null };
    case "select": return action.id === state.selectedId ? state : {
      ...state, selectedId: action.id, details: null, detailError: null, detailLoading: Boolean(action.id) };
    case "loading": return action.id !== state.selectedId ? state : {
      ...state, requestId: action.requestId, detailLoading: true, detailError: null };
    case "loaded": return action.id !== state.selectedId || action.requestId !== state.requestId ? state : {
      ...state, details: action.details, detailLoading: false, detailError: null };
    case "failed": return action.id !== state.selectedId || action.requestId !== state.requestId ? state : {
      ...state, detailLoading: false, detailError: action.error };
  }
}
