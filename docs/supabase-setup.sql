-- =====================================================================
--  Student Portal (AKI Consultant) — database setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run again: it only creates what is missing and refreshes functions.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Roles and employee accounts
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id    text primary key,
  name  text not null,
  perms text[] not null default '{}',
  sort  int not null default 0
);

insert into public.roles (id, name, perms, sort) values
  ('admin',      'Admin / Owner', '{*}', 0),
  ('counsellor', 'Counsellor',    '{students.view,students.create,students.edit,universities.view,documents.view,documents.upload,visa.view,visa.edit}', 1),
  ('accountant', 'Accountant',    '{students.view,universities.view,finance.view,finance.edit,finance.manage}', 2),
  ('frontdesk',  'Front desk',    '{students.view,students.create,universities.view}', 3)
on conflict (id) do nothing;

create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text not null default '',
  role_id              text references public.roles(id),
  extra_perms          text[] not null default '{}',   -- granted on top of the role
  revoked_perms        text[] not null default '{}',   -- taken away from the role
  active               boolean not null default false,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  last_seen            timestamptz
);

-- Effective permissions of the signed-in employee (empty when deactivated).
create or replace function public.my_perms() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when not p.active then '{}'::text[]
                when '*' = any(coalesce(r.perms, '{}')) then '{*}'::text[]
                else array(select unnest(coalesce(r.perms, '{}') || p.extra_perms)
                           except select unnest(p.revoked_perms)) end
      from profiles p left join roles r on r.id = p.role_id
     where p.id = auth.uid()), '{}'::text[]);
$$;

create or replace function public.has_perm(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select '*' = any(my_perms()) or perm = any(my_perms());
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active from profiles where id = auth.uid()), false);
$$;

-- Every new login gets a profile. The very first account becomes the active Admin;
-- everyone after that starts inactive until an Admin gives them a role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles (id, email, full_name, role_id, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when first_user then 'admin' end, first_user)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin helpers (need the users.manage permission)
create or replace function public.admin_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not has_perm('users.manage') then raise exception 'Not allowed'; end if;
  if length(new_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = target;
  update profiles set must_change_password = (target <> auth.uid()) where id = target;
end $$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('users.manage') then raise exception 'Not allowed'; end if;
  if target = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  if exists (select 1 from students where created_by = target or updated_by = target or counsellor_id = target)
     or exists (select 1 from audit_log where actor = target) then
    raise exception 'This employee has history in the system. Deactivate the account instead of deleting it.';
  end if;
  delete from auth.users where id = target;
end $$;

-- Called by the app on sign-in; clears the "change your password" flag after a change.
create or replace function public.touch_profile(password_changed boolean default false) returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen = now(),
         must_change_password = case when password_changed then false else must_change_password end
   where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
--  Student statuses (customisable in Settings)
-- ---------------------------------------------------------------------
create table if not exists public.statuses (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  color    text not null default '#64748b',
  sort     int not null default 0,
  archived boolean not null default false
);

insert into public.statuses (name, color, sort)
select * from (values
  ('New Enquiry', '#0ea5e9', 1), ('Interested', '#06b6d4', 2), ('Follow-up Required', '#f59e0b', 3),
  ('Application Pending', '#a855f7', 4), ('Waiting for University Application', '#8b5cf6', 5),
  ('Application Submitted', '#6366f1', 6), ('Offer Received', '#14b8a6', 7), ('Offer Accepted', '#10b981', 8),
  ('Visa Applied', '#3b82f6', 9), ('Visa Approved', '#22c55e', 10), ('Visa Rejected', '#ef4444', 11),
  ('Active Student', '#16a34a', 12), ('Enrolled', '#15803d', 13), ('Withdrawn', '#94a3b8', 14),
  ('Not Proceeding', '#64748b', 15)) v(name, color, sort)
where not exists (select 1 from public.statuses);

-- ---------------------------------------------------------------------
--  Students
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id                 uuid primary key default gen_random_uuid(),
  ref                bigint generated always as identity unique,  -- shown as AKI-00001
  full_name          text not null,
  gender             text,
  dob                date,
  nationality        text,
  phone              text,
  whatsapp           text,
  email              text,
  address            text,
  civil_id           text,
  civil_id_expiry    date,
  passport_no        text,
  passport_expiry    date,
  guardian_name      text,
  guardian_relation  text,
  guardian_phone     text,
  guardian_email     text,
  high_school        text,
  curriculum         text,
  grade              text,
  graduation_year    int,
  highest_education  text,
  english_test       text,
  english_score      text,
  english_test_date  date,
  preferred_countries text[] not null default '{}',
  preferred_level    text,
  preferred_courses  text,
  preferred_intake   text,
  budget             text,
  lead_source        text,
  status_id          uuid references public.statuses(id),
  counsellor_id      uuid references public.profiles(id),
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id)
);

