# Notion Schema Mapping

Database: `Google Ads Ad Group Setup Requests`

Default database ID: `8adaf03ad617472780f0b34e5ca6ef08`

## Campaign grouping

- `01 Ad Group Name` title: one row per Search ad group or PMax asset group.
- `02 Client / Ad Account` relation: points to the Ad Account page.
- `05 Campaign Name` rich text: final Google Ads campaign name, formatted as `LT | {Campaign Type} | {Daily Budget}/d | {YYYY-MM-DD}`.
- `06 Campaign Objective` select: business objective, such as `Leads`, `Sales`, or `Website Traffic`.
- `07 Campaign Type` select: `Search` or `Performance Max`.
- `08 Optimization Focus` select: bidding or optimization focus. Use `Conversions` for conversion bidding, `Clicks` for Maximize clicks, and reserve `Reach` or `Engagement` for supported reach/engagement campaign builds.
- `11 Start Date` date: Google Ads campaign start date.
- `12 Average Daily Budget` number: campaign daily budget in MYR.
- `13 Target CPA` number: optional target cost per action for conversion bidding.
- `65 Status` select: rows with `Ready for Setup` are eligible when querying by database.

## Ad account relation

Read the first related Ad Account page:

- `ID`: Google Ads customer ID, with or without dashes.
- `Account Name`: reporting name.
- `Access Path`: use as Google Ads `login-customer-id`.
  - `personal` means direct access with no login customer header.
  - `366-613-7525` means MCC `3666137525`.
  - `411-468-5827` means MCC `4114685827`.

## Search fields

- `14 Network`: `Google Search Only` means Google Search on, partners/content off.
- `16 Target Location`: multi-select location names to resolve as Malaysia geo targets.
- `17 Language`: multi-select language names to resolve through `language_constant`.
- `10 Final URL`: ad final URL.
- `28 Display Path 1`, `29 Display Path 2`: Search display path fields, max 15 characters each.
- `30 Headline 1` through `44 Headline 15`: Responsive Search Ad headlines, max 30 characters each.
- `45 Description 1` through `48 Description 4`: Responsive Search Ad descriptions, max 90 characters each.
- `18 Keyword 1` through `27 Keyword 10`: Google Ads keyword text with match-type syntax.
- `53/54` through `63/64`: six sitelink title and URL pairs.

## Asset fields

- `49 Business Name`: business name asset text.
- `50 Logo`: files property for logo images.
- `51 Product / Service Image`: files property for service image assets.
- `52 Image Notes`: human review notes; do not parse as structured input.
