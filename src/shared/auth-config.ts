import type { AuthConfig, ProviderUserPayload, ZenyAuthOptions } from "./types";

export function defineAuth<TUser = ProviderUserPayload>(options: ZenyAuthOptions<TUser>): AuthConfig<TUser> {
  return options as AuthConfig<TUser>;
}

export const createAuth = defineAuth;
