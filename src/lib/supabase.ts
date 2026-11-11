import { createClient } from '@supabase/supabase-js';
import {
  getCanonicalFileCode,
  getCleanCode,
  generateFileCode,
  isValidFileCode,
} from './code';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export type Snippet = {
  id: string;
  code: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type SharedFile = {
  id: string;
  code: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  created_at: string;
};


export const STORAGE_BUCKET = 'shared_files';
export const MAX_FILE_SIZE_BYTES = 52428800; // 50 MiB (52,428,800 bytes)

// Allowed document and image extensions
export const ALLOWED_DOC_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'txt',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'mdj',
] as const;

export const ALLOWED_IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
] as const;

export const ALLOWED_EXTENSIONS = [
  ...ALLOWED_DOC_EXTENSIONS,
  ...ALLOWED_IMAGE_EXTENSIONS,
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

// Expected MIME types per extension to ensure neither MIME type nor filename alone is trusted
const EXPECTED_MIMES_BY_EXT: Record<AllowedExtension, string[]> = {
  pdf: ['application/pdf'],
  doc: [
    'application/msword',
    'application/vnd.ms-office',
    'application/octet-stream',
    'application/x-msword',
  ],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ],
  txt: ['text/plain', 'text/x-log'],
  ppt: [
    'application/vnd.ms-powerpoint',
    'application/vnd.ms-office',
    'application/octet-stream',
  ],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/octet-stream',
  ],
  xls: [
    'application/vnd.ms-excel',
    'application/vnd.ms-office',
    'application/octet-stream',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
  ],
  mdj: ['', 'application/json', 'text/plain', 'application/octet-stream'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  svg: ['image/svg+xml', 'text/xml', 'application/xml'],
};

// Known dangerous executable / script MIME types
const DANGEROUS_MIMES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-csh',
  'application/x-bat',
  'application/x-dosexec',
  'application/vnd.microsoft.portable-executable',
  'application/javascript',
  'text/javascript',
  'text/html',
  'application/x-php',
  'application/x-httpd-php',
];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Strict file validation: checks size, extension allowlist, and rejects mismatched or dangerous MIME types
export function validateFileForUpload(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }
  if (file.size === 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds the 50 MB limit (${formatFileSize(file.size)}). Maximum upload size is 50 MiB (52,428,800 bytes).`,
    };
  }

  const parts = file.name.split('.');
  if (parts.length < 2) {
    return {
      valid: false,
      error: 'Unsupported file. DinoDrop only supports documents (.pdf, .doc, .docx, .txt, .ppt, .pptx, .xls, .xlsx, .mdj) and images (.png, .jpg, .jpeg, .gif, .webp, .svg).',
    };
  }
  const ext = parts.pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    return {
      valid: false,
      error: `File extension ".${ext}" is not supported. Only documents (.pdf, .doc, .docx, .txt, .ppt, .pptx, .xls, .xlsx, .mdj) and images (.png, .jpg, .jpeg, .gif, .webp, .svg) are allowed.`,
    };
  }

  const fileMime = (file.type || '').toLowerCase().trim();

  // Reject executable and script MIME types even if renamed
  if (fileMime && DANGEROUS_MIMES.includes(fileMime)) {
    return {
      valid: false,
      error: `File type "${fileMime}" is not permitted for security reasons.`,
    };
  }

  // Validate that MIME type matches the declared extension if provided by the client
  const allowedMimes = EXPECTED_MIMES_BY_EXT[ext as AllowedExtension];
  if (fileMime && allowedMimes && allowedMimes.length > 0) {
    const isAllowedMime =
      allowedMimes.includes(fileMime) ||
      (ext === 'svg' && (fileMime.includes('svg') || fileMime.includes('xml'))) ||
      (ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number]) &&
        fileMime.startsWith('image/')) ||
      (ext === 'txt' && fileMime.startsWith('text/'));

    if (!isAllowedMime) {
      return {
        valid: false,
        error: `MIME type "${fileMime}" does not match the file extension ".${ext}". Please upload a valid document or image.`,
      };
    }
  }

  return { valid: true };
}

// Sanitizes original filename for safe use in storage paths
export function sanitizeStorageFileName(originalName: string): string {
  const parts = originalName.split('.');
  const ext = parts.length > 1 ? '.' + parts.pop()?.toLowerCase() : '';
  const base = parts.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${base || 'file'}${ext}`;
}

// Uploads a file to Supabase Storage and records its metadata in public.shared_files
// Supports optional custom code (e.g. $MYDOC or MYDOC) or auto-generates if omitted
export async function uploadSharedFile(
  file: File,
  customCode?: string
): Promise<{ success: boolean; data?: SharedFile; error?: string }> {
  // 1. Validate file size, extension, and MIME type
  const validation = validateFileForUpload(file);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Invalid file.' };
  }

  let finalCode = '';

  if (customCode && customCode.trim()) {
    const canonical = getCanonicalFileCode(customCode);
    if (!isValidFileCode(canonical)) {
      return {
        success: false,
        error:
          'Custom code must be 6 to 12 alphanumeric characters (e.g. $ABC123 or ABC123).',
      };
    }

    // Check if code is already taken
    const { data: existing, error: checkError } = await supabase
      .rpc('get_shared_file', { p_code: canonical })
      .maybeSingle();

    if (checkError) {
      return {
        success: false,
        error: `Could not verify code availability: ${checkError.message}`,
      };
    }

    if (existing) {
      return {
        success: false,
        error: `Code "${customCode.trim()}" is already in use. Please choose another code.`,
      };
    }

    finalCode = canonical;
  } else {
    // Generate unique random code
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateFileCode(6);
      const { data: existing } = await supabase
        .rpc('get_shared_file', { p_code: candidate })
        .maybeSingle();

      if (!existing) {
        finalCode = candidate;
        break;
      }
    }

    if (!finalCode) {
      return {
        success: false,
        error: 'Could not generate a unique sharing code. Please try again.',
      };
    }
  }

  const sanitizedName = sanitizeStorageFileName(file.name);
  const cleanCode = getCleanCode(finalCode);
  const storagePath = `uploads/${cleanCode}/${sanitizedName}`;

  // 2. Upload original file bytes to private Supabase Storage bucket
  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (storageError) {
    return {
      success: false,
      error: `Upload to storage failed: ${storageError.message || 'Please verify the storage bucket exists.'}`,
    };
  }

  // 3. Insert record into shared_files table
  const { error: dbError } = await supabase.from('shared_files').insert({
    code: finalCode,
    file_name: file.name,
    file_size: file.size,
    file_type: file.type || 'application/octet-stream',
    storage_path: storagePath,
  });

  if (dbError) {
    // Clean up storage object if metadata insert failed
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    if (dbError.code === '23505') {
      return {
        success: false,
        error: `Code "${finalCode}" is already in use. Please choose another code.`,
      };
    }
    return {
      success: false,
      error: `Database record failed: ${dbError.message || 'Please check permissions.'}`,
    };
  }

  const sharedFile: SharedFile = {
    id: '',
    code: finalCode,
    file_name: file.name,
    file_size: file.size,
    file_type: file.type || 'application/octet-stream',
    storage_path: storagePath,
    created_at: new Date().toISOString(),
  };

  return {
    success: true,
    data: sharedFile,
  };
}

