# M03 pause confirmation across trusted ingress rotation

## Connected failure

On October 15, Ava's connected DigitalBee MCP read returned approved request `92c5e030-18e6-44aa-8a0c-bd1cfbcb21e0`, revision `ff86bff1-6d20-40e6-8acc-e7141d312bc9`, official campaign status `PAUSED`, and no execution receipts. One pause preparation created a card for Google campaign `24293971098` with `PAUSED -> PAUSED`. After the human clicked **Pause this campaign**, the card retained `blocked/stale_confirmation`, `confirmation_validation/guard`, sole mismatch `ingress_ip`, correlation `443a323c-f971-4bd8-b5a9-c220a27c80c4`, and `provider_action:false`. One authenticated receipt read still showed approved, official `PAUSED`, and no receipts. The consumed card was not retried. The primary MCPS register links the local safe result.

## Scoped source change

New pause confirmations issued by the private signed-ingress Worker use version 3 and a domain-separated consent hash. The hash binds subject, actor, grant revision, service/client, connection revision, session, provider target, ingress source and canonical origin; it excludes only the proxy IP value. The signed token separately binds the pause action, request and exact immutable revision/hash. Preparation and confirmation each still verify the signed delegation, current Supabase operator/domain/trusted-network policy, pilot target, current grant and revision integrity. Preparation also runs the provider preview. A changed IP therefore works only when both addresses are independently authorized at their respective request times.

Existing version-2 approval tokens and unversioned legacy tokens retain their previous behavior. Old pause tokens are not upgraded or replayed; they still require exact ingress IP. Version 3 is accepted only for pause at the private signed-ingress boundary. Execution claims, readback, receipts, emergency controls and provider dispatch are unchanged.

## Verification and release boundary

Focused private Worker tests cover a trusted two-IP pause, one execution on repeated confirmation, unapproved/unsigned/spoofed ingress, changed session/grant/client/target/revision, revoked operator/grant, disabled Worker and legacy changed-IP rejection. Existing domain workflow tests, repository typecheck, scoped lint, whitespace check and offline Wrangler dry run pass. These are local fixtures and build checks; live pause acceptance remains failed until a fresh human card and receipt show verified execution.

The source branch is `codex/m03-pause-rotation-20261015`, based on `ca78e95540a75492f81d8f0dbc2442026e7f794d`. No deployment, source-map upload, runtime setting/secret change, migration, provider retry or main merge is part of this preparation. The currently deployed backend version `e181b8ab-9b97-4ea9-a568-969dda54c6cb` is the immediate rollback reference for a separately approved release. A release owner must freshly verify the live four-service baseline and exact artifact/configuration before any backend-only cutover. Another human pause click needs a fresh card after that cutover; never reuse the consumed October 15 card.
