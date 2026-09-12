import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";

describe("Owner and Profile Management", () => {
  async function setup() {
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);
    return db;
  }

  it("creates and updates owner (username) properly", async () => {
    const db = await setup();

    // 1. Initial creation
    const ownerId = crypto.randomUUID();
    const now = Date.now();
    await db.execute(
      "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
      [ownerId, "local", null, "سهراب", "local-ns-1", now, now]
    );

    const owners = await db.query<{ id: string; display_name: string; kind: string; auth_user_id: string | null }>(
      "SELECT id, display_name, kind, auth_user_id FROM owners WHERE inactive_at IS NULL"
    );
    expect(owners.length).toBe(1);
    expect(owners[0].display_name).toBe("سهراب");
    expect(owners[0].kind).toBe("local");

    // 2. Link Google Account
    await db.execute(
      "UPDATE owners SET display_name=?, kind=?, auth_user_id=?, updated_at=? WHERE id=?",
      ["سهراب سپهری", "account", "google-sub-12345", Date.now(), ownerId]
    );

    const updated = await db.query<{ id: string; display_name: string; kind: string; auth_user_id: string | null }>(
      "SELECT id, display_name, kind, auth_user_id FROM owners WHERE id=?",
      [ownerId]
    );
    expect(updated[0].display_name).toBe("سهراب سپهری");
    expect(updated[0].kind).toBe("account");
    expect(updated[0].auth_user_id).toBe("google-sub-12345");
  });

  it("creates profile, adds subjects, updates target percentages, and deletes subjects", async () => {
    const db = await setup();
    const profileId = crypto.randomUUID();
    const now = Date.now();

    // Create profile
    await db.execute(
      "INSERT INTO profiles(id, name, target_track, created_at) VALUES(?,?,?,?)",
      [profileId, "کنکور تجربی", "پزشکی", now]
    );

    // Add multiple subjects with target percentage
    const subj1Id = crypto.randomUUID();
    const subj2Id = crypto.randomUUID();
    await db.batch([
      {
        sql: "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, created_at) VALUES(?,?,?,?,?,?)",
        bind: [subj1Id, profileId, "زیست‌شناسی", 1, 80, now],
      },
      {
        sql: "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, created_at) VALUES(?,?,?,?,?,?)",
        bind: [subj2Id, profileId, "شیمی", 1, 70, now],
      },
    ]);

    const subjects = await db.query<{ id: string; name: string; target_percentage: number }>(
      "SELECT id, name, target_percentage FROM subjects WHERE profile_id=? ORDER BY created_at ASC",
      [profileId]
    );
    expect(subjects.length).toBe(2);
    expect(subjects[0].name).toBe("زیست‌شناسی");
    expect(subjects[0].target_percentage).toBe(80);

    // Update target percentage of chemistry to 75%
    await db.execute(
      "UPDATE subjects SET target_percentage=? WHERE id=?",
      [75, subj2Id]
    );
    const updatedSubj = await db.query<{ target_percentage: number }>(
      "SELECT target_percentage FROM subjects WHERE id=?",
      [subj2Id]
    );
    expect(updatedSubj[0].target_percentage).toBe(75);

    // Delete a subject
    await db.execute("DELETE FROM subjects WHERE id=?", [subj1Id]);
    const remaining = await db.query<{ id: string }>("SELECT id FROM subjects WHERE profile_id=?", [profileId]);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(subj2Id);
  });

  it("links and unlinks Google Account using AppDatabase api", async () => {
    const rawDb = await setup();
    const { AppDatabase } = await import("@/database/app-database");
    const appDb = new AppDatabase(rawDb);

    // Initial local owner
    await appDb.saveOwner("کاربر محلی", "local");
    let owner = await appDb.getCurrentOwner();
    expect(owner?.displayName).toBe("کاربر محلی");
    expect(owner?.kind).toBe("local");
    expect(owner?.authUserId).toBeNull();

    // Link authenticated account using an immutable Supabase Auth UUID
    const authUserId = "11111111-1111-4111-8111-111111111111";
    const linked = await appDb.linkAuthenticatedAccount(authUserId, "علی رضایی");
    expect(linked.displayName).toBe("علی رضایی");
    expect(linked.authUserId).toBe(authUserId);

    owner = await appDb.getCurrentOwner();
    expect(owner?.kind).toBe("account");
    expect(owner?.authUserId).toBe(authUserId);
    expect(owner?.displayName).toBe("علی رضایی");

    // Unlink Google Account back to local
    await appDb.unlinkGoogleAccount();
    owner = await appDb.getCurrentOwner();
    expect(owner?.kind).toBe("local");
    expect(owner?.authUserId).toBeNull();
    expect(owner?.displayName).toBe("علی رضایی");
  });

  it("updates subject question count and target percentage via AppDatabase api", async () => {
    const rawDb = await setup();
    const { AppDatabase } = await import("@/database/app-database");
    const appDb = new AppDatabase(rawDb);

    await appDb.createProfile({
      name: "کنکور ریاضی",
      targetTrack: "مهندسی کامپیوتر",
      subjects: [{ name: "حسابان", coefficient: 4, targetPercentage: 70, questionCount: 25 }],
    });

    let profiles = await appDb.listProfiles();
    expect(profiles[0].subjects[0].questionCount).toBe(25);
    expect(profiles[0].subjects[0].targetPercentage).toBe(70);

    const subjId = profiles[0].subjects[0].id;
    await appDb.updateProfileSubject(subjId, { questionCount: 30, targetPercentage: 85 });

    profiles = await appDb.listProfiles();
    expect(profiles[0].subjects[0].questionCount).toBe(30);
    expect(profiles[0].subjects[0].targetPercentage).toBe(85);
  });
});
