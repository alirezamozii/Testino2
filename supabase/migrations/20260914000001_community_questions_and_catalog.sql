-- Community Crowdsourced Question Bank & Shared Catalog Migration
-- Allows automatic cross-user sharing of subjects and questions for active curriculum subjects.

-- 1. Ensure subjects table allows all authenticated users to read and add subjects
DROP POLICY IF EXISTS subjects_community_select ON public.subjects;
CREATE POLICY subjects_community_select ON public.subjects
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS subjects_community_insert ON public.subjects;
CREATE POLICY subjects_community_insert ON public.subjects
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Allow reading community question bundles from sync_entity_state
DROP POLICY IF EXISTS sync_entity_state_community_question_select ON public.sync_entity_state;
CREATE POLICY sync_entity_state_community_question_select ON public.sync_entity_state
  FOR SELECT TO authenticated
  USING (
    owner_id = public.current_owner_id()
    OR entity_type = 'questionBundle'
  );

-- 3. Upgrade download_subject_content RPC to pull matching questions across all community contributors
CREATE OR REPLACE FUNCTION public.download_subject_content(
  p_subject_names TEXT[],
  p_cursor TEXT DEFAULT '0',
  p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth
AS $$
DECLARE
  v_owner_id UUID;
  v_cursor BIGINT := COALESCE(NULLIF(p_cursor,'')::BIGINT,0);
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit,100),1),100);
  v_changes JSONB := '[]'::JSONB;
  v_next BIGINT := v_cursor;
  v_count INT := 0;
  v_row RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT id INTO v_owner_id FROM public.owners WHERE auth_user_id=auth.uid() LIMIT 1;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'OwnerNotFound'; END IF;

  FOR v_row IN
    SELECT * FROM public.sync_entity_state s
    WHERE s.last_change_seq > v_cursor
      AND s.is_tombstone = false
      AND (
        (s.owner_id = v_owner_id AND s.entity_type = 'profileBundle')
        OR (s.entity_type = 'questionBundle' AND (s.payload #>> '{question,subject}') = ANY(p_subject_names))
      )
    ORDER BY s.last_change_seq
    LIMIT v_limit + 1
  LOOP
    v_count := v_count + 1;
    IF v_count <= v_limit THEN
      v_next := v_row.last_change_seq;
      v_changes := v_changes || jsonb_build_object(
        'changeSeq', v_row.last_change_seq::TEXT,
        'entityType', v_row.entity_type,
        'entityId', v_row.entity_id::TEXT,
        'serverVersion', v_row.server_version,
        'isTombstone', v_row.is_tombstone,
        'payload', v_row.payload,
        'createdAt', v_row.updated_at
      );
    END IF;
  END LOOP;
  RETURN jsonb_build_object('changes', v_changes, 'nextCursor', v_next::TEXT, 'hasMore', v_count > v_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.download_subject_content(TEXT[],TEXT,INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.download_subject_content(TEXT[],TEXT,INT) TO authenticated;
