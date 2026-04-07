import { createAuth } from "zenyauth";
import GoogleProvider from "zenyauth/providers/google";
import MicrosoftEntraIdProvider from "zenyauth/providers/microsoft";

function getMicrosoftTenantId(issuer: string) {
  try {
    const pathParts = new URL(issuer).pathname.split("/").filter(Boolean);
    return pathParts[0] ?? "common";
  } catch {
    return issuer || "common";
  }
}

const microsoftIssuer = process.env.MICROSOFT_ENTRA_ID_ISSUER!;

export const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    }),
    MicrosoftEntraIdProvider({
      clientId: process.env.MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.MICROSOFT_ENTRA_ID_SECRET!,
      tenantId: getMicrosoftTenantId(microsoftIssuer)
    })
  ],
  session: {
    maxAge: 60 * 60 * 24 * 7
  },
  pages: {
    signIn: "/login",
    error: "/login"
  }
});
