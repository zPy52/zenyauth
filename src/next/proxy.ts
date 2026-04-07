import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { DefaultUser, SessionSnapshot, ZenyAuthOptions } from "../shared/types";
import { normalizeOptions } from "../shared/providers";
import { getCookieNames, verifySessionToken } from "../shared/session";
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

function unauthorized<TUser>(
  req: NextRequest,
  options: ZenyAuthProxyOptions<TUser>
): Response {
  if (wantsHtml(req) && options.pages?.signIn) {
    const url = new URL(options.pages.signIn, req.url);
    url.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return new Response("Unauthorized", { status: 401 });
}

export function withAuth<TUser = DefaultUser>(
  authOptions: ZenyAuthOptions<TUser>,
  handler?: (req: AuthenticatedNextRequest<TUser>) => void | Response | Promise<void | Response>,
  options: ZenyAuthProxyOptions<TUser> = {}
): (req: NextRequest) => Promise<NextResponse | Response> {
  const normalized = normalizeOptions(authOptions);
  const sessionCookie = getCookieNames(normalized.session.cookiePrefix).session;

  return async (req: NextRequest) => {
    const token = req.cookies.get(sessionCookie)?.value;
    const session = await verifySessionToken<TUser>(token, normalized.secret);

    const authReq = req as AuthenticatedNextRequest<TUser>;
    Object.defineProperty(authReq, "auth", {
      value: session,
      configurable: true,
      enumerable: true,
      writable: true
    });

    const decision = options.callbacks?.authorized
      ? await options.callbacks.authorized({ req, session })
      : true;

    if (decision instanceof Response) {
      return decision;
    }

    if (decision === false) {
      return unauthorized(req, options);
    }

    if (handler) {
      const response = await handler(authReq);
      if (response) {
        return response;
      }
    }

    return NextResponse.next();
  };
}
