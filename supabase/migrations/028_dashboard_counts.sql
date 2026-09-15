-- Aggregate the dashboard's counts in Postgres instead of shipping every row
-- to the function and counting them in JavaScript.
--
-- The dashboard was fetching ALL tasks, ALL task_assignments and ALL
-- leave_requests on every load — three unbounded selects — purely to produce
-- about a dozen numbers. That is ~1,100 rows today and grows forever, and the
-- dashboard auto-refreshes every 60 seconds, so the cost repeats.
--
-- Comparisons are done in UTC on purpose: the TypeScript this replaces sliced
-- ISO strings (`completed_at.slice(0,10)`), which is a UTC date. Using local
-- time here would silently shift "completed today" by the timezone offset.

create or replace function public.dashboard_counts(
  p_today      date,
  p_week_start date,
  p_last30     date
)
returns json
language sql
stable
set search_path = public, pg_temp
as $$
  select json_build_object(
    'tasks', (
      select json_build_object(
        'total',             count(*),
        'todo',              count(*) filter (where status = 'todo'),
        'inProgress',        count(*) filter (where status = 'in_progress'),
        'done',              count(*) filter (where status = 'done'),
        'overdue',           count(*) filter (where status <> 'done' and deadline is not null and deadline < now()),
        'completedToday',    count(*) filter (where (completed_at at time zone 'UTC')::date = p_today),
        'completedThisWeek', count(*) filter (where (completed_at at time zone 'UTC')::date >= p_week_start)
      )
      from public.tasks
    ),
    'leave', (
      select json_build_object(
        'pending',  count(*) filter (where status = 'pending'),
        'approved', count(*) filter (where status = 'approved'),
        'rejected', count(*) filter (where status = 'rejected')
      )
      from public.leave_requests
    ),
    -- Per-employee completions in the last 30 days, already ranked and capped.
    -- Previously every assignment row was transferred to build this Map.
    'topPerformers', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select ta.employee_id, count(*)::int as completed
        from public.task_assignments ta
        join public.tasks t on t.id = ta.task_id
        where t.status = 'done'
          and t.completed_at is not null
          and (t.completed_at at time zone 'UTC')::date >= p_last30
        group by ta.employee_id
        order by count(*) desc
        limit 5
      ) x
    )
  );
$$;

-- Server routes use the service-role key, which bypasses RLS and needs no
-- grant. Deny everyone else explicitly: PUBLIC gets EXECUTE on new functions by
-- default, and anon inherits it, which is how the abandoned auth helpers ended
-- up callable over /rest/v1/rpc/.
revoke execute on function public.dashboard_counts(date, date, date) from public;
revoke execute on function public.dashboard_counts(date, date, date) from anon, authenticated;

-- Covers the join and the date filter behind topPerformers.
create index if not exists tasks_completed_at_idx
  on public.tasks (completed_at)
  where completed_at is not null;

create index if not exists task_assignments_task_id_idx
  on public.task_assignments (task_id);
