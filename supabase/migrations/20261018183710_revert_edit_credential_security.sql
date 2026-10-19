/*
# Revert edit-credential security upgrade (non-destructive)

1. Purpose
- Restore the original public clipboard/editor behavior so the pre-upgrade
  application works again: anyone with a code can read, create, edit, and
  delete snippets directly through the table.
- Undo the RPC-based access control introduced by the security upgrade without
  losing any existing snippet rows or content.

2. Data safety
- No tables are dropped or recreated.
- No rows are deleted.
- No snippet content is changed.
- The `edit_token_hash` column added by the security upgrade is left in place
  as a nullable column. Dropping a column is a destructive operation and is
  intentionally avoided. The column is simply ignored by the reverted app and
  remains harmless (nullable, unused).

3. Security changes
- Drop the five SECURITY DEFINER RPC functions added by the security upgrade
  (get_snippet_status, create_snippet, claim_snippet, update_snippet_content,
  delete_snippet). They are no longer referenced by the reverted frontend.
- Re-enable direct table access for anon and authenticated roles by restoring
  the original permissive RLS policies (SELECT/INSERT/UPDATE/DELETE) that the
  first migration created. This matches the original prototype behavior:
  snippets are intentionally public/shareable by code.

4. Existing data
- All existing snippet rows (including any created during the security upgrade)
  are preserved. Their content, codes, and timestamps are untouched.
- Rows that have an `edit_token_hash` value keep it, but it is no longer used
  for authorization and is never exposed by the reverted app.

5. Important notes
- This migration intentionally reverts to the original, less-secure public
  access model per the user's explicit request to restore the last working
  pre-upgrade version.
- This is safe to re-run: function drops are idempotent, policies are dropped
  before re-creation.
*/

DROP FUNCTION IF EXISTS public.get_snippet_status(text, text);
DROP FUNCTION IF EXISTS public.create_snippet(text, text, text);
DROP FUNCTION IF EXISTS public.claim_snippet(text, text);
DROP FUNCTION IF EXISTS public.update_snippet_content(text, text, text);
DROP FUNCTION IF EXISTS public.delete_snippet(text, text);

-- Keep snippets_set_updated_at (defined in the original migration) as-is.

ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_snippets" ON public.snippets;
CREATE POLICY "anon_select_snippets"
  ON public.snippets FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon_insert_snippets" ON public.snippets;
CREATE POLICY "anon_insert_snippets"
  ON public.snippets FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_snippets" ON public.snippets;
CREATE POLICY "anon_update_snippets"
  ON public.snippets FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_snippets" ON public.snippets;
CREATE POLICY "anon_delete_snippets"
  ON public.snippets FOR DELETE
  TO anon, authenticated
  USING (true);

-- Re-grant direct table privileges that the security upgrade had revoked.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snippets TO anon, authenticated;
