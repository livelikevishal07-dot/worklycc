-- Migration 017: Company letterhead details + issued employee letters
--
-- Offer and relieving letters go out on the letterhead of the company the
-- employee is enrolled in (Giftlaya, 7eventzz, ClearLevel, BalloonDekor…), so
-- the companies table needs the details that appear on a letterhead.

/* ── Company letterhead fields ─────────────────────────────────────────────── */
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email   text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone   text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS website text;

-- Who signs letters for this company. Falls back to "Authorised Signatory"
-- when left blank, so a letter is never unsigned.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signatory_name        text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signatory_designation text;

/* ── Issued letters ────────────────────────────────────────────────────────── */
-- One row per letter generated. The letterhead and employee details are
-- snapshotted into `body` and the *_snapshot columns at issue time: editing a
-- company address or an employee's salary later must not silently rewrite a
-- letter that has already been sent to someone.
CREATE TABLE IF NOT EXISTS public.employee_letters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,

  type          text NOT NULL CHECK (type IN ('offer','release')),
  reference_no  text,
  subject       text NOT NULL,
  body          jsonb NOT NULL DEFAULT '{}',   -- resolved LetterDoc as issued

  employee_name  text,
  employee_email text,
  company_name   text,

  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','failed')),
  sent_at       timestamptz,
  error         text,
  storage_path  text,                          -- the exact PDF that was sent

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_letters_employee ON public.employee_letters(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_letters_company  ON public.employee_letters(company_id);
CREATE INDEX IF NOT EXISTS idx_emp_letters_created  ON public.employee_letters(created_at DESC);

CREATE OR REPLACE FUNCTION touch_employee_letter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS employee_letters_touch ON public.employee_letters;
CREATE TRIGGER employee_letters_touch
  BEFORE UPDATE ON public.employee_letters
  FOR EACH ROW EXECUTE FUNCTION touch_employee_letter();

-- Letters contain salary and personal details and are reached only through
-- admin-guarded server routes using the service-role key.
ALTER TABLE public.employee_letters ENABLE ROW LEVEL SECURITY;
