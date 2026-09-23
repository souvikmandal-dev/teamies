create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  project_role_id uuid references public.project_roles (id) on delete set null,
  membership_status text not null default 'active',
  joined_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint project_members_project_profile_key unique (
    project_id,
    profile_id
  ),
  constraint project_members_membership_status_check check (
    membership_status in ('active', 'left', 'removed')
  )
);

create index project_members_profile_id_idx
  on public.project_members (profile_id);

create index project_members_project_role_id_idx
  on public.project_members (project_role_id)
  where project_role_id is not null;

create index project_members_status_joined_at_idx
  on public.project_members (membership_status, joined_at desc);

create or replace function public.validate_project_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_owner_id uuid;
  role_project_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.project_id is distinct from old.project_id
    or new.profile_id is distinct from old.profile_id
  ) then
    raise exception 'A membership cannot be moved to another project or profile.';
  end if;

  select p.owner_id
  into project_owner_id
  from public.projects as p
  where p.id = new.project_id;

  if not found then
    raise exception 'The referenced project does not exist.';
  end if;

  if new.profile_id = project_owner_id then
    raise exception 'A project owner cannot also be stored as a project member.';
  end if;

  if new.project_role_id is not null then
    select r.project_id
    into role_project_id
    from public.project_roles as r
    where r.id = new.project_role_id
    for share;

    if not found then
      raise exception 'The referenced project role does not exist.';
    end if;

    if role_project_id <> new.project_id then
      raise exception 'The selected project role belongs to a different project.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_project_membership()
  from public, anon, authenticated;

create trigger validate_project_membership_before_write
  before insert or update on public.project_members
  for each row
  execute function public.validate_project_membership();

create or replace function public.protect_assigned_project_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
    and exists (
      select 1
      from public.project_members as pm
      where pm.project_role_id = old.id
    )
  then
    raise exception 'A project role with assigned members cannot move to another project.';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_assigned_project_role()
  from public, anon, authenticated;

create trigger protect_assigned_project_role_before_update
  before update of project_id on public.project_roles
  for each row
  execute function public.protect_assigned_project_role();

create trigger set_project_members_updated_at
  before update on public.project_members
  for each row
  execute function public.set_updated_at();

alter table public.project_members enable row level security;

revoke all on table public.project_members from anon, authenticated;
grant select on table public.project_members to anon, authenticated;
grant insert, update on table public.project_members to authenticated;

create policy "Project memberships are publicly readable"
  on public.project_members
  for select
  to anon, authenticated
  using (true);

create policy "Project owners can create memberships"
  on public.project_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.projects as p
      where p.id = project_members.project_id
        and p.owner_id = (select auth.uid())
        and project_members.profile_id <> p.owner_id
    )
    and (
      project_members.project_role_id is null
      or exists (
        select 1
        from public.project_roles as r
        where r.id = project_members.project_role_id
          and r.project_id = project_members.project_id
      )
    )
  );

create policy "Project owners can update memberships"
  on public.project_members
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.projects as p
      where p.id = project_members.project_id
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.projects as p
      where p.id = project_members.project_id
        and p.owner_id = (select auth.uid())
        and project_members.profile_id <> p.owner_id
    )
    and (
      project_members.project_role_id is null
      or exists (
        select 1
        from public.project_roles as r
        where r.id = project_members.project_role_id
          and r.project_id = project_members.project_id
      )
    )
  );
