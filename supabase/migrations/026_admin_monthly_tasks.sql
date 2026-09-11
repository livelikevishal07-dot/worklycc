-- The admin's own recurring monthly obligations: GST filing, salary payment,
-- AWS charges and the like.
--
-- Deliberately separate from `recurring_tasks`, which is a different thing:
-- that one is assigned to employees, runs daily/weekly, and is completed per
-- calendar DATE. These are the admin's own, run monthly, carry a due day, and
-- are completed once per MONTH.

create table if not exists public.admin_monthly_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  -- Loose grouping for the UI; not an enum so new kinds don't need a migration.
  category    text not null default 'other'
              check (category in ('compliance','payment','subscription','other')),
  -- Day of the month it is due. 29–31 is clamped to the last day of short
  -- months in the query layer, so "due on the 31st" still works in February.
  due_day     integer not null default 1 check (due_day between 1 and 31),
  -- Expected amount for bills like AWS or salary. Null for non-money tasks.
  amount      numeric(12,2),
  company_id  uuid references public.companies(id) on delete set null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists admin_monthly_tasks_active_idx
  on public.admin_monthly_tasks (is_active, sort_order);

create index if not exists admin_monthly_tasks_company_idx
  on public.admin_monthly_tasks (company_id);

-- One row per task per month. `period` is always the first of the month, so
-- the unique constraint below is what makes "done for September" a fact rather
-- than something to be inferred from timestamps.
create table if not exists public.admin_monthly_task_completions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.admin_monthly_tasks(id) on delete cascade,
  period       date not null,
  completed_at timestamptz not null default now(),
  note         text,
  amount_paid  numeric(12,2),
  created_at   timestamptz not null default now(),
  unique (task_id, period)
);

create index if not exists admin_monthly_completions_period_idx
  on public.admin_monthly_task_completions (period);

-- Guard the invariant rather than trusting every caller to pass the 1st.
alter table public.admin_monthly_task_completions
  drop constraint if exists admin_monthly_completions_period_is_first;
alter table public.admin_monthly_task_completions
  add constraint admin_monthly_completions_period_is_first
  check (extract(day from period) = 1);

create or replace function public.touch_admin_monthly_task()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists admin_monthly_tasks_touch on public.admin_monthly_tasks;
create trigger admin_monthly_tasks_touch
  before update on public.admin_monthly_tasks
  for each row execute function public.touch_admin_monthly_task();

-- Reached only through server routes using the service-role key, same as every
-- other table here. RLS on with no policies denies anon outright.
alter table public.admin_monthly_tasks            enable row level security;
alter table public.admin_monthly_task_completions enable row level security;

-- Seed the three the admin named, so the page is useful on first open.
insert into public.admin_monthly_tasks (title, description, category, due_day, sort_order)
select * from (values
  ('GST filing',     'File monthly GST return',              'compliance',   20, 0),
  ('Salary payment', 'Pay staff salaries for the month',     'payment',       7, 1),
  ('AWS charges',    'Settle the monthly AWS/hosting bill',  'subscription',  5, 2)
) as v(title, description, category, due_day, sort_order)
where not exists (select 1 from public.admin_monthly_tasks);
