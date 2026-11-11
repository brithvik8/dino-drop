# 🦖 DinoDrop

DinoDrop is a lightweight text and file-sharing web app. Share text snippets with a short code, or upload documents and images up to **50 MiB** and share them with a custom or automatically generated file code.

## Features

### Text sharing
- Create a text snippet and edit it at `/e/:code`.
- Share the public clipboard page at `/c/:code`.
- Click the dinosaur on the clipboard page to copy the saved text.
- Text codes are exactly 6 uppercase letters or digits (`A–Z`, `0–9`).

### File sharing
- Upload supported documents and images up to **50 MiB (52,428,800 bytes) per file**.
- Choose a custom code containing 6–12 letters or digits, or leave the field blank to generate a code automatically.
- File codes use a `$` prefix to distinguish them from text codes (example: `$DBMS2026`). The prefix is added by DinoDrop; enter only the letters and numbers in the custom-code field.
- Codes are case-insensitive and stored in uppercase. Duplicate codes are rejected.
- Files are stored in a private Supabase Storage bucket. File metadata is stored in the `shared_files` table.
- Supported extensions: `.pdf`, `.doc`, `.docx`, `.txt`, `.ppt`, `.pptx`, `.xls`, `.xlsx`, `.mdj`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`.

## Routes

| Route | Purpose |
|---|---|
| `/` | Create a text snippet, upload a file, or open an existing code. |
| `/e/:code` | Edit the text snippet associated with a code. |
| `/c/:code` | Public clipboard page for a text snippet. |
| `/f` | File upload / file access page. |
| `/f/$CODE` | File-sharing link. The `$` is part of the file code. |
| `/f/#CODE` | Upload result / file access URL format used by the app. |

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Supabase (Postgres database and Storage)
- Lucide React icons

## Run locally

### Requirements

- Node.js and npm
- A Supabase project

### 1. Clone the repository

```bash
git clone https://github.com/brithvik8/dino-drop.git
cd dino-drop
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Supabase environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Add your Supabase project URL and public anon/publishable key to `.env`:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLIC_ANON_KEY
```

Do not put a Supabase `service_role` or secret key in a Vite environment variable. Vite variables prefixed with `VITE_` are exposed to the browser.

### 4. Set up the database and storage

In your Supabase project, open **SQL Editor** and run the migration files in chronological order:

1. `supabase/migrations/20261018165254_create_snippets_table.sql`
2. `supabase/migrations/20261018183710_revert_edit_credential_security.sql`
3. `supabase/migrations/20261028204500_create_shared_files.sql`

These migrations create/configure the text snippets table, restore the app's current public snippet access behavior, and create the file metadata table, private Storage bucket, constraints, and policies.

If you use the Supabase CLI migration workflow instead, link your Supabase project and apply the migrations using the CLI. Do not run the SQL migrations repeatedly against a production database unless you understand the changes and have a backup.

### 5. Start the development server

```bash
npm run dev
```

Vite will print the local development URL in the terminal.

### 6. Check the project

```bash
npm run typecheck
npm run lint
npm run build
```

To preview a production build locally:

```bash
npm run preview
```

## Deploy to Vercel

1. Push the project to a GitHub repository.
2. Import the repository into Vercel and select the Vite project defaults.
3. In **Project Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Make sure the variables are available to the environment you are deploying (Production, Preview, or Development as needed).
5. Deploy or redeploy the project after changing environment variables.
6. Confirm that the Supabase migrations have been applied to the same Supabase project referenced by the environment variables.

The included `vercel.json` configures SPA routing so direct navigation and page refreshes on app routes work.

## Security and privacy notes

DinoDrop currently has no user accounts. Sharing is based on knowing a code, not on user authentication.

- **Text snippets:** the current Supabase Row Level Security policies allow anonymous users to read, insert, update, and delete snippet rows. Anyone who obtains or guesses a text code may be able to view, change, or delete that snippet. Do not use DinoDrop to store passwords, private information, or sensitive data.
- **File sharing:** the `shared_files` Storage bucket is private. The migration allows anonymous uploads within the configured file-size and extension restrictions, and allows downloads for files registered in the metadata table. The metadata table does not grant blanket anonymous `SELECT`; file lookup is performed through the `get_shared_file` database function. The migration does not provide anonymous file update or delete policies.
- The Supabase anon/public key is intended for browser use, but database and Storage policies determine what that key can do. Never expose a service-role or secret key in frontend code.

Review and strengthen the Supabase policies before using the service for sensitive or production-critical data. Consider adding authentication, ownership checks, upload rate limits, abuse controls, and file-scanning safeguards before opening the service to a large public audience.

## Repository

https://github.com/brithvik8/dino-drop
