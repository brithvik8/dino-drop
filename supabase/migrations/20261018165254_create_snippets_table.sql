/*
# Create snippets table for DinoDrop

DinoDrop is a text-sharing app where each snippet is keyed by a public
six-character alphanumeric code. Anyone who knows the code can read and
edit the snippet text. There are no user accounts in this prototype, so
the table is single-tenant / intentionally public.

1. New Tables
- `snippets`
  - `id`          uuid, primary key (default gen_random_uuid())
  - `code`        text, unique, not null; six-character uppercase alphanumeric
  - `content`     text, not null; multiline snippet body, defaults to empty string
  - `created_at`  timestamptz, default now()
  - `updated_at`  timestamptz, default now(), auto-updated on row change

2. Indexes
- Unique index on `code` (enforces uniqueness + fast lookups by code).

3. Security (RLS)
- RLS enabled on `snippets`.
- Four separate policies (SELECT / INSERT / UPDATE / DELETE) scoped to
  `TO anon, authenticated` because the app has no sign-in screen and
  the frontend uses the anon key. `USING (true)` / `WITH CHECK (true)`
  is intentional here: snippets are publicly shared by code and anyone
  with a code may read or modify them. This is the documented trade-off
  of the prototype; the safer upgrade path is to add per-snippet owner
  accounts (see README).

4. Important notes
- A `BEFORE UPDATE` trigger refreshes `updated_at` automatically so the
  client never needs to send it.
- The app validates code format (6 chars, A-Z0-9, no ambiguous chars)
  on the client before insert. The DB does not enforce format, only
  uniqueness — this keeps the schema flexible while the app guards the
  boundary.
*/

CREATE TABLE IF NOT EXISTS snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS snippets_code_key ON snippets (code);

ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_snippets" ON snippets;
CREATE POLICY "anon_select_snippets"
  ON snippets FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon_insert_snippets" ON snippets;
CREATE POLICY "anon_insert_snippets"
  ON snippets FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_snippets" ON snippets;
CREATE POLICY "anon_update_snippets"
  ON snippets FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_snippets" ON snippets;
CREATE POLICY "anon_delete_snippets"
  ON snippets FOR DELETE
  TO anon, authenticated
  USING (true);

-- Auto-update updated_at on row change.
CREATE OR REPLACE FUNCTION snippets_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snippets_updated_at ON snippets;
CREATE TRIGGER snippets_updated_at
  BEFORE UPDATE ON snippets
  FOR EACH ROW
  EXECUTE FUNCTION snippets_set_updated_at();
