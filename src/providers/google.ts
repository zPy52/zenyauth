import type { DefaultUser, OAuthProvider } from "../shared/types";

type GoogleProfile = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export default function GoogleProvider<TUser = DefaultUser>(config: {
  clientId: string;
  clientSecret: string;
}): OAuthProvider<TUser> {
  return {
    id: "google",
    name: "Google",
    type: "oauth",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: ["openid", "profile", "email"],
    checks: ["state", "pkce"],
    profile: ({ profile }) => {
      const googleProfile = profile as GoogleProfile;
      return {
        id: googleProfile.sub,
        email: googleProfile.email,
        name: googleProfile.name,
        image: googleProfile.picture,
        raw: googleProfile
      };
    }
  };
}
