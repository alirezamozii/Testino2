-- ========================================================================
-- Testino Cloud Database Schema & Row-Level Security (RLS)
-- Migration 0001: Core Entities, Parity Tables, Indexes, and Security Policies
-- ========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Owners Table
CREATE TABLE IF NOT EXISTS public.owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK (kind IN ('local', 'account')),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    device_namespace TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ
);

-- 2. Exam Profiles
CREATE TABLE IF NOT EXISTS public.exam_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    target_track TEXT,
    penalty_numerator INT NOT NULL DEFAULT 1,
    penalty_denominator INT NOT NULL DEFAULT 3 CHECK (penalty_denominator > 0),
    default_timer_mode TEXT NOT NULL DEFAULT 'active' CHECK (default_timer_mode IN ('active', 'wall')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ
);

-- 3. Banks
CREATE TABLE IF NOT EXISTS public.banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ
);

-- 4. Bank Members (Cloud Access Control)
CREATE TABLE IF NOT EXISTS public.bank_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID NOT NULL REFERENCES public.banks(id) ON DELETE CASCADE,
    account_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'reader')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bank_id, account_user_id)
);

-- 5. Subjects
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID NOT NULL REFERENCES public.banks(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    language_kind TEXT NOT NULL DEFAULT 'general' CHECK (language_kind IN ('general', 'language')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (bank_id, normalized_name)
);

-- 6. Chapters
CREATE TABLE IF NOT EXISTS public.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (subject_id, normalized_name)
);

-- 7. Topics
CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0 CHECK (position >= 0),
    target_seconds INT CHECK (target_seconds IS NULL OR target_seconds > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (chapter_id, normalized_name)
);

-- 8. Profile Subjects
CREATE TABLE IF NOT EXISTS public.profile_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.exam_profiles(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    coefficient NUMERIC NOT NULL DEFAULT 1 CHECK (coefficient >= 0),
    target_percentage NUMERIC NOT NULL DEFAULT 70 CHECK (target_percentage BETWEEN 0 AND 100),
    position INT NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (profile_id, subject_id)
);

-- 9. Sources
CREATE TABLE IF NOT EXISTS public.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID NOT NULL REFERENCES public.banks(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN ('EXAM', 'AI', 'PERSONAL')),
    title TEXT,
    year INT,
    external_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (bank_id, external_key)
);

-- 10. Question Groups (Reading, Cloze)
CREATE TABLE IF NOT EXISTS public.question_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID NOT NULL REFERENCES public.banks(id) ON DELETE RESTRICT,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
    source_namespace_key TEXT NOT NULL DEFAULT 'local',
    external_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('reading', 'cloze', 'shared')),
    content_json JSONB NOT NULL,
    expected_keys_json JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('complete', 'incomplete')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (bank_id, source_namespace_key, external_key)
);

-- 11. Questions
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID NOT NULL REFERENCES public.banks(id) ON DELETE RESTRICT,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
    source_namespace_key TEXT NOT NULL DEFAULT 'local',
    source_number TEXT,
    external_key TEXT NOT NULL,
    group_id UUID REFERENCES public.question_groups(id) ON DELETE SET NULL,
    group_position INT,
    content_json JSONB NOT NULL,
    explanation_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_option_id UUID,
    status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    shuffle_safe BOOLEAN NOT NULL DEFAULT false,
    fingerprint TEXT NOT NULL,
    search_text TEXT NOT NULL DEFAULT '',
    head_revision_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (bank_id, source_namespace_key, external_key)
);

-- 12. Question Options
CREATE TABLE IF NOT EXISTS public.question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    external_key TEXT NOT NULL,
    position INT NOT NULL CHECK (position BETWEEN 0 AND 3),
    content_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (question_id, position)
);

-- 13. Question Revisions (Immutable History)
CREATE TABLE IF NOT EXISTS public.question_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    version INT NOT NULL,
    snapshot_json JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    author_owner_id UUID REFERENCES public.owners(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (question_id, version)
);

