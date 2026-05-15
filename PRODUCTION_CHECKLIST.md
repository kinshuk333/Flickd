# Flickd Production Readiness Checklist

## 1) Environment and Secrets
- Use **only** `.env` locally and platform environment variables in production.
- Rotate keys if they were shared in chats/screenshots:
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_OMDB_API_KEY`
  - `VITE_OMDB_API_KEY_FALLBACK`

## 2) Supabase SQL (run in SQL editor)
```sql
-- Performance indexes
create index if not exists idx_member_profiles_user_id
on public.member_profiles(user_id);

create index if not exists idx_member_profiles_updated_at
on public.member_profiles(updated_at desc);

create index if not exists idx_follows_follower
on public.follows(follower_user_id);

create index if not exists idx_follows_followed
on public.follows(followed_user_id);

create unique index if not exists idx_follows_unique_pair
on public.follows(follower_user_id, followed_user_id);
```

## 3) OMDb Cache Policy Hardening
Current setup allows public writes. For production, prefer authenticated writes:
```sql
drop policy if exists omdb_cache_write on public.omdb_cache;
drop policy if exists omdb_cache_update on public.omdb_cache;

create policy omdb_cache_write
on public.omdb_cache
for insert
to authenticated
with check (true);

create policy omdb_cache_update
on public.omdb_cache
for update
to authenticated
using (true)
with check (true);
```

Keep `omdb_cache_read` as-is unless you want to restrict reads too.

## 4) Build/Lint Gates
Run before deploy:
```bash
npm run lint
npm run build
```

## 5) Smoke Test Script (manual)
1. Login with Google.
2. Upload IMDb file.
3. Verify Overview/Personality charts render.
4. Open Members and view another profile.
5. Follow/Unfollow works and reflects in Following/Followers.
6. Open movie modal from Deep Dive.
7. Export PDF.

## 6) Known Operational Notes
- If OMDb key A hits quota, app will auto-try fallback key B.
- If both OMDb keys fail, non-OMDb dashboards should still work (posters/details may degrade).
- If you see Supabase auth lock warnings in dev, ensure single client usage and avoid StrictMode double-mount.
