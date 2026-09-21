import type { RawBlock } from "./raw";

export function toBlocks(content: string | RawBlock[] | undefined): RawBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) {
    return content.filter((b): b is RawBlock => !!b && typeof b === "object");
  }
  return [];
}

/** Turn tool_result content (string, block array, or anything) into display text. */
export function flattenResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (!b || typeof b !== "object") return "";
        const block = b as RawBlock;
        if (block.type === "text") return block.text ?? "";
        if (block.type === "image") return "[image]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(content);
}
