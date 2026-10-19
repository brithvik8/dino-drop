# DinoDrop

A minimalist text-sharing site disguised as a browser offline dinosaur page. Save any text behind a short 6-character code, then copy it back by clicking a dinosaur.

## Routes

- `/` — Home: create a new text or open an existing code.
- `/e/:code` — Editor for the text saved under `:code`. Creates the record on first save.
- `/c/:code` — Dino clipboard page. Click the dinosaur to copy the saved text.

## How it works

- Codes are 6 characters from `A–Z` and `2–9` (ambiguous characters like `0`, `O`, `1`, `I` are excluded).
- All text is stored in a Supabase `snippets` table, keyed by the code.
- Anyone with a code can read **and edit** its text — see the security note below.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file from the example and fill in your Supabase project's public values:
   ```bash
   cp .env.example .env
   ```
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
3. Create the `snippets` table in Supabase using the SQL below.
4. Run the dev server:
   ```bash
   npm run dev
   ```
5. Build for production:
   ```bash
   npm run build && npm run preview
   ```

## Supabase schema

Run this in the Supabase SQL editor (or via the migration tooling your environment provides):

```sql
CREATE TABLE IF NOT EXISTS snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS snippets_code_key ON snippets (code);

ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;

-- Single-tenant, no-auth prototype: anyone with a code may read and edit.
CREATE POLICY "anon_select_snippets" ON snippets FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_snippets" ON snippets FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_snippets" ON snippets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_snippets" ON snippets FOR DELETE
  TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION snippets_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER snippets_updated_at
  BEFORE UPDATE ON snippets
  FOR EACH ROW EXECUTE FUNCTION snippets_set_updated_at();
```

## Security note (read this)

DinoDrop is a **prototype with no accounts**. The RLS policies above allow anyone holding the anon key to read, insert, update, and delete any snippet. Because the anon key is public and codes are short, this means:

- Anyone who guesses or learns a code can **read and edit** that snippet's text.
- Anyone can **delete** snippets via the API.

This is intentional for the smallest working MVP, and matches the app's "share by code" UX. The safer upgrade path is:

1. Add user accounts (Supabase email/password auth) and a `user_id` column on `snippets`.
2. Replace the `USING (true)` policies with owner checks: `auth.uid() = user_id`.
3. Make `/c/:code` read-only (drop the UPDATE/DELETE policies for anon, keep a SELECT-only public policy if the clipboard page should stay public).
4. Optionally make codes longer, or pair them with a secret token stored server-side.

## Deployment (Vercel)

1. Push the repo to GitHub/GitLab.
2. Import the project into Vercel.
3. Add environment variables in the Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Vercel detects Vite automatically. The included `vercel.json` rewrites all routes to `index.html` so direct navigation and refreshes of `/e/ABCDEF` and `/c/ABCDEF` work.
5. Deploy. After deploy, refresh `/e/<code>` and `/c/<code>` to confirm SPA fallback works.

## Tech stack

React + Vite + TypeScript + Tailwind CSS + React Router + Supabase.
