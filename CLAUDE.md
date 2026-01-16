# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zali is an AI-powered exam marking application for teachers. Teachers create questions with model answers, start live sessions with join codes, and students submit handwritten answers as images. The system uses Google Gemini AI to analyze submissions and generate marked images with annotations.

## Commands

```bash
npm run dev          # Start development server (Vite)
npm run build        # Build for production
npm run start        # Run production server (requires build first)
npm run preview      # Preview production build
npm run check        # Run svelte-check for type checking
npm run check:watch  # Run svelte-check in watch mode
```

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 4
- **Database/Auth**: Supabase (PostgreSQL with RLS policies, `@supabase/ssr` for SSR)
- **AI**: Google Gemini API (`@google/genai` SDK)
  - `gemini-3-flash-preview` - Analysis model for reading student answers
  - `gemini-3-pro-image-preview` - Image generation model for red annotations
- **Build**: Vite 5

## Architecture

### SSR Pattern

This app uses SvelteKit's server-side rendering pattern:
- **`+page.server.ts`** files load data on the server (not `onMount`)
- **`hooks.server.ts`** handles auth validation via `supabase.auth.getUser()` on every request
- **`+layout.ts`** creates the Supabase client for client-side use
- Session/user data flows from server → layout → pages via `data` prop

### Data Flow

1. Teachers authenticate via Supabase Auth → creates entry in `teachers` table via trigger
2. Teachers create questions with model answers in the `questions` table
3. Teachers start sessions with 6-character join codes (`sessions` table)
4. Students join via `/join/[code]`, upload handwritten answer images
5. Marking API processes submission in two steps (analysis → image marking)
6. Results stored in `submissions` table, marked images in Supabase Storage
7. Real-time updates via Supabase Realtime subscriptions

### AI Marking Pipeline

Two-step process in `/api/mark`:

**Step 1: Analysis** (`gemini-3-flash-preview`)
- Input: Student image + model answer + optional context files
- Output: JSON with score, feedback, mistakes[], markingInstructions
- Uses `@google/genai` SDK

**Step 2: Image Marking** (`gemini-3-pro-image-preview`)
- Input: Original image + marking instructions from Step 1
- Output: Annotated image with red teacher-style markings
- Uses REST API with `responseModalities: ['IMAGE', 'TEXT']`
- Runs in background (non-blocking)

### Key Files

- `src/hooks.server.ts` - Auth validation with `getUser()`, protects `/dashboard` routes
- `src/routes/+layout.ts` - Creates Supabase client, passes session to pages
- `src/routes/api/mark/+server.ts` - AI marking endpoint
- `src/lib/types/database.ts` - TypeScript types (regenerate with MCP tool)

### Route Structure

| Route | Auth | Purpose |
|-------|------|---------|
| `/login` | Public | Teacher authentication |
| `/join/[code]` | Public | Student submission page |
| `/dashboard/*` | Protected | Teacher dashboard, sessions, analytics |
| `/api/mark` | Internal | AI marking endpoint |

## Environment Variables

```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # Server-side admin operations
GEMINI_API_KEY=...
PUBLIC_APP_URL=...              # For QR code generation
```

## Database

Tables: `teachers`, `questions`, `sessions`, `submissions`

RLS policies enforce:
- Teachers can only see their own data
- Students can submit to active sessions without auth
- Anyone can view questions for active sessions (needed for join page)

## Supabase MCP Integration

Use MCP tools for database operations:

```
mcp__supabase__execute_sql         # Read queries
mcp__supabase__apply_migration     # DDL changes (tracked)
mcp__supabase__generate_typescript_types  # Regenerate types
mcp__supabase__get_advisors        # Security/performance checks
```

Always use `apply_migration` for schema changes.
