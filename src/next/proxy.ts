import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { DefaultUser, SessionSnapshot, ZenyAuthOptions } from "../shared/types";
import { normalizeOptions } from "../shared/providers";
import {
  SESSION_HEADER_NAME,
  buildSnapshotCookie,
  clearAuthCookies,
  clearSnapshotCookie,
  encodeSnapshotHeader,
  getCookieNames,
  verifySessionToken
} from "../shared/session";
import { wantsHtml } from "../shared/utils";

export type AuthenticatedNextRequest<TUser = DefaultUser> = NextRequest & {
  auth: SessionSnapshot<TUser>;
};

export type AuthorizedCallbackContext<TUser = DefaultUser> = {
  req: NextRequest;
  session: SessionSnapshot<TUser>;
};

export type ZenyAuthProxyOptions<TUser = DefaultUser> = {
  pages?: {
    signIn?: string;
    error?: string;
  };
  callbacks?: {
    authorized?: (
      context: AuthorizedCallbackContext<TUser>
    ) => boolean | Response | Promise<boolean | Response>;
  };
};

function applySetCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
}

function withSnapshotHeader<TUser>(req: NextRequest, snapshot: SessionSnapshot<TUser>): Headers {
  const headers = new Headers(req.headers);
  headers.set(SESSION_HEADER_NAME, encodeSnapshotHeader(snapshot));
  return headers;
}

function createPassThroughResponse(headers: Headers): NextResponse {
  return NextResponse.next({
    request: {
      headers
    }
  });
}

function createUnauthorizedResponse<TUser>(
  req: NextRequest,
  options: ZenyAuthProxyOptions<TUser>,
  responseCookies: string[]
): Response {
  if (wantsHtml(req) && options.pages?.signIn) {
    const url = new URL(options.pages.signIn, req.url);
    url.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    const response = NextResponse.redirect(url);
    applySetCookies(response.headers, responseCookies);
    return response;
  }

  const response = new Response("Unauthorized", { status: 401 });
  applySetCookies(response.headers, responseCookies);
  return response;
}

function attachCookies(response: Response, responseCookies: string[]): Response {
  applySetCookies(response.headers, responseCookies);
  return response;
}

export function withAuth<TUser = DefaultUser>(
  authOptions: ZenyAuthOptions<TUser>,
  handler?: (req: AuthenticatedNextRequest<TUser>) => void | Response | Promise<void | Response>,
  options: ZenyAuthProxyOptions<TUser> = {}
): (req: NextRequest) => Promise<NextResponse | Response> {
  const normalized = normalizeOptions(authOptions);
  const cookieNames = getCookieNames(normalized.session.cookiePrefix);

  return async (req: NextRequest) => {
    const sessionToken = req.cookies.get(cookieNames.session)?.value;
    const snapshotCookie = req.cookies.get(cookieNames.snapshot)?.value;
    const session = await verifySessionToken<TUser>(sessionToken, normalized.secret);
    const responseCookies = session.isValid
      ? [buildSnapshotCookie(session, normalized)]
      : sessionToken
        ? clearAuthCookies(normalized)
        : snapshotCookie
          ? [clearSnapshotCookie(normalized)]
          : [];
    const requestHeaders = withSnapshotHeader(req, session);

    const decision = options.callbacks?.authorized
      ? await options.callbacks.authorized({ req, session })
      : true;

    if (decision instanceof Response) {
      return attachCookies(decision, responseCookies);
    }

    if (decision === false) {
      return createUnauthorizedResponse(req, options, responseCookies);
    }

    const authReq = req as AuthenticatedNextRequest<TUser>;
    Object.defineProperty(authReq, "auth", {
      value: session,
      configurable: true,
      enumerable: true,
      writable: true
    });

    if (!handler) {
      const response = createPassThroughResponse(requestHeaders);
      applySetCookies(response.headers, responseCookies);
      return response;
    }

    const response = await handler(authReq);
    if (response) {
      return attachCookies(response, responseCookies);
    }

    const nextResponse = createPassThroughResponse(requestHeaders);
    applySetCookies(nextResponse.headers, responseCookies);
    return nextResponse;
  };
}
