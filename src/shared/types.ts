export type DefaultUser = {
  email: string;
  name?: string;
  image?: string;
};

export type SessionSnapshot<TUser = DefaultUser> = {
  user: TUser | undefined;
  expiryDate: Date | undefined;
  isExpired: boolean;
  isValid: boolean;
};

export type SessionSnapshotJson<TUser = DefaultUser> = {
  user: TUser | undefined;
  expiryDate: string | undefined;
  isExpired: boolean;
  isValid: boolean;
};

export type SignInResult = {
  ok: boolean;
  redirected?: boolean;
  error?: string;
};

export type SessionState<TUser = DefaultUser> = SessionSnapshot<TUser> & {
  signIn: (provider: string, options?: Record<string, unknown>) => Promise<SignInResult>;
  signOut: (options?: { callbackUrl?: string; api?: string }) => Promise<void>;
};

export type ProviderUserPayload = DefaultUser & {
  id?: string;
  raw?: unknown;
  [key: string]: unknown;
};

export type SignInCallbackContext = {
  req: Request;
  provider: string;
  user: ProviderUserPayload;
};

export type SessionPayload<TUser = DefaultUser> = {
  sub: string;
  provider: string;
  user: TUser;
  exp: number;
  iat: number;
};

export type AuthFlowPayload = {
  provider: string;
  state: string;
  callbackUrl: string;
  codeVerifier?: string;
  exp: number;
  iat: number;
};

export type ProviderBase<TUser = DefaultUser> = {
  id: string;
  name: string;
  type: "oauth" | "email";
};

export type OAuthChecks = Array<"state" | "pkce">;

export type OAuthTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  [key: string]: unknown;
};

export type OAuthProvider<TUser = DefaultUser> = ProviderBase<TUser> & {
  type: "oauth";
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scope?: string[];
  checks?: OAuthChecks;
  authorizationParams?: Record<string, string>;
  tokenParams?: Record<string, string>;
  clientAuthMethod?: "client_secret_post" | "client_secret_basic" | "none";
  userInfoRequest?: (context: {
    provider: OAuthProvider<TUser>;
    tokens: OAuthTokenResponse;
  }) => Promise<unknown>;
  profile: (context: {
    profile: unknown;
    tokens: OAuthTokenResponse;
  }) => Promise<ProviderUserPayload> | ProviderUserPayload;
};

export type EmailProvider<TUser = DefaultUser> = ProviderBase<TUser> & {
  type: "email";
  authorize: (credentials: Record<string, unknown>, req: Request) => Promise<ProviderUserPayload | null>;
};

export type Provider<TUser = DefaultUser> = OAuthProvider<TUser> | EmailProvider<TUser>;

export type ZenyAuthOptions<TUser = DefaultUser> = {
  secret: string;
  providers: Provider<TUser>[];
  basePath?: string;
  pages?: {
    error?: string;
    signIn?: string;
  };
  session?: {
    maxAge?: number;
    cookiePrefix?: string;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
  };
  callbacks?: {
    signIn?: (context: SignInCallbackContext) => void | Promise<void>;
    sessionPayload?: (input: ProviderUserPayload) => TUser | Promise<TUser>;
  };
};

export type AuthConfig<TUser = DefaultUser> = ZenyAuthOptions<TUser> & {
  readonly __zenyauth?: {
    user: TUser;
  };
};

export type InferAuthUser<TAuth> = TAuth extends AuthConfig<infer TUser> ? TUser : DefaultUser;

export type NormalizedZenyAuthOptions<TUser = DefaultUser> = Omit<ZenyAuthOptions<TUser>, "providers" | "session" | "basePath"> & {
  basePath: string;
  providers: Provider<TUser>[];
  providerMap: Map<string, Provider<TUser>>;
  session: {
    maxAge: number;
    cookiePrefix: string;
    sameSite: "lax" | "strict" | "none";
    secure: boolean;
  };
};

export type AuthAction =
  | { kind: "signin"; providerId: string }
  | { kind: "callback"; providerId: string }
  | { kind: "signout" }
  | { kind: "session" }
  | { kind: "providers" }
  | { kind: "error" }
  | { kind: "unknown"; reason: string };
