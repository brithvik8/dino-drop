/*
# Create or Update shared_files table and secure storage configuration for DinoDrop
# Supports DOCUMENTS AND IMAGES ONLY with $ prefixed codes and 50 MB limit

1. Public metadata table: public.shared_files
   - Stores metadata for shared documents and images.
   - Enforces max 50 MB (52,428,800 bytes) limit.
   - Enforces code format starting with literal '$' (e.g. $ABC123).
   - Strict database-level extension check (.pdf, .doc, .docx, .txt, .ppt, .pptx, .xls, .xlsx, .mdj, .png, .jpg, .jpeg, .gif, .webp, .svg).
   - RLS is ENABLED. Blanket SELECT on table is disabled.
   - Lookups are restricted to the SECURITY DEFINER function `get_shared_file`.
   - Anonymous users cannot overwrite or delete any file.

2. Supabase Storage bucket: 'shared_files'
   - Private bucket (`public = false`).
   - Size limit: 52,428,800 bytes (50 MB).
   - INSERT allowed to anon without overwrite permission.
   - SELECT allowed ONLY for files registered in public.shared_files.
   - NO UPDATE or DELETE policies.

3. Existing snippets table and text routes are completely untouched.
*/

-- 1. Create metadata table if it does not exist yet
CREATE TABLE IF NOT EXISTS public.shared_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL DEFAULT 'application/octet-stream',
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_files_size_check CHECK (file_size > 0 AND file_size <= 52428800),
  CONSTRAINT shared_files_code_format_check CHECK (code ~ '^\$[A-Z0-9]{6,12}$'),
  CONSTRAINT shared_files_extension_check CHECK (lower(file_name) ~ '\.(pdf|doc|docx|txt|ppt|pptx|xls|xlsx|mdj|png|jpg|jpeg|gif|webp|svg)$')
);

-- 2. Safe constraint update for existing deployments:
-- Drops and re-adds constraints to safely handle updates without dropping tables
DO $$
BEGIN
  -- Update size constraint
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_files_size_check') THEN
    ALTER TABLE public.shared_files DROP CONSTRAINT shared_files_size_check;
  END IF;
  ALTER TABLE public.shared_files
    ADD CONSTRAINT shared_files_size_check
    CHECK (file_size > 0 AND file_size <= 52428800);

  -- Add/update code format check ($ prefix required)
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_files_code_format_check') THEN
    ALTER TABLE public.shared_files DROP CONSTRAINT shared_files_code_format_check;
  END IF;
  ALTER TABLE public.shared_files
    ADD CONSTRAINT shared_files_code_format_check
    CHECK (code ~ '^\$[A-Z0-9]{6,12}$');

  -- Add/update extension allowlist check
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_files_extension_check') THEN
    ALTER TABLE public.shared_files DROP CONSTRAINT shared_files_extension_check;
  END IF;
  ALTER TABLE public.shared_files
    ADD CONSTRAINT shared_files_extension_check
    CHECK (lower(file_name) ~ '\.(pdf|doc|docx|txt|ppt|pptx|xls|xlsx|mdj|png|jpg|jpeg|gif|webp|svg)$');
END $$;

-- 3. Unique indexes on sharing code and storage path
CREATE UNIQUE INDEX IF NOT EXISTS shared_files_code_key ON public.shared_files (code);
CREATE UNIQUE INDEX IF NOT EXISTS shared_files_storage_path_key ON public.shared_files (storage_path);

-- 4. Enable Row Level Security on metadata table
ALTER TABLE public.shared_files ENABLE ROW LEVEL SECURITY;

-- 5. INSERT Policy: Allow anonymous users to upload documents and images with $ codes up to 50 MB
DROP POLICY IF EXISTS "anon_insert_shared_files" ON public.shared_files;
CREATE POLICY "anon_insert_shared_files"
  ON public.shared_files FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    file_size > 0
    AND file_size <= 52428800
    AND code ~ '^\$[A-Z0-9]{6,12}$'
    AND lower(file_name) ~ '\.(pdf|doc|docx|txt|ppt|pptx|xls|xlsx|mdj|png|jpg|jpeg|gif|webp|svg)$'
  );

GRANT INSERT ON public.shared_files TO anon, authenticated;

-- Ensure blanket SELECT on public.shared_files is NOT granted to anon (prevents table scraping)
DROP POLICY IF EXISTS "anon_select_shared_files" ON public.shared_files;

-- 6. Safe single-record lookup by exact sharing code via SECURITY DEFINER function
DROP FUNCTION IF EXISTS public.get_shared_file(text);
CREATE OR REPLACE FUNCTION public.get_shared_file(p_code text)
RETURNS TABLE (
  id uuid,
  code text,
  file_name text,
  file_size bigint,
  file_type text,
  storage_path text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT sf.id, sf.code, sf.file_name, sf.file_size, sf.file_type, sf.storage_path, sf.created_at
  FROM public.shared_files sf
  WHERE sf.code = upper(trim(p_code))
     OR sf.code = '$' || upper(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_file(text) TO anon, authenticated;

-- Helper function to verify that a storage path belongs to an active shared file
CREATE OR REPLACE FUNCTION public.is_shared_file_path(p_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_files WHERE storage_path = p_path
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_shared_file_path(text) TO anon, authenticated;

-- 7. Storage bucket: private, max 50 MB (52428800 bytes) per file
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shared_files', 'shared_files', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

-- 8. Storage RLS policies on storage.objects

-- Allow upload into 'shared_files' bucket (no overwrite permission)
DROP POLICY IF EXISTS "anon_upload_shared_files_storage" ON storage.objects;
CREATE POLICY "anon_upload_shared_files_storage"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'shared_files'
  );

-- Allow reading/downloading objects ONLY if their path is registered in public.shared_files
DROP POLICY IF EXISTS "anon_read_shared_files_storage" ON storage.objects;
CREATE POLICY "anon_read_shared_files_storage"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'shared_files'
    AND public.is_shared_file_path(storage.objects.name)
  );

-- Ensure NO update or delete policies exist for anon or authenticated
DROP POLICY IF EXISTS "anon_update_shared_files_storage" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_shared_files_storage" ON storage.objects;
