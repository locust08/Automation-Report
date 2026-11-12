# Demand Gen Ads sorting — local receipt, 2026-10-02

Branch: `codex/demand-gen-ad-filters`. Scope was reduced to sortable metrics only; no new campaign filter was added.

Clicks, CTR, CPC and Views headers toggle descending/ascending numeric order. First click selects highest-to-lowest, the second lowest-to-highest. Arrow and aria-sort indicate direction. Null/undefined/nonfinite values remain last; ties keep source order. The data array is not mutated. Local state remains during capture because screenshot mode does not change the report query key. PDF campaign grouping remains as previously approved, with sorted order preserved within each campaign.

Local unit test passed for numeric ordering, stable ties, unavailable values and source preservation. Browser fixtures on localhost:3000 passed all four header toggles, no provider refetch, sorted PDF order, and screen restoration. Existing edge export checks passed for long names, unavailable metrics, creative overflow, failed images and PNG. Source-only typecheck and scoped ESLint pass. Repository-wide typecheck/lint blockers remain those documented in the custom PDF receipt.

No native metric reconciliation, remote migration or deployment was performed. Generated files stay under ignored tmp/.
