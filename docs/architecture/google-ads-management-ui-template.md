# Google Ads Management UI Template

## Purpose

`/manage/google` follows the same focused management pattern as `/manage/meta` while retaining Google-specific resources, metrics, recommendations, and provider rules.

## Layout

```text
ReportShell
├── Google Ads account search card
├── Account controls row
│   ├── Compact date range — left
│   └── Refresh official data — right
└── Account workspace
    ├── Sticky 220px navigation rail — desktop
    │   ├── Recommendations
    │   ├── Campaigns
    │   ├── Ad groups
    │   ├── Ads
    │   ├── Divider
    │   └── Change requests (only collapsible group)
    │       ├── All requests
    │       ├── Campaign
    │       ├── Ad groups
    │       └── Ads
    ├── One shadcn section Select — mobile
    └── One focused content surface
```

The navigation remains visible while official data loads. The selected content surface uses cards, metrics, and row-shaped skeletons instead of a full-page progress panel.

## Change Control

Change requests use the shared account-scoped M03 workspace. Resource options first show only the synchronized entities and reviewed fields relevant to that resource type. `Request change` opens the editor inline with provider identity mappings and synchronized baseline values.

The Google capability registry is the source for fields displayed by the embedded editor. Unsupported fields are not displayed. Baselines and resource mappings are read-only in the embedded management flow.

The global `/change-control` page remains the recovery and administration surface, including legacy Google history. The Google management page embeds only M03 lifecycle behavior.

## Loading, pagination, and empty states

- Show the sidebar or mobile section Select immediately after account selection.
- Use view-shaped skeleton cards and rows while loading.
- Use 10 rows per page by default, with 10, 25, and 50 options where a list footer is present.
- Preserve normal empty cards and tables when no activity is returned.
- Show normalized errors without removing the navigation context.

## Safety boundary

- Management refreshes and date changes are read-only Google Ads retrievals.
- Request creation writes only to M03 workflow storage.
- Provider execution remains locked; Publish, Retry, Verify, conflict resolution, and rollback execution stay disabled.
- Google credentials and raw sensitive provider responses remain server-only.
- This page does not perform Google Ads mutations.
