import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Download,
  Link as LinkIcon,
  Check,
  Loader2,
  AlertCircle,
  ArrowLeft,
  FileText,
  FileCode,
  FileImage,
  File as GenericFile,
  Copy,
  CheckCircle2,
  Upload,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  supabase,
  type SharedFile,
  STORAGE_BUCKET,
  formatFileSize,
  validateFileForUpload,
  uploadSharedFile,
} from '@/lib/supabase';
import {
  extractFileCode,
  getFileSharingUrl,
  isValidFileCode,
  generateCode,
  getCleanCode,
} from '@/lib/code';
import { SpinosaurusLogo } from '@/components/SpinosaurusLogo';

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
    return <FileImage className="h-10 w-10 text-purple-400" />;
  }
  if (ext === 'mdj') {
    return <FileCode className="h-10 w-10 text-purple-400" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
    return <FileText className="h-10 w-10 text-purple-400" />;
  }
  return <GenericFile className="h-10 w-10 text-purple-400" />;
}

export default function FileDownload() {
  const { code: rawCode } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract canonical code ($ABC123) from route parameter (/f/:code) or URL hash (/f/#CODE)
  const code = extractFileCode(rawCode, location.hash);
  const [justUploadedLocal, setJustUploadedLocal] = useState(false);
  const isJustUploaded = Boolean((location.state as { justUploaded?: boolean })?.justUploaded) || justUploadedLocal;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<SharedFile | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Upload state when visiting an unclaimed code or /f
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState<string>(code ? getCleanCode(code) : '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!code) {
        setFile(null);
        setLoadError(null);
        setLoading(false);
        setCustomCodeInput('');
        return;
      }

      if (!isValidFileCode(code)) {
        setLoadError('Invalid code. File sharing codes are 6 to 12 alphanumeric characters (e.g. $ABC123 or #ABC123).');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      setCustomCodeInput(getCleanCode(code));

      const { data, error } = await supabase
        .rpc('get_shared_file', { p_code: code })
        .maybeSingle();

      if (!active) return;

      if (error) {
        setLoadError(`Could not reach the database: ${error.message || 'Please try again.'}`);
        setLoading(false);
        return;
      }

      if (data) {
        setFile(data as SharedFile);
      } else {
        setFile(null);
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    let active = true;
    if (!file) {
      setImagePreviewUrl(null);
      return;
    }
    const ext = file.file_name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(file.storage_path, 3600)
        .then(({ data }) => {
          if (active && data?.signedUrl) {
            setImagePreviewUrl(data.signedUrl);
          }
        });
    } else {
      setImagePreviewUrl(null);
    }
    return () => {
      active = false;
    };
  }, [file]);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError(null);
    const validation = validateFileForUpload(f);
    if (!validation.valid) {
      setUploadError(validation.error || 'Unsupported file.');
      return;
    }
    setSelectedFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setUploadError(null);
    const validation = validateFileForUpload(f);
    if (!validation.valid) {
      setUploadError(validation.error || 'Unsupported file.');
      return;
    }
    setSelectedFile(f);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadError('Please choose a file to upload.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    // If custom code was typed, use it; otherwise use route code or undefined (auto-generate)
    const codeToUse = customCodeInput.trim()
      ? '$' + customCodeInput.trim().toUpperCase()
      : (code || undefined);

    const res = await uploadSharedFile(selectedFile, codeToUse);

    if (!res.success || !res.data) {
      setUploadError(res.error || 'Upload failed.');
      setUploading(false);
      return;
    }

    setFile(res.data);
    setJustUploadedLocal(true);
    setUploading(false);

    // Update URL to match newly created canonical code
    const clean = getCleanCode(res.data.code);
    navigate(`/f/#${clean}`, { replace: true });
  }

  async function handleDownload() {
    if (!file) return;
    setDownloading(true);
    setDownloadError(null);

    try {
      // 1. First attempt: create a short-lived signed download URL (valid for 5 minutes / 300s)
      const { data: signedData, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(file.storage_path, 300, {
          download: file.file_name,
        });

      if (signedData?.signedUrl) {
        const link = document.createElement('a');
        link.href = signedData.signedUrl;
        link.download = file.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setDownloading(false);
        return;
      }

      if (signError) {
        // Fallback: download directly as a Blob
        const { data: blob, error: dlError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(file.storage_path);

        if (dlError || !blob) {
          throw dlError || new Error('Could not download file from storage.');
        }

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = file.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        setDownloading(false);
        return;
      }

      throw new Error('Download URL could not be generated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed. Please try again.';
      setDownloadError(msg);
      setDownloading(false);
    }
  }

  async function handleCopyLink() {
    // Copied sharing link format: https://dinodrop.vercel.app/f/$CODE
    const url = getFileSharingUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } catch {
        setDownloadError('Could not copy link to clipboard.');
      }
      document.body.removeChild(input);
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setDownloadError('Could not copy code to clipboard.');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-neutral-400">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#800080' }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-black px-6 py-16 text-white">
        <div className="mx-auto max-w-xl">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
          <div className="rounded-lg border border-red-900/60 bg-[#111111] p-6 text-red-300">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-5 w-5 text-red-400" />
              {loadError}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!file) {
    const targetCodeDisplay = customCodeInput ? `$${customCodeInput}` : (code || '');
    return (
      <div className="min-h-screen bg-black text-white">
        <header className="border-b border-neutral-800 bg-[#111111]">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-neutral-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Home
            </Link>
            {targetCodeDisplay && (
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-neutral-400">Target Code:</span>
                <span className="font-mono text-lg font-semibold tracking-widest text-purple-300">
                  {targetCodeDisplay}
                </span>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-6 py-12">
          {code ? (
            <div className="mb-6 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-200">
              No file exists for code <strong className="font-mono text-white">{code}</strong> yet. Select or drop a document or image below to save and share it under this code.
            </div>
          ) : (
            <div className="mb-6 text-center">
              <SpinosaurusLogo className="mx-auto mb-4 h-16 w-16 drop-shadow-[0_0_16px_rgba(128,0,128,0.4)]" />
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Upload & Share File</h1>
              <p className="mt-1 text-sm text-neutral-400">
                Share any document or image up to 50 MB with an optional custom code.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-neutral-800 bg-[#111111] p-6 sm:p-8 shadow-xl">
            {/* File dropzone / selector */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelected}
              accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.mdj,.png,.jpg,.jpeg,.gif,.webp,.svg"
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex items-center justify-between rounded-xl border border-purple-500/40 bg-purple-950/20 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-black/60">
                    {getFileIcon(selectedFile.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {selectedFile.name}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {formatFileSize(selectedFile.size)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="rounded-lg border border-neutral-700 bg-[#161616] px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-purple-400 hover:text-white transition"
                >
                  Change file
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
                  isDragOver
                    ? 'border-purple-400 bg-purple-950/30'
                    : 'border-neutral-700 bg-neutral-900/30 hover:border-purple-500/60 hover:bg-neutral-900/60'
                }`}
              >
                <Upload className="mx-auto h-10 w-10 text-purple-400 mb-3" />
                <p className="text-sm font-medium text-white">
                  Click to choose a file or drag and drop
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Documents (.pdf, .docx, .txt, .xlsx, .pptx, etc.) and images (.png, .jpg, .svg) up to 50 MB
                </p>
              </div>
            )}

            {/* Custom Code Input */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Custom File Code (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => setCustomCodeInput(generateCode(6))}
                  className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition"
                  title="Generate a random 6-character code"
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
                  value={customCodeInput}
                  onChange={(e) =>
                    setCustomCodeInput(
                      e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
                    )
                  }
                  placeholder={code ? getCleanCode(code) : 'AUTO-GENERATED IF BLANK'}
                  maxLength={12}
                  className="w-full rounded-lg border border-neutral-700 bg-black/60 pl-8 pr-4 py-3 font-mono text-base uppercase tracking-widest text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                />
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">
                6 to 12 alphanumeric characters (A–Z, 0–9).
              </p>
            </div>

            {uploadError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{uploadError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#800080] px-6 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(128,0,128,0.25)] transition hover:bg-[#A020F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A020F0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                  Uploading file…
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Upload File {targetCodeDisplay ? `to ${targetCodeDisplay}` : ''}
                </>
              )}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const uploadedDate = new Date(file.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-neutral-800 bg-[#111111]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-neutral-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-neutral-400">File Code:</span>
            <span className="font-mono text-lg font-semibold tracking-widest text-purple-300">
              {code}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 transition hover:border-purple-400 hover:text-white"
              title="Copy sharing code"
            >
              {copiedCode ? (
                <>
                  <Check className="h-3 w-3 text-purple-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-neutral-400" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        {isJustUploaded && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-purple-500/40 bg-purple-950/30 p-4 text-purple-200 shadow-lg">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-purple-400 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-white">Upload successful!</div>
              <div className="text-xs text-neutral-300 mt-1">
                Your file is ready to share. Click <strong className="text-purple-300">Copy Link</strong> to copy the sharing URL (<span className="font-mono text-purple-300">{getFileSharingUrl(code)}</span>).
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-[#111111] p-8 shadow-xl">
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-950/20">
              {getFileIcon(file.file_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-xl font-bold text-white sm:text-2xl">
                {file.file_name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                <span className="font-medium text-neutral-300">
                  {formatFileSize(file.file_size)}
                </span>
                <span>•</span>
                <span>Uploaded {uploadedDate}</span>
                <span>•</span>
                <span className="font-mono text-purple-400">Code: {file.code}</span>
              </div>
            </div>
          </div>

          {imagePreviewUrl && (
            <div className="mt-6 overflow-hidden rounded-xl border border-neutral-800 bg-black/60 p-2 flex items-center justify-center">
              <img
                src={imagePreviewUrl}
                alt={file.file_name}
                className="max-h-80 w-auto rounded-lg object-contain shadow-md"
              />
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#800080] px-6 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(128,0,128,0.25)] transition hover:bg-[#A020F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A020F0] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Downloading…
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  Download File
                </>
              )}
            </button>

            <button
              onClick={handleCopyLink}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-[#161616] px-5 py-3.5 text-sm font-semibold text-neutral-200 transition hover:border-purple-500/60 hover:text-white focus:outline-none focus-visible:ring-2"
            >
              {copiedLink ? (
                <>
                  <Check className="h-4 w-4 text-purple-400" />
                  Link Copied!
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4" />
                  Copy Link
                </>
              )}
            </button>
          </div>

          {downloadError && (
            <p
              role="alert"
              className="mt-6 flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {downloadError}
            </p>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-xs text-neutral-500 transition hover:text-purple-400"
          >
            Want to share another text or file? Return to DinoDrop Home
          </Link>
        </div>
      </main>
    </div>
  );
}
