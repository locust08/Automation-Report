create table if not exists m04_local_seed_state (
  key text primary key,
  seeded_at text not null
);

create table if not exists m04_local_ad_accounts (
  id integer primary key,
  client_name text not null,
  platform text not null check (platform in ('google','meta','tiktok')),
  provider_account_id text not null,
  account_name text not null,
  currency text not null,
  timezone text not null,
  access_status text not null default 'verified',
  is_active integer not null default 1 check (is_active in (0,1)),
  unique(platform, provider_account_id)
);

create table if not exists m04_local_budget_packages (
  id integer primary key,
  client_name text not null,
  package_key text not null unique,
  name text not null,
  currency text not null,
  start_date text not null,
  end_date text not null,
  envelope_micros integer not null check (envelope_micros > 0),
  committed_micros integer not null default 0 check (committed_micros >= 0),
  status text not null default 'active',
  lock_version integer not null default 0
);

create table if not exists m04_local_campaign_plans (
  id integer primary key autoincrement,
  client_name text not null,
  package_id integer not null references m04_local_budget_packages(id),
  account_id integer not null references m04_local_ad_accounts(id),
  platform text not null check (platform in ('google','meta','tiktok')),
  active_revision_id integer,
  approved_revision_id integer,
  approved_hash text,
  reserved_micros integer not null default 0,
  status text not null check (status in ('draft','awaiting_approval','approved','launch_in_progress','launched')),
  created_by text not null,
  lock_version integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists m04_local_campaign_plan_revisions (
  id integer primary key autoincrement,
  plan_id integer not null references m04_local_campaign_plans(id),
  revision_no integer not null,
  campaign_name text not null,
  start_date text not null,
  end_date text not null,
  allocation_micros integer not null check (allocation_micros > 0),
  daily_budget_micros integer not null check (daily_budget_micros > 0),
  projected_total_micros integer not null check (projected_total_micros > 0),
  objective text not null,
  destination text not null,
  payload_json text not null,
  canonical_json text not null,
  revision_hash text not null,
  author_email text not null,
  created_at text not null,
  unique(plan_id, revision_no)
);

create table if not exists m04_local_campaign_approvals (
  id integer primary key autoincrement,
  plan_id integer not null references m04_local_campaign_plans(id),
  revision_id integer not null references m04_local_campaign_plan_revisions(id),
  revision_hash text not null,
  decision text not null,
  comment text not null,
  approved_by_email text not null,
  approved_at text not null,
  expires_at text not null
);

create table if not exists m04_local_campaign_builds (
  id integer primary key autoincrement,
  plan_id integer not null unique references m04_local_campaign_plans(id),
  revision_id integer not null references m04_local_campaign_plan_revisions(id),
  revision_hash text not null,
  approval_id integer not null references m04_local_campaign_approvals(id),
  package_id integer not null references m04_local_budget_packages(id),
  account_id integer not null references m04_local_ad_accounts(id),
  platform text not null,
  status text not null check (status in ('pending_gate_1','ready_to_deliver','verified','handoff_complete')),
  gate_1_completed_at text,
  gate_2_completed_at text,
  verified_at text,
  lock_version integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists m04_local_campaign_build_resources (
  id integer primary key autoincrement,
  build_id integer not null references m04_local_campaign_builds(id),
  logical_resource_key text not null,
  resource_type text not null,
  provider_resource_id text,
  provider_parent_resource_id text,
  provider_response_json text not null default '{}',
  verified_at text,
  unique(build_id, logical_resource_key)
);

create table if not exists m04_local_campaign_gate_attempts (
  id integer primary key autoincrement,
  build_id integer not null references m04_local_campaign_builds(id),
  gate integer not null check (gate in (1,2)),
  action text not null,
  status text not null,
  intent_json text not null,
  outcome_json text not null default '{}',
  actor_email text not null,
  started_at text not null,
  completed_at text
);

create table if not exists m04_local_campaign_qa_results (
  id integer primary key autoincrement,
  attempt_id integer not null references m04_local_campaign_gate_attempts(id),
  resource_id integer not null references m04_local_campaign_build_resources(id),
  gate integer not null check (gate in (1,2)),
  field_path text not null,
  expected_json text not null,
  observed_json text not null,
  result text not null,
  evidence_json text not null,
  created_at text not null
);

create table if not exists m04_local_campaign_audit_events (
  id integer primary key autoincrement,
  plan_id integer not null references m04_local_campaign_plans(id),
  build_id integer references m04_local_campaign_builds(id),
  event_type text not null,
  from_status text,
  to_status text,
  actor_id text not null,
  actor_email text not null,
  metadata_json text not null default '{}',
  created_at text not null
);

create table if not exists m04_local_campaign_monitoring_handoffs (
  id integer primary key autoincrement,
  build_id integer not null unique references m04_local_campaign_builds(id),
  plan_id integer not null references m04_local_campaign_plans(id),
  revision_id integer not null references m04_local_campaign_plan_revisions(id),
  provider_campaign_id text not null,
  provider_child_ids_json text not null,
  evidence_json text not null,
  created_at text not null
);

create index if not exists m04_local_plans_status_idx on m04_local_campaign_plans(status, updated_at desc);
create index if not exists m04_local_audits_plan_idx on m04_local_campaign_audit_events(plan_id, created_at desc);
create index if not exists m04_local_qa_attempt_idx on m04_local_campaign_qa_results(attempt_id, resource_id);
