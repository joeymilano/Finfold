
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    timestamp: new Date().toISOString()
  });
}
