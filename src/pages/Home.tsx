import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search, AlertCircle } from 'lucide-react';
import { generateCode, isValidCode, normalizeCode } from '@/lib/code';
import { supabase } from '@/lib/supabase';
import { SpinosaurusLogo } from '@/components/SpinosaurusLogo';

export default function Home() {
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(`Could not create a new text: ${msg}`);
      setCreating(false);
    }
  }

  function handleOpenExisting(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = normalizeCode(codeInput);
    if (!isValidCode(code)) {
      setError('Enter a valid 6-character code (letters A–Z and digits 2–9).');
      return;
    }
    navigate(`/e/${code}`);
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
          DinoDrop is a minimalist text-sharing site disguised as an offline
          browser page. Save any text behind a short code, then copy it by
          clicking a dinosaur. No accounts, no fuss.
        </p>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#800080] px-6 py-3 text-base font-semibold text-white shadow-[0_8px_24px_rgba(128,0,128,0.2)] transition hover:bg-[#A020F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A020F0] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create New Text'}
          {!creating && <ArrowRight className="h-4 w-4" />}
        </button>

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
              maxLength={6}
              aria-label="Six-character code"
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