-- The same Civil ID or passport number can't be registered twice.
create unique index if not exists students_civil_id_uq on public.students (upper(trim(civil_id))) where civil_id is not null and trim(civil_id) <> '';
create unique index if not exists students_passport_uq on public.students (upper(trim(passport_no))) where passport_no is not null and trim(passport_no) <> '';
create index if not exists students_status_idx on public.students (status_id);
create index if not exists students_counsellor_idx on public.students (counsellor_id);

-- Communication log (calls, WhatsApp, emails, visits)
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  kind        text not null default 'call',
  happened_at timestamptz not null default now(),
  summary     text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);
create index if not exists contacts_student_idx on public.contacts (student_id, happened_at desc);

-- ---------------------------------------------------------------------
--  Who-did-what: stamps and audit log
-- ---------------------------------------------------------------------
create or replace function public.stamp_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid();
  else
    new.created_at := old.created_at; new.created_by := old.created_by;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_name text,
  table_name text not null,
  record_id  uuid,
  student_id uuid,
  action     text not null,          -- created / updated / deleted
  label      text,                   -- e.g. the student's name at the time
  changes    jsonb not null default '{}'   -- { field: [old, new] }
);
create index if not exists audit_student_idx on public.audit_log (student_id, at desc);
create index if not exists audit_at_idx on public.audit_log (at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}' end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}' end;
  r jsonb := case when tg_op = 'DELETE' then o else n end;
  diff jsonb := '{}';
  k text;
begin
  for k in select jsonb_object_keys(o || n) loop
    if k in ('id', 'updated_at', 'updated_by', 'created_at', 'created_by', 'ref', 'last_seen') then continue; end if;
    if coalesce(o -> k, 'null') is distinct from coalesce(n -> k, 'null') then
      if tg_op = 'INSERT' and n -> k in ('null', '[]', '""') then continue; end if;
      diff := diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  if tg_op = 'UPDATE' and diff = '{}' then return null; end if;
  insert into audit_log (actor, actor_name, table_name, record_id, student_id, action, label, changes)
  values (auth.uid(), (select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid()),
          tg_table_name,
          case when (r ->> 'id') ~* '^[0-9a-f-]{36}$' then (r ->> 'id')::uuid end,
          coalesce((r ->> 'student_id')::uuid, case when tg_table_name = 'students' then (r ->> 'id')::uuid end),
          case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
          coalesce(r ->> 'full_name', r ->> 'name', r ->> 'summary'),
          diff);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['students', 'contacts'] loop
    execute format('drop trigger if exists stamp on public.%I', t);
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.stamp_row()', t);
  end loop;
  foreach t in array array['students', 'contacts', 'statuses', 'profiles', 'roles'] loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  Row-level security: who can see and change what
-- ---------------------------------------------------------------------
alter table public.roles     enable row level security;
alter table public.profiles  enable row level security;
alter table public.statuses  enable row level security;
alter table public.students  enable row level security;
alter table public.contacts  enable row level security;
alter table public.audit_log enable row level security;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('roles', 'profiles', 'statuses', 'students', 'contacts', 'audit_log') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy roles_read   on public.roles for select using (is_active());
create policy roles_write  on public.roles for all using (has_perm('users.manage')) with check (has_perm('users.manage'));

create policy profiles_read  on public.profiles for select using (is_active() or id = auth.uid());
create policy profiles_write on public.profiles for update using (has_perm('users.manage')) with check (has_perm('users.manage'));

create policy statuses_read  on public.statuses for select using (is_active());
create policy statuses_write on public.statuses for all using (has_perm('settings.manage')) with check (has_perm('settings.manage'));

create policy students_read   on public.students for select using (has_perm('students.view'));
create policy students_insert on public.students for insert with check (has_perm('students.create'));
create policy students_update on public.students for update using (has_perm('students.edit')) with check (has_perm('students.edit'));
create policy students_delete on public.students for delete using (has_perm('students.delete'));

create policy contacts_read   on public.contacts for select using (has_perm('students.view'));
create policy contacts_insert on public.contacts for insert with check (has_perm('students.view'));
create policy contacts_update on public.contacts for update using (created_by = auth.uid() or has_perm('students.delete'));
create policy contacts_delete on public.contacts for delete using (created_by = auth.uid() or has_perm('students.delete'));

create policy audit_read on public.audit_log for select using (
  has_perm('audit.view') or (student_id is not null and has_perm('students.view')));
-- No insert/update/delete policies: the log is written only by the database itself and can't be edited.

-- Profiles: an admin must not be able to lock everyone out.
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role_id = 'admin' and old.active and (new.role_id is distinct from 'admin' or not new.active)
     and not exists (select 1 from profiles where id <> old.id and role_id = 'admin' and active) then
    raise exception 'At least one active Admin is required.';
  end if;
  return new;
end $$;
drop trigger if exists guard_last_admin on public.profiles;
create trigger guard_last_admin before update on public.profiles for each row execute function public.guard_last_admin();

grant execute on function public.my_perms, public.has_perm, public.is_active, public.touch_profile,
  public.admin_set_password, public.admin_delete_user to authenticated;
