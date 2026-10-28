import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  AlertCircle,
  Upload,
  Check,
  Copy,
  ExternalLink,
  FileCheck,
  Loader2,
} from 'lucide-react';
import {
  generateCode,
  generateFileCode,
  isValidSnippetCode,
  isValidFileCode,
  normalizeCode,
  getCleanCode,
  getFileSharingUrl,
} from '@/lib/code';
import {
  supabase,
  STORAGE_BUCKET,
  formatFileSize,
  validateFileForUpload,
  sanitizeStorageFileName,
  type SharedFile,
} from '@/lib/supabase';
import { SpinosaurusLogo } from '@/components/SpinosaurusLogo';

interface UploadSuccessInfo {
  code: string;
  fileName: string;
  fileSize: number;
}

export default function Home() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<UploadSuccessInfo | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        const { error: insertError } = await supabase
          .from('snippets')
          .insert({ code, content: '' });
        if (!insertError) {
          navigate(`/e/${code}`);
          return;
        }
        if (insertError.code !== '23505') {
          throw insertError;
        }
      }
      throw new Error('Could not generate a unique code after several tries.');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Something went wrong.';
      setError(`Could not create a new text: ${msg}`);
      setCreating(false);
    }
  }

  function handleUploadButtonClick() {
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate allowed file extensions, MIME types, and 50 MB limit
    const validation = validateFileForUpload(file);
    if (!validation.valid) {
      setError(validation.error || 'Unsupported file.');
      return;
    }

    setUploading(true);
    setUploadSuccess(null);

    try {
      let code = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        // File sharing codes must start with a literal dollar sign (e.g. $ABC123)
        const candidate = generateFileCode(6);
        // Check uniqueness via get_shared_file RPC
        const { data: existingFile } = await supabase
          .rpc('get_shared_file', { p_code: candidate })
          .maybeSingle();

        if (!existingFile) {
          code = candidate;
          break;
        }
      }

      if (!code) {
        throw new Error('Could not generate a unique sharing code. Please try again.');
      }

      // Sanitize filename and create storage path
      const sanitizedName = sanitizeStorageFileName(file.name);
      const cleanCode = getCleanCode(code);
      const storagePath = `uploads/${cleanCode}/${sanitizedName}`;

      // 1. Upload original file bytes to private Supabase Storage bucket
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });

      if (storageError) {
        throw new Error(
          `Upload to storage failed: ${storageError.message || 'Please verify the storage bucket exists.'}`
        );
      }

      // 2. Insert record into shared_files table
      const { error: dbError } = await supabase.from('shared_files').insert({
        code,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
        storage_path: storagePath,
      });

      if (dbError) {
        // Clean up storage object if metadata insert failed
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw new Error(`Database record failed: ${dbError.message || 'Please check permissions.'}`);
      }

      setUploading(false);

      // Navigate to user-facing file upload/result page: /f/#CODE
      navigate(`/f/#${cleanCode}`, {
        state: {
          justUploaded: true,
          fileName: file.name,
          fileSize: file.size,
          code,
        },
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'File upload failed. Please try again.';
      setError(msg);
      setUploading(false);
    }
  }

  async function handleOpenExisting(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeCode(codeInput);
    if (!normalized) {
      setError('Please enter a code.');
      return;
    }

    // If code begins with '#' or '$', it is a file sharing code
    if (normalized.startsWith('#') || normalized.startsWith('$')) {
      if (!isValidFileCode(normalized)) {
        setError('File sharing codes must be 6 to 12 alphanumeric characters (e.g. $ABC123 or #ABC123).');
        return;
      }
      const clean = getCleanCode(normalized);
      navigate(`/f/#${clean}`);
      return;
    }

    // If it's a standard 6-character alphanumeric code (e.g. ABC123)
    if (isValidSnippetCode(normalized)) {
      // Check if this code was registered as a shared file first
      try {
        const { data: fileData } = await supabase
          .rpc('get_shared_file', { p_code: normalized })
          .maybeSingle();

        const file = fileData as SharedFile | null;
        if (file) {
          const clean = getCleanCode(file.code || normalized);
          navigate(`/f/#${clean}`);
          return;
        }
      } catch {
        // Fallback to text editor
      }

      navigate(`/e/${normalized}`);
      return;
    }

    setError('Enter a valid code (e.g. ABC123 for text or $ABC123 for files).');
  }

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setError('Could not copy code to clipboard.');
    }
  }

  async function handleCopyLink(code: string) {
    // Copied sharing link format: https://dinodrop.vercel.app/f/$CODE
    const url = getFileSharingUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError('Could not copy link to clipboard.');
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <SpinosaurusLogo className="mb-6 h-24 w-24 drop-shadow-[0_0_18px_rgba(128,0,128,0.45)]" />

        <div className="mb-3 text-sm font-medium uppercase tracking-widest text-[#B3B3B3]">
          DinoDrop
        </div>
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
          Tiny texts. Big dino energy.
        </h1>
        <p className="mt-4 max-w-md text-center text-[#B3B3B3]">
          DinoDrop is a minimalist text and file sharing site disguised as an offline
          browser page. Share texts, documents, and images (up to 50 MB) behind a short code.
          No accounts, no fuss.
        </p>

        {/* Action Buttons: Create New Text and Upload File */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleCreate}
            disabled={creating || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#800080] px-6 py-3 text-base font-semibold text-white shadow-[0_8px_24px_rgba(128,0,128,0.2)] transition hover:bg-[#A020F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A020F0] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create New Text'}
            {!creating && <ArrowRight className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={handleUploadButtonClick}
            disabled={creating || uploading}
            className="inline-flex items-center gap-2 rounded-lg border border-purple-500/60 bg-[#161616] px-6 py-3 text-base font-semibold text-white transition hover:border-purple-400 hover:bg-purple-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#800080] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 text-purple-400" />
                Upload File
              </>
            )}
          </button>

          {/* Hidden file input restricted strictly to allowed documents and images up to 50 MB */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.mdj,.png,.jpg,.jpeg,.gif,.webp,.svg"
            className="hidden"
            aria-label="Upload documents or images up to 50 MB"
          />
        </div>

        {/* Upload Success Card */}
        {uploadSuccess && (
          <div className="mt-8 w-full max-w-md rounded-xl border border-purple-500/40 bg-[#111111] p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-950/40 text-purple-400">
                <FileCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">
                  {uploadSuccess.fileName}
                </div>
                <div className="text-xs text-neutral-400">
                  {formatFileSize(uploadSuccess.fileSize)} • File uploaded
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-neutral-800 bg-black/60 px-4 py-3">
              <span className="text-xs uppercase tracking-wider text-neutral-400">Code:</span>
              <span className="font-mono text-xl font-bold tracking-widest text-purple-300">
                {uploadSuccess.code}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCopyCode(uploadSuccess.code)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-[#161616] px-3 py-2 text-xs font-semibold text-white transition hover:border-purple-500/60"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-purple-400" />
                    Code Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-neutral-400" />
                    Copy Code
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopyLink(uploadSuccess.code)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-[#161616] px-3 py-2 text-xs font-semibold text-white transition hover:border-purple-500/60"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-purple-400" />
                    Link Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-neutral-400" />
                    Copy Link
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 pt-2">
              <Link
                to={`/f/#${getCleanCode(uploadSuccess.code)}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-purple-400 transition hover:text-purple-300 hover:underline"
              >
                Go to download page <ExternalLink className="h-3 w-3" />
              </Link>

              <button
                type="button"
                onClick={() => setUploadSuccess(null)}
                className="text-xs text-neutral-500 transition hover:text-neutral-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Enter Code Section */}
        <div className="mt-10 w-full max-w-sm">
          <div className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-[#B3B3B3]">
            Or open an existing code
          </div>
          <form onSubmit={handleOpenExisting} className="flex gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Enter Code"
              maxLength={12}
              aria-label="Sharing code"
              className="w-full rounded-lg border border-[#333333] bg-[#111111] px-4 py-3 text-center text-lg font-mono uppercase tracking-widest text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-[#888888] focus:border-[#800080] focus:outline-none focus:ring-2 focus:ring-[#800080]/40"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-[#800080] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#A020F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A020F0] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <Search className="h-4 w-4" />
              Open
            </button>
          </form>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-6 flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
