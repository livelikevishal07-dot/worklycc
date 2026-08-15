-- Migration 018: Employee KYC intake
--
-- A new joiner fills a public, token-linked form (no login) before they exist as
-- an employee. Submissions land in the CMS KYC list, where the admin reviews the
-- documents and promotes the person into the real employee list — which is what
-- creates their employees row.
--
-- Aadhaar is a government identity number: the full value is stored encrypted
-- (AES-256-GCM, same MAIL_ENCRYPTION_KEY) and only the last four digits are kept
-- in the clear for on-screen identification.

CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unguessable; this is the only credential the public form has.
  token        text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'invited'
                 CHECK (status IN ('invited','submitted','approved','rejected')),

  /* ── Invite ── */
  invited_name  text,
  invited_email text,
  company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  sent_at       timestamptz,

  /* ── What the joiner submits ── */
  full_name          text,
  email              text,
  phone              text,
  alt_phone          text,
  date_of_birth      date,
  address            text,
  city               text,
  state              text,
  pincode            text,
  emergency_name     text,
  emergency_phone    text,
  emergency_relation text,
  designation        text,

  aadhaar_last4 text,
  aadhaar_enc   text,

  -- Object paths in the private 'kyc-documents' bucket.
  photo_path    text,
  aadhaar_path  text,
  letter_path   text,
  letter_kind   text CHECK (letter_kind IN ('offer','release')),

  submitted_at timestamptz,

  /* ── Review ── */
  reviewed_at timestamptz,
  review_note text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_status   ON public.kyc_submissions(status);
CREATE INDEX IF NOT EXISTS idx_kyc_created  ON public.kyc_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_company  ON public.kyc_submissions(company_id);
CREATE INDEX IF NOT EXISTS idx_kyc_employee ON public.kyc_submissions(employee_id);

CREATE OR REPLACE FUNCTION touch_kyc_submission()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS kyc_submissions_touch ON public.kyc_submissions;
CREATE TRIGGER kyc_submissions_touch
  BEFORE UPDATE ON public.kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION touch_kyc_submission();

-- Private bucket for ID scans and photos. Never public: downloads go through an
-- admin-guarded route that mints a short-lived signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Reached only by server routes using the service-role key. The public form
-- writes through a token-scoped route, never directly with the anon key.
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
