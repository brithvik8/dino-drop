import { createClient } from '@supabase/supabase-js';

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

