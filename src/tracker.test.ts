import { describe, expect, it } from "vitest";
import { InteractionTracker, toInteraction } from "./tracker.js";
import type { EventTimingEntry } from "./types.js";

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

describe("toInteraction", () => {
  it("splits an entry into its three latency phases", () => {
    const result = toInteraction(entry());
    expect(result.inputDelay).toBe(10); // processingStart - startTime
    expect(result.processingTime).toBe(40); // processingEnd - processingStart
    expect(result.presentationDelay).toBe(50); // start + duration - processingEnd
    expect(result.inputDelay + result.processingTime + result.presentationDelay).toBe(
      result.duration,
    );
  });

  it("carries type, id and start time through", () => {
    const result = toInteraction(entry({ name: "keydown", interactionId: 7, startTime: 200 }));
    expect(result.type).toBe("keydown");
    expect(result.id).toBe(7);
    expect(result.startTime).toBe(200);
  });

  it("clamps phases at zero when timestamps overlap", () => {
    const result = toInteraction(
      entry({ startTime: 1000, processingStart: 1000, processingEnd: 1005, duration: 4 }),
    );
    expect(result.inputDelay).toBe(0);
    expect(result.presentationDelay).toBe(0); // 1000 + 4 - 1005 = -1, clamped
  });

  it("treats a missing interactionId as zero", () => {
    const { interactionId, ...rest } = entry();
    void interactionId;
    expect(toInteraction(rest).id).toBe(0);
  });
});

describe("dominantPhase", () => {
  it("names presentation when the paint is the longest phase", () => {
    // input 10, processing 40, presentation 50
    expect(toInteraction(entry()).dominantPhase).toBe("presentation");
  });

  it("names processing when the handlers are the longest phase", () => {
    const result = toInteraction(entry({ processingEnd: 1090, duration: 100 }));
    // input 10, processing 80, presentation 0
    expect(result.dominantPhase).toBe("processing");
  });

  it("names input when the delay before the handlers is the longest phase", () => {
    const result = toInteraction(entry({ processingStart: 1080, processingEnd: 1090, duration: 100 }));
    // input 80, processing 10, presentation 10
    expect(result.dominantPhase).toBe("input");
  });

  it("breaks a tie toward the earlier phase", () => {
    const result = toInteraction(entry({ processingStart: 1040, processingEnd: 1080, duration: 80 }));
    // input 40, processing 40, presentation 0
    expect(result.dominantPhase).toBe("input");
  });
});

describe("InteractionTracker", () => {
  it("starts empty", () => {
    const tracker = new InteractionTracker();
    expect(tracker.worst).toBeNull();
    expect(tracker.interactions).toEqual([]);
  });

  it("ignores entries with no interactionId", () => {
    const tracker = new InteractionTracker();
    expect(tracker.record(entry({ interactionId: 0 }))).toBeNull();
    const { interactionId, ...rest } = entry();
    void interactionId;
    expect(tracker.record(rest)).toBeNull();
    expect(tracker.worst).toBeNull();
  });

  it("records the worst interaction by duration", () => {
    const tracker = new InteractionTracker();
    tracker.record(entry({ interactionId: 1, duration: 50 }));
    tracker.record(entry({ interactionId: 2, duration: 340 }));
    tracker.record(entry({ interactionId: 3, duration: 120 }));
    expect(tracker.worst?.id).toBe(2);
    expect(tracker.worst?.duration).toBe(340);
    expect(tracker.interactions).toHaveLength(3);
  });

  it("keeps the longest event within a single interaction", () => {
    const tracker = new InteractionTracker();
    // Same interactionId, several events (pointerdown, pointerup, click).
    tracker.record(entry({ interactionId: 5, name: "pointerdown", duration: 40 }));
    tracker.record(entry({ interactionId: 5, name: "pointerup", duration: 180 }));
    tracker.record(entry({ interactionId: 5, name: "click", duration: 90 }));
    expect(tracker.interactions).toHaveLength(1);
    expect(tracker.worst?.type).toBe("pointerup");
    expect(tracker.worst?.duration).toBe(180);
  });

  it("returns the interaction only when it advances the recorded duration", () => {
    const tracker = new InteractionTracker();
    expect(tracker.record(entry({ interactionId: 9, duration: 100 }))?.duration).toBe(100);
    expect(tracker.record(entry({ interactionId: 9, duration: 80 }))).toBeNull();
    expect(tracker.record(entry({ interactionId: 9, duration: 150 }))?.duration).toBe(150);
    expect(tracker.worst?.duration).toBe(150);
  });

  it("forgets everything on reset", () => {
    const tracker = new InteractionTracker();
    tracker.record(entry({ interactionId: 1, duration: 200 }));
    tracker.reset();
    expect(tracker.worst).toBeNull();
    expect(tracker.interactions).toEqual([]);
  });
});
