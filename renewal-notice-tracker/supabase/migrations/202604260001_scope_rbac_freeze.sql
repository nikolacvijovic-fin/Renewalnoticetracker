update public.memberships
set role = 'operator'
where role = 'member';

alter table public.memberships
  drop constraint if exists memberships_role_check;

alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'operator', 'reviewer'));
