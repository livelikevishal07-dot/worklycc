-- Performance: cover the foreign keys that had no index.
--
-- Postgres does NOT index a foreign key automatically. Without a covering
-- index, every join across the key and every cascading delete on the parent
-- does a sequential scan. These are small tables today, so this is cheap
-- insurance taken before the tables grow rather than after they hurt.

create index if not exists automation_log_employee_id_idx
  on public.automation_log (employee_id);

create index if not exists email_campaign_sends_account_id_idx
  on public.email_campaign_sends (account_id);

create index if not exists kyc_public_links_company_id_idx
  on public.kyc_public_links (company_id);

create index if not exists recurring_tasks_created_by_idx
  on public.recurring_tasks (created_by);

create index if not exists task_template_employees_employee_id_idx
  on public.task_template_employees (employee_id);

create index if not exists task_templates_company_id_idx
  on public.task_templates (company_id);

create index if not exists tasks_created_by_idx
  on public.tasks (created_by);

-- The bookings analysis page filters on order_date and the calendar on
-- event_date, both over the full 3,000+ row table. order_date already leads an
-- index; event_date did not.
create index if not exists bookings_event_date_idx
  on public.bookings (event_date);

-- ── Function hardening ───────────────────────────────────────────────────────
--
-- A function with a mutable search_path resolves unqualified names using
-- whatever the caller's search_path happens to be. Pinning it removes that
-- lever. `public, pg_temp` is the existing default, so behaviour is unchanged.

alter function public.touch_announcement()      set search_path = public, pg_temp;
alter function public.set_updated_at()          set search_path = public, pg_temp;
alter function public.touch_updated_at()        set search_path = public, pg_temp;
alter function public.update_leave_updated_at() set search_path = public, pg_temp;
alter function public.touch_recurring_task()    set search_path = public, pg_temp;
alter function public.touch_employee_letter()   set search_path = public, pg_temp;
alter function public.touch_kyc_submission()    set search_path = public, pg_temp;
alter function public.touch_diary_entry()       set search_path = public, pg_temp;

-- These three are SECURITY DEFINER leftovers from an abandoned Supabase Auth
-- setup — this app authenticates with its own signed cookies and never calls
-- them. Until now anyone could invoke them over /rest/v1/rpc/ with the public
-- anon key. Revoking EXECUTE does not affect the trigger that uses
-- handle_new_user: triggers run as the table owner, not as the caller.
revoke execute on function public.handle_new_user()       from anon, authenticated;
revoke execute on function public.is_admin()              from anon, authenticated;
revoke execute on function public.is_manager_or_admin()   from anon, authenticated;
