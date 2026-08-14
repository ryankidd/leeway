import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupported, observe } from "./observe.js";
import type { EventTimingEntry } from "./types.js";

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
    expect(handle.worst()).toBeNull();
    expect(handle.interactions()).toEqual([]);
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
