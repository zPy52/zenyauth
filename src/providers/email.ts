import type { DefaultUser, EmailProvider, ProviderUserPayload } from "../shared/types";

export default function EmailProviderFactory<TUser = DefaultUser>(config: {
  authorize: (credentials: Record<string, unknown>, req: Request) => Promise<ProviderUserPayload | null>;
}): EmailProvider<TUser> {
  return {
    id: "email",
    name: "Email",
    type: "email",
    authorize: config.authorize
  };
}
