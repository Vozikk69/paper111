# Quality Assurance and Submission Report

**Project:** Lumen — AI-Assisted Student Study Planning System  
**Review date:** 2026-11-05

## Scope

The review covered project structure, tutor responses grounded in the supplied alkane chapter, note upload and paste, flashcard generation and review, date validation, study planning, the Pomodoro timer, build checks, linting, type checks, regression tests, and dependency audit.

## Issues corrected

- Tutor retrieval now recognizes related word forms and neighboring passages, so a numbered topic can be answered from a list that crosses a passage boundary.
- Definition and alkane nomenclature questions have extractive answer paths. Unsupported questions return a clear “no relevant notes” response rather than fabricated chemistry facts.
- Tutor output language follows the question, and unexpected Chinese characters trigger a readable fallback for non-Chinese questions.
- “Save as card” is hidden for refusal/no-notes replies and rejected again on the server. A saved answer uses the preceding question to form its front side instead of the generic “key point” prompt.
- PDF line wrapping is joined before extracting sentences for cards. Chapter headings, question fragments, generic introductions, duplicate text, and weak prompts are filtered. Numbered nomenclature rules become individual cards with clear fronts.
- Exam and task dates now reject impossible calendar dates.
- The custom authentication migration comments were corrected to match the implementation.
- An unused tutor-card helper was removed. Generated build output is excluded from the handoff archive.

## Verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed: 7 regression tests |
| `npm run build` | Passed (see note below) |
| `npm audit` | Passed: 0 reported vulnerabilities |
| Browser smoke test with the supplied alkane PDF | Confirmed upload/paste, retrieval, source-based answers, unsupported-topic fallback, meaningful card fronts, review, subject filter, plan generation, task completion, and timer start/pause/reset |

The production build prints upstream `use client` directive warnings from dependencies; Vite completes the build successfully. Browser checks used an isolated local preview database, so they did not connect to or change any persistent account data.

## Regression coverage

The automated tests check that:

1. A nomenclature question retrieves adjacent passages and returns the numbered rules in order.
2. “What is an alkane?” resolves to the matching definition in the notes.
3. Unsupported questions return a no-notes response that cannot be saved as a flashcard.
4. Unexpected Chinese characters are rejected for English questions while Chinese questions and translation requests remain allowed.
5. Impossible dates are rejected and generated plan dates stay within the exam range.
6. SM-2 “Again” resets the repetition state while a “Good” review advances its interval.
7. Card generation joins PDF line wraps, creates individual cards from nomenclature rules, and skips generic or malformed prompts.

## Clean handoff contents

The submission contains application source, migrations, build scripts, tests, `README.md`, this guide, and this QA report. It excludes installed dependencies, generated build output, local environment files, database files, and operating-system metadata. Install dependencies with `npm ci` before running the project.

## Remaining limitations

- Scanned PDFs require OCR before they can be searched.
- The small local model may not explain every free-form question reliably; tutor answers remain restricted to matching notes and screened for support.
- PGLite is in-memory for local development. Configure persistent PostgreSQL through `DATABASE_URL` to keep accounts and study data after a restart.
- Password reset and email verification are not included.
