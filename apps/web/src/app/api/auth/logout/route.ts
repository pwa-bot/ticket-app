import { NextResponse } from "next/server";
import { cookieNames } from "@/lib/auth";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));

  // Delete cookies by setting empty value with expires in the past
  response.cookies.set(cookieNames.session, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  response.cookies.set(cookieNames.selectedRepo, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  // Also try the delete method
  response.cookies.delete(cookieNames.session);
  response.cookies.delete(cookieNames.selectedRepo);

  return response;
}
