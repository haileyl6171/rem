import { NextResponse } from "next/server";
import { getConnectedRedisClient } from "@/lib/redis";

export async function GET() {
  try {
    const client = await getConnectedRedisClient();
    const pong = await client.ping();
    return NextResponse.json({ ok: true, pong });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
