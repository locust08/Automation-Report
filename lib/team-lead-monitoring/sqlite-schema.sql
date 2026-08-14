pragma foreign_keys = on;

create table if not exists ad_automation_workflow_escalations (
  id integer primary key autoincrement,
  module text not null check (module in ('search_term', 'placement')),
  source_id integer not null,
  google_customer_id text not null,
  note text not null check (length(trim(note)) > 0),
  escalated_by_user_id text not null,
  escalated_by_email text not null,
  status text not null default 'active' check (status in ('active', 'resolved')),
  created_at text not null default (datetime('now')),
  resolved_at text,
  resolved_by_user_id text,
  resolved_by_email text
);

create unique index if not exists workflow_escalations_active_idx
  on ad_automation_workflow_escalations (module, source_id)
  where status = 'active';
create index if not exists workflow_escalations_account_idx
  on ad_automation_workflow_escalations (google_customer_id, status, created_at desc);

