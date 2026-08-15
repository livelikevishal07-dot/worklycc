-- Migration 016: Email management
--
-- Ported from the ClearLevel admin panel, adapted for Workly:
--   * Workly has a single admin (env-var credentials, HMAC cookie) rather than a
--     cms_admins table, so mailboxes carry no owner column and the
--     email_account_access grant table is dropped — the admin sees every mailbox.
--   * Attachment bytes live in Supabase Storage (bucket 'email-attachments')
--     instead of S3, so the pointer column is storage_path, not s3_key.
--
-- Model:
--   email_accounts      one row per mailbox + its IMAP/SMTP credentials
--   email_messages      every inbound + outbound message (the mail store)
--   email_attachments   file metadata; bytes in Supabase Storage
--   email_folder_state  per-(account, IMAP folder) sync cursor
--   email_templates     canned replies
--   email_campaigns     bulk HTML sends + per-recipient log
--   email_contacts      address book grouped by category

/* ── Accounts ──────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address        text        NOT NULL UNIQUE,      -- lowercased, e.g. admin@workly.cc
  display_name   text,                             -- shown as the "From" name
  is_active      boolean     NOT NULL DEFAULT true,
  imap_host      text        NOT NULL DEFAULT 'imap.hostinger.com',
  imap_port      integer     NOT NULL DEFAULT 993,
  smtp_host      text        NOT NULL DEFAULT 'smtp.hostinger.com',
  smtp_port      integer     NOT NULL DEFAULT 465,
  username       text        NOT NULL DEFAULT '',  -- usually = address
  password_enc   text,                             -- AES-256-GCM; never sent to the client
  sync_enabled   boolean     NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

/* ── Messages ──────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.email_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  direction        text        NOT NULL CHECK (direction IN ('inbound','outbound')),
  thread_id        text        NOT NULL,
  rfc_message_id   text,                            -- RFC 5322 Message-ID header
  in_reply_to      text,                            -- parent's rfc_message_id
  from_address     text        NOT NULL,
  from_name        text,
  to_addresses     jsonb       NOT NULL DEFAULT '[]',
  cc_addresses     jsonb       NOT NULL DEFAULT '[]',
  subject          text,
  snippet          text,                            -- first ~140 chars, for the list view
  body_text        text,
  body_html        text,
  folder           text        NOT NULL DEFAULT 'inbox',  -- validated in app code
  is_read          boolean     NOT NULL DEFAULT false,
  is_starred       boolean     NOT NULL DEFAULT false,
  status           text,                            -- outbound: draft | sent | failed
  provider_id      text,
  error            text,
  imap_uid         bigint,                          -- per-folder IMAP UID
  imap_uidvalidity bigint,
  imap_folder      text,                            -- source IMAP folder name
  flags_dirty      boolean     NOT NULL DEFAULT false,  -- panel changed flags; push to IMAP
  created_at       timestamptz NOT NULL DEFAULT now()
);

/* ── Attachments (bytes in Supabase Storage) ───────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.email_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid REFERENCES public.email_messages(id) ON DELETE CASCADE,
  filename     text,
  content_type text,
  size_bytes   integer,
  storage_path text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

/* ── Sync cursor ───────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.email_folder_state (
  account_id  uuid        NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  imap_folder text        NOT NULL,
  uidvalidity bigint      NOT NULL,
  last_uid    bigint      NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, imap_folder)
);

/* ── Templates ─────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.email_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  subject    text,
  body_html  text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/* ── Campaigns ─────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  subject      text        NOT NULL DEFAULT '',
  body_html    text        NOT NULL DEFAULT '',
  last_sent_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per recipient per run. 'queued' rows are drained in batches by
-- /api/email/campaigns/[id]/send/run — serverless functions are killed when the
-- response returns, so a long send cannot run in the background as it did on
-- ClearLevel's always-on VPS.
CREATE TABLE IF NOT EXISTS public.email_campaign_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient   text        NOT NULL,
  status      text        NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','sent','failed')),
  error       text,
  account_id  uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

/* ── Contacts ──────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.email_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  email      text        NOT NULL,
  category   text        NOT NULL DEFAULT 'General',
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, category)
);

/* ── Indexes ───────────────────────────────────────────────────────────────── */
CREATE INDEX IF NOT EXISTS idx_email_msg_account   ON public.email_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_email_msg_folder    ON public.email_messages(folder);
CREATE INDEX IF NOT EXISTS idx_email_msg_thread    ON public.email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_msg_created   ON public.email_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_msg_rfc       ON public.email_messages(rfc_message_id);
CREATE INDEX IF NOT EXISTS idx_email_msg_uid       ON public.email_messages(account_id, imap_folder, imap_uid);
CREATE INDEX IF NOT EXISTS idx_email_msg_dirty     ON public.email_messages(flags_dirty) WHERE flags_dirty = true;
CREATE INDEX IF NOT EXISTS idx_email_attach_msg    ON public.email_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_send ON public.email_campaign_sends(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_email_contacts_cat  ON public.email_contacts(category);

/* ── updated_at triggers ───────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION touch_email_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS email_templates_touch ON public.email_templates;
CREATE TRIGGER email_templates_touch
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION touch_email_row();

DROP TRIGGER IF EXISTS email_campaigns_touch ON public.email_campaigns;
CREATE TRIGGER email_campaigns_touch
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION touch_email_row();

/* ── Attachment storage bucket (private) ───────────────────────────────────── */
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

/* ── RLS ───────────────────────────────────────────────────────────────────── */
-- Mail is admin-only and reached exclusively through server routes using the
-- service-role key, which bypasses RLS. Enabling RLS with no policies keeps the
-- public anon key from touching any of it. email_accounts holds encrypted
-- mailbox passwords, so this is not optional.
ALTER TABLE public.email_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_folder_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_contacts       ENABLE ROW LEVEL SECURITY;
