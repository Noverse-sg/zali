# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zali is an AI-powered exam marking application for teachers. Teachers create questions with model answers, start live sessions with join codes, and students submit handwritten answers as images. The system uses the Noverse Console API (which internally calls Google Gemini) to analyze submissions and generate marked images with annotations.

## Commands

```bash
npm run dev          # Start development server (Vite)
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Run svelte-check for type checking
npm run check:watch  # Run svelte-check in watch mode
```

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5
- **Database/Auth**: Supabase (PostgreSQL with RLS policies)
- **AI**: Noverse Console API (`NOVERSE_API_URL`)
  - Zali calls `POST /api/mark-image` on the Noverse API with a Bearer token
  - The Noverse API internally uses Gemini models for analysis and image marking
  - Gemini API keys live on the Noverse server, not in Zali
- **Build**: Vite 7

## Architecture

### Data Flow
1. Teachers authenticate via Supabase Auth → creates entry in `teachers` table via trigger
2. Teachers create questions with model answers in the `questions` table
3. Teachers start sessions with 6-character join codes (`sessions` table)
4. Students join via `/join/[code]`, upload handwritten answer images
5. Marking API calls Noverse Console API (see AI Marking Pipeline below)
6. Results stored in `submissions` table, marked images in Supabase Storage

### AI Marking Pipeline

Zali's `/api/mark` endpoint sends the student image and model answer to the Noverse Console API at `POST /api/mark-image`. The Noverse API performs a two-step marking process:

**Step 1: Analysis** (Gemini `gemini-3-pro-preview`)
- Input: Student image + model answer/rubric + optional context files
- Output: JSON with score, feedback, mistakes array, and marking instructions

**Step 2: Image Marking** (Gemini `gemini-3-pro-image-preview`)
- Only called if marking instructions exist from Step 1
- Input: Original student image (PNG) + marking instructions
- Output: Annotated image with red teacher-style markings

Zali receives the results (score, feedback, mistakes, marked image base64) and handles Supabase storage upload and submission status updates.

### Key Files
- `src/lib/supabase.ts` - Client-side Supabase client (anon key)
- `src/lib/server/supabase.ts` - Server-side admin client (service role key)
- `src/lib/stores/auth.ts` - Svelte store for auth state with teacher profile
- `src/lib/types/database.ts` - TypeScript types matching Supabase schema
- `src/routes/api/mark/+server.ts` - Marking endpoint (calls Noverse API)
- `supabase/schema.sql` - Database schema with RLS policies

### Route Structure
- `/` - Landing page
- `/login` - Teacher authentication
- `/dashboard` - Teacher dashboard (sessions overview)
- `/dashboard/sessions` - List/manage sessions
- `/dashboard/sessions/new` - Create new session
- `/dashboard/sessions/[id]` - View session and submissions
- `/dashboard/analytics` - Analytics view
- `/join/[code]` - Student submission page
- `/api/mark` - POST endpoint for AI marking

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` - Supabase project credentials
- `SUPABASE_SERVICE_ROLE_KEY` - For server-side admin operations
- `NOVERSE_API_KEY` - Noverse Console API key (e.g., `nv_...`)
- `NOVERSE_API_URL` - Noverse Console API base URL
- `PUBLIC_APP_URL` - Base URL for the application

## Database

Schema in `supabase/schema.sql` defines:
- `teachers` - Linked to Supabase Auth users
- `questions` - Question bank per teacher
- `sessions` - Live marking sessions with join codes
- `submissions` - Student submissions with marking results

RLS policies enforce teacher data isolation. Students can submit to active sessions without authentication.
