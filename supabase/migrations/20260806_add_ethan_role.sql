alter table public.ad_automation_report_users
  drop constraint if exists ad_automation_report_users_role_check;

alter table public.ad_automation_report_users
  add constraint ad_automation_report_users_role_check
  check (role in ('pms', 'co', 'specialist', 'approver', 'tl', 'pm', 'admin', 'ethan'));
