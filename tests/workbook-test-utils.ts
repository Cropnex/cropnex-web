import ExcelJS from "exceljs";
import { vi } from "vitest";

export async function makeWorkbookFile(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(buffer)], "test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function stubDownloads() {
  const blobs: Blob[] = [];
  const click = vi.fn();
  const anchor = { href: "", download: "", click };
  const createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return "blob:test-download";
  });
  const revokeObjectURL = vi.fn();

  vi.stubGlobal("document", {
    createElement: vi.fn(() => anchor),
  });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

  return { blobs, click, createObjectURL, revokeObjectURL };
}
