-- Run this in the Supabase SQL editor for the deployed project.
-- It makes the public community/profile endpoints return the shareable
-- dashboard dataset, so fresh browsers and mobile devices do not rely on
-- another browser's localStorage cache.

create or replace view public.public_member_profiles as
select
  id,
  user_id,
  display_name,
  avatar_url,
  created_at,
  updated_at,
  snapshot,
  snapshot -> 'stats' as stats,
  snapshot -> 'followings' as followings,
  snapshot ->> 'aboutMe' as "aboutMe",
  snapshot -> 'profileLinks' as "profileLinks",
  coalesce(
    snapshot -> 'dataset',
    snapshot -> 'rows',
    snapshot -> 'data',
    '[]'::jsonb
  ) as dataset
from public.member_profiles
where coalesce(jsonb_array_length(
  case
    when jsonb_typeof(snapshot -> 'dataset') = 'array' then snapshot -> 'dataset'
    when jsonb_typeof(snapshot -> 'rows') = 'array' then snapshot -> 'rows'
    when jsonb_typeof(snapshot -> 'data') = 'array' then snapshot -> 'data'
    else '[]'::jsonb
  end
), 0) > 0;

grant select on public.public_member_profiles to anon, authenticated;

drop function if exists public.get_public_member_profiles(integer, integer);
drop function if exists public.get_public_member_profile(uuid);
drop function if exists public.get_public_member_profile(text);

create or replace function public.get_public_member_profiles(
  page_limit integer default 200,
  page_offset integer default 0
)
returns table (
  id text,
  user_id text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  snapshot jsonb,
  stats jsonb,
  followings jsonb,
  "aboutMe" text,
  "profileLinks" jsonb,
  dataset jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id::text,
    p.user_id::text,
    p.display_name,
    p.avatar_url,
    p.created_at,
    p.updated_at,
    p.snapshot,
    p.snapshot -> 'stats' as stats,
    p.snapshot -> 'followings' as followings,
    p.snapshot ->> 'aboutMe' as "aboutMe",
    p.snapshot -> 'profileLinks' as "profileLinks",
    coalesce(
      p.snapshot -> 'dataset',
      p.snapshot -> 'rows',
      p.snapshot -> 'data',
      '[]'::jsonb
    ) as dataset
  from public.member_profiles p
  where coalesce(jsonb_array_length(
    case
      when jsonb_typeof(p.snapshot -> 'dataset') = 'array' then p.snapshot -> 'dataset'
      when jsonb_typeof(p.snapshot -> 'rows') = 'array' then p.snapshot -> 'rows'
      when jsonb_typeof(p.snapshot -> 'data') = 'array' then p.snapshot -> 'data'
      else '[]'::jsonb
    end
  ), 0) > 0
  order by p.updated_at desc
  limit greatest(1, least(coalesce(page_limit, 200), 1000))
  offset greatest(0, coalesce(page_offset, 0));
$$;

grant execute on function public.get_public_member_profiles(integer, integer) to anon, authenticated;

create or replace function public.get_public_member_profile(profile_user_id text)
returns table (
  id text,
  user_id text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  snapshot jsonb,
  stats jsonb,
  followings jsonb,
  "aboutMe" text,
  "profileLinks" jsonb,
  dataset jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id::text,
    p.user_id::text,
    p.display_name,
    p.avatar_url,
    p.created_at,
    p.updated_at,
    p.snapshot,
    p.snapshot -> 'stats' as stats,
    p.snapshot -> 'followings' as followings,
    p.snapshot ->> 'aboutMe' as "aboutMe",
    p.snapshot -> 'profileLinks' as "profileLinks",
    coalesce(
      p.snapshot -> 'dataset',
      p.snapshot -> 'rows',
      p.snapshot -> 'data',
      '[]'::jsonb
    ) as dataset
  from public.member_profiles p
  where p.user_id::text = profile_user_id
  limit 1;
$$;

grant execute on function public.get_public_member_profile(text) to anon, authenticated;
