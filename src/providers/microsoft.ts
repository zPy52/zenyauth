import type { DefaultUser, OAuthProvider } from "../shared/types";

type MicrosoftProfile = {
  sub?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  picture?: string;
};

export default function MicrosoftProvider<TUser = DefaultUser>(config: {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
}): OAuthProvider<TUser> {
  const tenant = config.tenantId ?? "common";

  return {
    id: "microsoft-entra-id",
    name: "Microsoft Entra ID",
    type: "oauth",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scope: ["openid", "profile", "email", "User.Read"],
    checks: ["state", "pkce"],
    profile: ({ profile }) => {
      const microsoftProfile = profile as MicrosoftProfile;
      return {
        id: microsoftProfile.sub || microsoftProfile.oid || microsoftProfile.preferred_username || microsoftProfile.email,
        email: microsoftProfile.email || microsoftProfile.preferred_username || "",
        name: microsoftProfile.name,
        image: microsoftProfile.picture,
        raw: microsoftProfile
      };
    }
  };
}
