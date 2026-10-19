import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Save,
  Link as LinkIcon,
  Check,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { supabase, type Snippet } from '@/lib/supabase';
import { isValidCode, normalizeCode } from '@/lib/code';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export default function Editor() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode ? normalizeCode(rawCode) : '';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!rawCode || !isValidCode(normalizeCode(rawCode))) {
        setLoadError('This code is invalid. Codes are 6 characters, A–Z and 2–9.');
        setLoading(false);
        return;
      }
      const normalized = normalizeCode(rawCode);
      const { data, error } = await supabase
        .from('snippets')
        .select('*')
        .eq('code', normalized)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setLoadError('Could not reach the database. Please try again.');
        setLoading(false);
        return;
      }
      if (data) {
        setSnippet(data);
        setText(data.content);
      } else {
        setSnippet(null);
        setText('');
      }
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [rawCode]);

  useEffect(() => {
    if (rawCode && rawCode !== normalizeCode(rawCode)) {
      navigate(`/e/${normalizeCode(rawCode)}`, { replace: true });
    }
  }, [rawCode, navigate]);

  async function handleSave() {
    if (!isValidCode(code)) {
      setSaveError('Invalid code.');
      return;
    }
    setStatus('saving');
    setSaveError(null);
    try {
      if (snippet) {
        const { error } = await supabase
          .from('snippets')
          .update({ content: text })
          .eq('id', snippet.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('snippets')
          .insert({ code, content: text })
          .select()
          .maybeSingle();
        if (error) {
          if (error.code === '23505') {
            const { data: existing, error: loadErr } = await supabase
              .from('snippets')
              .select('*')
              .eq('code', code)
              .maybeSingle();
            if (loadErr) throw loadErr;
            if (existing) {
              const { error: updErr } = await supabase
                .from('snippets')
                .update({ content: text })
                .eq('id', existing.id);
              if (updErr) throw updErr;
              setSnippet(existing);
            } else {
              throw new Error('Code was taken; could not save.');
            }
          } else {
            throw error;
          }
        } else if (data) {
          setSnippet(data);
        }
      }
      setStatus('saved');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setStatus('idle'), 2200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      setSaveError(msg);
      setStatus('error');
    }
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/e/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        setSaveError('Could not copy the link. Copy it from the address bar.');
      }
      document.body.removeChild(input);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-neutral-400">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#A020F0' }} />
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
          <div className="rounded-lg border border-purple-500/40 bg-[#111111] p-6 text-red-300">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-5 w-5" />
              {loadError}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isNew = !snippet;

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
            <span className="font-mono text-lg font-semibold tracking-widest text-white">
              {code}
            </span>
            <Link
              to={`/c/${code}`}
              className="inline-flex items-center gap-1 rounded-md border border-purple-500/40 px-2.5 py-1 text-xs font-medium text-purple-300 transition hover:border-purple-400 hover:bg-purple-500/10 hover:text-purple-200"
              title="Open the dinosaur clipboard page for this code"
            >
              Dino page <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {isNew && (
          <div className="mb-4 rounded-md border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-200">
            No text exists for this code yet. Write something below and press
            Save to create it.
          </div>
        )}

        <div className="rounded-lg border border-neutral-800 bg-[#111111] shadow-sm">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setStatus('idle');
            }}
            placeholder="Type or paste your text here…"
            spellCheck={false}
            className="block h-[60vh] w-full resize-y rounded-lg border-0 bg-transparent p-5 font-mono text-sm leading-relaxed text-white placeholder:text-neutral-500 focus:outline-none focus:ring-0"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={status === 'saving'}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-60"
            style={{
              backgroundColor: '#800080',
            }}
            onMouseEnter={(e) => {
              if (status !== 'saving') e.currentTarget.style.backgroundColor = '#A020F0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#800080';
            }}
          >
            {status === 'saving' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>

          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-[#111111] px-4 py-2.5 text-sm font-semibold text-neutral-200 transition hover:border-purple-500/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ ['--tw-ring-color' as string]: '#A020F0' }}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" style={{ color: '#A020F0' }} /> Copied!
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4" /> Copy Editor Link
              </>
            )}
          </button>

          <div className="ml-auto text-sm">
            {status === 'saved' && (
              <span className="inline-flex items-center gap-1 text-green-400">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
            {status === 'error' && (
              <span className="inline-flex items-center gap-1 text-red-400">
                <AlertCircle className="h-4 w-4" /> Save failed
              </span>
            )}
          </div>
        </div>

        {(saveError || status === 'error') && saveError && (
          <p
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </p>
        )}
      </main>
    </div>
  );
}
