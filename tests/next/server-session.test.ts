import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeOptions } from "../../src/shared/providers";
import { createSessionArtifacts, getCookieNames } from "../../src/shared/session";

const cookiesMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

describe("server Session", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
  });

  it("reads the current request cookies through next/headers", async () => {
    type TestUser = {
      email: string;
    };

    const options = normalizeOptions<TestUser>({
      secret: "server-secret",
      providers: []
    });
    const { sessionToken } = await createSessionArtifacts<TestUser>(
      { email: "rae@example.com" },
      "email",
      options,
      "rae@example.com"
    );
    const cookieNames = getCookieNames(options.session.cookiePrefix);

    cookiesMock.mockResolvedValue({
      get(name: string) {
        if (name === cookieNames.session) {
          return { value: sessionToken };
        }

        return undefined;
      }
    });

    const { Session } = await import("../../src/next/server-session");
    const snapshot = await Session.read<TestUser>(options);

    expect(snapshot.isValid).toBe(true);
    expect(snapshot.user?.email).toBe("rae@example.com");
    await expect(Session.isValid(options)).resolves.toBe(true);
  });
});
