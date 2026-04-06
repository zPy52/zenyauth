import { describe, expect, it } from "vitest";

import { normalizeOptions } from "../../src/shared/providers";
import {
  buildAuthCookies,
  clearAuthCookies,
  createSessionArtifacts,
  deserializeSnapshot,
  serializeSnapshot,
  verifySessionToken
} from "../../src/shared/session";

describe("session helpers", () => {
  type TestUser = {
    email: string;
    name?: string;
  };

  const options = normalizeOptions<TestUser>({
    secret: "test-secret",
    providers: []
  });

  it("creates and verifies a signed session cookie", async () => {
    const { sessionToken } = await createSessionArtifacts<TestUser>(
      { email: "sara@example.com", name: "Sara" },
      "email",
      options,
      "sara@example.com"
    );

    const snapshot = await verifySessionToken<TestUser>(sessionToken, options.secret);
    expect(snapshot.isValid).toBe(true);
    expect(snapshot.user?.email).toBe("sara@example.com");
    expect(deserializeSnapshot(serializeSnapshot(snapshot)).user?.email).toBe("sara@example.com");
  });

  it("invalidates tampered session tokens", async () => {
    const { sessionToken } = await createSessionArtifacts<TestUser>(
      { email: "sam@example.com" },
      "email",
      options,
      "sam@example.com"
    );

    const tampered = `${sessionToken}tampered`;
    const snapshot = await verifySessionToken<TestUser>(tampered, options.secret);
    expect(snapshot.isValid).toBe(false);
    expect(snapshot.user).toBeUndefined();
  });

  it("creates a single HttpOnly auth cookie", async () => {
    const { sessionToken } = await createSessionArtifacts<TestUser>(
      { email: "sara@example.com" },
      "email",
      options,
      "sara@example.com"
    );

    const cookies = buildAuthCookies(sessionToken, options);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).toContain("za.session=");
  });

  it("creates a single clear-cookie header", () => {
    const cleared = clearAuthCookies(options);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toContain("Max-Age=0");
    expect(cleared[0]).toContain("za.session=");
  });
});
