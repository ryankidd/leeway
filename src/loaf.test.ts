import { describe, expect, it } from "vitest";
import { LoafTracker, toLongAnimationFrame, toScriptAttribution } from "./loaf.js";
import type { LongAnimationFrameEntry, ScriptTimingEntry } from "./types.js";

function script(overrides: Partial<ScriptTimingEntry> = {}): ScriptTimingEntry {
  return {
    name: "https://example.com/app.js",
    duration: 30,
    invoker: "BUTTON#submit.onclick",
    invokerType: "event-listener",
    ...overrides,
  };
}

function frame(overrides: Partial<LongAnimationFrameEntry> = {}): LongAnimationFrameEntry {
  return {
    startTime: 1000,
    duration: 120,
    blockingDuration: 80,
    scripts: [script()],
    ...overrides,
  };
}

describe("toScriptAttribution", () => {
  it("maps the source url, invoker and duration through", () => {
    const result = toScriptAttribution(
      script({ name: "https://example.com/vendor.js", duration: 42, invoker: "timer" }),
    );
    expect(result).toEqual({
      source: "https://example.com/vendor.js",
      invoker: "timer",
      invokerType: "event-listener",
      duration: 42,
    });
  });
});

describe("toLongAnimationFrame", () => {
  it("carries the frame timing through", () => {
    const result = toLongAnimationFrame(frame({ startTime: 500, duration: 90, blockingDuration: 60 }));
    expect(result.startTime).toBe(500);
    expect(result.duration).toBe(90);
    expect(result.blockingDuration).toBe(60);
  });

  it("ranks scripts longest-running first and names the dominant one", () => {
    const result = toLongAnimationFrame(
      frame({
        scripts: [
          script({ name: "a.js", duration: 10 }),
          script({ name: "b.js", duration: 70 }),
          script({ name: "c.js", duration: 40 }),
        ],
      }),
    );
    expect(result.scripts.map((s) => s.source)).toEqual(["b.js", "c.js", "a.js"]);
    expect(result.dominantScript?.source).toBe("b.js");
    expect(result.dominantScript?.duration).toBe(70);
  });

  it("has a null dominant script when the frame ran none", () => {
    const result = toLongAnimationFrame(frame({ scripts: [] }));
    expect(result.scripts).toEqual([]);
    expect(result.dominantScript).toBeNull();
  });

  it("does not mutate the source scripts array", () => {
    const scripts = [script({ duration: 10 }), script({ duration: 70 })];
    toLongAnimationFrame(frame({ scripts }));
    expect(scripts.map((s) => s.duration)).toEqual([10, 70]);
  });
});

describe("LoafTracker", () => {
  it("attributes an interaction to the frame that contains it", () => {
    const tracker = new LoafTracker();
    tracker.record(frame({ startTime: 0, duration: 100, scripts: [script({ name: "early.js" })] }));
    tracker.record(frame({ startTime: 1000, duration: 200, scripts: [script({ name: "hit.js" })] }));
    tracker.record(frame({ startTime: 5000, duration: 100, scripts: [script({ name: "late.js" })] }));
    // Interaction runs from 1050 to 1150, wholly inside the second frame.
    const attributed = tracker.attribute({ startTime: 1050, duration: 100 });
    expect(attributed?.dominantScript?.source).toBe("hit.js");
  });

  it("picks the frame with the most overlap when several overlap", () => {
    const tracker = new LoafTracker();
    tracker.record(frame({ startTime: 900, duration: 150, scripts: [script({ name: "small.js" })] }));
    tracker.record(frame({ startTime: 1000, duration: 400, scripts: [script({ name: "big.js" })] }));
    // Window 1010..1210: overlaps small.js by 40ms, big.js by 200ms.
    const attributed = tracker.attribute({ startTime: 1010, duration: 200 });
    expect(attributed?.dominantScript?.source).toBe("big.js");
  });

  it("returns null when no frame overlaps the interaction", () => {
    const tracker = new LoafTracker();
    tracker.record(frame({ startTime: 0, duration: 100 }));
    expect(tracker.attribute({ startTime: 5000, duration: 50 })).toBeNull();
  });

  it("does not attribute a frame that merely touches the interaction edge", () => {
    const tracker = new LoafTracker();
    // Frame ends exactly at 1000, interaction starts at 1000: zero overlap.
    tracker.record(frame({ startTime: 800, duration: 200 }));
    expect(tracker.attribute({ startTime: 1000, duration: 50 })).toBeNull();
  });

  it("exposes every recorded frame and clears them on reset", () => {
    const tracker = new LoafTracker();
    tracker.record(frame({ startTime: 0 }));
    tracker.record(frame({ startTime: 1000 }));
    expect(tracker.frames()).toHaveLength(2);
    tracker.reset();
    expect(tracker.frames()).toEqual([]);
    expect(tracker.attribute({ startTime: 0, duration: 100 })).toBeNull();
  });
});
