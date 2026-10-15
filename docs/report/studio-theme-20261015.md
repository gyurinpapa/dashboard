# Restore saved report theme in rendering consumers

Production baseline: 0194862fa767cac548a436703677d1ef7a9a8e87, rechecked 2026-10-15 KST.

The builder sends meta.report_theme and the existing create/update/public-share APIs retain it. Test report 0249b022-5090-48ed-bbd3-6f7f57b4c231 already stores studio; no database correction is needed. The advertiser public client page already forwards the saved theme correctly.

Three consumers omitted the reportTheme prop and therefore used ReportTemplate's light default: token-based shared report, the editor's export capture, and PPT render content pages. Each now forwards the saved meta through the existing pickReportThemeFromMeta helper. Existing light/missing/invalid theme fallback is unchanged. No theme redesign, new package, state, effect, network request, schema, auth, data/filter/calculation, page-selection or export-geometry changes are included. Cover/closing PPT pages retain their own existing layout.

Validation: syntax compilation for all three TSX files; 24 metadata forwarding cases; exact source round-trip confirms only one import and one theme prop added per consumer. Full Preview TypeScript/build and visual confirmation are tracked separately. Existing report data is not rewritten.

The isolated fix branch starts from the current Production source. The same file changes are integrated into feat/unassigned-advertiser-20261014 only after verifying all three baseline blobs match, so the ongoing payment/test settings and earlier fixes remain intact. No Production deployment is authorized by this patch. Real visual Studio rendering and PPT export still require confirmation with a populated report. Existing-report repayment after refund was deferred by the user, not newly verified.
