import type { AuthAction } from "./types";

export function parseAuthAction(segments?: string[]): AuthAction {
  if (!segments || segments.length === 0) {
    return { kind: "unknown", reason: "Missing auth action." };
  }

  const [first, second, ...rest] = segments;
  if (rest.length > 0) {
    return { kind: "unknown", reason: "Too many auth route segments." };
  }

  switch (first) {
    case "signin":
      return second ? { kind: "signin", providerId: second } : { kind: "unknown", reason: "Missing provider for sign-in." };
    case "callback":
      return second ? { kind: "callback", providerId: second } : { kind: "unknown", reason: "Missing provider for callback." };
    case "signout":
      return second ? { kind: "unknown", reason: "Sign-out does not accept a provider." } : { kind: "signout" };
    case "session":
      return second ? { kind: "unknown", reason: "Session route does not accept extra segments." } : { kind: "session" };
    case "providers":
      return second ? { kind: "unknown", reason: "Providers route does not accept extra segments." } : { kind: "providers" };
    case "error":
      return second ? { kind: "unknown", reason: "Error route does not accept extra segments." } : { kind: "error" };
    default:
      return { kind: "unknown", reason: `Unknown auth action "${first}".` };
  }
}