-- 14. Sessions
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
    profile_id UUID NOT NULL REFERENCES public.exam_profiles(id) ON DELETE RESTRICT,
    state TEXT NOT NULL CHECK (state IN ('CREATED', 'RUNNING', 'PAUSED', 'FINISHED')),
    config_json JSONB,
    policy_json JSONB,
    selection_seed TEXT NOT NULL,
    active_question_id UUID,
    active_group_id UUID,
    active_ms INT NOT NULL DEFAULT 0,
    wall_started_at BIGINT,
    deadline_at BIGINT,
    started_at BIGINT,
    finished_at BIGINT,
    finish_reason TEXT,
    editor_device_id TEXT,
    lease_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ
);

-- 15. Session Questions
CREATE TABLE IF NOT EXISTS public.session_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    question_revision_id UUID,
    group_id UUID,
    ordinal INT NOT NULL,
    snapshot_json JSONB NOT NULL,
    option_order_json JSONB NOT NULL,
    selected_option_id UUID,
    first_selected_option_id UUID,
    confidence TEXT CHECK (confidence IN ('sure', 'doubtful', 'guess')),
    explicitly_skipped BOOLEAN NOT NULL DEFAULT false,
    visited BOOLEAN NOT NULL DEFAULT false,
    visit_count INT NOT NULL DEFAULT 0,
    change_count INT NOT NULL DEFAULT 0,
    active_ms INT NOT NULL DEFAULT 0,
    first_visited_at BIGINT,
    last_answer_at BIGINT,
    locked_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ,
    UNIQUE (session_id, question_id),
    UNIQUE (session_id, ordinal)
);

-- 16. Question Attempts (Immutable)
CREATE TABLE IF NOT EXISTS public.question_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
    profile_id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    session_question_id UUID NOT NULL UNIQUE REFERENCES public.session_questions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    revision_id UUID,
    selected_option_id UUID,
    result TEXT NOT NULL CHECK (result IN ('correct', 'wrong', 'unanswered')),
    was_visited BOOLEAN NOT NULL DEFAULT false,
    explicitly_skipped BOOLEAN NOT NULL DEFAULT false,
    confidence TEXT,
    active_ms INT NOT NULL DEFAULT 0,
    change_count INT NOT NULL DEFAULT 0,
    first_selected_option_id UUID,
    finalized_at BIGINT NOT NULL,
    exposed_answer BOOLEAN NOT NULL DEFAULT true,
    review_algorithm_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. Attempt Events (Immutable Replay Log)
CREATE TABLE IF NOT EXISTS public.attempt_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    session_question_id UUID REFERENCES public.session_questions(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    payload_json JSONB,
    occurred_at BIGINT NOT NULL,
    device_id TEXT NOT NULL,
    device_sequence INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (device_id, device_sequence)
);

-- 18. Prompts
CREATE TABLE IF NOT EXISTS public.prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
    subject_id UUID,
    kind TEXT NOT NULL CHECK (kind IN ('extract', 'generate', 'analyze')),
    template_version INT NOT NULL DEFAULT 1,
    custom_instructions TEXT NOT NULL DEFAULT '',
    locale TEXT NOT NULL DEFAULT 'fa',
    schema_version TEXT NOT NULL DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision INT NOT NULL DEFAULT 1,
    inactive_at TIMESTAMPTZ
);

-- 19. Change Log (For Bounded Incremental Pull Synchronization)
CREATE TABLE IF NOT EXISTS public.change_log (
    change_seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id UUID REFERENCES public.owners(id) ON DELETE CASCADE,
    bank_id UUID REFERENCES public.banks(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    server_version INT NOT NULL DEFAULT 1,
    is_tombstone BOOLEAN NOT NULL DEFAULT false,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. Mutation Receipts (Idempotency and Deduping for Push)
CREATE TABLE IF NOT EXISTS public.mutation_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mutation_id TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'duplicate', 'conflict', 'rejected')),
    change_seq BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (actor_id, mutation_id)
);

