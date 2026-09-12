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
