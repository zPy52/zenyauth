import { beforeEach, describe, expect, it, vi } from "vitest";

import { defineAuth } from "../../src";
import { createNextAuth } from "../../src/next";
import { encodeSnapshotValue, getCookieNames } from "../../src/shared/session";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

describe("createNextAuth SessionProvider", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
  });

  it("uses the auth cookie prefix when hydrating from the snapshot cookie", async () => {
    const auth = defineAuth({
      secret: "factory-session-provider-secret",
      providers: [],
      session: {
        cookiePrefix: "custom"
      },
      callbacks: {
        sessionPayload(user) {
          return {
            email: user.email,
            role: user.role as "admin" | "member" | undefined
          };
        }
      }
    });

    const cookieNames = getCookieNames("custom");
    const snapshot = {
      user: {
        email: "mia@example.com",
        role: "admin" as const
      },
      expiryDate: new Date(Date.now() + 60 * 60 * 1000),
      isExpired: false,
      isValid: true
    };

    cookiesMock.mockResolvedValue({
      get(name: string) {
        return name === cookieNames.snapshot ? { value: encodeSnapshotValue(snapshot) } : undefined;
      }
    });

    const nextAuth = createNextAuth(auth);
    const element = await nextAuth.SessionProvider({ children: null });

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(element.props.cookiePrefix).toBe("custom");
    expect(element.props.initialSnapshot).toEqual(snapshot);
  });
});
