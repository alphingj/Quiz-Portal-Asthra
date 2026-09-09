-- ==============================================================================
-- Asthra 11.0: KeyBreak (Cipher Clash) Database Schema for Supabase
-- St. Joseph's College of Engineering and Technology, Palai (Autonomous)
-- ==============================================================================
-- SECURITY OVERHAUL: This schema enforces restrictive RLS policies.
-- All admin mutations go through service_role (server API).
-- Participant mutations go through server-side RPCs.
-- ==============================================================================

-- 1. Create Participants Table (with RBAC role column)
CREATE TABLE IF NOT EXISTS public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    team_name TEXT,
    current_question_index INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    warning_count INTEGER DEFAULT 0,
    role TEXT DEFAULT 'participant' CHECK (role IN ('participant', 'moderator', 'admin')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    current_question_started_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration for existing deployments: rename password -> password_hash if needed.
-- The participant login API performs a one-time bcrypt upgrade when it sees a
-- legacy plaintext value. Do not expose password_hash through any public view.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'password'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE public.participants RENAME COLUMN password TO password_hash;
    END IF;
END $$;

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

-- Migration for timed-competition mode: per-question start timestamp if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'current_question_started_at'
    ) THEN
        ALTER TABLE public.participants ADD COLUMN current_question_started_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Backfill NULL timer timestamps (#37)
UPDATE public.participants
SET current_question_started_at = COALESCE(current_question_started_at, started_at, NOW())
WHERE current_question_started_at IS NULL;

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

-- Safe public leaderboard/participant view. Never includes password_hash.
CREATE OR REPLACE VIEW public.participants_public AS
SELECT id, username, team_name, current_question_index, score, completed,
       is_banned, started_at, completed_at, created_at, current_question_started_at
FROM public.participants;

-- 3. Create public view that hides the answer column (#2)
CREATE OR REPLACE VIEW public.questions_public AS
SELECT id, round_number, title, cipher_type, ciphertext, clue, points, difficulty, order_index
FROM public.questions;

-- 4. Create Submissions Table
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES public.questions(id) ON DELETE CASCADE,
    submitted_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Warnings / Anti-Cheat Incidents Table
CREATE TABLE IF NOT EXISTS public.warnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    team_name TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Competition Settings (single-row table, id = 1 drives timed-competition mode)
CREATE TABLE IF NOT EXISTS public.competition_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'live', 'ended')),
    started_at TIMESTAMPTZ,
    time_limit_seconds INTEGER DEFAULT 600,
    decay_per_second INTEGER DEFAULT 1,
    active_question_count INTEGER DEFAULT 3,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the singleton settings row (safe to re-run)
INSERT INTO public.competition_settings (id, status, time_limit_seconds, decay_per_second, active_question_count)
VALUES (1, 'waiting', 600, 1, 3)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 7. SECURE Row Level Security (RLS) Policies
-- ==============================================================================

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_settings ENABLE ROW LEVEL SECURITY;

-- Drop all old permissive policies
DROP POLICY IF EXISTS "Allow public read access on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow public insert on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow public update on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow public delete on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow public read on questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public insert on questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public update on questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public delete on questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public read on submissions" ON public.submissions;
DROP POLICY IF EXISTS "Allow public insert on submissions" ON public.submissions;
DROP POLICY IF EXISTS "Allow public read on warnings" ON public.warnings;
DROP POLICY IF EXISTS "Allow public insert on warnings" ON public.warnings;
DROP POLICY IF EXISTS "Allow public delete on warnings" ON public.warnings;
DROP POLICY IF EXISTS "Allow public read on competition_settings" ON public.competition_settings;
DROP POLICY IF EXISTS "Allow public insert on competition_settings" ON public.competition_settings;
DROP POLICY IF EXISTS "Allow public update on competition_settings" ON public.competition_settings;

