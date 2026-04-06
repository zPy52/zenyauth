import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_HEADER_NAME, encodeSnapshotHeader } from "../../src/shared/session";

const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
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
    headersMock.mockReset();
  });

  it("hydrates from the request header when no snapshot is passed", async () => {
    const snapshot = makeSnapshot("mia@example.com");

    headersMock.mockResolvedValue({
      get(name: string) {
        return name === SESSION_HEADER_NAME ? encodeSnapshotHeader<TestUser>(snapshot) : null;
      }
    });

    const nextEntry = await import("../../src/next");
    const element = await nextEntry.SessionProvider<TestUser>({ children: null });

    expect(headersMock).toHaveBeenCalledTimes(1);
    expect(element.props.initialSnapshot).toEqual(snapshot);
  });

  it("treats null as an explicit manual snapshot", async () => {
    headersMock.mockImplementation(() => {
      throw new Error("headers() should not be called for explicit snapshots");
    });

    const nextEntry = await import("../../src/next");
    const element = await nextEntry.SessionProvider<TestUser>({
      children: null,
      initialSnapshot: null
    });

    expect(headersMock).not.toHaveBeenCalled();
    expect(element.props.initialSnapshot).toBeNull();
  });

  it("prefers an explicit snapshot over the request header", async () => {
    const headerSnapshot = makeSnapshot("header@example.com");
    const explicitSnapshot = makeSnapshot("explicit@example.com");

    headersMock.mockResolvedValue({
      get(name: string) {
        return name === SESSION_HEADER_NAME ? encodeSnapshotHeader<TestUser>(headerSnapshot) : null;
      }
    });

    const nextEntry = await import("../../src/next");
    const element = await nextEntry.SessionProvider<TestUser>({
      children: null,
      initialSnapshot: explicitSnapshot
    });

    expect(headersMock).not.toHaveBeenCalled();
    expect(element.props.initialSnapshot).toBe(explicitSnapshot);
  });

  it("does not export SessionHydrator anymore", async () => {
    const nextEntry = await import("../../src/next");

    expect(nextEntry.SessionProvider).toBeTypeOf("function");
    expect("SessionHydrator" in nextEntry).toBe(false);
  });
});
