import { forward } from "@/lib/backend";

// GET /api/auth/me → the signed-in user (401 when signed out)
export async function GET() {
  return forward("/auth/me");
}
