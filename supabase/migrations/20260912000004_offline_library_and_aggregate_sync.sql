-- Durable aggregate state for cross-device merge and selective offline downloads.
-- Apply after 20260912000003_auth_owner_claim_hardening.sql.

CREATE TABLE IF NOT EXISTS public.sync_entity_state (
  owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  bank_id UUID REFERENCES public.banks(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  server_version INT NOT NULL DEFAULT 1,
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  last_change_seq BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_entity_subject
  ON public.sync_entity_state(owner_id, entity_type, (payload #>> '{question,subject}'), last_change_seq);
CREATE INDEX IF NOT EXISTS idx_sync_entity_cursor
  ON public.sync_entity_state(owner_id, last_change_seq);

ALTER TABLE public.sync_entity_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_entity_state_owner_select ON public.sync_entity_state;
CREATE POLICY sync_entity_state_owner_select ON public.sync_entity_state
  FOR SELECT USING (owner_id = public.current_owner_id());

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('question-media', 'question-media', false, 10485760, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT(id) DO UPDATE SET
  public=false,
  file_size_limit=10485760,
  allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp'];

DROP POLICY IF EXISTS question_media_owner_read ON storage.objects;
CREATE POLICY question_media_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='question-media' AND (storage.foldername(name))[1]=auth.uid()::TEXT);
DROP POLICY IF EXISTS question_media_owner_insert ON storage.objects;
CREATE POLICY question_media_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='question-media' AND (storage.foldername(name))[1]=auth.uid()::TEXT);
DROP POLICY IF EXISTS question_media_owner_update ON storage.objects;
CREATE POLICY question_media_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id='question-media' AND (storage.foldername(name))[1]=auth.uid()::TEXT)
  WITH CHECK (bucket_id='question-media' AND (storage.foldername(name))[1]=auth.uid()::TEXT);

CREATE OR REPLACE FUNCTION public.merge_sync_rows(p_old JSONB, p_new JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SET search_path=public
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'id'), '[]'::JSONB)
  FROM (
    SELECT DISTINCT ON (item->>'id') item
    FROM (
      SELECT item, 0 AS priority FROM jsonb_array_elements(COALESCE(p_old,'[]'::JSONB)) AS item
      UNION ALL
      SELECT item, 1 AS priority FROM jsonb_array_elements(COALESCE(p_new,'[]'::JSONB)) AS item
    ) candidates
    WHERE item ? 'id'
    ORDER BY item->>'id', priority DESC
  ) merged;
$$;

CREATE OR REPLACE FUNCTION public.push_mutations(p_device_id TEXT, p_mutations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owner_id UUID;
  v_item JSONB;
  v_mutation_id TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_payload JSONB;
  v_existing public.sync_entity_state%ROWTYPE;
  v_change_seq BIGINT;
  v_version INT;
  v_results JSONB := '[]'::JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT id INTO v_owner_id FROM public.owners WHERE auth_user_id=v_user_id LIMIT 1;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'OwnerNotFound'; END IF;
  IF jsonb_typeof(p_mutations) <> 'array'
     OR jsonb_array_length(p_mutations) > 100
     OR octet_length(p_mutations::TEXT) > 1048576 THEN
    RAISE EXCEPTION 'InvalidMutationBatch';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_mutations)
  LOOP
    v_mutation_id := v_item->>'mutationId';
    v_entity_type := v_item->>'entityType';
    v_payload := COALESCE(v_item->'payload','{}'::JSONB);
    BEGIN
      v_entity_id := (v_item->>'entityId')::UUID;
      IF v_mutation_id IS NULL OR length(v_mutation_id) > 512 OR
         v_entity_type NOT IN ('profileBundle','questionBundle','sessionBundle','profile','subject','chapter','topic','question','question_archive','session','attempt','attemptEvent','mediaManifest','tombstone') THEN
        RAISE EXCEPTION 'InvalidMutationSchema';
      END IF;
      IF EXISTS(SELECT 1 FROM public.mutation_receipts WHERE actor_id=v_user_id AND mutation_id=v_mutation_id) THEN
        SELECT change_seq INTO v_change_seq FROM public.mutation_receipts WHERE actor_id=v_user_id AND mutation_id=v_mutation_id;
        v_results := v_results || jsonb_build_object('mutationId',v_mutation_id,'status','duplicate','changeSeq',v_change_seq::TEXT);
        CONTINUE;
      END IF;

      SELECT * INTO v_existing FROM public.sync_entity_state
       WHERE owner_id=v_owner_id AND entity_type=v_entity_type AND entity_id=v_entity_id
       FOR UPDATE;
      IF FOUND AND v_entity_type='sessionBundle'
         AND v_existing.payload #>> '{session,state}'='FINISHED'
         AND COALESCE(v_payload #>> '{session,state}','')<>'FINISHED' THEN
        v_results := v_results || jsonb_build_object('mutationId',v_mutation_id,'status','conflict','serverVersion',v_existing.server_version,'errorCode','FINISHED_TERMINAL');
        INSERT INTO public.mutation_receipts(actor_id,mutation_id,entity_type,entity_id,status)
        VALUES(v_user_id,v_mutation_id,v_entity_type,v_entity_id::TEXT,'conflict');
        CONTINUE;
      END IF;

      -- Question heads are last-accepted, but immutable revision snapshots from
      -- both offline branches are retained so an edit is never silently lost.
      IF FOUND AND v_entity_type='questionBundle' THEN
        v_payload := jsonb_set(
          v_payload,
          '{revisions}',
          public.merge_sync_rows(v_existing.payload->'revisions',v_payload->'revisions'),
          true
        );
      END IF;

      IF FOUND AND v_entity_type='profileBundle' THEN
        v_payload := jsonb_set(v_payload,'{subjects}',public.merge_sync_rows(v_existing.payload->'subjects',v_payload->'subjects'),true);
        v_payload := jsonb_set(v_payload,'{chapters}',public.merge_sync_rows(v_existing.payload->'chapters',v_payload->'chapters'),true);
        v_payload := jsonb_set(v_payload,'{topics}',public.merge_sync_rows(v_existing.payload->'topics',v_payload->'topics'),true);
      END IF;

      v_version := CASE WHEN FOUND THEN v_existing.server_version + 1 ELSE 1 END;
      INSERT INTO public.change_log(owner_id,bank_id,entity_type,entity_id,server_version,is_tombstone,payload)
      VALUES(v_owner_id,NULL,v_entity_type,v_entity_id,v_version,false,v_payload)
      RETURNING change_seq INTO v_change_seq;
      INSERT INTO public.sync_entity_state(owner_id,bank_id,entity_type,entity_id,server_version,is_tombstone,payload,last_change_seq,updated_at)
      VALUES(v_owner_id,NULL,v_entity_type,v_entity_id,v_version,false,v_payload,v_change_seq,now())
      ON CONFLICT(owner_id,entity_type,entity_id) DO UPDATE SET
        server_version=excluded.server_version,
        is_tombstone=excluded.is_tombstone,
        payload=excluded.payload,
        last_change_seq=excluded.last_change_seq,
        updated_at=excluded.updated_at;
      INSERT INTO public.mutation_receipts(actor_id,mutation_id,entity_type,entity_id,status,change_seq)
      VALUES(v_user_id,v_mutation_id,v_entity_type,v_entity_id::TEXT,'accepted',v_change_seq);
      v_results := v_results || jsonb_build_object('mutationId',v_mutation_id,'status','accepted','serverVersion',v_version,'changeSeq',v_change_seq::TEXT);
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_object('mutationId',COALESCE(v_mutation_id,''),'status','rejected','errorCode',SQLERRM);
    END;
  END LOOP;
  RETURN v_results;
END;
$$;

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
    WHERE s.owner_id=v_owner_id AND s.last_change_seq>v_cursor
      AND (
        s.entity_type='profileBundle'
        OR (s.entity_type='questionBundle' AND (s.payload #>> '{question,subject}')=ANY(p_subject_names))
      )
    ORDER BY s.last_change_seq
    LIMIT v_limit+1
  LOOP
    v_count := v_count+1;
    IF v_count<=v_limit THEN
      v_next := v_row.last_change_seq;
      v_changes := v_changes || jsonb_build_object(
        'changeSeq',v_row.last_change_seq::TEXT,'entityType',v_row.entity_type,
        'entityId',v_row.entity_id::TEXT,'serverVersion',v_row.server_version,
        'isTombstone',v_row.is_tombstone,'payload',v_row.payload,'createdAt',v_row.updated_at
      );
    END IF;
  END LOOP;
  RETURN jsonb_build_object('changes',v_changes,'nextCursor',v_next::TEXT,'hasMore',v_count>v_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.download_subject_content(TEXT[],TEXT,INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.download_subject_content(TEXT[],TEXT,INT) TO authenticated;
