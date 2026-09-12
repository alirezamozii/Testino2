import type { SqlStatement } from "./protocol";

export interface Migration {
  version: number;
  name: string;
  checksum: string;
  destructive?: boolean;
  statements: SqlStatement[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "0001_core",
    checksum: "de45ac7253a649e2c525f9edefcd5a76350de1d4c88761cf10241d1dbd22fe23",
    destructive: false,
    statements: [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS profiles(
            id TEXT PRIMARY KEY, name TEXT NOT NULL, target_track TEXT, penalty_numerator INTEGER NOT NULL DEFAULT 0,
            penalty_denominator INTEGER NOT NULL DEFAULT 1 CHECK(penalty_denominator > 0), created_at INTEGER NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1, inactive_at INTEGER
          );
          CREATE TABLE IF NOT EXISTS subjects(
            id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), name TEXT NOT NULL,
            coefficient REAL NOT NULL CHECK(coefficient >= 0), target_percentage REAL NOT NULL CHECK(target_percentage BETWEEN 0 AND 100),
            created_at INTEGER NOT NULL, UNIQUE(profile_id, name)
          );
          CREATE TABLE IF NOT EXISTS sources(
            id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('EXAM','AI','PERSONAL')),
            title TEXT, year INTEGER, external_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS question_groups(
            id TEXT PRIMARY KEY, external_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('reading','cloze','shared')),
            subject TEXT NOT NULL, chapter TEXT, topic TEXT, content_json TEXT NOT NULL,
            expected_keys_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('complete','incomplete')),
            created_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS questions(
            id TEXT PRIMARY KEY, external_key TEXT NOT NULL UNIQUE, subject TEXT NOT NULL, chapter TEXT, topic TEXT,
            group_id TEXT REFERENCES question_groups(id), group_position INTEGER, source_id TEXT REFERENCES sources(id),
            content_json TEXT NOT NULL, explanation_json TEXT NOT NULL, correct_option_id TEXT,
            status TEXT NOT NULL CHECK(status IN ('draft','published')), shuffle_safe INTEGER NOT NULL CHECK(shuffle_safe IN (0,1)),
            created_at INTEGER NOT NULL, inactive_at INTEGER
          );
          CREATE TABLE IF NOT EXISTS question_options(
            id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES questions(id), external_key TEXT NOT NULL,
            position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 3), content_json TEXT NOT NULL,
            UNIQUE(question_id, external_key), UNIQUE(question_id, position)
          );
          CREATE TABLE IF NOT EXISTS question_revisions(
            id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES questions(id), version INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
            UNIQUE(question_id, version)
          );
          CREATE TABLE IF NOT EXISTS sessions(
            id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), state TEXT NOT NULL CHECK(state IN ('CREATED','RUNNING','PAUSED','FINISHED')),
            selection_seed TEXT NOT NULL,
            current_ordinal INTEGER NOT NULL DEFAULT 0, started_at INTEGER, finished_at INTEGER, active_ms INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS session_questions(
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), question_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL, snapshot_json TEXT NOT NULL, option_order_json TEXT NOT NULL,
            selected_option_id TEXT, first_selected_option_id TEXT, change_count INTEGER NOT NULL DEFAULT 0,
            confidence TEXT CHECK(confidence IN ('sure','doubtful','guess')), visited INTEGER NOT NULL DEFAULT 0,
            active_ms INTEGER NOT NULL DEFAULT 0, UNIQUE(session_id, question_id), UNIQUE(session_id, ordinal)
          );
          CREATE TABLE IF NOT EXISTS attempts(
            id TEXT PRIMARY KEY, session_question_id TEXT NOT NULL UNIQUE REFERENCES session_questions(id), session_id TEXT NOT NULL,
            question_id TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('correct','wrong','unanswered')),
            visited INTEGER NOT NULL, confidence TEXT, active_ms INTEGER NOT NULL, finalized_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS attempt_events(
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL, session_question_id TEXT,
            kind TEXT NOT NULL, payload_json TEXT, occurred_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS review_items(
            question_id TEXT PRIMARY KEY, due_at INTEGER NOT NULL, priority INTEGER NOT NULL, stable_streak INTEGER NOT NULL,
            interval_days INTEGER NOT NULL, last_attempt_id TEXT NOT NULL REFERENCES attempts(id)
          );
          CREATE TABLE IF NOT EXISTS outbox(
            id TEXT PRIMARY KEY, mutation_id TEXT NOT NULL UNIQUE, entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL, base_version INTEGER NOT NULL DEFAULT 1, payload_json TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('pending','sending','acked','failed')),
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS questions_filter_idx ON questions(subject, chapter, topic, status, inactive_at);
          CREATE INDEX IF NOT EXISTS sessions_state_idx ON sessions(profile_id, state, created_at DESC);
          CREATE INDEX IF NOT EXISTS review_due_idx ON review_items(due_at, priority);
        `,
      },
    ],
  },
  {
    version: 2,
    name: "0002_owner_taxonomy_applied_mutations",
    checksum: "42505f6bf169769276317c1181a150c1de51b89cf25e3899a2627d741dcc1864",
    destructive: false,
    statements: [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS owners(
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK(kind IN ('local','account')),
            auth_user_id TEXT UNIQUE,
            display_name TEXT NOT NULL,
            device_namespace TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            inactive_at INTEGER
          );

          CREATE TABLE IF NOT EXISTS applied_mutations(
            owner_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL,
            result_json TEXT,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(owner_id, mutation_id)
          );

          CREATE TABLE IF NOT EXISTS chapters(
            id TEXT PRIMARY KEY,
            subject_id TEXT NOT NULL REFERENCES subjects(id),
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            inactive_at INTEGER,
            UNIQUE(subject_id, normalized_name)
          );

          CREATE TABLE IF NOT EXISTS topics(
            id TEXT PRIMARY KEY,
            chapter_id TEXT NOT NULL REFERENCES chapters(id),
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
            target_seconds INTEGER CHECK(target_seconds IS NULL OR target_seconds > 0),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            inactive_at INTEGER,
            UNIQUE(chapter_id, normalized_name)
          );

          CREATE INDEX IF NOT EXISTS chapters_subject_idx ON chapters(subject_id, position);
          CREATE INDEX IF NOT EXISTS topics_chapter_idx ON topics(chapter_id, position);
          CREATE INDEX IF NOT EXISTS outbox_state_idx ON outbox(state);
        `,
      },
    ],
  },
  {
    version: 3,
    name: "0003_session_config",
    checksum: "8a1e50669b3f9dc68512eb4c9bbfd2a6a8b7921a221f7ebf856cf2ebcf4817a0",
    destructive: false,
    statements: [
      {
        sql: `
          ALTER TABLE sessions ADD COLUMN config_json TEXT;
        `,
      },
    ],
  },
  {
    version: 4,
    name: "0004_profile_timer_preference",
    checksum: "060b4602a1b465892782ab48cdd4a01146c95c55d9ac0b6733d2777bd8e318ba",
    destructive: false,
    statements: [
      {
        sql: `ALTER TABLE profiles ADD COLUMN default_timer_mode TEXT NOT NULL DEFAULT 'active' CHECK(default_timer_mode IN ('active','wall'));`,
      },
    ],
  },
  {
    version: 5,
    name: "0005_sync_state_and_outbox_columns",
    checksum: "fc5659a83111cf0ad4eafc1ae341bb1e05b991b7f1c7e943eaa2a8c779b8abcb",
    destructive: false,
    statements: [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS sync_state(
            owner_id TEXT PRIMARY KEY,
            remote_cursor TEXT NOT NULL DEFAULT '0',
            last_pull_at INTEGER,
            last_push_at INTEGER,
            last_error_code TEXT
          );
        `,
      },
      { sql: `ALTER TABLE outbox ADD COLUMN owner_id TEXT;` },
      { sql: `ALTER TABLE outbox ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;` },
      { sql: `ALTER TABLE outbox ADD COLUMN next_attempt_at INTEGER;` },
      { sql: `ALTER TABLE outbox ADD COLUMN last_error_code TEXT;` },
      { sql: `CREATE INDEX IF NOT EXISTS outbox_owner_state_idx ON outbox(owner_id, state, next_attempt_at);` },
    ],
  },
  {
    version: 6,
    name: "0006_media_tables",
    checksum: "c7f9f2184a6a6d8c68205de6490be7abf2cbb6714070808e45beaef0b777a85b",
    destructive: false,
    statements: [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS media_files(
            id TEXT PRIMARY KEY,
            bank_id TEXT,
            sha256 TEXT NOT NULL UNIQUE,
            mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
            bytes INTEGER NOT NULL CHECK(bytes > 0),
            width INTEGER NOT NULL CHECK(width > 0),
            height INTEGER NOT NULL CHECK(height > 0),
            local_path TEXT,
            remote_path TEXT,
            availability TEXT NOT NULL CHECK(availability IN ('local','remote','both','missing')),
            variant TEXT NOT NULL CHECK(variant IN ('original','optimized')),
            created_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS question_media(
            id TEXT PRIMARY KEY,
            question_id TEXT REFERENCES questions(id),
            group_id TEXT REFERENCES question_groups(id),
            media_id TEXT NOT NULL REFERENCES media_files(id),
            role TEXT NOT NULL CHECK(role IN ('content','reference','option')),
            required INTEGER NOT NULL CHECK(required IN (0,1)),
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS question_media_q_idx ON question_media(question_id);
          CREATE INDEX IF NOT EXISTS question_media_g_idx ON question_media(group_id);
          CREATE INDEX IF NOT EXISTS media_files_sha_idx ON media_files(sha256);
        `,
      },
    ],
  },
  {
    version: 7,
    name: "0007_subject_question_count",
    checksum: "32f9f7d7dc6763e4c257e8a78bb1a2979a42763737fa14d1923fb3a127d7bcc4",
    destructive: false,
    statements: [
      {
        sql: `ALTER TABLE subjects ADD COLUMN question_count INTEGER NOT NULL DEFAULT 25;`,
      },
    ],
  },
  {
    version: 8,
    name: "0008_offline_library_and_sync_cache",
    checksum: "c66dfa936c1700dca36418bd8ce6da952260ade1f73646220a7ab03e72a76d98",
    destructive: false,
    statements: [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS offline_subjects(
            owner_id TEXT NOT NULL,
            profile_id TEXT NOT NULL REFERENCES profiles(id),
            subject_id TEXT NOT NULL REFERENCES subjects(id),
            subject_name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','downloading','ready','error')),
            downloaded_questions INTEGER NOT NULL DEFAULT 0,
            downloaded_media INTEGER NOT NULL DEFAULT 0,
            missing_media INTEGER NOT NULL DEFAULT 0,
            remote_cursor TEXT NOT NULL DEFAULT '0',
            last_synced_at INTEGER,
            last_error_code TEXT,
            PRIMARY KEY(owner_id, profile_id, subject_id)
          );

          CREATE TABLE IF NOT EXISTS sync_entity_cache(
            owner_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            payload_hash TEXT NOT NULL,
            observed_at INTEGER NOT NULL,
            PRIMARY KEY(owner_id, entity_type, entity_id)
          );

          CREATE TABLE IF NOT EXISTS sync_conflicts(
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            local_payload_json TEXT,
            remote_payload_json TEXT,
            resolution TEXT NOT NULL CHECK(resolution IN ('remote','local','merged','forked','blocked')),
            created_at INTEGER NOT NULL,
            resolved_at INTEGER
          );

          CREATE INDEX IF NOT EXISTS offline_subjects_owner_idx
            ON offline_subjects(owner_id, enabled, status);
          CREATE INDEX IF NOT EXISTS sync_conflicts_owner_idx
            ON sync_conflicts(owner_id, resolved_at, created_at DESC);
        `,
      },
    ],
  },
  {
    version: 9,
    name: "0009_subject_score_group",
    checksum: "4048c3a1c76d63b102ab9e9ce29cfbf83c0c75f3b41c2136717cc37af641c724",
    destructive: false,
    statements: [
      {
        sql: `ALTER TABLE subjects ADD COLUMN score_group TEXT;`,
      },
    ],
  },
  {
    version: 10,
    name: "0010_incremental_sync_dirty_queue",
    checksum: "794d69f9210acd5f37d5bf78542fc1f9bbc65f2647103246755a67aadac3c28b",
    destructive: false,
    statements: [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS sync_dirty_entities(
            entity_type TEXT NOT NULL CHECK(entity_type IN ('profileBundle','questionBundle','sessionBundle')),
            entity_id TEXT NOT NULL,
            dirtied_at INTEGER NOT NULL,
            PRIMARY KEY(entity_type, entity_id)
          );
          CREATE INDEX IF NOT EXISTS sync_dirty_order_idx ON sync_dirty_entities(dirtied_at, entity_type, entity_id);

          INSERT OR IGNORE INTO sync_dirty_entities(entity_type, entity_id, dirtied_at)
            SELECT 'profileBundle', id, created_at FROM profiles;
          INSERT OR IGNORE INTO sync_dirty_entities(entity_type, entity_id, dirtied_at)
            SELECT 'questionBundle', id, created_at FROM questions;
          INSERT OR IGNORE INTO sync_dirty_entities(entity_type, entity_id, dirtied_at)
            SELECT 'sessionBundle', id, created_at FROM sessions;

          CREATE TRIGGER IF NOT EXISTS sync_dirty_profile_insert AFTER INSERT ON profiles BEGIN
            INSERT INTO sync_dirty_entities VALUES('profileBundle', NEW.id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_profile_update AFTER UPDATE ON profiles BEGIN
            INSERT INTO sync_dirty_entities VALUES('profileBundle', NEW.id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_subject_insert AFTER INSERT ON subjects BEGIN
            INSERT INTO sync_dirty_entities VALUES('profileBundle', NEW.profile_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_subject_update AFTER UPDATE ON subjects BEGIN
            INSERT INTO sync_dirty_entities VALUES('profileBundle', NEW.profile_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_subject_delete AFTER DELETE ON subjects BEGIN
            INSERT INTO sync_dirty_entities VALUES('profileBundle', OLD.profile_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_chapter_insert AFTER INSERT ON chapters BEGIN
            INSERT INTO sync_dirty_entities SELECT 'profileBundle', profile_id, unixepoch('subsec')*1000 FROM subjects WHERE id=NEW.subject_id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_chapter_update AFTER UPDATE ON chapters BEGIN
            INSERT INTO sync_dirty_entities SELECT 'profileBundle', profile_id, unixepoch('subsec')*1000 FROM subjects WHERE id=NEW.subject_id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_topic_insert AFTER INSERT ON topics BEGIN
            INSERT INTO sync_dirty_entities SELECT 'profileBundle', s.profile_id, unixepoch('subsec')*1000
              FROM chapters c JOIN subjects s ON s.id=c.subject_id WHERE c.id=NEW.chapter_id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_topic_update AFTER UPDATE ON topics BEGIN
            INSERT INTO sync_dirty_entities SELECT 'profileBundle', s.profile_id, unixepoch('subsec')*1000
              FROM chapters c JOIN subjects s ON s.id=c.subject_id WHERE c.id=NEW.chapter_id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;

          CREATE TRIGGER IF NOT EXISTS sync_dirty_question_insert AFTER INSERT ON questions BEGIN
            INSERT INTO sync_dirty_entities VALUES('questionBundle', NEW.id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_question_update AFTER UPDATE ON questions BEGIN
            INSERT INTO sync_dirty_entities VALUES('questionBundle', NEW.id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_option_insert AFTER INSERT ON question_options BEGIN
            INSERT INTO sync_dirty_entities VALUES('questionBundle', NEW.question_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_option_update AFTER UPDATE ON question_options BEGIN
            INSERT INTO sync_dirty_entities VALUES('questionBundle', NEW.question_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_revision_insert AFTER INSERT ON question_revisions BEGIN
            INSERT INTO sync_dirty_entities VALUES('questionBundle', NEW.question_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_question_media_insert AFTER INSERT ON question_media BEGIN
            INSERT INTO sync_dirty_entities SELECT 'questionBundle', COALESCE(NEW.question_id,q.id), unixepoch('subsec')*1000
              FROM questions q WHERE q.id=NEW.question_id OR q.group_id=NEW.group_id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_media_update AFTER UPDATE ON media_files BEGIN
            INSERT INTO sync_dirty_entities
              SELECT 'questionBundle', COALESCE(qm.question_id,q.id), unixepoch('subsec')*1000
              FROM question_media qm LEFT JOIN questions q ON q.group_id=qm.group_id WHERE qm.media_id=NEW.id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;

          CREATE TRIGGER IF NOT EXISTS sync_dirty_session_insert AFTER INSERT ON sessions BEGIN
            INSERT INTO sync_dirty_entities VALUES('sessionBundle', NEW.id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_session_update AFTER UPDATE ON sessions BEGIN
            INSERT INTO sync_dirty_entities VALUES('sessionBundle', NEW.id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_session_question_insert AFTER INSERT ON session_questions BEGIN
            INSERT INTO sync_dirty_entities VALUES('sessionBundle', NEW.session_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_session_question_update AFTER UPDATE ON session_questions BEGIN
            INSERT INTO sync_dirty_entities VALUES('sessionBundle', NEW.session_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_attempt_insert AFTER INSERT ON attempts BEGIN
            INSERT INTO sync_dirty_entities VALUES('sessionBundle', NEW.session_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_event_insert AFTER INSERT ON attempt_events BEGIN
            INSERT INTO sync_dirty_entities VALUES('sessionBundle', NEW.session_id, unixepoch('subsec')*1000)
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_review_update AFTER UPDATE ON review_items BEGIN
            INSERT INTO sync_dirty_entities SELECT 'sessionBundle', session_id, unixepoch('subsec')*1000
              FROM attempts WHERE id=NEW.last_attempt_id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
          CREATE TRIGGER IF NOT EXISTS sync_dirty_review_insert AFTER INSERT ON review_items BEGIN
            INSERT INTO sync_dirty_entities SELECT 'sessionBundle', session_id, unixepoch('subsec')*1000
              FROM attempts WHERE id=NEW.last_attempt_id
            ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirtied_at=excluded.dirtied_at;
          END;
        `,
      },
    ],
  },
  {
    version: 11,
    name: "0011_question_reports",
    checksum: "9b380eec4b64827b3f0fa61c1b59d0d116c67f9099d261f0cf42cc77d3486488",
    destructive: false,
    statements: [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS question_reports(
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL REFERENCES questions(id),
            owner_id TEXT NOT NULL REFERENCES owners(id),
            note TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(question_id, owner_id),
            CHECK(note IS NULL OR length(note) <= 1000)
          );
          CREATE INDEX IF NOT EXISTS question_reports_question_idx ON question_reports(question_id, created_at DESC);
        `,
      },
    ],
  },
];

// For backwards-compatibility with direct batch executions
export const migrationStatements: SqlStatement[] = MIGRATIONS.flatMap((m) => m.statements);
