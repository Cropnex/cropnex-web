# CropNex workflow and reporting audit — v6.42.0

## Result and deployment status

The audit found real inconsistencies. The local v6.42.0 source and migration correct the reporting and save paths described below. They have **not been deployed or applied to the live Supabase project**. The live site observed during testing was v6.41.0.

## Corrections

| Workflow | Correction |
|---|---|
| Planned work → actual → stock | Actuals retain their farming account, record the field ID, reject duplicate product lines, support a date range and multiple fields, and post per-field quantities and costs. Below-zero stock counts as needing attention even without a minimum. |
| Field costs → margins | Remaining planned work + actualised work + additional field expenses are used consistently. Cancelled plans are excluded. The field cost report groups by field ID, so a changed crop/name does not create another report row. |
| Harvest → reports | Manual capture, activity, financial entries and optional completion save in one transaction. Repeating the same request does not duplicate the capture. |
| Transport / Excel → Harvest | Load and allocation saves are atomic per imported row. Saved source changes update derived Harvest records, including removal when a load is no longer reconciled. Reconciled allocation tonnes remain visible without a price. Pricing fragments cannot multiply tonnes. |
| Completion | Marking a field complete does not pretend that a harvesting plan or its stock usage has been confirmed. Actualise that work through the normal confirmation window. |
| Grain contracts → harvest valuation | Contract changes reprice harvested allocations when saved. Opening Reports no longer changes pricing data. |
| Farm-wide expenses | New transactions have a season. Unambiguous field-linked history is backfilled. Old farm-wide transactions with no season are shown for assignment; their season is not guessed. |
| Commitments / equipment finance | Applicable annual allowances are scoped to their season/finance term. A booked payment explicitly linked to its commitment reduces the remaining allowance instead of counting twice. |
| Labour → expenses | New labour captures post field or farm-wide labour costs to the selected season, atomically and with retry protection. Previously unallocated labour is not silently backdated into financial history. |
| Reviewed scanner → stock/transport | Confirmation saves the reviewed lines and scan record together. A bad later receipt line rolls back earlier postings. Retrying the same confirmation does not receive the stock again. Receipt units must match an existing stock item's unit. |
| Dashboard / Finance / Reports | Use the same field and business margin calculations. Failed or timed-out source queries show a retry state instead of allowing an incomplete management export. Report queries paginate beyond the default 1,000 rows. |
| Export | Field margins, farm-wide season costs, remaining commitments, cash scope and rainfall scope are explicit. Booked cash movement is separate from planned/actual operating costs. |

## Verification performed

- TypeScript validation passed.
- The automated regression suite passed (see included test output).
- The complete migration chain executed in an isolated PostgreSQL engine with Supabase auth/storage fixture schemas.
- Executed database scenarios cover negative stock, duplicate retries, manual harvest and financial postings, wrong-season rejection, transport reconciliation/unreconciliation, completion, two-field actualisation with added product/operation, scanner receipt rollback, contract repricing and authenticated RLS isolation between farmers.
- Live v6.41.0 login succeeded. The Dashboard, Reports, Transport, Inventory and Trials screens were inspected. The report/harvest cost discrepancy and negative-stock attention-count discrepancy were reproduced.
- Created one authorised live trial named **AUDIT ONLY — workflow test 2026-11-05**, attached to WO1. Its sample strip has 2 ha, 8 t, product cost R300/ha and operation cost R100/ha, at R4,000/t. The screen correctly shows 4 t/ha and R15,600/ha margin.
- Downloaded that live trial workbook and inspected it locally: R15,600/ha, R31,200 total margin and two graph images are present. The sample trial remains clearly labelled in the live app. It does not post stock usage or field financial transactions.

## Items requiring attention

1. **Two Kalkpan entries:** the live farm/field selectors and reports contain two Kalkpan fields with the same farm, season and 58.76 ha. These may be duplicate source records. They were not merged or deleted. Confirm which record/boundary and history should be retained before cleaning them up. Grouping report rows by ID does not merge two separate field records.
2. **Legacy farm-wide expenses:** assign their season in Business & Finance. They remain in the all-dates transaction/cash export while unassigned, but are excluded from season margins. Link commitment payments explicitly; old payment descriptions cannot reliably identify the matching allowance.
3. **Cost basis:** activity/stock consumption is an operating cost, not automatically a bank payment. Finance field expenses and labour postings are additional costs. Avoid recording the same labour or machinery cost in an activity actual and again as an additional expense. Inventory purchases/diesel issues are not automatically posted as extra expenses; fuel has its own supporting logbook. Trials have their own worksheet with graphs and do not deduct production stock.
4. **Permissions:** atomic saves keep RLS enabled. A role posting harvest with activity/financial entries needs the corresponding editing access; transport saving also writes derived harvest/pricing. The owner/admin path and cross-farmer rejection were tested. Every possible organisation/adviser permission combination was not tested live.
5. **Scope of live testing:** no live farm stock, production harvest or financial records were changed for this audit. New v6.42.0 mutations were tested in the isolated database, not on the live deployment. AI extraction accuracy, paid subscriptions, WhatsApp delivery, external weather/satellite services, mobile devices and all third-party integrations are not certified by these checks.
6. **Production build:** the local webpack build compiled and completed TypeScript checks, but Windows denied creation of a generated prerender output directory (`EPERM`). A complete production build was not obtained here. Run `npm run build` in Codespaces and require it to pass before pushing. Do not treat this audit as proof that the new version is deployed.

## Apply the update

1. Keep your Codespaces `.git` folder and local environment files. Overwrite the project source with the contents of the full v6.42.0 ZIP; do not erase credentials or Git history.
2. On the existing v6.41.0 database, run **only** the new `202611030002_workflow_report_integrity.sql` migration (also supplied separately as `CropNex-v6.42.0-Migration.sql`). It runs inside a transaction and preserves existing RLS. Do not replay old migrations manually.
3. Use the supplied installation commands. A failed migration or failed build must be resolved before publishing.
4. After Vercel reports Ready, confirm the footer says v6.42.0. Refresh Dashboard, Finance, Reports and Harvest. Compare a field's costs/margin across them and export a fresh management workbook.

Database test reproduction is documented in `tests/database/README.md` inside the ZIP.
