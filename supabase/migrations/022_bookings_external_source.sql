-- Idempotency + provenance for bookings that arrive from the public websites.
--
-- Website checkouts retry: network blips, serverless cold starts, a customer
-- double-tapping "Place order". Without a stable key from the originating
-- system, every retry inserts a second booking row and quietly inflates every
-- revenue KPI on the analysis page.
--
-- `external_order_id` holds the source site's own order number. The unique
-- index is PARTIAL — scoped to rows that actually carry one — so the ~3,300
-- manually-entered bookings (which have none) are completely unaffected, and
-- two different sites are free to reuse the same order number.

alter table public.bookings
  add column if not exists external_order_id text;

create unique index if not exists bookings_external_order_uniq
  on public.bookings (website, external_order_id)
  where external_order_id is not null;

comment on column public.bookings.external_order_id is
  'Order number from the originating website. NULL for manual entries. Unique per website.';