-- ========================================================================
-- Indexes for Performance & Filter Isolation
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_exam_profiles_owner ON public.exam_profiles(owner_id, inactive_at);
CREATE INDEX IF NOT EXISTS idx_questions_lookup ON public.questions(bank_id, subject_id, status, inactive_at);
CREATE INDEX IF NOT EXISTS idx_sessions_owner_state ON public.sessions(owner_id, profile_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_owner_question ON public.question_attempts(owner_id, profile_id, question_id, finalized_at);
CREATE INDEX IF NOT EXISTS idx_change_log_seq ON public.change_log(change_seq);
CREATE INDEX IF NOT EXISTS idx_change_log_owner ON public.change_log(owner_id, change_seq);

-- ========================================================================
-- Row Level Security (RLS) Configuration
-- ========================================================================
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutation_receipts ENABLE ROW LEVEL SECURITY;

-- Helper function: Get the owner ID for the current authenticated user
CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS UUID AS $$
  SELECT id FROM public.owners WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Owner-Scoped Policies (Only the authenticated owner can access)
CREATE POLICY owners_self_policy ON public.owners
    FOR ALL USING (auth_user_id = auth.uid());

CREATE POLICY profiles_owner_policy ON public.exam_profiles
    FOR ALL USING (owner_id = public.current_owner_id());

CREATE POLICY sessions_owner_policy ON public.sessions
    FOR ALL USING (owner_id = public.current_owner_id());

CREATE POLICY session_questions_owner_policy ON public.session_questions
    FOR ALL USING (session_id IN (SELECT id FROM public.sessions WHERE owner_id = public.current_owner_id()));

CREATE POLICY attempts_owner_policy ON public.question_attempts
    FOR ALL USING (owner_id = public.current_owner_id());

CREATE POLICY attempt_events_owner_policy ON public.attempt_events
    FOR ALL USING (owner_id = public.current_owner_id());

CREATE POLICY prompts_owner_policy ON public.prompts
    FOR ALL USING (owner_id = public.current_owner_id());

CREATE POLICY receipts_owner_policy ON public.mutation_receipts
    FOR ALL USING (actor_id = auth.uid());

-- Bank and Content Policies (Owner & Member based)
CREATE POLICY banks_policy ON public.banks
    FOR ALL USING (
        owner_id = public.current_owner_id() OR
        id IN (SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid())
    );

CREATE POLICY bank_members_policy ON public.bank_members
    FOR ALL USING (
        account_user_id = auth.uid() OR
        bank_id IN (SELECT id FROM public.banks WHERE owner_id = public.current_owner_id())
    );

CREATE POLICY subjects_policy ON public.subjects
    FOR ALL USING (
        bank_id IN (
            SELECT id FROM public.banks WHERE owner_id = public.current_owner_id()
            UNION
            SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid()
        )
    );

CREATE POLICY chapters_policy ON public.chapters
    FOR ALL USING (
        subject_id IN (SELECT id FROM public.subjects WHERE bank_id IN (
            SELECT id FROM public.banks WHERE owner_id = public.current_owner_id()
            UNION
            SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid()
        ))
    );

CREATE POLICY topics_policy ON public.topics
    FOR ALL USING (
        chapter_id IN (SELECT id FROM public.chapters WHERE subject_id IN (
            SELECT id FROM public.subjects WHERE bank_id IN (
                SELECT id FROM public.banks WHERE owner_id = public.current_owner_id()
                UNION
                SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid()
            )
        ))
    );

CREATE POLICY profile_subjects_policy ON public.profile_subjects
    FOR ALL USING (profile_id IN (SELECT id FROM public.exam_profiles WHERE owner_id = public.current_owner_id()));

CREATE POLICY questions_policy ON public.questions
    FOR ALL USING (
        bank_id IN (
            SELECT id FROM public.banks WHERE owner_id = public.current_owner_id()
            UNION
            SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid()
        )
    );

CREATE POLICY question_options_policy ON public.question_options
    FOR ALL USING (
        question_id IN (
            SELECT id FROM public.questions WHERE bank_id IN (
                SELECT id FROM public.banks WHERE owner_id = public.current_owner_id()
                UNION
                SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid()
            )
        )
    );

CREATE POLICY question_revisions_policy ON public.question_revisions
    FOR ALL USING (
        question_id IN (
            SELECT id FROM public.questions WHERE bank_id IN (
                SELECT id FROM public.banks WHERE owner_id = public.current_owner_id()
                UNION
                SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid()
            )
        )
    );

CREATE POLICY change_log_policy ON public.change_log
    FOR SELECT USING (
        owner_id = public.current_owner_id() OR
        bank_id IN (
            SELECT id FROM public.banks WHERE owner_id = public.current_owner_id()
            UNION
            SELECT bank_id FROM public.bank_members WHERE account_user_id = auth.uid()
        )
    );
-- ========================================================================
-- Testino Cloud Database Schema & RPC Functions
-- Migration 0002: Synchronization RPC Functions (Push, Pull, Claim Local Owner)
-- ========================================================================

-- 1. RPC: Claim Local Owner
-- Associates an offline/local device owner with the authenticated Supabase user.
CREATE OR REPLACE FUNCTION public.claim_local_owner(
    p_local_owner_id TEXT,
    p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_existing_owner RECORD;
    v_owner_id UUID;
    v_clean_name TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'احراز هویت الزامی است (Unauthorized)';
    END IF;

    v_clean_name := NULLIF(TRIM(p_display_name), '');
    IF v_clean_name IS NULL THEN
        v_clean_name := 'کاربر تستیونو';
    END IF;

    -- Check if an owner record already exists for this auth user
    SELECT * INTO v_existing_owner FROM public.owners WHERE auth_user_id = v_user_id LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'ownerId', v_existing_owner.id,
            'displayName', v_existing_owner.display_name,
            'kind', 'account',
            'isNew', false
        );
    END IF;

    -- If a local owner ID was passed, check if it can be claimed
    IF p_local_owner_id IS NOT NULL AND p_local_owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_existing_owner FROM public.owners WHERE id = p_local_owner_id::UUID AND auth_user_id IS NULL;
        IF FOUND THEN
            UPDATE public.owners
            SET auth_user_id = v_user_id,
                kind = 'account',
                display_name = v_clean_name,
                updated_at = now(),
                revision = revision + 1
            WHERE id = v_existing_owner.id;

            RETURN jsonb_build_object(
                'ownerId', v_existing_owner.id,
                'displayName', v_clean_name,
                'kind', 'account',
                'isNew', false
            );
        END IF;
    END IF;

    -- Create new account owner
    v_owner_id := gen_random_uuid();
    INSERT INTO public.owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at, revision)
    VALUES (
        v_owner_id,
        'account',
        v_user_id,
        v_clean_name,
        'account-' || substr(md5(random()::text), 1, 8),
        now(),
        now(),
        1
    );

    RETURN jsonb_build_object(
        'ownerId', v_owner_id,
        'displayName', v_clean_name,
        'kind', 'account',
        'isNew', true
    );