-- Drop new named policies too (idempotent re-run)
DROP POLICY IF EXISTS "anon_read_participants_safe" ON public.participants;
DROP POLICY IF EXISTS "anon_read_questions" ON public.questions;
DROP POLICY IF EXISTS "anon_read_submissions" ON public.submissions;
DROP POLICY IF EXISTS "anon_read_warnings" ON public.warnings;
DROP POLICY IF EXISTS "anon_insert_warnings" ON public.warnings;
DROP POLICY IF EXISTS "anon_read_settings" ON public.competition_settings;

-- Public clients read only the safe question view and competition status.
CREATE POLICY "anon_read_settings" ON public.competition_settings
    FOR SELECT TO anon, authenticated USING (true);

-- No anon access to raw participants/questions/submissions/warnings. Admin APIs
-- use service_role, participant mutations use authenticated server RPC routes.
REVOKE ALL ON TABLE public.participants, public.questions, public.submissions, public.warnings FROM anon, authenticated;
GRANT SELECT ON TABLE public.competition_settings TO anon, authenticated;
GRANT SELECT ON public.questions_public TO anon, authenticated;
GRANT SELECT ON public.participants_public TO anon, authenticated;

-- View access must be explicit; the base answer-bearing table remains private.
REVOKE ALL ON TABLE public.questions_public FROM anon, authenticated;
GRANT SELECT ON TABLE public.questions_public TO anon, authenticated;

