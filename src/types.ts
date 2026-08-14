/**
 * The subset of a browser `PerformanceEventTiming` entry that leeway reads.
 *
 * Declaring it explicitly (rather than depending on the DOM lib type at the
 * call site) keeps the processing logic decoupled from a live
 * `PerformanceObserver`, so it can be exercised with fabricated entries.
 */
export interface EventTimingEntry {
  /** The event type, e.g. `"pointerup"`, `"click"`, `"keydown"`. */
  name: string;
  /** Time the event was created, relative to the time origin (ms). */
  startTime: number;
  /** Rounded interaction latency for the event (ms). */
  duration: number;
  /** Time the event handlers began running (ms). */
  processingStart: number;
  /** Time the event handlers finished running (ms). */
  processingEnd: number;
  /**
   * Identifier shared by every event belonging to the same interaction.
   * `0` (or absent) means the event is not part of a discrete interaction.
   */
  interactionId?: number;
}

/**
 * A single user interaction, reduced to its worst constituent event and the
 * three latency phases that make up its total duration.
 */
export interface Interaction {
  /** The `interactionId` this interaction was grouped under. */
  id: number;
  /** Event type of the slowest event in the interaction. */
  type: string;
  /** Interaction latency in milliseconds. */
  duration: number;
  /** Start time of the slowest event, relative to the time origin (ms). */
  startTime: number;
  /**
   * Input delay: time from the event firing to its handlers running.
   * A large value points at the main thread being busy before the input.
   */
  inputDelay: number;
  /** Processing time: how long the event handlers themselves ran (ms). */
  processingTime: number;
  /**
   * Presentation delay: time from handlers finishing to the next paint.
   * A large value points at rendering or layout work, not the handler.
   */
  presentationDelay: number;
}

/** Options for {@link observe}. */
export interface ObserveOptions {
  /**
   * Only surface events whose duration is at least this many milliseconds.
   * The Event Timing API clamps this to a 16ms floor. Defaults to `16`.
   */
  durationThreshold?: number;
  /** Called whenever a recorded interaction is created or updated. */
  onInteraction?: (interaction: Interaction) => void;
}

/** Handle returned by {@link observe} for reading results and cleaning up. */
export interface ObserveHandle {
  /** The worst interaction seen so far, or `null` if none yet. */
  worst(): Interaction | null;
  /** Every distinct interaction seen so far. */
  interactions(): Interaction[];
  /** Stop observing and release the underlying `PerformanceObserver`. */
  disconnect(): void;
  /** Whether the environment supports Event Timing observation. */
  readonly supported: boolean;
}
