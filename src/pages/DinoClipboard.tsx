import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Loader2, AlertTriangle, Home } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isValidCode, normalizeCode } from '@/lib/code';
import { SpinosaurusLogo } from '@/components/SpinosaurusLogo';

type State =
  | { kind: 'loading' }
  | { kind: 'notext' }
  | { kind: 'ready'; content: string }
  | { kind: 'error'; message: string };

export default function DinoClipboard() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode ? normalizeCode(rawCode) : '';

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [toast, setToast] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!rawCode || !isValidCode(normalizeCode(rawCode))) {
        setState({
          kind: 'error',
          message: 'Invalid code. Codes are 6 characters, A–Z and 2–9.',
        });
        return;
      }
      const { data, error } = await supabase
        .from('snippets')
        .select('content')
        .eq('code', normalizeCode(rawCode))
        .maybeSingle();
      if (!active) return;
      if (error) {
        setState({ kind: 'error', message: 'Could not reach the database.' });
        return;
      }
      if (!data || !data.content) {
        setState({ kind: 'notext' });
      } else {
        setState({ kind: 'ready', content: data.content });
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [rawCode]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  async function handleLogoClick(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (state.kind !== 'ready') return;

    setPressed(true);
    setTimeout(() => setPressed(false), 180);

    const text = state.content;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
        return;
      }
      if (fallbackRef.current) {
        fallbackRef.current.value = text;
        fallbackRef.current.select();
        const ok = document.execCommand('copy');
        if (ok) {
          showToast('Copied to clipboard!');
          return;
        }
      }
      setCopyError('Clipboard unavailable — select the text below and copy manually.');
    } catch {
      setCopyError('Clipboard permission denied — select the text below and copy manually.');
      if (fallbackRef.current) {
        fallbackRef.current.value = text;
        fallbackRef.current.focus();
        fallbackRef.current.select();
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLogoClick(e);
    }
  }

  if (!isOnline) {
    return (
      <div
        className="min-h-screen bg-white text-[#111111]"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12">
          <div className="flex w-full flex-col items-start text-left">
            <img
              src="/animal.png"
              alt="Dinosaur"
              className="mb-8 h-28 w-28 select-none sm:h-32 sm:w-32"
              draggable={false}
            />

            <h1 className="text-2xl font-medium text-[#111111] sm:text-3xl">
              No internet
            </h1>

            <div className="mt-5 w-full max-w-sm text-left text-sm text-[#333333]">
              <p className="mb-2">Try:</p>
              <ul className="ml-5 list-disc space-y-2 text-[#555555]">
                <li>Checking your internet connection</li>
                <li>Reconnecting to Wi-Fi</li>
                <li>Checking your network settings</li>
              </ul>
            </div>

            <div className="mt-10 w-full text-left">
              <p className="font-mono text-xs text-[#777777]">ERR_INTERNET_DISCONNECTED</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12">
        {state.kind === 'loading' && (
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        )}

        {state.kind === 'error' && (
          <div className="flex flex-col items-center gap-3 text-[#111111]">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm">{state.message}</p>
            <Link
              to="/"
              className="mt-2 inline-flex items-center gap-1 text-sm text-[#800080] underline-offset-4 hover:text-[#A020F0] hover:underline"
            >
              <Home className="h-4 w-4" /> Back home
            </Link>
          </div>
        )}

        {state.kind === 'notext' && (
          <div className="flex flex-col items-center gap-4 text-[#111111]">
            <SpinosaurusLogo className="h-32 w-32 opacity-50" />
            <p className="text-sm">
              Nothing to copy yet. No text saved for this code.
            </p>
            <Link
              to={`/e/${code}`}
              className="mt-1 text-sm font-medium text-[#800080] underline-offset-4 hover:text-[#A020F0] hover:underline"
            >
              Open editor →
            </Link>
          </div>
        )}

        {(state.kind === 'ready' || state.kind === 'loading') && (
          <div className="flex w-full flex-col items-start text-left">
            <button
              type="button"
              onClick={handleLogoClick}
              onKeyDown={handleKeyDown}
              disabled={state.kind !== 'ready'}
              aria-label="Click the Spinosaurus logo to copy the saved text to your clipboard"
              className="group rounded-2xl p-0 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-500/40 disabled:cursor-default"
            >
              <SpinosaurusLogo
                className={`h-24 w-24 transition-transform duration-150 group-hover:scale-105 group-hover:drop-shadow-[0_0_16px_rgba(160,32,240,0.45)] group-active:scale-95 sm:h-28 sm:w-28 ${
                  pressed ? 'scale-95' : ''
                }`}
              />
            </button>

            <h1 className="mt-6 text-2xl font-medium text-[#111111] sm:text-3xl">
              Press space to play
            </h1>

            <div className="mt-5 w-full max-w-sm text-left text-sm text-[#333333]">
              <p className="mb-2">Try:</p>
              <ul className="ml-5 list-disc space-y-2 text-[#555555]">
                <li>Checking the network cables, modem and router</li>
                <li>Reconnecting to Wi-Fi</li>
                <li>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="text-[#800080] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#800080]"
                  >
                    Running Windows Network Diagnostics
                  </button>
                </li>
              </ul>
            </div>
          </div>
        )}

        <div className="mt-10 w-full text-left">
          <p className="font-mono text-xs text-[#777777]">ERR_INTERNET_DISCONNECTED</p>
        </div>

        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white shadow-lg"
            style={{ border: '1px solid #A020F0' }}
          >
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4" style={{ color: '#A020F0' }} />
              {toast}
            </span>
          </div>
        )}

        {copyError && state.kind === 'ready' && (
          <div className="mt-8 w-full text-left">
            <p className="mb-2 text-sm text-amber-600">{copyError}</p>
            <textarea
              ref={fallbackRef}
              readOnly
              aria-label="Saved text — select and copy manually"
              className="h-32 w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-sm text-[#111111] focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: '#800080' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
