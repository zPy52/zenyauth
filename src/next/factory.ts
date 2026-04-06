import type {
  AuthConfig,
  InferAuthUser,
  SessionSnapshot,
  ZenyAuthOptions
} from "../shared/types";
import { normalizeOptions } from "../shared/providers";
import { getServerSession as getServerSessionBase, NextZenyAuth } from "./handler";
import type { AuthenticatedNextRequest, ZenyAuthProxyOptions } from "./proxy";
import { withAuth as withAuthBase } from "./proxy";
import { Session as ServerSession } from "./server-session";
import { SessionProvider as SessionProviderBase } from "./session-provider";
import type { SessionProviderProps } from "./session-provider";

export type NextAuth<TUser> = {
  handlers: ReturnType<typeof NextZenyAuth<TUser>>;
  GET: ReturnType<typeof NextZenyAuth<TUser>>["GET"];
  POST: ReturnType<typeof NextZenyAuth<TUser>>["POST"];
  SessionProvider: (
    props: SessionProviderProps<TUser>
  ) => ReturnType<typeof SessionProviderBase<TUser>>;
  getServerSession: (req: Request) => Promise<SessionSnapshot<TUser>>;
  withAuth: (
    handler?: (req: AuthenticatedNextRequest<TUser>) => void | Response | Promise<void | Response>,
    options?: ZenyAuthProxyOptions<TUser>
  ) => ReturnType<typeof withAuthBase<TUser>>;
  Session: {
    read: () => Promise<SessionSnapshot<TUser>>;
    user: () => Promise<TUser | undefined>;
    expiryDate: () => Promise<Date | undefined>;
    isExpired: () => Promise<boolean>;
    isValid: () => Promise<boolean>;
  };
};

export function createNextAuth<TAuth extends AuthConfig<any>>(auth: TAuth): NextAuth<InferAuthUser<TAuth>> {
  type TUser = InferAuthUser<TAuth>;

  const options = auth as ZenyAuthOptions<TUser>;
  const normalized = normalizeOptions(options);
  const handlers = NextZenyAuth<TUser>(options);

  return {
    handlers,
    GET: handlers.GET,
    POST: handlers.POST,
    SessionProvider(props) {
      return SessionProviderBase<TUser>({
        ...props,
        cookiePrefix: props.cookiePrefix ?? normalized.session.cookiePrefix
      });
    },
    getServerSession(req) {
      return getServerSessionBase<TUser>(req, options);
    },
    withAuth(handler, proxyOptions) {
      return withAuthBase<TUser>(options, handler, proxyOptions);
    },
    Session: {
      read() {
        return ServerSession.read<TUser>(options);
      },
      user() {
        return ServerSession.user<TUser>(options);
      },
      expiryDate() {
        return ServerSession.expiryDate<TUser>(options);
      },
      isExpired() {
        return ServerSession.isExpired<TUser>(options);
      },
      isValid() {
        return ServerSession.isValid<TUser>(options);
      }
    }
  };
}
