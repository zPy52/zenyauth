import { cookies } from "next/headers";

import type { DefaultUser, SessionSnapshot, ZenyAuthOptions } from "../shared/types";
import { normalizeOptions } from "../shared/providers";
import { getCookieNames, verifySessionToken } from "../shared/session";

export class Session {
  static async read<TUser = DefaultUser>(options: ZenyAuthOptions<TUser>): Promise<SessionSnapshot<TUser>> {
    const normalized = normalizeOptions(options);
    const store = await cookies();
    const names = getCookieNames(normalized.session.cookiePrefix);

    return verifySessionToken<TUser>(store.get(names.session)?.value, normalized.secret);
  }

  static async user<TUser = DefaultUser>(options: ZenyAuthOptions<TUser>): Promise<TUser | undefined> {
    return (await Session.read(options)).user;
  }

  static async expiryDate<TUser = DefaultUser>(options: ZenyAuthOptions<TUser>): Promise<Date | undefined> {
    return (await Session.read(options)).expiryDate;
  }

  static async isExpired<TUser = DefaultUser>(options: ZenyAuthOptions<TUser>): Promise<boolean> {
    return (await Session.read(options)).isExpired;
  }

  static async isValid<TUser = DefaultUser>(options: ZenyAuthOptions<TUser>): Promise<boolean> {
    return (await Session.read(options)).isValid;
  }
}
