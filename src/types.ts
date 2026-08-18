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
 * Which of an interaction's three latency phases contributed the most time.
 *
 * The three phases each have a different fix, so naming the dominant one points
 * at where to look first: `"input"` at a busy main thread, `"processing"` at the
 * event handlers, `"presentation"` at rendering or layout work.
 */
export type InteractionPhase = "input" | "processing" | "presentation";

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
  /**
   * The phase that contributed the most time, i.e. where to look first.
   * Ties are broken in phase order, favouring `input`, then `processing`.
   */
  dominantPhase: InteractionPhase;
}

/**
 * The subset of a browser `PerformanceScriptTiming` entry that leeway reads.
 *
 * These appear in the `scripts` array of a long animation frame and describe a
 * single script execution that ran during that frame. As with
 * {@link EventTimingEntry}, the shape is declared explicitly so the attribution
 * logic can be exercised with fabricated entries.
 */
export interface ScriptTimingEntry {
  /** Source location of the script, e.g. the URL it was loaded from. */
  name: string;
  /** How long this script execution ran (ms). */
  duration: number;
  /**
   * What triggered the script, e.g. `"BUTTON#submit.onclick"` or the URL of a
   * timer callback. May be empty when the invoker cannot be determined.
   */
  invoker: string;
  /**
   * The kind of entry point that ran the script, e.g. `"event-listener"`,
   * `"user-callback"`, or `"classic-script"`.
   */
  invokerType: string;
}

/**
 * The subset of a browser `PerformanceLongAnimationFrameTiming` entry that
 * leeway reads. A long animation frame (LoAF) is a frame whose main-thread work
 * ran long enough to risk delaying user interactions.
 */
export interface LongAnimationFrameEntry {
  /** Start of the frame, relative to the time origin (ms). */
  startTime: number;
  /** Total duration of the frame (ms). */
  duration: number;
  /** Portion of the frame that blocked the main thread past the busy threshold (ms). */
  blockingDuration: number;
  /** The script executions that ran during the frame. */
  scripts: ScriptTimingEntry[];
}

/**
 * A single script execution reduced to what a report needs to name the code
 * that dominated a frame.
 */
export interface ScriptAttribution {
  /** Source location of the script, e.g. the URL it was loaded from. */
  source: string;
  /** What triggered the script, e.g. `"BUTTON#submit.onclick"`. */
  invoker: string;
  /** The kind of entry point that ran the script, e.g. `"event-listener"`. */
  invokerType: string;
  /** How long this script execution ran (ms). */
  duration: number;
}

/**
 * A long animation frame reduced to the fields leeway attributes an interaction
 * to, with its scripts ranked so the dominant one is easy to surface.
 */
export interface LongAnimationFrame {
  /** Start of the frame, relative to the time origin (ms). */
  startTime: number;
  /** Total duration of the frame (ms). */
  duration: number;
  /** Portion of the frame that blocked the main thread past the busy threshold (ms). */
  blockingDuration: number;
  /** The frame's scripts as attributions, longest-running first. */
  scripts: ScriptAttribution[];
  /** The single longest-running script in the frame, or `null` if it ran none. */
  dominantScript: ScriptAttribution | null;
}

/**
 * An {@link Interaction} paired with the long animation frame it occurred
 * within, when one could be attributed.
 *
 * `longAnimationFrame` is `null` when the environment does not support the Long
 * Animation Frames API, or when no observed frame overlapped the interaction.
 */
export interface InteractionReport {
  /** The interaction being explained. */
  interaction: Interaction;
  /** The frame the interaction ran within, or `null` when none was attributed. */
  longAnimationFrame: LongAnimationFrame | null;
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
  /**
   * The worst interaction paired with the long animation frame it ran within,
   * or `null` if no interaction has been seen yet.
   *
   * The report's `longAnimationFrame` is `null` when the environment lacks the
   * Long Animation Frames API (see {@link longAnimationFramesSupported}) or when
   * no observed frame overlapped the interaction.
   */
  report(): InteractionReport | null;
  /** Stop observing and release the underlying `PerformanceObserver`(s). */
  disconnect(): void;
  /** Whether the environment supports Event Timing observation. */
  readonly supported: boolean;
  /** Whether the environment supports Long Animation Frames observation. */
  readonly longAnimationFramesSupported: boolean;
}
