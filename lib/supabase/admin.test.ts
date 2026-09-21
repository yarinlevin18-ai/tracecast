import { afterEach, describe, expect, it, vi } from "vitest";

describe("getAdminClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws SharingNotConfigured when env is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { getAdminClient, SharingNotConfigured } = await import("./admin");
    expect(() => getAdminClient()).toThrow(SharingNotConfigured);
  });

  it("builds a client when both vars are set", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const { getAdminClient } = await import("./admin");
    const client = getAdminClient();
    expect(typeof client.from).toBe("function");
    expect(typeof client.storage.from).toBe("function");
  });
});
