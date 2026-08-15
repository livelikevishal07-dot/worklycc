-- Migration 015: Admin daily diary
-- Date-wise work log written from the CMS. One row per entry; a day can hold
-- several entries. Filtering (keyword / date / category / tag) lives in
-- lib/db/diary.ts — the indexes below back those queries.

CREATE TABLE IF NOT EXISTS public.diary_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  title      text,
  content    text NOT NULL,
  category   text NOT NULL DEFAULT 'work'
               CHECK (category IN ('work','meeting','idea','personal','issue')),
  tags       text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diary_entries_date     ON public.diary_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_diary_entries_category ON public.diary_entries(category);
CREATE INDEX IF NOT EXISTS idx_diary_entries_tags     ON public.diary_entries USING gin (tags);

CREATE OR REPLACE FUNCTION touch_diary_entry()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS diary_entries_touch ON public.diary_entries;
CREATE TRIGGER diary_entries_touch
  BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION touch_diary_entry();

-- The diary is private to the admin. The app reads/writes it with the
-- service-role key, which bypasses RLS — enabling RLS with no policies keeps
-- the public anon key locked out entirely.
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
