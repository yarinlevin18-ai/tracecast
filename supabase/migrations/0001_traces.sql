-- Shared traces. Rows are written and read only through the service role
-- from Next.js route handlers and server components; no client access.
create table if not exists public.traces (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now(),
  totals jsonb not null,
  storage_path text not null,
  expires_at timestamptz
);

alter table public.traces enable row level security;
-- No policies on purpose: anon and authenticated roles get nothing.

create index if not exists traces_expires_at_idx on public.traces (expires_at);

-- Private bucket for the normalized Trace JSON files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('traces', 'traces', false, 10485760, array['application/json'])
on conflict (id) do nothing;
