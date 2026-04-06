import { describe, expect, it } from "vitest";

import { parseAuthAction } from "../../src/shared/routes";

describe("parseAuthAction", () => {
  it("parses sign-in and callback routes", () => {
    expect(parseAuthAction(["signin", "google"])).toEqual({
      kind: "signin",
      providerId: "google"
    });
    expect(parseAuthAction(["callback", "github"])).toEqual({
      kind: "callback",
      providerId: "github"
    });
  });

  it("parses singleton routes", () => {
    expect(parseAuthAction(["signout"])).toEqual({ kind: "signout" });
    expect(parseAuthAction(["session"])).toEqual({ kind: "session" });
    expect(parseAuthAction(["providers"])).toEqual({ kind: "providers" });
    expect(parseAuthAction(["error"])).toEqual({ kind: "error" });
  });

  it("rejects malformed routes", () => {
    expect(parseAuthAction()).toEqual({
      kind: "unknown",
      reason: "Missing auth action."
    });
    expect(parseAuthAction(["signin"])).toEqual({
      kind: "unknown",
      reason: "Missing provider for sign-in."
    });
    expect(parseAuthAction(["session", "extra"])).toEqual({
      kind: "unknown",
      reason: "Session route does not accept extra segments."
    });
  });
});
