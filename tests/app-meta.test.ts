import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  APP_STAGE,
  APP_VERSION,
  COMPANY_NAME,
  COMPANY_REGISTRATION,
  LEGAL_VERSION,
} from "@/lib/app-meta";

describe("application metadata", () => {
  it("exports the current product and legal metadata", () => {
    expect({
      APP_NAME,
      APP_VERSION,
      APP_STAGE,
      LEGAL_VERSION,
      COMPANY_NAME,
      COMPANY_REGISTRATION,
    }).toEqual({
      APP_NAME: "CropNex",
      APP_VERSION: "6.37.0",
      APP_STAGE: "Private Beta",
      LEGAL_VERSION: "2026-10-23",
      COMPANY_NAME: "CROPNEX (PTY) LTD",
      COMPANY_REGISTRATION: "2026/452524/07",
    });
  });
});
