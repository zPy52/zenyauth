import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeSnapshotValue, getCookieNames } from "../../src/shared/session";

const cookiesMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

type TestUser = {
  email: string;
  name: string | undefined;
};

function makeSnapshot(email: string) {
  return {
    user: {
      email,
      name: email.split("@")[0]
    },
    expiryDate: new Date(Date.now() + 60 * 60 * 1000),
    isExpired: false,
    isValid: true
  };
}

describe("next SessionProvider", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
  });

  it("hydrates from the snapshot cookie when no snapshot is passed", async () => {
    const snapshot = makeSnapshot("mia@example.com");
    const cookieNames = getCookieNames("za");

    cookiesMock.mockResolvedValue({
      get(name: string) {
        return name === cookieNames.snapshot ? { value: encodeSnapshotValue<TestUser>(snapshot) } : undefined;
      }
    });

    const nextEntry = await import("../../src/next");
    const element = await nextEntry.SessionProvider<TestUser>({ children: null });

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(element.props.initialSnapshot).toEqual(snapshot);
    expect(element.props.cookiePrefix).toBeUndefined();
  });

  it("treats null as an explicit manual snapshot", async () => {
    cookiesMock.mockImplementation(() => {
      throw new Error("cookies() should not be called for explicit snapshots");
    });

    const nextEntry = await import("../../src/next");
    const element = await nextEntry.SessionProvider<TestUser>({
      children: null,
      initialSnapshot: null
    });

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(element.props.initialSnapshot).toBeNull();
  });

  it("prefers an explicit snapshot over the snapshot cookie", async () => {
    const cookieSnapshot = makeSnapshot("cookie@example.com");
    const explicitSnapshot = makeSnapshot("explicit@example.com");
    const cookieNames = getCookieNames("za");

    cookiesMock.mockResolvedValue({
      get(name: string) {
        return name === cookieNames.snapshot ? { value: encodeSnapshotValue<TestUser>(cookieSnapshot) } : undefined;
      }
    });

    const nextEntry = await import("../../src/next");
    const element = await nextEntry.SessionProvider<TestUser>({
      children: null,
      initialSnapshot: explicitSnapshot
    });

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(element.props.initialSnapshot).toBe(explicitSnapshot);
  });

  it("supports custom cookie prefixes", async () => {
    const snapshot = makeSnapshot("custom@example.com");
    const cookieNames = getCookieNames("custom");

    cookiesMock.mockResolvedValue({
      get(name: string) {
        return name === cookieNames.snapshot ? { value: encodeSnapshotValue<TestUser>(snapshot) } : undefined;
      }
    });

    const nextEntry = await import("../../src/next");
    const element = await nextEntry.SessionProvider<TestUser>({
      children: null,
      cookiePrefix: "custom"
    });

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(element.props.initialSnapshot).toEqual(snapshot);
    expect(element.props.cookiePrefix).toBe("custom");
  });

  it("does not export SessionHydrator anymore", async () => {
    const nextEntry = await import("../../src/next");

    expect(nextEntry.SessionProvider).toBeTypeOf("function");
    expect("SessionHydrator" in nextEntry).toBe(false);
  });
});
