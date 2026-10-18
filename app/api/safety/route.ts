import { NextRequest } from "next/server";
import { classify } from "@/lib/safety";

export async function POST(request: NextRequest) {
  try {
    const { input } = await request.json();
    if (!input || typeof input !== "string") {
      return Response.json({ ok: false, error: "input string required" }, { status: 400 });
    }
    const result = classify(input);
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
