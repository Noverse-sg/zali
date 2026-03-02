-- Teachers table (linked to Supabase Auth)
CREATE TABLE teachers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions bank for teachers
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    model_answer TEXT,
    answer_key_url TEXT,          -- URL to uploaded answer key file (image, PDF, text)
    answer_key_type TEXT,         -- MIME type of answer key file
    max_points INTEGER NOT NULL DEFAULT 10,
    time_limit_seconds INTEGER NOT NULL DEFAULT 300,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (one question per session)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE, -- 6-character join code
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'closed')),
    started_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student submissions
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    original_image_url TEXT NOT NULL,
    marked_image_url TEXT,
    score INTEGER,
    max_score INTEGER NOT NULL,
    feedback TEXT,
    mistakes TEXT[], -- Array of identified mistakes for analytics
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'marking', 'completed', 'error')),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    marked_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_questions_teacher ON questions(teacher_id);
CREATE INDEX idx_sessions_teacher ON sessions(teacher_id);
CREATE INDEX idx_sessions_code ON sessions(code);
CREATE INDEX idx_submissions_session ON submissions(session_id);
CREATE INDEX idx_submissions_status ON submissions(status);

-- RLS Policies
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Teachers can only see their own data
CREATE POLICY "Teachers can view own profile" ON teachers
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Teachers can update own profile" ON teachers
    FOR UPDATE USING (auth.uid() = id);

-- Questions policies
CREATE POLICY "Teachers can view own questions" ON questions
    FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own questions" ON questions
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own questions" ON questions
    FOR UPDATE USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own questions" ON questions
    FOR DELETE USING (auth.uid() = teacher_id);

-- Sessions policies
CREATE POLICY "Teachers can view own sessions" ON sessions
    FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own sessions" ON sessions
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own sessions" ON sessions
    FOR UPDATE USING (auth.uid() = teacher_id);

CREATE POLICY "Anyone can view active sessions by code" ON sessions
    FOR SELECT USING (status IN ('waiting', 'active'));

-- Submissions policies
CREATE POLICY "Teachers can view submissions for their sessions" ON submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = submissions.session_id
            AND sessions.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Anyone can insert submissions to active sessions" ON submissions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = submissions.session_id
            AND sessions.status = 'active'
        )
    );

CREATE POLICY "Service role can update submissions" ON submissions
    FOR UPDATE USING (true);

-- Function to auto-create teacher profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.teachers (id, email, name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Storage bucket for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', true)
ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can upload to submissions bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'submissions');

CREATE POLICY "Anyone can view submissions bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'submissions');

CREATE POLICY "Service role can update submissions bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'submissions');

-- Storage bucket for answer keys
INSERT INTO storage.buckets (id, name, public)
VALUES ('answer-keys', 'answer-keys', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated users can upload to answer-keys bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'answer-keys' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view answer-keys bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'answer-keys');

CREATE POLICY "Authenticated users can update answer-keys bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'answer-keys' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete from answer-keys bucket"
ON storage.objects FOR DELETE
USING (bucket_id = 'answer-keys' AND auth.role() = 'authenticated');
