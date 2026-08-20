-- Stragglers missed by 024.
--
-- touch_email_row was simply left off the list.
--
-- handle_new_user needed a revoke from PUBLIC, not just from anon: Postgres
-- grants EXECUTE to PUBLIC on every new function by default and anon inherits
-- it, so revoking from anon alone changed nothing.

alter function public.touch_email_row() set search_path = public, pg_temp;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
