import type { DefaultUser, OAuthProvider } from "../shared/types";

type GithubProfile = {
  id: number;
  login?: string;
  name?: string;
  email?: string | null;
  avatar_url?: string;
};

type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

export default function GithubProvider<TUser = DefaultUser>(config: {
  clientId: string;
  clientSecret: string;
}): OAuthProvider<TUser> {
  return {
    id: "github",
    name: "GitHub",
    type: "oauth",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scope: ["read:user", "user:email"],
    checks: ["state"],
    userInfoRequest: async ({ tokens }) => {
      const headers = {
        authorization: `Bearer ${tokens.access_token}`,
        accept: "application/json",
        "user-agent": "zenyauth"
      };

      const [profileResponse, emailsResponse] = await Promise.all([
        fetch("https://api.github.com/user", { headers }),
        fetch("https://api.github.com/user/emails", { headers })
      ]);

      const profile = (await profileResponse.json()) as GithubProfile;
      const emails = emailsResponse.ok ? ((await emailsResponse.json()) as GithubEmail[]) : [];
      return { profile, emails };
    },
    profile: ({ profile }) => {
      const payload = profile as { profile: GithubProfile; emails: GithubEmail[] };
      const primaryEmail =
        payload.profile.email ||
        payload.emails.find((entry) => entry.primary && entry.verified)?.email ||
        payload.emails.find((entry) => entry.verified)?.email;

      if (!primaryEmail) {
        throw new Error("GitHub did not return a verified email address.");
      }

      return {
        id: String(payload.profile.id),
        email: primaryEmail,
        name: payload.profile.name || payload.profile.login,
        image: payload.profile.avatar_url,
        raw: payload.profile
      };
    }
  };
}
