create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  slug text not null unique,
  short_description text not null,
  description text,
  category text not null,
  project_type text not null,
  stage text not null default 'idea',
  collaboration_type text not null default 'remote',
  city text,
  duration text,
  weekly_commitment integer,
  max_team_size integer not null default 5,
  goal text,
  status text not null default 'open',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint projects_name_length_check check (
    char_length(btrim(name)) between 3 and 100
  ),
  constraint projects_slug_format_check check (
    char_length(slug) between 3 and 120
    and slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint projects_short_description_length_check check (
    char_length(btrim(short_description)) between 10 and 240
  ),
  constraint projects_description_length_check check (
    description is null
    or char_length(btrim(description)) between 1 and 10000
  ),
  constraint projects_category_length_check check (
    char_length(btrim(category)) between 2 and 60
  ),
  constraint projects_project_type_check check (
    project_type in (
      'startup',
      'hackathon',
      'portfolio',
      'college',
      'experimental',
      'creative',
      'other'
    )
  ),
  constraint projects_stage_check check (
    stage in ('idea', 'planning', 'building', 'mvp', 'launched')
  ),
  constraint projects_collaboration_type_check check (
    collaboration_type in ('remote', 'local', 'hybrid')
  ),
  constraint projects_city_length_check check (
    city is null
    or char_length(btrim(city)) between 1 and 100
  ),
  constraint projects_duration_length_check check (
    duration is null
    or char_length(btrim(duration)) between 1 and 100
  ),
  constraint projects_weekly_commitment_check check (
    weekly_commitment is null
    or weekly_commitment between 0 and 168
  ),
  constraint projects_max_team_size_check check (
    max_team_size between 1 and 50
  ),
  constraint projects_goal_length_check check (
    goal is null
    or char_length(btrim(goal)) between 1 and 500
  ),
  constraint projects_status_check check (
    status in ('open', 'in_progress', 'completed', 'archived')
  )
);

create index projects_owner_id_idx
  on public.projects (owner_id);

create index projects_status_created_at_idx
  on public.projects (status, created_at desc);

create index projects_category_idx
  on public.projects (category);

create index projects_project_type_idx
  on public.projects (project_type);

create index projects_stage_idx
  on public.projects (stage);

create index projects_collaboration_type_idx
  on public.projects (collaboration_type);

create index projects_city_idx
  on public.projects (city)
  where city is not null;

create trigger set_projects_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

alter table public.projects enable row level security;

revoke all on table public.projects from anon, authenticated;
grant select on table public.projects to anon, authenticated;
grant insert, update, delete on table public.projects to authenticated;

create policy "Projects are publicly readable"
  on public.projects
  for select
  to anon, authenticated
  using (true);

create policy "Users can create their own projects"
  on public.projects
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update their projects"
  on public.projects
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their projects"
  on public.projects
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
