// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defineAuth } from "../../src";
import { deserializeSnapshot, encodeSnapshotValue } from "../../src/shared/session";
import type { SessionSnapshotJson, SessionState } from "../../src/react";
import { createReactAuth } from "../../src/react";

type TestUser = {
  email: string;
  name: string | undefined;
};

const authConfig = defineAuth({
  secret: "react-test-secret",
  providers: [],
  callbacks: {
    sessionPayload(user) {
      return {
        email: user.email,
        name: user.name
      };
    }
  }
});

const { SessionProvider, useSession } = createReactAuth(authConfig);

function makeSnapshot(email: string): SessionSnapshotJson<TestUser> {
  return {
    user: {
      email,
      name: email.split("@")[0]
    },
    expiryDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    isExpired: false,
    isValid: true
  };
}

describe("client Session", () => {
  beforeEach(async () => {
    document.body.innerHTML = "";
    document.cookie = "za.snapshot=; Max-Age=0; path=/";
    vi.restoreAllMocks();

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<SessionProvider initialSnapshot={null}>{null}</SessionProvider>);
    });
    root.unmount();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.cookie = "za.snapshot=; Max-Age=0; path=/";
  });

  it("hydrates useSession from SessionProvider without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    function Probe() {
      const session = useSession();
      return <div id="value">{session.user?.email ?? "anonymous"}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(
        <SessionProvider initialSnapshot={makeSnapshot("mia@example.com")}>
          <Probe />
        </SessionProvider>
      );
    });

    expect(container.querySelector("#value")?.textContent).toBe("mia@example.com");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hydrates from the readable snapshot cookie when no snapshot prop is passed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    document.cookie = `za.snapshot=${encodeURIComponent(
      encodeSnapshotValue(deserializeSnapshot(makeSnapshot("mia@example.com")))
    )}`;

    function Probe() {
      const session = useSession();
      return <div id="value">{session.user?.email ?? "anonymous"}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(
        <SessionProvider>
          <Probe />
        </SessionProvider>
      );
    });

    expect(container.querySelector("#value")?.textContent).toBe("mia@example.com");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the default invalid snapshot without a provider", async () => {
    function Probe() {
      const session = useSession();
      return <div id="value">{session.user?.email ?? "anonymous"}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(<Probe />);
    });

    expect(container.querySelector("#value")?.textContent).toBe("anonymous");
  });

  it("hydrates the store from the email sign-in response body", async () => {
    let currentSession: SessionState<TestUser> | undefined;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          redirected: false,
          session: makeSnapshot("ada@example.com")
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    function Probe() {
      currentSession = useSession();
      return <div id="value">{currentSession.user?.email ?? "anonymous"}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(
        <SessionProvider initialSnapshot={null}>
          <Probe />
        </SessionProvider>
      );
    });

    await act(async () => {
      await currentSession?.signIn("email", {
        email: "ada@example.com",
        password: "pass123"
      });
    });

    expect(container.querySelector("#value")?.textContent).toBe("ada@example.com");
  });

  it("clears the store immediately on sign-out", async () => {
    let currentSession: SessionState<TestUser> | undefined;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    function Probe() {
      currentSession = useSession();
      return <div id="value">{currentSession.user?.email ?? "anonymous"}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      const root = createRoot(container);
      root.render(
        <SessionProvider initialSnapshot={makeSnapshot("rae@example.com")}>
          <Probe />
        </SessionProvider>
      );
    });

    expect(container.querySelector("#value")?.textContent).toBe("rae@example.com");

    await act(async () => {
      await currentSession?.signOut();
    });

    expect(container.querySelector("#value")?.textContent).toBe("anonymous");
  });
});
