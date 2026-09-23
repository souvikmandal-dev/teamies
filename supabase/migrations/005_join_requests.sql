create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  project_role_id uuid not null references public.project_roles (id) on delete cascade,
  message text,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  responded_at timestamp with time zone,

  constraint join_requests_project_applicant_key unique (
    project_id,
    applicant_id
  ),
  constraint join_requests_message_length_check check (
    message is null
    or char_length(btrim(message)) between 1 and 1000
  ),
  constraint join_requests_status_check check (
    status in ('pending', 'accepted', 'rejected', 'withdrawn')
  ),
  constraint join_requests_response_timestamp_check check (
    (status in ('accepted', 'rejected') and responded_at is not null)
    or (status in ('pending', 'withdrawn') and responded_at is null)
  )
);

create index join_requests_applicant_created_at_idx
  on public.join_requests (applicant_id, created_at desc);

create index join_requests_project_status_created_at_idx
  on public.join_requests (project_id, status, created_at desc);

create index join_requests_project_role_status_idx
  on public.join_requests (project_role_id, status);

create or replace function public.validate_join_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_actor_id uuid;
  project_owner_id uuid;
  project_status text;
  role_project_id uuid;
  role_status text;
begin
  request_actor_id := auth.uid();

  if request_actor_id is null or request_actor_id <> new.applicant_id then
    raise exception 'A join request can only be created by its applicant.';
  end if;

  if new.status <> 'pending' or new.responded_at is not null then
    raise exception 'A new join request must begin with pending status.';
  end if;

  select p.owner_id, p.status
  into project_owner_id, project_status
  from public.projects as p
  where p.id = new.project_id
  for share;

  if not found then
    raise exception 'The referenced project does not exist.';
  end if;

  if project_status <> 'open' then
    raise exception 'This project is not accepting join requests.';
  end if;

  if new.applicant_id = project_owner_id then
    raise exception 'A project owner cannot apply to their own project.';
  end if;

  select r.project_id, r.status
  into role_project_id, role_status
  from public.project_roles as r
  where r.id = new.project_role_id
  for share;

  if not found then
    raise exception 'The referenced project role does not exist.';
  end if;

  if role_project_id <> new.project_id then
    raise exception 'The selected project role belongs to a different project.';
  end if;

  if role_status <> 'open' then
    raise exception 'This project role is not accepting join requests.';
  end if;

  if exists (
    select 1
    from public.project_members as pm
    where pm.project_id = new.project_id
      and pm.profile_id = new.applicant_id
      and pm.membership_status = 'active'
  ) then
    raise exception 'An active project member cannot submit a join request.';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_join_request_insert()
  from public, anon, authenticated;

create trigger validate_join_request_before_insert
  before insert on public.join_requests
  for each row
  execute function public.validate_join_request_insert();

create or replace function public.process_join_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_actor_id uuid;
  project_owner_id uuid;
  project_status text;
  project_max_team_size integer;
  role_project_id uuid;
  role_status text;
  role_positions integer;
  active_role_members bigint;
  active_project_members bigint;
