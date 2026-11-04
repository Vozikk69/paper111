# Lumen — AI-Assisted Student Study Planning System

Lumen helps students organize course notes, ask questions grounded in their own material, review flashcards, and plan study tasks up to an exam date.

## Features

- **Study desk:** subject overview, study streak, and Pomodoro timer.
- **Subjects and notes:** create subjects and add notes by pasting text or uploading PDF, TXT, and Markdown files.
- **AI-assisted tutor:** retrieve relevant passages from the selected subject and answer from those passages with a local browser model. Clear fallback messages are shown when the notes do not support an answer.
- **Flashcards:** create cards manually or from notes and tutor answers; review them with spaced-repetition scheduling.
- **Study plan:** create a dated study plan from topics and an exam date, then track tasks.

## Requirements

- Node.js **22.12 or later**
- npm
- A current desktop browser for the local AI model

## Run locally

```bash
npm ci
npm run dev
```

Open <http://localhost:8080>. Email/password authentication is enabled by default. The default local PGLite database is in memory and is cleared when the server stops. For a quick single-user demo without login, set `VITE_AUTH_ENABLED=false` before starting the server; this mode uses one shared development identity and must not be used with a real database.

The tutor downloads its small language model the first time it is used. The model runs in a browser Web Worker; the initial download needs an internet connection and can take a little time. The project does not require a hosted AI API key.

## Persistent database

For data that must survive server restarts, configure a PostgreSQL connection (Neon or another PostgreSQL provider):

```bash
cp .env.example .env
# Set DATABASE_URL in .env
npm run db:migrate
npm run dev
```

The application also runs migrations on startup. Keep `.env` private and out of the submission archive. Never use `VITE_AUTH_ENABLED=false` with real user data.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the locked dependencies |
| `npm run dev` | Start the development server on port 8080 |
| `npm run build` | Create a production build and apply configured database migrations |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check source formatting and lint rules |
| `npm test` | Run focused study-domain regression tests |
| `npm run db:migrate` | Apply pending SQL migrations when `DATABASE_URL` is configured |

## Project layout

```text
src/components/   Study desk, subjects, tutor, cards, plan, shared UI
src/lib/auth/     Email/password authentication and session handling
src/lib/study/    Study domain, server functions, note retrieval, local AI worker
src/routes/       Application routes
migrations/       Versioned authentication and study database schema
scripts/          Database migration and build support scripts
tests/            Focused regression tests
docs/             Project and quality-assurance documentation
```

## Documentation

- [Project guide](docs/PROJECT_GUIDE.md) — requirements, architecture, data model, and use.
- [QA and submission report](docs/QA_REPORT.md) — checks performed, fixes made, and known limits.

## Notes and limits

- File uploads are limited to 4 MB each. The app accepts PDF, TXT, and Markdown, with up to 30 notes and 200,000 extracted characters per note.
- PDF text extraction works for text-based PDFs. Scanned image-only PDFs need OCR before upload.
- Tutor answers are intentionally constrained to notes attached to the selected subject. General questions outside those notes receive a clear “not found” response.
- Local PGLite is a disposable preview database. Configure `DATABASE_URL` for persistent use.
