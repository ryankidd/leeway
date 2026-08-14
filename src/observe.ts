import { InteractionTracker } from "./tracker.js";
import type { EventTimingEntry, ObserveHandle, ObserveOptions } from "./types.js";

/**
 * Whether the current environment can observe Event Timing entries.
 *
 * False in Node, in older browsers, and anywhere the `event` entry type is
 * not among the supported types. Callers rarely need this directly —
 * {@link observe} degrades to a no-op handle when it returns false — but it is
 * exported so support can be probed before wiring up UI.
 */
export function isSupported(): boolean {
  return (
    typeof PerformanceObserver !== "undefined" &&
    Array.isArray(PerformanceObserver.supportedEntryTypes) &&
    PerformanceObserver.supportedEntryTypes.includes("event")
  );
}

function noop(): ObserveHandle {
  return {
    worst: () => null,
    interactions: () => [],
    disconnect: () => {},
    supported: false,
  };
}

/**
 * Start observing user interactions and tracking the worst one.
 *
 * In an unsupported environment this returns a no-op handle whose `supported`
 * flag is `false` and whose readers return empty results, so calling code
 * never has to branch on availability.
 */
export function observe(options: ObserveOptions = {}): ObserveHandle {
  if (!isSupported()) return noop();

  const tracker = new InteractionTracker();
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const interaction = tracker.record(entry as unknown as EventTimingEntry);
      if (interaction) options.onInteraction?.(interaction);
    }
  });

  observer.observe({
    type: "event",
    durationThreshold: options.durationThreshold ?? 16,
    buffered: true,
  } as PerformanceObserverInit);

  return {
    worst: () => tracker.worst,
    interactions: () => tracker.interactions,
    disconnect: () => observer.disconnect(),
    supported: true,
  };
}
