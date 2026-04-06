import type {
  NormalizedZenyAuthOptions,
  OAuthProvider,
  OAuthTokenResponse,
  ProviderUserPayload
} from "./types";
import { randomString, sha256 } from "./tokens";
import { asError, buildUrl, parseJsonBody, resolveRequestOrigin, toFormRecord } from "./utils";

function baseAuthorizationParams<TUser>(provider: OAuthProvider<TUser>, callbackUrl: string): URLSearchParams {
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: callbackUrl,
    response_type: "code"
  });

  if (provider.scope?.length) {
    params.set("scope", provider.scope.join(" "));
  }

  for (const [key, value] of Object.entries(provider.authorizationParams ?? {})) {
    params.set(key, value);
  }

  return params;
}

export async function beginOAuthSignIn<TUser>(
  req: Request,
  provider: OAuthProvider<TUser>,
  options: NormalizedZenyAuthOptions<TUser>,
  callbackUrl: string
): Promise<{
  authorizationUrl: string;
  state: string;
  codeVerifier?: string;
}> {
  const state = randomString(24);
  const params = baseAuthorizationParams(provider, buildUrl(resolveRequestOrigin(req), `${options.basePath}/callback/${provider.id}`));
  params.set("state", state);

  let codeVerifier: string | undefined;
  if (provider.checks?.includes("pkce")) {
    codeVerifier = randomString(48);
    params.set("code_challenge", await sha256(codeVerifier));
    params.set("code_challenge_method", "S256");
  }

  if (callbackUrl) {
    params.set("callbackUrl", callbackUrl);
  }

  return {
    authorizationUrl: `${provider.authorizationUrl}?${params.toString()}`,
    state,
    codeVerifier
  };
}

function buildTokenRequest<TUser>(provider: OAuthProvider<TUser>, req: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): RequestInit {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: req.code,
    redirect_uri: req.redirectUri,
    client_id: provider.clientId
  });

  if (provider.clientSecret && provider.clientAuthMethod !== "client_secret_basic") {
    params.set("client_secret", provider.clientSecret);
  }

  if (req.codeVerifier) {
    params.set("code_verifier", req.codeVerifier);
  }

  for (const [key, value] of Object.entries(provider.tokenParams ?? {})) {
    params.set(key, value);
  }

  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json"
  });

  if (provider.clientSecret && provider.clientAuthMethod === "client_secret_basic") {
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64")}`
    );
  }

  return {
    method: "POST",
    headers,
    body: params
  };
}

export async function exchangeOAuthCode<TUser>(
  req: Request,
  provider: OAuthProvider<TUser>,
  options: NormalizedZenyAuthOptions<TUser>,
  code: string,
  codeVerifier?: string
): Promise<OAuthTokenResponse> {
  const redirectUri = buildUrl(resolveRequestOrigin(req), `${options.basePath}/callback/${provider.id}`);
  const response = await fetch(provider.tokenUrl, buildTokenRequest(provider, { code, redirectUri, codeVerifier }));
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Token exchange failed for ${provider.id}: ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return parseJsonBody(text) as OAuthTokenResponse;
  }

  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries()) as OAuthTokenResponse;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return text ? parseJsonBody(text) : {};
}

export async function fetchOAuthProfile<TUser>(
  provider: OAuthProvider<TUser>,
  tokens: OAuthTokenResponse
): Promise<ProviderUserPayload> {
  let profileData: unknown;

  if (provider.userInfoRequest) {
    profileData = await provider.userInfoRequest({ provider, tokens });
  } else if (provider.userInfoUrl) {
    profileData = await fetchJson(provider.userInfoUrl, {
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        accept: "application/json"
      }
    });
  } else if (tokens.id_token) {
    const [, payload] = tokens.id_token.split(".");
    if (!payload) {
      throw new Error(`Missing profile for provider "${provider.id}".`);
    }
    profileData = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } else {
    throw new Error(`Provider "${provider.id}" does not expose user profile data.`);
  }

  const user = await provider.profile({
    profile: profileData,
    tokens
  });

  if (!user.email) {
    throw new Error(`Provider "${provider.id}" did not return an email address.`);
  }

  return user;
}

export async function readCallbackParams(req: Request): Promise<Record<string, unknown>> {
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

export function unwrapOAuthError(error: unknown): string {
  return asError(error).message;
}
