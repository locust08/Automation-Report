alter table public.ads_change_notifications
  add column if not exists recipient_names jsonb not null default '[]'::jsonb,
  add column if not exists recipient_emails jsonb not null default '[]'::jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists last_error_message text;

create index if not exists ads_change_notifications_pending_idx
  on public.ads_change_notifications(status, created_at);
