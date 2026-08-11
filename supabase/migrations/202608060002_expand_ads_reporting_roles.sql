alter table public.ad_automation_report_users
  drop constraint if exists ad_automation_report_users_role_check;

alter table public.ad_automation_report_users
  add constraint ad_automation_report_users_role_check
  check (role in ('admin', 'paid_media_specialist', 'campaign_optimizer', 'specialist', 'approver', 'team_lead', 'project_manager', 'viewer'));
