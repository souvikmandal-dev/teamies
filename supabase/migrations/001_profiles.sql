create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  college text,
  city text,
  primary_role text,
  experience_level text,
  weekly_availability integer,
  portfolio_url text,
  github_url text,
  linkedin_url text,
  skills text[] not null default array[]::text[],
  interests text[] not null default array[]::text[],
  builder_mode text not null default 'both',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint profiles_username_format_check check (
    username is null
    or (
      username = lower(username)
      and username ~ '^[a-z0-9_]{3,30}$'
    )
  ),
  constraint profiles_experience_level_check check (
    experience_level is null
    or experience_level in ('beginner', 'intermediate', 'advanced')
  ),
  constraint profiles_weekly_availability_check check (
    weekly_availability is null
    or weekly_availability between 0 and 168
  ),
  constraint profiles_builder_mode_check check (
    builder_mode in (
      'have_something_to_build',
      'want_something_to_build',
      'both'
    )
  )
);

create index profiles_city_idx
  on public.profiles (city)
  where city is not null;

create index profiles_primary_role_idx
  on public.profiles (primary_role)
  where primary_role is not null;

create index profiles_experience_level_idx
  on public.profiles (experience_level)
  where experience_level is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert, update on table public.profiles to authenticated;

create policy "Profiles are publicly readable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