begin
  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.applicant_id is distinct from old.applicant_id
    or new.project_role_id is distinct from old.project_role_id
    or new.message is distinct from old.message
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Join request identity and submission details are immutable.';
  end if;

  if new.responded_at is distinct from old.responded_at then
    raise exception 'responded_at is managed automatically.';
  end if;

  if old.status <> 'pending' then
    raise exception 'Only pending join requests can change status.';
  end if;

  request_actor_id := auth.uid();

  select p.owner_id, p.status, p.max_team_size
  into project_owner_id, project_status, project_max_team_size
  from public.projects as p
  where p.id = old.project_id
  for update;

  if not found then
    raise exception 'The referenced project does not exist.';
  end if;

  if request_actor_id = old.applicant_id then
    if new.status <> 'withdrawn' then
      raise exception 'Applicants may only withdraw pending join requests.';
    end if;

    new.responded_at := null;
    return new;
  end if;

  if request_actor_id <> project_owner_id then
    raise exception 'Only the applicant or project owner may update this request.';
  end if;

  if new.status not in ('accepted', 'rejected') then
    raise exception 'Project owners may only accept or reject pending requests.';
  end if;

  if new.status = 'rejected' then
    new.responded_at := now();
    return new;
  end if;

  if project_status <> 'open' then
    raise exception 'This project is no longer accepting new members.';
  end if;

  if old.applicant_id = project_owner_id then
    raise exception 'A project owner cannot become a project member.';
  end if;

  select r.project_id, r.status, r.positions
  into role_project_id, role_status, role_positions
  from public.project_roles as r
  where r.id = old.project_role_id
  for update;

  if not found then
    raise exception 'The requested project role no longer exists.';
  end if;

  if role_project_id <> old.project_id then
    raise exception 'The requested role belongs to a different project.';
  end if;

  if role_status <> 'open' then
    raise exception 'The requested project role is no longer open.';
  end if;

  if exists (
    select 1
    from public.project_members as pm
    where pm.project_id = old.project_id
      and pm.profile_id = old.applicant_id
  ) then
    raise exception 'A membership relationship already exists for this builder and project.';
  end if;

  select count(*)
  into active_role_members
  from public.project_members as pm
  where pm.project_id = old.project_id
    and pm.project_role_id = old.project_role_id
    and pm.membership_status = 'active';

  if active_role_members >= role_positions then
    raise exception 'This project role has no available positions.';
  end if;

  select count(*)
  into active_project_members
  from public.project_members as pm
  where pm.project_id = old.project_id
    and pm.membership_status = 'active';

  if active_project_members + 1 >= project_max_team_size then
    raise exception 'This project has reached its maximum team size.';
  end if;

  insert into public.project_members (
    project_id,
    profile_id,
    project_role_id,
    membership_status,
    joined_at
  )
  values (
    old.project_id,
    old.applicant_id,
    old.project_role_id,
    'active',
    now()
  );

  new.responded_at := now();
  return new;
end;
$$;

revoke execute on function public.process_join_request_update()
  from public, anon, authenticated;

create trigger process_join_request_before_update
  before update on public.join_requests
  for each row
  execute function public.process_join_request_update();

create or replace function public.protect_requested_project_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
    and exists (
      select 1
      from public.join_requests as jr
      where jr.project_role_id = old.id
    )
  then
    raise exception 'A project role with join requests cannot move to another project.';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_requested_project_role()
  from public, anon, authenticated;

create trigger protect_requested_project_role_before_update
  before update of project_id on public.project_roles
  for each row
  execute function public.protect_requested_project_role();

create trigger set_join_requests_updated_at
  before update on public.join_requests
  for each row
  execute function public.set_updated_at();

alter table public.join_requests enable row level security;

revoke all on table public.join_requests from anon, authenticated;
grant select, insert, update on table public.join_requests to authenticated;

create policy "Applicants and project owners can read join requests"
  on public.join_requests
  for select
  to authenticated
  using (
    applicant_id = (select auth.uid())
    or exists (
      select 1
      from public.projects as p
      where p.id = join_requests.project_id
        and p.owner_id = (select auth.uid())
    )
  );

create policy "Builders can submit their own join requests"
  on public.join_requests
  for insert
  to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'pending'
    and responded_at is null
    and exists (
      select 1
      from public.projects as p
      where p.id = join_requests.project_id
        and p.owner_id <> (select auth.uid())
        and p.status = 'open'
    )
    and exists (
      select 1
      from public.project_roles as r
      where r.id = join_requests.project_role_id
        and r.project_id = join_requests.project_id
        and r.status = 'open'
    )
    and not exists (
      select 1
      from public.project_members as pm
      where pm.project_id = join_requests.project_id
        and pm.profile_id = join_requests.applicant_id
        and pm.membership_status = 'active'
    )
  );

create policy "Applicants and project owners can update join requests"
  on public.join_requests
  for update
  to authenticated
  using (
    applicant_id = (select auth.uid())
    or exists (
      select 1
      from public.projects as p
      where p.id = join_requests.project_id
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    applicant_id = (select auth.uid())
    or exists (
      select 1
      from public.projects as p
      where p.id = join_requests.project_id
        and p.owner_id = (select auth.uid())
    )
  );
