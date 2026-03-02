-- Add answer key file fields to questions table
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer_key_url TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer_key_type TEXT;

-- Make model_answer nullable (answer key files replace text answers)
ALTER TABLE questions ALTER COLUMN model_answer DROP NOT NULL;

-- Create answer-keys storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('answer-keys', 'answer-keys', true)
ON CONFLICT DO NOTHING;

-- Storage policies for answer-keys bucket
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
