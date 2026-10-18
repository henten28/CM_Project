// ─────────────────────────────────────────────────────────────────────────────
// Retrieval Agent
// Searches the approved content library by concept tags + module IDs.
// Refinement loop if coverage < threshold.
// Never invents medical facts — only returns approved content blocks.
// ─────────────────────────────────────────────────────────────────────────────

import { CONTENT_LIBRARY, searchBlocks } from "../content-library";
import type { ContentBlock, Lang } from "../content-library";

interface RetrievalInput {
  moduleIds: string[];
  conceptTags?: string[];
  lang: Lang;
  minBlocks?: number;
}

interface RetrievalOutput {
  blocks: ContentBlock[];
  sourcesCited: string[];
  agentNote: { kn: string; en: string };
}

export async function runRetrievalAgent(input: RetrievalInput): Promise<RetrievalOutput> {
  await new Promise((r) => setTimeout(r, 600));

  const minBlocks = input.minBlocks ?? 1;

  // Primary: get blocks for requested modules
  let blocks = CONTENT_LIBRARY.filter((b) => input.moduleIds.includes(b.moduleId));

  // Refinement loop: if below threshold, fall back to concept tag search
  if (blocks.length < minBlocks && input.conceptTags && input.conceptTags.length > 0) {
    const extra = searchBlocks(input.conceptTags, input.lang).filter(
      (b) => !blocks.find((x) => x.id === b.id)
    );
    blocks = [...blocks, ...extra];
  }

  // Final fallback: first available block
  if (blocks.length === 0) {
    blocks = [CONTENT_LIBRARY[0]];
  }

  const sourcesCited = [...new Set(blocks.map((b) => b.source))];

  const agentNote = {
    kn: `ಹುಡುಕಾಟ ಏಜೆಂಟ್: ${blocks.length} ವಿಷಯ ಬ್ಲಾಕ್‌ಗಳನ್ನು ಕಂಡುಹಿಡಿದೆ. ಮೂಲ: ${sourcesCited.join(", ")}.`,
    en: `Retrieval Agent: Found ${blocks.length} content block(s). Sources: ${sourcesCited.join(", ")}.`,
  };

  return { blocks, sourcesCited, agentNote };
}
