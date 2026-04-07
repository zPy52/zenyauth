import type {
  DefaultUser,
  EmailProvider,
  NormalizedZenyAuthOptions,
  OAuthProvider,
  ProviderUserPayload,
  SessionSnapshot,
  ZenyAuthOptions
} from "../shared/types";
import { parseCookieHeader } from "../shared/cookies";
import { beginOAuthSignIn, exchangeOAuthCode, fetchOAuthProfile, readCallbackParams, unwrapOAuthError } from "../shared/oauth";
import { getProviderById, isEmailProvider, isOAuthProvider, normalizeOptions } from "../shared/providers";
import { parseAuthAction } from "../shared/routes";
import {
  buildAuthCookies,
  buildSnapshotCookie,
  clearAuthCookies,
  clearFlowCookie,
  createFlowCookie,
  createSessionArtifacts,
  getCookieNames,
  readFlowToken,
  serializeSnapshot,
  verifySessionToken
} from "../shared/session";
import {
  asError,
  jsonResponse,
  parseJsonBody,
  redirectResponse,
  resolveRequestOrigin,
  toFormRecord,
  wantsHtml
} from "../shared/utils";

type RouteContext = {
  params?: Promise<{ zenyauth?: string[] }> | { zenyauth?: string[] };
};

function applySetCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
}

function errorResponse<TUser>(
  req: Request,
  options: NormalizedZenyAuthOptions<TUser>,
  error: string,
  init?: ResponseInit & { cookies?: string[] }
): Response {
  if (options.pages?.error && wantsHtml(req)) {
    const url = new URL(options.pages.error, resolveRequestOrigin(req));
    url.searchParams.set("error", error);
    const headers = new Headers(init?.headers);
    applySetCookies(headers, init?.cookies ?? []);
    return redirectResponse(url.toString(), {
      ...init,
      headers
    });
  }

  const headers = new Headers(init?.headers);
  applySetCookies(headers, init?.cookies ?? []);
  return jsonResponse({ error }, {
    ...init,
    status: init?.status ?? 400,
    headers
  });
}

function sanitizeCallbackUrl(req: Request, callbackUrl: unknown): string {
  if (typeof callbackUrl !== "string" || !callbackUrl.trim()) {
    return "/";
  }

  try {
    const url = new URL(callbackUrl, resolveRequestOrigin(req));
    if (url.origin !== resolveRequestOrigin(req)) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

async function readRequestPayload(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET") {
    return Object.fromEntries(new URL(req.url).searchParams.entries());
  }

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return parseJsonBody(await req.text());
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    return toFormRecord(await req.formData());
  }

  return {};
}

async function mapSessionUser<TUser>(
  options: NormalizedZenyAuthOptions<TUser>,
  payload: ProviderUserPayload
): Promise<TUser> {
  if (options.callbacks?.sessionPayload) {
    return options.callbacks.sessionPayload(payload);
  }

  return payload as TUser;
}

async function runSignInCallback<TUser>(
  req: Request,
  options: NormalizedZenyAuthOptions<TUser>,
  providerId: string,
  user: ProviderUserPayload
): Promise<void> {
  await options.callbacks?.signIn?.({
    req,
    provider: providerId,
    user
  });
}

async function buildSuccessSessionResponse<TUser>(
  req: Request,
  options: NormalizedZenyAuthOptions<TUser>,
  providerId: string,
  payload: ProviderUserPayload,
  init?: {
    redirectTo?: string;
    extraCookies?: string[];
    body?: Record<string, unknown>;
  }
): Promise<Response> {
  await runSignInCallback(req, options, providerId, payload);
  const user = await mapSessionUser(options, payload);
  const subject = payload.id ?? payload.email;
  const { sessionToken, sessionPayload } = await createSessionArtifacts(
    user,
    providerId,
    options,
    subject
  );
  const snapshot = {
    user: sessionPayload.user,
    expiryDate: new Date(sessionPayload.exp * 1000),
    isExpired: false,
    isValid: true
  };

  const headers = new Headers();
  applySetCookies(headers, buildAuthCookies(sessionToken, snapshot, options));
  applySetCookies(headers, init?.extraCookies ?? []);

  if (init?.redirectTo) {
    return redirectResponse(init.redirectTo, { headers });
  }

  return jsonResponse(
    {
      ok: true,
      redirected: false,
      session: serializeSnapshot(snapshot)
    },
    { headers }
  );
}

