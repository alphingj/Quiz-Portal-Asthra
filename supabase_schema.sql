-- ==============================================================================
-- Asthra 11.0: KeyBreak (Cipher Clash) Database Schema for Supabase
-- St. Joseph's College of Engineering and Technology, Palai (Autonomous)
-- ==============================================================================

-- 1. Create Participants Table (with RBAC role column)
CREATE TABLE IF NOT EXISTS public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    team_name TEXT,
    current_question_index INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    warning_count INTEGER DEFAULT 0,
    role TEXT DEFAULT 'participant' CHECK (role IN ('participant', 'moderator', 'admin')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration for existing deployments: add role column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.participants ADD COLUMN role TEXT DEFAULT 'participant' CHECK (role IN ('participant', 'moderator', 'admin'));
    END IF;
END $$;

-- 2. Create Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
    id SERIAL PRIMARY KEY,
    round_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    cipher_type TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    clue TEXT,
    answer TEXT NOT NULL,
    points INTEGER DEFAULT 100,
    difficulty TEXT DEFAULT 'Beginner',
    order_index INTEGER NOT NULL
);

-- 3. Create Submissions Table
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES public.questions(id) ON DELETE CASCADE,
    submitted_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Warnings / Anti-Cheat Incidents Table
CREATE TABLE IF NOT EXISTS public.warnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    team_name TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS) & permissive policies for the event
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warnings ENABLE ROW LEVEL SECURITY;

-- Allow read and write for anon during competition
-- (DROP first so the script is safe to re-run on an existing project)
DROP POLICY IF EXISTS "Allow public read access on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow public insert on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow public update on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow public delete on participants" ON public.participants;
CREATE POLICY "Allow public read access on participants" ON public.participants FOR SELECT USING (true);
CREATE POLICY "Allow public insert on participants" ON public.participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on participants" ON public.participants FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on participants" ON public.participants FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read on questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public insert on questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public update on questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public delete on questions" ON public.questions;
CREATE POLICY "Allow public read on questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on questions" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on questions" ON public.questions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on questions" ON public.questions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read on submissions" ON public.submissions;
DROP POLICY IF EXISTS "Allow public insert on submissions" ON public.submissions;
CREATE POLICY "Allow public read on submissions" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on submissions" ON public.submissions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read on warnings" ON public.warnings;
DROP POLICY IF EXISTS "Allow public insert on warnings" ON public.warnings;
DROP POLICY IF EXISTS "Allow public delete on warnings" ON public.warnings;
CREATE POLICY "Allow public read on warnings" ON public.warnings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on warnings" ON public.warnings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete on warnings" ON public.warnings FOR DELETE USING (true);

-- 6. Enable Realtime Publications for live scoreboards
-- (skips tables already in the publication, so re-runs are safe)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['participants', 'questions', 'submissions', 'warnings'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- 6. Seed Initial 3 Cryptography Questions
INSERT INTO public.questions (round_number, title, cipher_type, ciphertext, clue, answer, points, difficulty, order_index)
VALUES 
(
    1, 
    'Round 1: The Caesar Breach', 
    'Caesar Cipher (ROT-3)', 
    'DVWKUD{EUHDN_WKH_FLSKHU_11}', 
    'Shift each letter backward by 3 positions in the alphabet (A -> X, D -> A). The flag starts with ASTHRA{...}', 
    'ASTHRA{BREAK_THE_CIPHER_11}', 
    100, 
    'Beginner', 
    1
),
(
    2, 
    'Round 2: The Raw Memory Stream', 
    'Hexadecimal ASCII Stream', 
    '41 53 54 48 52 41 7b 48 34 43 4b 5f 54 48 33 5f 50 4c 41 4e 33 54 7d', 
    NULL, -- No clue provided for this question!
    'ASTHRA{H4CK_TH3_PLAN3T}', 
    150, 
    'Intermediate', 
    2
),
(
    3, 
    'Round 3: The Polyalphabetic Citadel', 
    'Vigenère Cipher', 
    'SFXZLE{GOMC_MEV_XCPPT}', 
    'The tech fest name itself (ASTHRA) was used as the repeating keyword key to lock this flag.', 
    'ASTHRA{CODE_AND_CONQR}', 
    200, 
    'Advanced', 
    3
)
ON CONFLICT (id) DO NOTHING;
