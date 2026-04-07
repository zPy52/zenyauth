import type { NextRequest } from "next/server";
import { withAuth } from "zenyauth/next";
import { auth } from "@/src/auth";

const proxyAuth = withAuth(auth, undefined, {
  pages: {
    signIn: "/login"
  },
  callbacks: {
    authorized: ({ session }) => session.isValid
  }
});

export function proxy(request: NextRequest) {
  return proxyAuth(request);
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
