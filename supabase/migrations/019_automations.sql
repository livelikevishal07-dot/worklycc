-- Migration 019: Scheduled automations
--
-- Birthday wishes, work anniversaries, late-arrival nudges and overdue-task
-- reminders. All four are driven by one endpoint (/api/cron/automations) that is
-- safe to call any number of times a day:
--
--   * automation_log has a UNIQUE (kind, subject_id, ref_date) constraint, so a
--     second run on the same day inserts nothing and sends nothing. That is the
--     dedupe guarantee — not a timestamp check that could race.
--   * Vercel's Hobby plan only fires cron once per day, so this design also lets
--     an external scheduler hit the same URL every few minutes for near
--     real-time late/overdue alerts, with no code change.

CREATE TABLE IF NOT EXISTS public.automation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  -- Employee for greetings/lateness; task for overdue reminders.
  subject_id  uuid NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  ref_date    date NOT NULL,
  status      text NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','failed','skipped')),
  channel     text,                       -- email | push | email+push | none
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, subject_id, ref_date)
);

CREATE INDEX IF NOT EXISTS idx_automation_log_date ON public.automation_log(ref_date DESC);
CREATE INDEX IF NOT EXISTS idx_automation_log_kind ON public.automation_log(kind, ref_date DESC);

-- One row per automation, so each can be switched off or tuned without a deploy.
CREATE TABLE IF NOT EXISTS public.automation_settings (
  kind       text PRIMARY KEY,
  enabled    boolean NOT NULL DEFAULT true,
  send_email boolean NOT NULL DEFAULT true,
  send_push  boolean NOT NULL DEFAULT true,
  config     jsonb   NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.automation_settings (kind, enabled, send_email, send_push, config) VALUES
  ('birthday',         true,  true, true, '{}'),
  ('work_anniversary', true,  true, true, '{}'),
  -- Off by default: nudging staff about lateness is a policy decision, and the
  -- grace period should be set deliberately before anyone gets an email.
  ('late_arrival',     false, true, true, '{"graceMinutes": 15}'),
  ('task_overdue',     false, true, true, '{"remindEveryDay": false}')
ON CONFLICT (kind) DO NOTHING;

ALTER TABLE public.automation_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;
