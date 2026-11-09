import { forward } from "@/lib/backend";

// GET /api/content → backend GET /content (approved learning content)
export async function GET() {
  return forward("/content");
}
