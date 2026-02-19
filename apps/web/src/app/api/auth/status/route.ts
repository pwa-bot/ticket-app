import { NextResponse } from "next/server";
import { isUnauthorizedResponse, requireSession } from "@/lib/auth";

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ authenticated: true });
  } catch (error) {
    if (isUnauthorizedResponse(error)) {
      return NextResponse.json({ authenticated: false });
    }
    throw error;
  }
}
