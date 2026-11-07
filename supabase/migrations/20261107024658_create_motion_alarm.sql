create table public.alerts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  created_at timestamptz not null check (isfinite(created_at)),
  source text not null default 'Movement' check (source = 'Movement'),
  status text not null default 'New' check (status in ('New', 'Reviewed')),
  strength double precision check (strength >= 0 and strength <= 10000),
  primary key (user_id, id)
);

create index alerts_user_created_idx on public.alerts (user_id, created_at desc, id desc);

create table public.alert_imports (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  primary key (user_id, id)
);

alter table public.alerts enable row level security;
alter table public.alert_imports enable row level security;

revoke all on public.alerts, public.alert_imports from public, anon, authenticated;
grant select, insert, delete on public.alerts to authenticated;
grant update (status) on public.alerts to authenticated;
grant select, insert on public.alert_imports to authenticated;

create policy alerts_read_own on public.alerts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy alerts_insert_own on public.alerts for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'New');
create policy alerts_update_own on public.alerts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy alerts_delete_own on public.alerts for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy imports_read_own on public.alert_imports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy imports_insert_own on public.alert_imports for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- The receipt and alert commit together, so an upload retry cannot restore a deleted alert.
create function public.record_movement_alert(p_id text, p_created_at timestamptz, p_strength double precision)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Log in to save an alert.' using errcode = '42501';
  end if;
  insert into public.alert_imports (user_id, id)
    values (auth.uid(), p_id)
    on conflict (user_id, id) do nothing;
  if found then
    insert into public.alerts (user_id, id, created_at, strength)
      values (auth.uid(), p_id, p_created_at, p_strength)
      on conflict (user_id, id) do nothing;
  end if;
end;
$$;

revoke all on function public.record_movement_alert(text, timestamptz, double precision) from public, anon;
grant execute on function public.record_movement_alert(text, timestamptz, double precision) to authenticated;
