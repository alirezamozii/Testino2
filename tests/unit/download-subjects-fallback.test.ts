import { describe, expect, it, vi } from "vitest";
import { SupabaseTransport } from "@/sync/supabase-transport";
import * as supabaseClientModule from "@/platform/auth/supabase-client";

describe("SupabaseTransport downloadSubjects fallback", () => {
  it("falls back to querying change_log directly when download_subject_content RPC fails", async () => {
    const mockRpc = vi.fn().mockRejectedValue(new Error("Could not find the function public.download_subject_content in schema cache"));

    const mockQueryBuilder: Record<string, unknown> = {};
    mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.gt = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.filter = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.order = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.limit = vi.fn().mockResolvedValue({
      data: [
        {
          change_seq: 101,
          entity_type: "questionBundle",
          entity_id: "q-101",
          server_version: 1,
          is_tombstone: false,
          payload: {
            question: { id: "q-101", subject: "مدیریت بازاریابی", content_json: "[]" },
            options: [],
            revisions: [],
          },
          created_at: "2026-09-23T00:00:00Z",
        },
      ],
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue(mockQueryBuilder);
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    const fakeClient = {
      rpc: mockRpc,
      from: mockFrom,
    } as unknown as ReturnType<typeof supabaseClientModule.getSupabaseClient>;

    vi.spyOn(supabaseClientModule, "getSupabaseClient").mockReturnValue(fakeClient);
    vi.spyOn(supabaseClientModule, "getSupabaseConfig").mockReturnValue({
      url: "https://example.supabase.co",
      anonKey: "fake-key",
      isConfigured: true,
    });

    const transport = new SupabaseTransport();
    const result = await transport.downloadSubjects(["مدیریت بازاریابی"], "0", 50);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("change_log");
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith("entity_type", "questionBundle");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].entityId).toBe("q-101");
    expect(result.nextCursor).toBe("101");
  });
});
