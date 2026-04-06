import type { ReactNode } from "react";
import { createElement } from "react";

import { headers } from "next/headers";

import type { DefaultUser, SessionSnapshot, SessionSnapshotJson } from "../shared/types";
import { SESSION_HEADER_NAME, decodeSnapshotHeader } from "../shared/session";

export type SessionProviderProps<TUser = DefaultUser> = {
  children: ReactNode;
  initialSnapshot?: SessionSnapshot<TUser> | SessionSnapshotJson<TUser> | null;
  api?: string;
};

export async function SessionProvider<TUser = DefaultUser>({
  children,
  initialSnapshot,
  api
}: SessionProviderProps<TUser>) {
  const snapshot =
    initialSnapshot !== undefined
      ? initialSnapshot
      : decodeSnapshotHeader<TUser>((await headers()).get(SESSION_HEADER_NAME));

  const { SessionProvider: ReactSessionProvider } = await import("../react");

  return createElement(ReactSessionProvider<TUser>, {
    children,
    initialSnapshot: snapshot,
    api
  });
}
