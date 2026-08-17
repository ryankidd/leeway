import { afterEach, describe, expect, it, vi } from "vitest";
import { isLongAnimationFrameSupported, isSupported, observe } from "./observe.js";
import type { EventTimingEntry, LongAnimationFrameEntry } from "./types.js";

const RealPerformanceObserver = globalThis.PerformanceObserver;

afterEach(() => {
  globalThis.PerformanceObserver = RealPerformanceObserver;
});

/**
 * A stand-in for the browser `PerformanceObserver` that lets a test push
 * fabricated entries at whatever callback `observe` registered.
 */
function installFakeObserver(entries: EventTimingEntry[][]) {
  const disconnect = vi.fn();
  let observedInit: unknown;
  class FakePerformanceObserver {
    static supportedEntryTypes = ["event"];
    constructor(private readonly cb: PerformanceObserverCallback) {}
    observe(init: unknown) {
      observedInit = init;
      for (const batch of entries) {
        this.cb(
          { getEntries: () => batch } as unknown as PerformanceObserverEntryList,
          this as unknown as PerformanceObserver,
        );
      }
    }
    disconnect = disconnect;
    takeRecords() {
      return [];
    }
  }
  globalThis.PerformanceObserver =
    FakePerformanceObserver as unknown as typeof PerformanceObserver;
  return { disconnect, getInit: () => observedInit };
}

function entry(overrides: Partial<EventTimingEntry> = {}): EventTimingEntry {
  return {
    name: "pointerup",
    startTime: 1000,
    duration: 100,
    processingStart: 1010,
    processingEnd: 1050,
    interactionId: 1,
    ...overrides,
  };
}

describe("isSupported", () => {
  it("is false when the event entry type is unavailable", () => {
    // Node's PerformanceObserver does not support the `event` type.
    expect(isSupported()).toBe(false);
  });

  it("is false when PerformanceObserver is undefined", () => {
    globalThis.PerformanceObserver = undefined as unknown as typeof PerformanceObserver;
    expect(isSupported()).toBe(false);
  });

  it("is true when the event entry type is supported", () => {
    installFakeObserver([]);
    expect(isSupported()).toBe(true);
  });
});

describe("observe (unsupported environment)", () => {
  it("returns a usable no-op handle instead of throwing", () => {
    const handle = observe();
    expect(handle.supported).toBe(false);
    expect(handle.longAnimationFramesSupported).toBe(false);
    expect(handle.worst()).toBeNull();
    expect(handle.interactions()).toEqual([]);
    expect(handle.report()).toBeNull();
    expect(() => handle.disconnect()).not.toThrow();
  });
});