async function handleOAuthSignIn<TUser>(
  req: Request,
  provider: OAuthProvider<TUser>,
  options: NormalizedZenyAuthOptions<TUser>
): Promise<Response> {
  const payload = await readRequestPayload(req);
  const callbackUrl = sanitizeCallbackUrl(req, payload.callbackUrl);
  const { authorizationUrl, state, codeVerifier } = await beginOAuthSignIn(req, provider, options, callbackUrl);
  const flowCookie = await createFlowCookie(
    provider.id,
    {
      provider: provider.id,
      state,
      callbackUrl,
      codeVerifier
    },
    options
  );

  const headers = new Headers();
  headers.append("set-cookie", flowCookie);
  return redirectResponse(authorizationUrl, { headers });
}

async function handleEmailSignIn<TUser>(
  req: Request,
  provider: EmailProvider<TUser>,
  options: NormalizedZenyAuthOptions<TUser>
): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse(req, options, "Email sign-in only accepts POST requests.", { status: 405 });
  }

  const payload = await readRequestPayload(req);
  const user = await provider.authorize(payload, req);
  if (!user) {
    return errorResponse(req, options, "Invalid email credentials.", { status: 401 });
  }

  return buildSuccessSessionResponse(req, options, provider.id, user);
}

async function handleOAuthCallback<TUser>(
  req: Request,
  provider: OAuthProvider<TUser>,
  options: NormalizedZenyAuthOptions<TUser>
): Promise<Response> {
  const cookieNames = getCookieNames(options.session.cookiePrefix);
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const flowCookieValue = cookies[cookieNames.flow(provider.id)];
  const flow = await readFlowToken(provider.id, flowCookieValue, options);
  const extraCookies = [clearFlowCookie(provider.id, options)];

  if (!flow) {
    return errorResponse(req, options, "Missing or invalid auth flow cookie.", {
      status: 400,
      cookies: extraCookies
    });
  }

  const callbackParams = await readCallbackParams(req);
  if (typeof callbackParams.error === "string" && callbackParams.error) {
    return errorResponse(req, options, callbackParams.error, {
      status: 400,
      cookies: extraCookies
    });
  }

  if (typeof callbackParams.code !== "string" || !callbackParams.code) {
    return errorResponse(req, options, "Missing OAuth code.", {
      status: 400,
      cookies: extraCookies
    });
  }

  if (callbackParams.state !== flow.state) {
    return errorResponse(req, options, "Invalid OAuth state.", {
      status: 400,
      cookies: [...extraCookies, ...clearAuthCookies(options)]
    });
  }

  try {
    const tokens = await exchangeOAuthCode(req, provider, options, callbackParams.code, flow.codeVerifier);
    const user = await fetchOAuthProfile(provider, tokens);
    try {
      return await buildSuccessSessionResponse(req, options, provider.id, user, {
        redirectTo: flow.callbackUrl || "/",
        extraCookies
      });
    } catch (error) {
      return errorResponse(req, options, asError(error).message, {
        status: 500,
        cookies: [...extraCookies, ...clearAuthCookies(options)]
      });
    }
  } catch (error) {
    return errorResponse(req, options, unwrapOAuthError(error), {
      status: 400,
      cookies: [...extraCookies, ...clearAuthCookies(options)]
    });
  }
}

async function handleProviders<TUser>(options: NormalizedZenyAuthOptions<TUser>): Promise<Response> {
  return jsonResponse({
    providers: options.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type
    }))
  });
}

