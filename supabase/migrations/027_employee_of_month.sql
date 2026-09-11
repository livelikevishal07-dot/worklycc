-- Employee of the Month: awarded on punctuality.
--
-- The standings are DERIVED, not stored — they are recomputed from
-- attendance_sessions whenever asked, so they stay honest as the month goes on
-- and a corrected attendance row immediately corrects the ranking.
--
-- What IS stored is the admin's decision. Being top of the list is not the same
-- as having been given the award: the month has to end, and the admin may pick
-- someone else for a reason the data does not know about. A row here is that
-- decision, and it is what the certificate and the employee's dashboard badge
-- are issued from.

create table if not exists public.employee_of_month_awards (
  id          uuid primary key default gen_random_uuid(),
  -- Always the first of the month, so one award per calendar month is a
  -- constraint the database enforces rather than a convention callers follow.
  period      date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  -- Snapshot of why they won. The underlying attendance can be edited later;
  -- the certificate should keep saying what it said when it was issued.
  on_time_days   integer,
  total_days     integer,
  avg_early_mins integer,
  note        text,
  awarded_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (period)
);

alter table public.employee_of_month_awards
  drop constraint if exists employee_of_month_period_is_first;
alter table public.employee_of_month_awards
  add constraint employee_of_month_period_is_first
  check (extract(day from period) = 1);

create index if not exists employee_of_month_employee_idx
  on public.employee_of_month_awards (employee_id, period desc);

-- Reached only through server routes on the service-role key, like every other
-- table here. RLS on with no policies denies anon outright.
alter table public.employee_of_month_awards enable row level security;
