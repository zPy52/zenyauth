import type { DefaultUser, OAuthProvider } from "../shared/types";

type AppleClaims = {
  sub: string;
  email: string;
};

export default function AppleProvider<TUser = DefaultUser>(config: {
  clientId: string;
  clientSecret: string;
}): OAuthProvider<TUser> {
  return {
    id: "apple",
    name: "Apple",
    type: "oauth",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    scope: ["name", "email"],
    checks: ["state", "pkce"],
    authorizationParams: {
      response_mode: "form_post"
    },
    profile: ({ profile }) => {
      const claims = profile as AppleClaims;
      return {
        id: claims.sub,
        email: claims.email,
        raw: claims
      };
    }
  };
}
