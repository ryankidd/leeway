import { LoafTracker } from "./loaf.js";
import { InteractionTracker } from "./tracker.js";
import type {
  EventTimingEntry,
  LongAnimationFrameEntry,
  ObserveHandle,
  ObserveOptions,
} from "./types.js";

/**
 * Whether the current environment can observe Event Timing entries.
 *
 * False in Node, in older browsers, and anywhere the `event` entry type is
 * not among the supported types. Callers rarely need this directly —
 * {@link observe} degrades to a no-op handle when it returns false — but it is
 * exported so support can be probed before wiring up UI.
 */
export function isSupported(): boolean {
  return supportsEntryType("event");
}

/**
 * Whether the current environment can observe Long Animation Frames.
 *
 * When false, {@link observe} still tracks interactions; the frame in each
 * report is simply `null`. Exported so support can be probed independently.
 */
export function isLongAnimationFrameSupported(): boolean {
  return supportsEntryType("long-animation-frame");
}

function supportsEntryType(type: string): boolean {
  return (
    typeof PerformanceObserver !== "undefined" &&
    Array.isArray(PerformanceObserver.supportedEntryTypes) &&
    PerformanceObserver.supportedEntryTypes.includes(type)
  );
}

function noop(): ObserveHandle {
  return {
    worst: () => null,
    interactions: () => [],
    report: () => null,
    disconnect: () => {},
    supported: false,
    longAnimationFramesSupported: false,
  };
}

/**
 * Start observing user interactions and tracking the worst one.
 *
 * Where the Long Animation Frames API is available, observed frames are used to
 * attribute each interaction to the frame — and script — that ran during it;
 * where it is not, interactions are still tracked and reports carry a `null`
 * frame.
 *
 * In an environment without Event Timing this returns a no-op handle whose
 * `supported` flag is `false` and whose readers return empty results, so
 * calling code never has to branch on availability.
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

  const loafSupported = isLongAnimationFrameSupported();
  const loafTracker = loafSupported ? new LoafTracker() : null;
  let loafObserver: PerformanceObserver | undefined;
  if (loafTracker) {
    loafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        loafTracker.record(entry as unknown as LongAnimationFrameEntry);
      }
    });
    loafObserver.observe({
      type: "long-animation-frame",
      buffered: true,
    } as PerformanceObserverInit);
  }

  return {
    worst: () => tracker.worst,
    interactions: () => tracker.interactions,
    report: () => {
      const worst = tracker.worst;
      if (!worst) return null;
      return {
        interaction: worst,
        longAnimationFrame: loafTracker ? loafTracker.attribute(worst) : null,
      };
    },
    disconnect: () => {
      observer.disconnect();
      loafObserver?.disconnect();
    },
    supported: true,
    longAnimationFramesSupported: loafSupported,
  };
}