END;
$$;

-- Account-owner hardening: an account owner must always be backed by Supabase Auth.
ALTER TABLE public.owners
  ADD CONSTRAINT owners_account_auth_uuid_check
  CHECK (kind <> 'account' OR auth_user_id IS NOT NULL) NOT VALID;

ALTER TABLE public.owners VALIDATE CONSTRAINT owners_account_auth_uuid_check;

-- 2. RPC: Push Mutations (Bounded Batch with Idempotency)
CREATE OR REPLACE FUNCTION public.push_mutations(
    p_device_id TEXT,
    p_mutations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_owner_id UUID;
    v_item JSONB;
    v_mutation_id TEXT;
    v_entity_type TEXT;
    v_entity_id TEXT;
    v_base_version INT;
    v_payload JSONB;
    v_receipt RECORD;
    v_results JSONB := '[]'::JSONB;
    v_change_seq BIGINT;
    v_status TEXT;
    v_server_version INT := 1;
    v_error_code TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'احراز هویت الزامی است (Unauthorized)';
    END IF;

    SELECT id INTO v_owner_id FROM public.owners WHERE auth_user_id = v_user_id LIMIT 1;
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'پروفایل مالک برای کاربر یافت نشد (OwnerNotFound)';
    END IF;

    -- Process each mutation in the batch
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_mutations)
    LOOP
        v_mutation_id := v_item->>'mutationId';
        v_entity_type := v_item->>'entityType';
        v_entity_id := v_item->>'entityId';
        v_base_version := COALESCE((v_item->>'baseVersion')::INT, 1);
        v_payload := v_item->'payload';
        v_status := 'accepted';
        v_error_code := NULL;
        v_change_seq := NULL;

        -- Check idempotency receipt
        SELECT * INTO v_receipt FROM public.mutation_receipts 
        WHERE actor_id = v_user_id AND mutation_id = v_mutation_id;

        IF FOUND THEN
            v_results := v_results || jsonb_build_object(
                'mutationId', v_mutation_id,
                'status', 'duplicate',
                'changeSeq', v_receipt.change_seq::TEXT,
                'errorCode', NULL
            );
            CONTINUE;
        END IF;

        BEGIN
            -- Record entity change and insert into change_log
            INSERT INTO public.change_log(owner_id, bank_id, entity_type, entity_id, server_version, is_tombstone, payload)
            VALUES (
                v_owner_id,
                NULL,
                v_entity_type,
                v_entity_id::UUID,
                v_server_version,
                false,
                COALESCE(v_payload, '{}'::JSONB)
            )
            RETURNING change_seq INTO v_change_seq;

            -- Record mutation receipt for future deduplication
            INSERT INTO public.mutation_receipts(actor_id, mutation_id, entity_type, entity_id, status, change_seq)
            VALUES (v_user_id, v_mutation_id, v_entity_type, v_entity_id, 'accepted', v_change_seq);

            v_results := v_results || jsonb_build_object(
                'mutationId', v_mutation_id,
                'status', 'accepted',
                'serverVersion', v_server_version,
                'changeSeq', v_change_seq::TEXT,
                'errorCode', NULL
            );

        EXCEPTION WHEN OTHERS THEN
            v_error_code := SQLERRM;
            v_results := v_results || jsonb_build_object(
                'mutationId', v_mutation_id,
                'status', 'rejected',
                'serverVersion', NULL,
                'changeSeq', NULL,
                'errorCode', v_error_code
            );
        END;
    END LOOP;

    RETURN v_results;
