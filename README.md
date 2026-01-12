# Zali

**AI-Powered Teaching Assistant for Live Student Insights**

Zali helps lecturers gain real-time insights into student understanding while detecting AI misuse. Create engaging, Kahoot-style interactive sessions that keep learning professional and fun.

## What is Zali?

Zali revolutionises the feedback loop between teachers and students. Instead of waiting days for assignment results, students receive instant, AI-powered feedback on their handwritten submissions - highlighting areas for improvement in real-time.

### Key Features

- **Live Sessions** - Create sessions with simple join codes. Students submit answers instantly from any device.
- **AI-Powered Marking** - Handwritten answers are analysed and annotated with teacher-style feedback in seconds.
- **Authenticity Detection** - Designed to work with handwritten submissions, helping identify genuine student work.
- **Instant Feedback** - Students see marked-up images with scores, corrections, and improvement suggestions immediately.
- **Teacher Dashboard** - Monitor submissions in real-time, view analytics, and track student progress.

## How It Works

1. **Create a Question** - Add questions with model answers and rubrics
2. **Start a Session** - Generate a 6-character join code for your class
3. **Students Submit** - Students photograph their handwritten answers and upload
4. **AI Marks & Annotates** - Submissions are scored and annotated with red pen-style markings
5. **Instant Results** - Both teachers and students see results immediately

## Tech Stack

- **Frontend**: SvelteKit 2 with Svelte 5
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **AI**: Google Gemini API for analysis and image annotation
- **Build**: Vite 7

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Google Gemini API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/zali.git
cd zali

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

### Environment Variables

```
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
PUBLIC_APP_URL=http://localhost:5173
```

## Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Type checking
```

## Roadmap

- [ ] Live leaderboards and gamification
- [ ] Team-based challenges
- [ ] Advanced analytics dashboard
- [ ] LMS integrations
- [ ] Mobile app

## License

MIT

---

*Built for educators who believe in the power of instant feedback.*
