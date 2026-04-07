import type {
  AuthFlowPayload,
  NormalizedZenyAuthOptions,
  SessionPayload,
  SessionSnapshotJson,
  SessionSnapshot
} from "./types";
import { expireCookie, serializeCookie } from "./cookies";
import { signToken, verifyToken } from "./tokens";
import { createInvalidSnapshot, nowInSeconds, toExpiryDate } from "./utils";

export function getCookieNames(prefix: string): {
  session: string;
  snapshot: string;
  flow: (providerId: string) => string;
} {
  return {
    session: `${prefix}.session`,
    snapshot: `${prefix}.snapshot`,
    flow: (providerId: string) => `${prefix}.flow.${providerId}`
  };
}

export function snapshotFromPayload<TUser>(payload?: SessionPayload<TUser> | null): SessionSnapshot<TUser> {
  if (!payload) {
    return createInvalidSnapshot<TUser>();
  }

  const expiryDate = toExpiryDate(payload.exp);
  const isExpired = payload.exp <= nowInSeconds();
  return {
    user: isExpired ? undefined : payload.user,
    expiryDate,
    isExpired,
    isValid: !isExpired && payload.user != null
  };
}

export function serializeSnapshot<TUser>(snapshot: SessionSnapshot<TUser>): SessionSnapshotJson<TUser> {
  return {
    user: snapshot.user,
    expiryDate: snapshot.expiryDate?.toISOString(),
    isExpired: snapshot.isExpired,
    isValid: snapshot.isValid
  };
}

export function deserializeSnapshot<TUser>(snapshot?: SessionSnapshotJson<TUser> | null): SessionSnapshot<TUser> {
  if (!snapshot) {
    return createInvalidSnapshot<TUser>();
  }

  return {
    user: snapshot.user,
    expiryDate: snapshot.expiryDate ? new Date(snapshot.expiryDate) : undefined,
    isExpired: snapshot.isExpired,
    isValid: snapshot.isValid
  };
}

export function encodeSnapshotValue<TUser>(snapshot: SessionSnapshot<TUser>): string {
  return Buffer.from(JSON.stringify(serializeSnapshot(snapshot)), "utf8").toString("base64url");
}

export function decodeSnapshotValue<TUser>(value: string | null | undefined): SessionSnapshot<TUser> {
  if (!value) {
    return createInvalidSnapshot<TUser>();
  }

  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    return deserializeSnapshot(JSON.parse(json) as SessionSnapshotJson<TUser>);
  } catch {
    return createInvalidSnapshot<TUser>();
  }
}

function resolveSnapshotCookieMaxAge<TUser>(
  snapshot: SessionSnapshot<TUser>,
  options: NormalizedZenyAuthOptions<TUser>
): number {
  if (!snapshot.expiryDate) {
    return options.session.maxAge;
  }

  return Math.max(0, Math.ceil((snapshot.expiryDate.getTime() - Date.now()) / 1000));
}

export function buildSnapshotCookie<TUser>(
  snapshot: SessionSnapshot<TUser>,
  options: NormalizedZenyAuthOptions<TUser>
): string {
  const names = getCookieNames(options.session.cookiePrefix);

  return serializeCookie(names.snapshot, encodeSnapshotValue(snapshot), {
    maxAge: resolveSnapshotCookieMaxAge(snapshot, options),
    path: "/",
    sameSite: options.session.sameSite,
    secure: options.session.secure
  });
}

export async function createSessionArtifacts<TUser>(
  user: TUser,
  providerId: string,
  options: NormalizedZenyAuthOptions<TUser>,
  subject: string
): Promise<{
  sessionToken: string;
  sessionPayload: SessionPayload<TUser>;
}> {
  const iat = nowInSeconds();
  const exp = iat + options.session.maxAge;
  const sessionPayload: SessionPayload<TUser> = {
    sub: subject,
    provider: providerId,
    user,
    iat,
    exp
  };

  const sessionToken = await signToken(sessionPayload as Record<string, unknown>, options.secret);

  return {
    sessionToken,
    sessionPayload
  };
}

export async function verifySessionToken<TUser>(sessionToken: string | undefined, secret: string): Promise<SessionSnapshot<TUser>> {
  if (!sessionToken) {
    return createInvalidSnapshot<TUser>();
  }

  const sessionPayload = await verifyToken<SessionPayload<TUser>>(sessionToken, secret);
  if (!sessionPayload) {
    return createInvalidSnapshot<TUser>();
  }

  return snapshotFromPayload(sessionPayload);
}

export function buildAuthCookies<TUser>(
  sessionToken: string,
  snapshot: SessionSnapshot<TUser>,
  options: NormalizedZenyAuthOptions<TUser>
): string[] {
  const names = getCookieNames(options.session.cookiePrefix);
  return [
    serializeCookie(names.session, sessionToken, {
      httpOnly: true,
      maxAge: options.session.maxAge,
      path: "/",
      sameSite: options.session.sameSite,
      secure: options.session.secure
    }),
    buildSnapshotCookie(snapshot, options)
  ];
}

export function clearSnapshotCookie<TUser>(options: NormalizedZenyAuthOptions<TUser>): string {
  const names = getCookieNames(options.session.cookiePrefix);

  return expireCookie(names.snapshot, {
    path: "/",
    sameSite: options.session.sameSite,
    secure: options.session.secure
  });
}

export function clearAuthCookies<TUser>(options: NormalizedZenyAuthOptions<TUser>): string[] {
  const names = getCookieNames(options.session.cookiePrefix);
  return [
    expireCookie(names.session, {
      httpOnly: true,
      path: "/",
      sameSite: options.session.sameSite,
      secure: options.session.secure
    }),
    clearSnapshotCookie(options)
  ];
}

export async function createFlowCookie<TUser>(
  providerId: string,
  payload: Omit<AuthFlowPayload, "exp" | "iat">,
  options: NormalizedZenyAuthOptions<TUser>
): Promise<string> {
  const iat = nowInSeconds();
  const exp = iat + 60 * 10;
  const token = await signToken(
    {
      ...payload,
      iat,
      exp
    },
    options.secret
  );

  return serializeCookie(getCookieNames(options.session.cookiePrefix).flow(providerId), token, {
    httpOnly: true,
    maxAge: exp - iat,
    path: "/",
    sameSite: options.session.sameSite,
    secure: options.session.secure
  });
}

export async function readFlowToken<TUser>(
  providerId: string,
  cookieValue: string | undefined,
  options: NormalizedZenyAuthOptions<TUser>
): Promise<AuthFlowPayload | null> {
  if (!cookieValue) {
    return null;
  }

  const payload = await verifyToken<AuthFlowPayload>(cookieValue, options.secret);
  if (!payload || payload.provider !== providerId || payload.exp <= nowInSeconds()) {
    return null;
  }

  return payload;
}

export function clearFlowCookie<TUser>(providerId: string, options: NormalizedZenyAuthOptions<TUser>): string {
  return expireCookie(getCookieNames(options.session.cookiePrefix).flow(providerId), {
    path: "/",
    sameSite: options.session.sameSite,
    secure: options.session.secure
  });
}
