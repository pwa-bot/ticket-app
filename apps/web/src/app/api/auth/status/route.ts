import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";

export async function GET() {
  const token = await getAccessTokenFromCookies();
  return NextResponse.json({ authenticated: !!token });
}
