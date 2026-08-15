-- Migration 020: General KYC link + re-KYC for existing employees
--
-- Two new ways in, alongside the per-person invite:
--
--   * a reusable "general" link that can be shared with a whole team — each
--     person who opens it gets their own private submission
--   * existing employees filling their own KYC from the employee dashboard
--
-- `source` is what keeps approval honest: a re-KYC submission belongs to an
-- employee who already exists, so approving it must UPDATE that employee rather
-- than create a duplicate.

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'invite';

DO $$
BEGIN
  ALTER TABLE public.kyc_submissions
    ADD CONSTRAINT kyc_submissions_source_check
    CHECK (source IN ('invite','public','employee'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Which shared link a public submission came through, for attribution.
ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS link_id uuid;

/* ── Reusable share links ──────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.kyc_public_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token      text NOT NULL UNIQUE,
  label      text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  is_active  boolean NOT NULL DEFAULT true,
  uses       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_submissions
  DROP CONSTRAINT IF EXISTS kyc_submissions_link_id_fkey;
ALTER TABLE public.kyc_submissions
  ADD CONSTRAINT kyc_submissions_link_id_fkey
  FOREIGN KEY (link_id) REFERENCES public.kyc_public_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kyc_source ON public.kyc_submissions(source);
CREATE INDEX IF NOT EXISTS idx_kyc_link   ON public.kyc_submissions(link_id);

-- An employee should have at most one open re-KYC at a time; a finished one is
-- kept as history, so the partial index only covers in-flight rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_open_per_employee
  ON public.kyc_submissions(employee_id)
  WHERE source = 'employee' AND status IN ('invited','submitted');

ALTER TABLE public.kyc_public_links ENABLE ROW LEVEL SECURITY;
