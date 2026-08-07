insert into public.ad_automation_report_users (id, full_name, role, is_active)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1)),
  roles.role,
  true
from auth.users as users
join (values
  ('test.pms@locus-t.com.my', 'paid_media_specialist'),
  ('test.co@locus-t.com.my', 'campaign_optimizer'),
  ('test.specialist@locus-t.com.my', 'specialist'),
  ('test.approver@locus-t.com.my', 'approver'),
  ('test.tl@locus-t.com.my', 'team_lead'),
  ('test.pm@locus-t.com.my', 'project_manager')
) as roles(email, role) on lower(users.email) = roles.email
on conflict (id) do update set
  role = excluded.role,
  is_active = true,
  updated_at = now();
