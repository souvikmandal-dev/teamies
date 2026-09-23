create table public.project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  required_skills text[] not null default array[]::text[],
  experience_level text default 'any',
  positions integer not null default 1,
  filled_positions integer not null default 0,
  weekly_commitment integer,
  status text not null default 'open',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint project_roles_title_length_check check (
    char_length(btrim(title)) between 2 and 80
  ),
  constraint project_roles_description_length_check check (
    description is null
    or char_length(btrim(description)) between 1 and 2000
  ),
  constraint project_roles_experience_level_check check (
    experience_level is null
    or experience_level in ('beginner', 'intermediate', 'advanced', 'any')
  ),
  constraint project_roles_positions_check check (
    positions between 1 and 20
  ),
  constraint project_roles_filled_positions_check check (
    filled_positions between 0 and positions
  ),
  constraint project_roles_weekly_commitment_check check (
    weekly_commitment is null
    or weekly_commitment between 0 and 168
  ),
  constraint project_roles_status_check check (
    status in ('open', 'filled', 'closed')
  )
);

create index project_roles_project_id_idx
  on public.project_roles (project_id);

create index project_roles_status_created_at_idx
  on public.project_roles (status, created_at desc);

create index project_roles_experience_level_idx
  on public.project_roles (experience_level)
  where experience_level is not null;

create index project_roles_required_skills_idx
  on public.project_roles using gin (required_skills);

create trigger set_project_roles_updated_at
  before update on public.project_roles
  for each row
  execute function public.set_updated_at();

alter table public.project_roles enable row level security;

revoke all on table public.project_roles from anon, authenticated;
grant select on table public.project_roles to anon, authenticated;
grant insert, update, delete on table public.project_roles to authenticated;

create policy "Project roles are publicly readable"
  on public.project_roles
  for select
  to anon, authenticated
  using (true);

create policy "Project owners can create roles"
  on public.project_roles
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.projects as p
      where p.id = project_roles.project_id
        and p.owner_id = (select auth.uid())
    )
  );

create policy "Project owners can update roles"
  on public.project_roles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.projects as p
      where p.id = project_roles.project_id
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.projects as p
      where p.id = project_roles.project_id
        and p.owner_id = (select auth.uid())
    )
  );

create policy "Project owners can delete roles"
  on public.project_roles
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.projects as p
      where p.id = project_roles.project_id
        and p.owner_id = (select auth.uid())
    )
  );
