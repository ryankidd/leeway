import type { EventTimingEntry, Interaction } from "./types.js";

/**
 * Splits an Event Timing entry into an {@link Interaction} with its three
 * latency phases. Phases are clamped at zero to absorb any rounding in the
 * source timestamps.
 */
export function toInteraction(entry: EventTimingEntry): Interaction {
  const { startTime, duration, processingStart, processingEnd } = entry;
  return {
    id: entry.interactionId ?? 0,
    type: entry.name,
    duration,
    startTime,
    inputDelay: Math.max(0, processingStart - startTime),
    processingTime: Math.max(0, processingEnd - processingStart),
    presentationDelay: Math.max(0, startTime + duration - processingEnd),
  };
}

/**
 * Groups Event Timing entries into interactions and tracks the worst one.
 *
 * An interaction (pointer, tap, keypress) can emit several event entries that
 * share an `interactionId`; its latency is the longest of those events. Events
 * without an `interactionId` are ignored, matching how INP is defined.
 *
 * This holds no reference to `PerformanceObserver`, so it can be driven with
 * fabricated entries in tests.
 */
export class InteractionTracker {
  private readonly byId = new Map<number, Interaction>();
  private worstInteraction: Interaction | null = null;

  /**
   * Record an entry. Returns the resulting interaction, or `null` when the
   * entry is not part of a discrete interaction or does not exceed the
   * duration already recorded for its interaction.
   */
  record(entry: EventTimingEntry): Interaction | null {
    const id = entry.interactionId ?? 0;
    if (id === 0) return null;

    const existing = this.byId.get(id);
    const candidate = toInteraction(entry);
    if (existing && candidate.duration <= existing.duration) return null;

    this.byId.set(id, candidate);
    if (!this.worstInteraction || candidate.duration > this.worstInteraction.duration) {
      this.worstInteraction = candidate;
    }
    return candidate;
  }

  /** The worst interaction recorded so far, or `null` if none. */
  get worst(): Interaction | null {
    return this.worstInteraction;
  }

  /** Every distinct interaction recorded so far. */
  get interactions(): Interaction[] {
    return [...this.byId.values()];
  }

  /** Forget all recorded interactions. */
  reset(): void {
    this.byId.clear();
    this.worstInteraction = null;
  }
}
