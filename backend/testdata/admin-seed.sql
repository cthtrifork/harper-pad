-- Three devices for trying the admin UI against a scratch PostgreSQL (backend/README.md, "Trying the admin UI").
-- Needs migrations/0001_init.sql applied first. Times are Unix milliseconds, relative to now.
INSERT INTO devices (id, client_id, name, user_agent, token_hash, public_key, created_at, last_seen)
SELECT v.id, 1, v.name, v.user_agent, sha256(convert_to(v.id, 'UTF8')), '{}',
       ((extract(epoch FROM now() - v.created) * 1000))::bigint,
       ((extract(epoch FROM now() - v.seen) * 1000))::bigint
FROM (VALUES
  ('seed-desktop', 'Desktop',    'Harper Pad 0.9 · Linux',    interval '23 days', interval '2 minutes'),
  ('seed-iphone',  'iPhone',     'Safari · Home Screen app',  interval '7 days',  interval '27 hours'),
  ('seed-laptop',  'Old laptop', 'Chromium · Windows',        interval '62 days', interval '37 days')
) AS v(id, name, user_agent, created, seen);
