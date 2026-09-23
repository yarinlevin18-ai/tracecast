import demo from "@/lib/demo/trace.json";
import { buildSchedule } from "@/lib/replay/schedule";
import { validateTrace } from "@/lib/share/validate";

// Validated once at module load; a bad file fails the build, not a request.
export const demoTrace = validateTrace(demo);

/** How long the demo takes to play at 1x on the compressed clock. */
export const demoReplayMs = buildSchedule(demoTrace.steps).totalMs;
