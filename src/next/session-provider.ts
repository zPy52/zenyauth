import type { ReactNode } from "react";
import { createElement } from "react";

import { cookies } from "next/headers";

import type { DefaultUser, SessionSnapshot, SessionSnapshotJson } from "../shared/types";
import { decodeSnapshotValue, getCookieNames } from "../shared/session";
import { DEFAULT_COOKIE_PREFIX } from "../shared/utils";

export type SessionProviderProps<TUser = DefaultUser> = {
  children: ReactNode;
  initialSnapshot?: SessionSnapshot<TUser> | SessionSnapshotJson<TUser> | null;
  api?: string;
  cookiePrefix?: string;
};

export async function SessionProvider<TUser = DefaultUser>({
  children,
  initialSnapshot,
  api,
  cookiePrefix
}: SessionProviderProps<TUser>) {
  const snapshot =
    initialSnapshot !== undefined
      ? initialSnapshot
      : decodeSnapshotValue<TUser>(
          (await cookies()).get(getCookieNames(cookiePrefix ?? DEFAULT_COOKIE_PREFIX).snapshot)?.value
        );

  const { SessionProvider: ReactSessionProvider } = await import("../react");

  return createElement(ReactSessionProvider<TUser>, {
    children,
    initialSnapshot: snapshot,
    api,
    cookiePrefix
  });
}
