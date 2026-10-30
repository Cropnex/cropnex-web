import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = new URL("../", import.meta.url);

function loadTsx(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(new URL(file, projectRoot), "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, `${file} must compile`);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module,
    exports: module.exports,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    AbortController,
    ...globals,
  }, { filename: file });
  return module.exports.default;
}

for (const route of ["trials", "help"]) {
  test(`${route} uses AppShell so access and season providers are present`, () => {
    function AppShell() {}
    const Layout = loadTsx(`app/${route}/layout.tsx`, {
      "@/components/layout/AppShell": { __esModule: true, default: AppShell },
    });
    const child = { id: "page-content" };
    const element = Layout({ children: child });
    assert.equal(element.type, AppShell);
    assert.equal(element.props.children, child);
  });
}

function workspaceForSeason(season) {
  return loadTsx("components/trials/TrialsWorkspace.tsx", {
    "next/link": { __esModule: true, default: () => null },
    "@/lib/supabase": { supabase: {} },
    "@/components/season/SeasonProvider": { useSeason: () => season },
    "@/components/auth/AccessProvider": {},
    "@/lib/trial-results": {}, "@/lib/trial-request": {},
    "@/components/trials/StripResults": {}, "@/components/trials/TrialForms": {},
  });
}
test("a new farm with no season gets setup guidance rather than an endless spinner", () => {
  const Workspace = workspaceForSeason({ loading: false, error: null, currentSeason: "" });
  assert.equal(Workspace().props.title, "Choose a season to start Trials");
});
test("season loading and season failures have explicit screen states", () => {
  assert.equal(workspaceForSeason({ loading: true })().props.title, "Loading your farm season…");
  assert.equal(workspaceForSeason({ loading: false, error: "Not connected" })().props.title, "Couldn’t load your farm season");
});
test("changing season gives the workspace a new identity so old trial forms cannot leak across seasons", () => {
  const season = { loading: false, error: null, currentSeason: "2026/2027" }, Workspace = workspaceForSeason(season);
  assert.equal(Workspace().key, "2026/2027");
  season.currentSeason = "2027/2028";
  assert.equal(Workspace().key, "2027/2028");
});

