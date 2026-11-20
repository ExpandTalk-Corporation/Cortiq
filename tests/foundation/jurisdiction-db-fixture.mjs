import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const S1 = '11111111-1111-4111-8111-111111111111';
export const S2 = '22222222-2222-4222-8222-222222222222';
export const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

export async function jurisdictionDb(extraSql = '') {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
    CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
    CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text, is_active boolean DEFAULT true);
    INSERT INTO public.sites VALUES ('${S1}', '${OWNER}', 'one.se', true), ('${S2}', '${OTHER}', 'two.se', true);
    INSERT INTO public.user_roles VALUES ('${ADMIN}', 'admin');
    ${extraSql}`);
  await pg.exec(read('../../supabase/migrations/20261207000001_jurisdiction_profile.sql'));
  await pg.exec(`GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;`);
  return pg;
}

export async function asUser(pg, userId, fn) {
  await pg.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
  try { return await fn(); } finally { await pg.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
}