-- Lock down SECURITY DEFINER RPCs to the server service role only.
REVOKE ALL ON FUNCTION public.rpc_submit_answer(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_skip_question(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_start_competition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_increment_warning(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_delete_question(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_answer(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_skip_question(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_start_competition() TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_increment_warning(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_question(integer) TO service_role;

-- ==============================================================================
-- 8. Server-Side RPCs (called via service_role from API routes)
-- ==============================================================================

-- RPC: Submit answer (atomic, server-side scoring)
CREATE OR REPLACE FUNCTION public.rpc_submit_answer(
    p_participant_id UUID,
    p_question_id INTEGER,
    p_raw_answer TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_question questions%ROWTYPE;
    v_settings competition_settings%ROWTYPE;
    v_active_count INTEGER;
    v_elapsed_seconds INTEGER;
    v_is_correct BOOLEAN;
    v_awarded INTEGER;
    v_next_index INTEGER;
    v_completed BOOLEAN;
    v_new_score INTEGER;
    v_now TIMESTAMPTZ;
    v_clean_input TEXT;
    v_clean_answer TEXT;
    v_expected_question questions%ROWTYPE;
BEGIN
    v_now := clock_timestamp();

    -- Lock and fetch participant
    SELECT * INTO v_participant
    FROM participants
    WHERE id = p_participant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Participant not found.');
    END IF;

    IF v_participant.is_banned THEN
        RETURN jsonb_build_object('success', false, 'message', 'Account disqualified / banned.');
    END IF;

    IF v_participant.completed THEN
        RETURN jsonb_build_object('success', false, 'message', 'Already completed all rounds.');
    END IF;

    -- Fetch competition settings
    SELECT * INTO v_settings FROM competition_settings WHERE id = 1;

    IF v_settings.status != 'live' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Competition is not live.');
    END IF;

    -- Fetch the question
    SELECT * INTO v_question FROM questions WHERE id = p_question_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Question not found.');
    END IF;

    -- Verify participant is on this question
    v_active_count := LEAST(
        v_settings.active_question_count,
        (SELECT COUNT(*) FROM questions)::INTEGER
    );

    IF v_active_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No active questions configured.');
    END IF;

    -- Check the question is the one the participant should be answering
    SELECT * INTO v_expected_question
    FROM questions
    WHERE order_index = v_participant.current_question_index + 1
    ORDER BY order_index
    LIMIT 1;

    IF NOT FOUND OR v_expected_question.id != p_question_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Not your current question.');
    END IF;

    -- Clean comparison
    v_clean_input := UPPER(TRIM(p_raw_answer));
    v_clean_answer := UPPER(TRIM(v_question.answer));
    v_is_correct := (v_clean_input = v_clean_answer);

    -- Record submission
    INSERT INTO submissions (participant_id, question_id, submitted_answer, is_correct, created_at)
    VALUES (p_participant_id, p_question_id, p_raw_answer, v_is_correct, v_now);

    IF NOT v_is_correct THEN
        RETURN jsonb_build_object(
            'success', true,
            'isCorrect', false,
            'pointsAwarded', 0,
            'completedEvent', false,
            'timedOut', false,
            'message', 'Incorrect cipher text decryption. Glitch detected! Try again.'
        );
    END IF;

    -- Correct answer: calculate elapsed time from DB timestamp
    v_elapsed_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_now - COALESCE(v_participant.current_question_started_at, v_now)))::INTEGER);

    IF v_elapsed_seconds > v_settings.time_limit_seconds THEN
        RETURN jsonb_build_object(
            'success', true,
            'isCorrect', false,
            'pointsAwarded', 0,
            'completedEvent', false,
            'timedOut', true,
            'message', 'Time expired for this round. Use Skip to advance.'
        );
    END IF;

    -- Calculate decayed award
    v_awarded := GREATEST(0, v_question.points - v_elapsed_seconds * v_settings.decay_per_second);
    v_next_index := v_participant.current_question_index + 1;
    v_completed := (v_next_index >= v_active_count);
    v_new_score := v_participant.score + v_awarded;

    -- Update participant atomically
    UPDATE participants SET
        current_question_index = v_next_index,
        score = v_new_score,
        completed = v_completed,
        completed_at = CASE WHEN v_completed THEN v_now ELSE NULL END,
        current_question_started_at = v_now
    WHERE id = p_participant_id
      AND current_question_index = v_participant.current_question_index;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Concurrent update detected. Please retry.');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'isCorrect', true,
        'pointsAwarded', v_awarded,
        'completedEvent', v_completed,
        'timedOut', false,
        'message', CASE WHEN v_completed
            THEN format('All ciphers breached! +%s points. Decryption complete!', v_awarded)
            ELSE format('Decryption successful! +%s points. Accessing next security layer...', v_awarded)
        END,
        'award', jsonb_build_object(
            'basePoints', v_question.points,
            'elapsedSeconds', v_elapsed_seconds,
            'awarded', v_awarded
        ),
        'updatedParticipant', jsonb_build_object(
            'id', p_participant_id,
            'current_question_index', v_next_index,
            'score', v_new_score,
            'completed', v_completed,
            'completed_at', CASE WHEN v_completed THEN v_now ELSE NULL END,
            'current_question_started_at', v_now
        )
    );
END;
$$;

-- RPC: Skip question (atomic, validates timeout)
CREATE OR REPLACE FUNCTION public.rpc_skip_question(
    p_participant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_settings competition_settings%ROWTYPE;
    v_active_count INTEGER;
    v_elapsed_seconds INTEGER;
    v_next_index INTEGER;
    v_completed BOOLEAN;
    v_now TIMESTAMPTZ;
BEGIN
    v_now := clock_timestamp();

    -- Lock and fetch participant
    SELECT * INTO v_participant
    FROM participants
    WHERE id = p_participant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Participant not found.');
    END IF;

    IF v_participant.is_banned THEN
        RETURN jsonb_build_object('success', false, 'message', 'Account disqualified / banned.');
    END IF;

    IF v_participant.completed THEN
        RETURN jsonb_build_object('success', false, 'message', 'Already completed all rounds.');
    END IF;

    SELECT * INTO v_settings FROM competition_settings WHERE id = 1;

    IF v_settings.status != 'live' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Competition is not live.');
    END IF;

    -- Validate timeout: skip only allowed after time expires (#12)
    v_elapsed_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_now - COALESCE(v_participant.current_question_started_at, v_now)))::INTEGER);

    IF v_elapsed_seconds < v_settings.time_limit_seconds THEN
        RETURN jsonb_build_object('success', false, 'message', 'Timer has not expired yet. Cannot skip.');
    END IF;

    v_active_count := LEAST(
        v_settings.active_question_count,
        (SELECT COUNT(*) FROM questions)::INTEGER
    );
    IF v_active_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No active questions configured.');
    END IF;
    v_next_index := v_participant.current_question_index + 1;
    v_completed := (v_next_index >= v_active_count);

    UPDATE participants SET
        current_question_index = v_next_index,
        completed = v_completed,
        completed_at = CASE WHEN v_completed THEN v_now ELSE completed_at END,
        current_question_started_at = v_now
    WHERE id = p_participant_id
      AND current_question_index = v_participant.current_question_index;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Concurrent update detected. Please retry.');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'completedEvent', v_completed,
        'message', CASE WHEN v_completed
            THEN 'Time expired on the final round. Run complete.'
            ELSE 'Time expired. Skipped to next round with 0 points.'
        END,
        'updatedParticipant', jsonb_build_object(
            'id', p_participant_id,
            'current_question_index', v_next_index,
            'score', v_participant.score,
            'completed', v_completed,
            'completed_at', CASE WHEN v_completed THEN v_now ELSE NULL END,
            'current_question_started_at', v_now
        )
    );
END;
$$;

-- RPC: Start competition (atomic reset + status change) (#14)
CREATE OR REPLACE FUNCTION public.rpc_start_competition()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_settings competition_settings%ROWTYPE;
BEGIN
    v_now := clock_timestamp();

    UPDATE participants SET
        current_question_index = 0,
        score = 0,
        completed = false,
        started_at = v_now,
        completed_at = NULL,
        current_question_started_at = v_now;

    UPDATE competition_settings SET
        status = 'live',
        started_at = v_now,
        updated_at = v_now
    WHERE id = 1;

    SELECT * INTO v_settings FROM competition_settings WHERE id = 1;

    RETURN jsonb_build_object(
        'success', true,
        'settings', row_to_json(v_settings)
    );
END;
$$;

-- RPC: Atomic warning increment (#35)
CREATE OR REPLACE FUNCTION public.rpc_increment_warning(
    p_participant_id UUID,
    p_username TEXT,
    p_team_name TEXT,
    p_event_type TEXT,
    p_details TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_count INTEGER;
BEGIN
    UPDATE participants
    SET warning_count = COALESCE(warning_count, 0) + 1
    WHERE id = p_participant_id
    RETURNING warning_count INTO v_new_count;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Participant not found.');
    END IF;

    INSERT INTO warnings (participant_id, username, team_name, event_type, details)
    VALUES (p_participant_id, p_username, p_team_name, p_event_type, p_details);

    RETURN jsonb_build_object('success', true, 'warningCount', v_new_count);
END;
$$;

-- RPC: Atomic delete + renumber questions (#10)
CREATE OR REPLACE FUNCTION public.rpc_delete_question(p_question_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM questions;
    IF v_count <= 1 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot delete the last remaining question.');
    END IF;

    DELETE FROM questions WHERE id = p_question_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Question not found.');
    END IF;

    WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS new_order
        FROM questions
    )
    UPDATE questions q
    SET order_index = o.new_order,
        round_number = o.new_order
    FROM ordered o
    WHERE q.id = o.id;

    UPDATE competition_settings
    SET active_question_count = LEAST(active_question_count, (SELECT COUNT(*) FROM questions)::INTEGER)
    WHERE id = 1
      AND active_question_count > (SELECT COUNT(*) FROM questions)::INTEGER;

    v_count := (SELECT COUNT(*) FROM questions)::INTEGER;
    UPDATE participants
    SET current_question_index = LEAST(current_question_index, v_count),
        completed = CASE WHEN current_question_index >= v_count THEN true ELSE completed END,
        completed_at = CASE WHEN current_question_index >= v_count AND completed_at IS NULL THEN clock_timestamp() ELSE completed_at END
    WHERE current_question_index > v_count;

    RETURN jsonb_build_object('success', true, 'remainingCount', v_count);
END;
$$;

-- ==============================================================================
-- 9. Enable Realtime Publications for live scoreboards
-- ==============================================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['participants', 'questions', 'submissions', 'warnings', 'competition_settings'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- 10. Seed Initial 3 Cryptography Questions
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
    NULL,
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
