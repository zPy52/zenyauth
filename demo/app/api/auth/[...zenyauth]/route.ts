import { auth } from "@/src/auth";
import { createNextAuth } from "zenyauth/next";

const zenyauth = createNextAuth(auth);

export const GET = zenyauth.GET;
export const POST = zenyauth.POST;