describe("observe (supported environment)", () => {
  it("subscribes to buffered event entries above the threshold", () => {
    const { getInit } = installFakeObserver([]);
    observe({ durationThreshold: 40 });
    expect(getInit()).toEqual({ type: "event", durationThreshold: 40, buffered: true });
  });

  it("defaults the duration threshold to 16ms", () => {
    const { getInit } = installFakeObserver([]);
    observe();
    expect(getInit()).toMatchObject({ durationThreshold: 16 });
  });

  it("tracks the worst interaction across delivered entries", () => {
    installFakeObserver([
      [entry({ interactionId: 1, duration: 90 })],
      [entry({ interactionId: 2, duration: 260 }), entry({ interactionId: 3, duration: 120 })],
    ]);
    const handle = observe();
    expect(handle.supported).toBe(true);
    expect(handle.worst()?.id).toBe(2);
    expect(handle.worst()?.duration).toBe(260);
    expect(handle.interactions()).toHaveLength(3);
  });

  it("invokes onInteraction for each recorded interaction", () => {
    const onInteraction = vi.fn();
    installFakeObserver([[entry({ interactionId: 1, duration: 90 })]]);
    observe({ onInteraction });
    expect(onInteraction).toHaveBeenCalledTimes(1);
    expect(onInteraction.mock.calls[0][0]).toMatchObject({ id: 1, duration: 90 });
  });

  it("disconnects the underlying observer", () => {
    const { disconnect } = installFakeObserver([]);
    observe().disconnect();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

/**
 * A richer fake that supports more than one entry type and routes each
 * batch to the observer that subscribed to its type, so the interaction and
 * long-animation-frame observers can be driven independently.
 */
function installTypedObserver(config: {
  supports: string[];
  event?: EventTimingEntry[][];
  loaf?: LongAnimationFrameEntry[][];
}) {
  const disconnect = vi.fn();
  const byType: Record<string, unknown[][]> = {
    event: config.event ?? [],
    "long-animation-frame": config.loaf ?? [],
  };
  class TypedPerformanceObserver {
    static supportedEntryTypes = config.supports;
    constructor(private readonly cb: PerformanceObserverCallback) {}
    observe(init: { type: string }) {
      for (const batch of byType[init.type] ?? []) {
        this.cb(
          { getEntries: () => batch } as unknown as PerformanceObserverEntryList,
          this as unknown as PerformanceObserver,
        );
      }
    }
    disconnect = disconnect;
    takeRecords() {
      return [];
    }
  }
  globalThis.PerformanceObserver =
    TypedPerformanceObserver as unknown as typeof PerformanceObserver;
  return { disconnect };
}

function loafEntry(
  overrides: Partial<LongAnimationFrameEntry> = {},
): LongAnimationFrameEntry {
  return {
    startTime: 1000,
    duration: 200,
    blockingDuration: 120,
    scripts: [
      {
        name: "https://example.com/app.js",
        duration: 150,
        invoker: "BUTTON#submit.onclick",
        invokerType: "event-listener",
      },
    ],
    ...overrides,
  };
}

describe("isLongAnimationFrameSupported", () => {
  it("is false when the entry type is unavailable", () => {
    installTypedObserver({ supports: ["event"] });
    expect(isLongAnimationFrameSupported()).toBe(false);
  });

  it("is true when the entry type is supported", () => {
    installTypedObserver({ supports: ["event", "long-animation-frame"] });
    expect(isLongAnimationFrameSupported()).toBe(true);
  });
});

describe("observe (long animation frames)", () => {
  it("flags long-animation-frame support on the handle", () => {
    installTypedObserver({ supports: ["event", "long-animation-frame"] });
    expect(observe().longAnimationFramesSupported).toBe(true);
  });

  it("attributes the worst interaction to the frame that contained it", () => {
    installTypedObserver({
      supports: ["event", "long-animation-frame"],
      event: [[entry({ interactionId: 1, startTime: 1050, duration: 100 })]],
      loaf: [[loafEntry({ startTime: 1000, duration: 200 })]],
    });
    const report = observe().report();
    expect(report?.interaction.id).toBe(1);
    expect(report?.longAnimationFrame?.startTime).toBe(1000);
    expect(report?.longAnimationFrame?.dominantScript?.source).toBe(
      "https://example.com/app.js",
    );
    expect(report?.longAnimationFrame?.dominantScript?.invokerType).toBe("event-listener");
  });

  it("reports a null frame when no observed frame overlaps the interaction", () => {
    installTypedObserver({
      supports: ["event", "long-animation-frame"],
      event: [[entry({ interactionId: 1, startTime: 5000, duration: 80 })]],
      loaf: [[loafEntry({ startTime: 1000, duration: 200 })]],
    });
    const report = observe().report();
    expect(report?.interaction.id).toBe(1);
    expect(report?.longAnimationFrame).toBeNull();
  });

  it("returns a null report until an interaction is seen", () => {
    installTypedObserver({
      supports: ["event", "long-animation-frame"],
      loaf: [[loafEntry()]],
    });
    expect(observe().report()).toBeNull();
  });

  it("disconnects both observers", () => {
    const { disconnect } = installTypedObserver({
      supports: ["event", "long-animation-frame"],
    });
    observe().disconnect();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});

describe("observe (without long animation frames)", () => {
  it("still tracks interactions and reports a null frame", () => {
    installTypedObserver({
      supports: ["event"],
      event: [[entry({ interactionId: 1, duration: 90 })]],
    });
    const handle = observe();
    expect(handle.supported).toBe(true);
    expect(handle.longAnimationFramesSupported).toBe(false);
    const report = handle.report();
    expect(report?.interaction.id).toBe(1);
    expect(report?.longAnimationFrame).toBeNull();
  });

  it("does not create a second observer to disconnect", () => {
    const { disconnect } = installTypedObserver({ supports: ["event"] });
    observe().disconnect();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