END;
$$;

-- 3. RPC: Pull Changes (Cursor-Based Pagination from change_log)
CREATE OR REPLACE FUNCTION public.pull_changes(
    p_cursor TEXT DEFAULT '0',
    p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_owner_id UUID;
    v_cursor BIGINT;
    v_effective_limit INT;
    v_changes JSONB := '[]'::JSONB;
    v_row RECORD;
    v_next_cursor BIGINT;
    v_count INT := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'احراز هویت الزامی است (Unauthorized)';
    END IF;

    SELECT id INTO v_owner_id FROM public.owners WHERE auth_user_id = v_user_id LIMIT 1;
    IF v_owner_id IS NULL THEN
        -- If no owner profile exists yet, return empty changes with current cursor
        RETURN jsonb_build_object(
            'changes', '[]'::JSONB,
            'nextCursor', COALESCE(p_cursor, '0'),
            'hasMore', false
        );
    END IF;

    v_cursor := COALESCE(NULLIF(p_cursor, '')::BIGINT, 0);
    v_effective_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_next_cursor := v_cursor;

    FOR v_row IN
        SELECT 
            change_seq,
            entity_type,
            entity_id,
            server_version,
            is_tombstone,
            payload,
            created_at
        FROM public.change_log
        WHERE change_seq > v_cursor
          AND (owner_id = v_owner_id OR bank_id IN (
              SELECT id FROM public.banks WHERE owner_id = v_owner_id
              UNION
              SELECT bank_id FROM public.bank_members WHERE account_user_id = v_user_id
          ))
        ORDER BY change_seq ASC
        LIMIT v_effective_limit + 1
    LOOP
        v_count := v_count + 1;
        IF v_count <= v_effective_limit THEN
            v_next_cursor := v_row.change_seq;
            v_changes := v_changes || jsonb_build_object(
                'changeSeq', v_row.change_seq::TEXT,
                'entityType', v_row.entity_type,
                'entityId', v_row.entity_id::TEXT,
                'serverVersion', v_row.server_version,
                'isTombstone', v_row.is_tombstone,
                'payload', v_row.payload,
                'createdAt', v_row.created_at
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'changes', v_changes,
        'nextCursor', v_next_cursor::TEXT,
        'hasMore', v_count > v_effective_limit
    );
END;
$$;
