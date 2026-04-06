import type {
  EmailProvider,
  NormalizedZenyAuthOptions,
  OAuthProvider,
  Provider,
  ZenyAuthOptions
} from "./types";
import {
  DEFAULT_BASE_PATH,
  DEFAULT_COOKIE_PREFIX,
  DEFAULT_MAX_AGE,
  normalizeBasePath
} from "./utils";

export function isOAuthProvider<TUser>(provider: Provider<TUser>): provider is OAuthProvider<TUser> {
  return provider.type === "oauth";
}

export function isEmailProvider<TUser>(provider: Provider<TUser>): provider is EmailProvider<TUser> {
  return provider.type === "email";
}

export function normalizeOptions<TUser>(options: ZenyAuthOptions<TUser>): NormalizedZenyAuthOptions<TUser> {
  const providerMap = new Map<string, Provider<TUser>>();
  for (const provider of options.providers) {
    providerMap.set(provider.id.toLowerCase(), provider);
  }

  return {
    ...options,
    basePath: normalizeBasePath(options.basePath ?? DEFAULT_BASE_PATH),
    providers: options.providers,
    providerMap,
    session: {
      maxAge: options.session?.maxAge ?? DEFAULT_MAX_AGE,
      cookiePrefix: options.session?.cookiePrefix ?? DEFAULT_COOKIE_PREFIX,
      sameSite: options.session?.sameSite ?? "lax",
      secure: options.session?.secure ?? process.env.NODE_ENV === "production"
    }
  };
}

export function getProviderById<TUser>(options: NormalizedZenyAuthOptions<TUser>, providerId: string): Provider<TUser> | undefined {
  return options.providerMap.get(providerId.toLowerCase());
}
