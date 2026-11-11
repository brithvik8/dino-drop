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
  RefreshCw,
  X,
  FileText,
  FileImage,
  FileCode,
  File as GenericFile,
} from 'lucide-react';
import {
  generateCode,
  isValidSnippetCode,
  isValidFileCode,
  normalizeCode,
  getCleanCode,
  getFileSharingUrl,
} from '@/lib/code';
import {
  supabase,
  formatFileSize,
  validateFileForUpload,
  uploadSharedFile,
  type SharedFile,
} from '@/lib/supabase';
import { SpinosaurusLogo } from '@/components/SpinosaurusLogo';

function getModalFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
    return <FileImage className="h-6 w-6 text-purple-400" />;
  }
  if (ext === 'mdj') {
    return <FileCode className="h-6 w-6 text-purple-400" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
    return <FileText className="h-6 w-6 text-purple-400" />;
  }
  return <GenericFile className="h-6 w-6 text-purple-400" />;
}

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

  // Upload modal state with custom code support
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalCustomCode, setModalCustomCode] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalDragOver, setModalDragOver] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  function handleOpenUploadModal() {
    setError(null);
    setModalError(null);
    setModalFile(null);
    if (codeInput.trim()) {
      setModalCustomCode(getCleanCode(codeInput));
    } else {
      setModalCustomCode('');
    }
    setIsUploadModalOpen(true);
  }

  function handleModalFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setModalError(null);
    const validation = validateFileForUpload(f);
    if (!validation.valid) {
      setModalError(validation.error || 'Unsupported file.');
      return;
    }
    setModalFile(f);
  }

  function handleModalDrop(e: React.DragEvent) {
    e.preventDefault();
    setModalDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setModalError(null);
    const validation = validateFileForUpload(f);
    if (!validation.valid) {
      setModalError(validation.error || 'Unsupported file.');
      return;
    }
    setModalFile(f);
  }

  async function handleModalUpload() {
    if (!modalFile) {
      setModalError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setModalError(null);

    const targetCode = modalCustomCode.trim()
      ? '$' + modalCustomCode.trim().toUpperCase()
      : undefined;

    const res = await uploadSharedFile(modalFile, targetCode);

    if (!res.success || !res.data) {
      setModalError(res.error || 'Upload failed.');
      setUploading(false);
      return;
    }

    setUploading(false);
    setIsUploadModalOpen(false);

    const clean = getCleanCode(res.data.code);
    navigate(`/f/#${clean}`, {
      state: {
        justUploaded: true,
        fileName: modalFile.name,
        fileSize: modalFile.size,
        code: res.data.code,
      },
    });
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

    // If code has 7 to 12 alphanumeric characters, route directly as a file code
    if (/^[A-Z0-9]{7,12}$/.test(normalized)) {
      navigate(`/f/#${normalized}`);
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
            onClick={handleOpenUploadModal}
            disabled={creating || uploading}
            className="inline-flex items-center gap-2 rounded-lg border border-purple-500/60 bg-[#161616] px-6 py-3 text-base font-semibold text-white transition hover:border-purple-400 hover:bg-purple-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#800080] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4 text-purple-400" />
            Upload File
          </button>
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
          <p className="mt-2 text-center text-xs text-neutral-500">
            Tip: Use <span className="font-mono text-purple-400">$CODE</span> (e.g. <span className="font-mono text-purple-400">$MYFILE</span>) for files, or <span className="font-mono text-purple-400">CODE</span> for text notes.
          </p>
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

        {/* Upload File with Custom Code Modal */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-[#111111] p-6 sm:p-8 shadow-2xl">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-950/30 text-purple-400">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Upload File</h2>
                  <p className="text-xs text-neutral-400">
                    Documents and images up to 50 MB
                  </p>
                </div>
              </div>

              {/* Hidden file input */}
              <input
                type="file"
                ref={modalFileInputRef}
                onChange={handleModalFileSelected}
                accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.mdj,.png,.jpg,.jpeg,.gif,.webp,.svg"
                className="hidden"
              />

              {/* File Dropzone / Selected Preview */}
              <div className="mt-5">
                {modalFile ? (
                  <div className="flex items-center justify-between rounded-xl border border-purple-500/40 bg-purple-950/20 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-black/60">
                        {getModalFileIcon(modalFile.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {modalFile.name}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {formatFileSize(modalFile.size)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setModalFile(null);
                        if (modalFileInputRef.current) modalFileInputRef.current.value = '';
                      }}
                      className="rounded-lg border border-neutral-700 bg-[#161616] px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-purple-400 hover:text-white transition"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setModalDragOver(true);
                    }}
                    onDragLeave={() => setModalDragOver(false)}
                    onDrop={handleModalDrop}
                    onClick={() => modalFileInputRef.current?.click()}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
                      modalDragOver
                        ? 'border-purple-400 bg-purple-950/30'
                        : 'border-neutral-700 bg-neutral-900/30 hover:border-purple-500/60 hover:bg-neutral-900/60'
                    }`}
                  >
                    <Upload className="mx-auto h-8 w-8 text-purple-400 mb-2" />
                    <p className="text-sm font-medium text-white">
                      Click to choose or drag and drop a file
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      PDF, DOCX, TXT, PPTX, XLSX, PNG, JPG, GIF, SVG (up to 50 MB)
                    </p>
                  </div>
                )}
              </div>

              {/* Custom Code Input */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                    Custom Code (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalCustomCode(generateCode(6))}
                    className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition"
                  >
                    <RefreshCw className="h-3 w-3" /> Randomize
                  </button>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 font-mono text-base font-bold text-purple-400 pointer-events-none select-none">
                    $
                  </span>
                  <input
                    type="text"
                    value={modalCustomCode}
                    onChange={(e) =>
                      setModalCustomCode(
                        e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
                      )
                    }
                    placeholder="AUTO-GENERATED IF BLANK"
                    maxLength={12}
                    className="w-full rounded-lg border border-neutral-700 bg-black/60 pl-8 pr-4 py-2.5 font-mono text-base uppercase tracking-widest text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  6 to 12 alphanumeric characters. Leave blank for an auto-generated code.
                </p>
              </div>

              {modalError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={uploading}
                  className="rounded-lg border border-neutral-700 bg-[#161616] px-4 py-2.5 text-sm font-semibold text-neutral-300 hover:text-white transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleModalUpload}
                  disabled={!modalFile || uploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#800080] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(128,0,128,0.25)] transition hover:bg-[#A020F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A020F0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload File {modalCustomCode ? `to $${modalCustomCode}` : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
