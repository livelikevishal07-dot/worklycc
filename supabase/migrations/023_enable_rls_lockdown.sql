-- Close the largest hole in the system: 21 public tables had RLS DISABLED.
--
-- Supabase exposes every table in `public` through PostgREST, and the `anon`
-- role holds SELECT/INSERT/UPDATE/DELETE/TRUNCATE on all of them. With RLS off
-- that is not theoretical: anyone reaching the project URL with the anon key
-- could read every salary in `payslips`, lift customer names and phone numbers
-- out of `bookings`, forge rows in `admin_sessions`, or drop the lot.
-- Confirmed via information_schema.role_table_grants, not assumed.
--
-- Enabling RLS with NO policies denies `anon` and `authenticated` completely.
-- That is safe here because the application never touches Supabase from the
-- browser: `lib/db/supabase.ts` is the only createClient in the codebase, it is
-- marked `server-only`, and it uses the service-role key — which bypasses RLS
-- by design. The anon key is referenced nowhere in the source and does not
-- appear in the shipped browser bundle. The Android app is a WebView wrapper
-- around workly.cc, not a direct database client.
--
-- Reversible per table: `alter table <t> disable row level security;`

alter table public.admin_sessions              enable row level security;
alter table public.announcements               enable row level security;
alter table public.attendance_sessions         enable row level security;
alter table public.booking_options             enable row level security;
alter table public.bookings                    enable row level security;
alter table public.company_holidays            enable row level security;
alter table public.leave_entitlements          enable row level security;
alter table public.leave_policy                enable row level security;
alter table public.leave_requests              enable row level security;
alter table public.notification_settings       enable row level security;
alter table public.payslips                    enable row level security;
alter table public.recurring_task_assignments  enable row level security;
alter table public.recurring_task_completions  enable row level security;
alter table public.recurring_tasks             enable row level security;
alter table public.task_assignments            enable row level security;
alter table public.task_comments               enable row level security;
alter table public.task_items                  enable row level security;
alter table public.task_template_employees     enable row level security;
alter table public.task_templates              enable row level security;
alter table public.tasks                       enable row level security;
alter table public.workspace_settings          enable row level security;
