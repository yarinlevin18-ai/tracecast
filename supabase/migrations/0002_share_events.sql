-- One row per accepted share, keyed by a salted hash of the client IP, so the
-- share route can refuse more than SHARE_LIMIT uploads per hour per network.
create table if not exists public.share_events (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.share_events enable row level security;
-- No policies on purpose: only the service role reads or writes.

create index if not exists share_events_ip_created_idx on public.share_events (ip_hash, created_at);
