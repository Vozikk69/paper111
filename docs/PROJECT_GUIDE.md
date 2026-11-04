# Lumen Project Guide

## Project purpose

**Design and Development of an AI-Assisted Student Study Planning System** is the project theme. Lumen brings course materials, question answering, active recall, and exam preparation into one study workspace. Its tutor is designed to ground answers in the student's uploaded notes and to say when the available notes do not support an answer.

## User workflows

### 1. Set up a subject and notes

Create a subject and add a description or exam date. Add study material by uploading a PDF, TXT, or Markdown file, or by pasting text. Text is extracted and divided into overlapping passages so a question can retrieve relevant context without sending an entire book to the model.

### 2. Ask the tutor

Choose a subject and ask a question. Lumen searches that subject's note passages, selects relevant passages, and returns an answer with a source marker. For common definition and numbered-rule questions, it uses an extractive response so wording and list items remain tied to the uploaded material. Other supported questions use a small model that runs locally in a browser Web Worker. If no relevant passage is found, or a generated answer cannot be grounded, the tutor reports that instead of presenting an unsupported fact.

The question language guides the response language. The tutor filters unexpected Chinese characters from answers to English, Ukrainian, or Russian questions and uses a clear fallback if it cannot produce a readable reply in the requested language.

### 3. Review flashcards

Cards can be written manually, generated from complete factual sentences in notes, or saved from factual tutor answers. Generated cards use a question on the front and a concise source-based answer on the back. Non-factual replies such as “no relevant notes” cannot be saved as cards. Review ratings update the card's next review date using the SM-2 spaced-repetition method.

### 4. Plan study sessions

Create a plan by selecting a subject, topics, exam date, and daily study capacity. The planner distributes tasks across the available dates; tasks can be added, edited, and marked complete. The Pomodoro timer supports focused study sessions from the desk.

## Architecture

| Layer | Implementation |
| --- | --- |
| Interface | React 19, TanStack Start/Router, Tailwind CSS |
| Server actions | TanStack Start server functions with input validation and user scoping |
| Authentication | Custom email/password flow with database-backed sessions |
| Database | PostgreSQL through `pg` when `DATABASE_URL` is set; in-memory PGLite for local preview |
| AI | Hugging Face Transformers in a browser Web Worker; no hosted inference API |
| PDF extraction | `unpdf`, followed by passage chunking and local retrieval |
| Tests | Node's built-in test runner for domain-level regression tests |

### Request flow

```text
Browser UI
   ├── server functions ── authentication ── PostgreSQL / PGLite
   ├── note passages ── retrieval ── grounded tutor response
   └── local AI Web Worker ── browser model download and inference
```

The local PGLite database is created in memory for each server process. It is intended for development and preview only; it is not a durable storage location. Set `DATABASE_URL` to a persistent PostgreSQL database for deployments or for any data that must survive a restart.

## Data model

- `user`, `session`, `account`, `verification`: authentication records.
- `subjects`: a user's subjects and exam information.
- `notes`, `note_chunks`: uploaded or pasted study material and searchable passages.
- `chat_messages`: tutor conversation history per subject.
- `flashcards`: prompt, answer, and spaced-repetition state.
- `plan_tasks`: dated study tasks and completion state.
- `study_sessions`: recorded study and focus sessions.

The SQL files in `migrations/` are the schema source of truth. Applied migrations are recorded in `_migrations` and are designed to run once.

## Local setup

1. Install Node.js 22.12+ and npm.
2. Run `npm ci` in the project directory.
3. Run `npm run dev` and open `http://localhost:8080`.
4. Create an account, then create a subject and upload or paste material.
5. The first tutor request may download the local model. Keep the tab open until it reports that the tutor is ready.

For persistent storage, copy `.env.example` to `.env`, set `DATABASE_URL`, and run `npm run db:migrate`. Keep credentials private. `VITE_AUTH_ENABLED=false` is for isolated local demonstrations only because it disables sign-in and uses a shared development identity.

## Validation commands

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

See [QA and submission report](QA_REPORT.md) for the checks run against this handoff copy.

## Known limits

- OCR is not included; scanned image-only PDFs do not provide searchable text.
- Each upload is limited to 4 MB, each subject to 30 notes, and each extracted note to 200,000 characters.
- Local model quality and download time depend on the student's browser and device. The extractive paths cover common definitions and numbered rules; other responses depend on the small local model and are screened against retrieved notes.
- The planner is an offline scheduling aid. It does not sync to an external calendar.
- Password reset and email verification flows are not part of this project version.
