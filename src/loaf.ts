import type {
  LongAnimationFrame,
  LongAnimationFrameEntry,
  ScriptAttribution,
  ScriptTimingEntry,
} from "./types.js";

/** Reduces a script timing entry to the fields a report surfaces. */
export function toScriptAttribution(script: ScriptTimingEntry): ScriptAttribution {
  return {
    source: script.name,
    invoker: script.invoker,
    invokerType: script.invokerType,
    duration: script.duration,
  };
}

/**
 * Reduces a long animation frame entry to a {@link LongAnimationFrame}, ranking
 * its scripts longest-running first so the dominant one is `scripts[0]`.
 *
 * The input `scripts` array is not mutated.
 */
export function toLongAnimationFrame(entry: LongAnimationFrameEntry): LongAnimationFrame {
  const scripts = entry.scripts
    .map(toScriptAttribution)
    .sort((a, b) => b.duration - a.duration);
  return {
    startTime: entry.startTime,
    duration: entry.duration,
    blockingDuration: entry.blockingDuration,
    scripts,
    dominantScript: scripts[0] ?? null,
  };
}

/** The window an interaction (or any timed thing) occupies on the timeline. */
interface TimeWindow {
  startTime: number;
  duration: number;
}

/** Length of the overlap between two time windows, or `0` if they are disjoint. */
function overlap(a: TimeWindow, b: TimeWindow): number {
  const start = Math.max(a.startTime, b.startTime);
  const end = Math.min(a.startTime + a.duration, b.startTime + b.duration);
  return Math.max(0, end - start);
}

/**
 * Collects long animation frame entries and attributes interactions to them.
 *
 * A long animation frame contains an interaction when the two overlap in time.
 * When several frames overlap a given interaction, the one sharing the most
 * time with it wins, which is the frame whose work most plausibly delayed it.
 *
 * Like {@link import("./tracker.js").InteractionTracker} this holds no reference
 * to `PerformanceObserver`, so it can be driven with fabricated entries.
 */
export class LoafTracker {
  private readonly entries: LongAnimationFrameEntry[] = [];

  /** Record a long animation frame entry for later attribution. */
  record(entry: LongAnimationFrameEntry): void {
    this.entries.push(entry);
  }

  /**
   * Return the recorded frame that best contains the given window, reduced to a
   * {@link LongAnimationFrame}, or `null` when no recorded frame overlaps it.
   */
  attribute(window: TimeWindow): LongAnimationFrame | null {
    let best: LongAnimationFrameEntry | null = null;
    let bestOverlap = 0;
    for (const entry of this.entries) {
      const shared = overlap(window, entry);
      if (shared > bestOverlap) {
        best = entry;
        bestOverlap = shared;
      }
    }
    return best ? toLongAnimationFrame(best) : null;
  }

  /** Every long animation frame recorded so far, reduced for reporting. */
  frames(): LongAnimationFrame[] {
    return this.entries.map(toLongAnimationFrame);
  }

  /** Forget all recorded frames. */
  reset(): void {
    this.entries.length = 0;
  }
}