async function handleSession<TUser>(
  req: Request,
  options: NormalizedZenyAuthOptions<TUser>
): Promise<Response> {
  const names = getCookieNames(options.session.cookiePrefix);
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const snapshot = await verifySessionToken<TUser>(cookies[names.session], options.secret);
  const headers = new Headers();

  if (snapshot.isValid) {
    headers.append("set-cookie", buildSnapshotCookie(snapshot, options));
  } else if (cookies[names.session] || cookies[names.snapshot]) {
    applySetCookies(headers, clearAuthCookies(options));
  }

  return jsonResponse(serializeSnapshot(snapshot), { headers });
}

async function handleSignOut<TUser>(req: Request, options: NormalizedZenyAuthOptions<TUser>): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse(req, options, "Sign-out only accepts POST requests.", { status: 405 });
  }

  const payload = await readRequestPayload(req);
  const callbackUrl = sanitizeCallbackUrl(req, payload.callbackUrl);
  const headers = new Headers();
  applySetCookies(headers, clearAuthCookies(options));

  if (payload.redirect === true || (typeof payload.callbackUrl === "string" && wantsHtml(req))) {
    return redirectResponse(callbackUrl, { headers });
  }

  return jsonResponse({ ok: true }, { headers });
}

async function resolveSegments(context: RouteContext): Promise<string[] | undefined> {
  const params = context.params ? await context.params : undefined;
  const value = params?.zenyauth;
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

async function handleAuthRequest<TUser>(
  req: Request,
  context: RouteContext,
  options: NormalizedZenyAuthOptions<TUser>
): Promise<Response> {
  const action = parseAuthAction(await resolveSegments(context));

  if (action.kind === "unknown") {
    return errorResponse(req, options, action.reason, { status: 404 });
  }

  switch (action.kind) {
    case "providers":
      return handleProviders(options);
    case "session":
      return handleSession(req, options);
    case "error":
      return errorResponse(req, options, new URL(req.url).searchParams.get("error") || "Unknown auth error.");
    case "signout":
      return handleSignOut(req, options);
    case "signin": {
      const provider = getProviderById(options, action.providerId);
      if (!provider) {
        return errorResponse(req, options, `Unknown provider "${action.providerId}".`, { status: 404 });
      }
      if (isOAuthProvider(provider)) {
        return handleOAuthSignIn(req, provider, options);
      }
      if (isEmailProvider(provider)) {
        return handleEmailSignIn(req, provider, options);
      }
      return errorResponse(req, options, `Unsupported provider "${action.providerId}".`, { status: 400 });
    }
    case "callback": {
      const provider = getProviderById(options, action.providerId);
      if (!provider) {
        return errorResponse(req, options, `Unknown provider "${action.providerId}".`, { status: 404 });
      }
      if (!isOAuthProvider(provider)) {
        return errorResponse(req, options, `Provider "${action.providerId}" does not support callbacks.`, { status: 400 });
      }
      return handleOAuthCallback(req, provider, options);
    }
    default:
      return errorResponse(req, options, "Unsupported auth action.", { status: 400 });
  }
}

export function NextZenyAuth<TUser = DefaultUser>(rawOptions: ZenyAuthOptions<TUser>): {
  GET: (req: Request, context: RouteContext) => Promise<Response>;
  POST: (req: Request, context: RouteContext) => Promise<Response>;
} {
  const options = normalizeOptions(rawOptions);

  return {
    GET(req, context) {
      return handleAuthRequest(req, context, options).catch((error) =>
        errorResponse(req, options, asError(error).message, { status: 500 })
      );
    },
    POST(req, context) {
      return handleAuthRequest(req, context, options).catch((error) =>
        errorResponse(req, options, asError(error).message, { status: 500 })
      );
    }
  };
}

export async function getServerSession<TUser = DefaultUser>(
  req: Request,
  rawOptions: ZenyAuthOptions<TUser>
): Promise<SessionSnapshot<TUser>> {
  const options = normalizeOptions(rawOptions);
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const names = getCookieNames(options.session.cookiePrefix);
  return verifySessionToken<TUser>(cookies[names.session], options.secret);
}
