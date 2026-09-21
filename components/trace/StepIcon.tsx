import { Bot, Brain, GitBranch, Info, User, Wrench } from "lucide-react";
import type { StepKind } from "@/lib/trace/types";

const ICONS: Record<StepKind, { Icon: typeof User; color: string; label: string }> = {
  user: { Icon: User, color: "text-sky-400", label: "User" },
  assistant: { Icon: Bot, color: "text-emerald-400", label: "Assistant" },
  thinking: { Icon: Brain, color: "text-violet-400", label: "Thinking" },
  tool_call: { Icon: Wrench, color: "text-amber-400", label: "Tool call" },
  tool_result: { Icon: Wrench, color: "text-amber-400", label: "Tool result" },
  subagent: { Icon: GitBranch, color: "text-pink-400", label: "Subagent" },
  system: { Icon: Info, color: "text-zinc-500", label: "System" },
};

export function stepColor(kind: StepKind): string {
  return ICONS[kind].color;
}

export function StepIcon({ kind, className = "h-4 w-4" }: { kind: StepKind; className?: string }) {
  const { Icon, color, label } = ICONS[kind];
  return <Icon className={`${className} ${color}`} aria-label={label} role="img" />;
}
