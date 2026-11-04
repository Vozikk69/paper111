# Lumen

A personal study desk: notes + local AI tutor, spaced-repetition flashcards, and an exam plan.

## Features

- **Desk** — overview, streak, pomodoro timer
- **Subjects** — organize topics and upload notes (text / PDF)
- **Tutor** — chat with a local (browser) AI that reads your notes
- **Cards** — SM-2 spaced repetition
- **Plan** — schedule up to the exam date

## Stack

- TanStack Start (React 19 + Vite 8 + Nitro)
- Tailwind CSS 4
- PGLite (embedded Postgres) by default, or Neon / any Postgres via `DATABASE_URL`
- Custom email/password auth (sessions in the database)
- Local AI via `@huggingface/transformers` (runs in a Web Worker)

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:8080

On first run the app creates an in-memory (or on-disk) PGLite database and applies migrations automatically. No external database is required for local development.

### Optional: real Postgres

```bash
export DATABASE_URL=postgres://user:pass@host:5432/lumen
npm run db:migrate
npm run dev
```

### Auth

Email + password is enabled by default. Set `VITE_AUTH_ENABLED=false` to skip login and use a shared dev user (only when no `DATABASE_URL` is set).

## Scripts

| Command            | Description                          |
|--------------------|--------------------------------------|
| `npm run dev`      | Start development server             |
| `npm run build`    | Production build + migrate           |
| `npm run preview`  | Preview production build             |
| `npm run typecheck`| TypeScript check                     |
| `npm run lint`     | ESLint                               |

## Project structure

```
src/
  components/     UI views (desk, cards, tutor, plan, …)
  lib/
    auth/         Email/password auth + session cookies
    study/        Domain logic, server functions, local AI worker
    db.ts         PGLite / Neon SQL layer
  routes/         File-based routes (TanStack Router)
migrations/       SQL schema (auth + study)
```

## Notes

- Local AI model downloads on first use in the browser (can take time / disk space).
- For production, point `DATABASE_URL` at a managed Postgres (e.g. Neon) and set a strong cookie secret if you add one later.
