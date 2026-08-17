# leeway

Attributes slow interactions to the frame, script, and component that caused them.

Knowing that your page has a 340ms interaction is not the same as knowing
*why*. leeway watches real user interactions through the
[Event Timing API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming)
and breaks each one down into the phases that make up its latency. Where the
[Long Animation Frames API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming)
is available it goes further, attributing each interaction to the frame it ran
within and the script that dominated that frame — so a slow tap points at a
line of code instead of just a number.

- **Zero runtime dependencies.** One small module, nothing pulled in at runtime.
- **Degrades safely.** Without Long Animation Frames you still get the
  interaction breakdown; without Event Timing (in Node, or older browsers) it
  returns a no-op handle rather than throwing.
- **Typed, testable core.** The entry-processing logic is decoupled from
  `PerformanceObserver`, so it can be driven with plain objects.

## Install

```sh
npm install leeway
```

## Usage

```ts
import { observe } from "leeway";

const latency = observe();

// Later — for example when the page is being hidden — read the worst
// interaction the user experienced and see where its time went.
addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") return;

  const worst = latency.worst();
  if (!worst) return;

  console.log(`slowest interaction: ${worst.type} took ${worst.duration}ms`);
  console.log(`  input delay:        ${worst.inputDelay}ms`);
  console.log(`  processing:         ${worst.processingTime}ms`);
  console.log(`  presentation delay: ${worst.presentationDelay}ms`);

  latency.disconnect();
});
```

Each interaction's total duration is split into three phases:

| Phase | Meaning | A large value points at |
| --- | --- | --- |
| `inputDelay` | Time from the input firing to its handlers running | A busy main thread before the input |
| `processingTime` | How long the event handlers ran | The event handlers themselves |
| `presentationDelay` | Time from handlers finishing to the next paint | Rendering, layout, or style work |

## Frame and script attribution

`handle.report()` pairs the worst interaction with the long animation frame it
ran within, when one can be attributed. The frame's scripts are ranked
longest-running first, and `dominantScript` names the single script that took
the most time — usually the code to fix first.

```ts
import { observe } from "leeway";

const latency = observe();

addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") return;

  const report = latency.report();
  if (!report) return;

  const { interaction, longAnimationFrame } = report;
  console.log(`slowest interaction: ${interaction.type} took ${interaction.duration}ms`);

  if (longAnimationFrame?.dominantScript) {
    const script = longAnimationFrame.dominantScript;
    console.log(`  frame blocked for:  ${longAnimationFrame.blockingDuration}ms`);
    console.log(`  dominated by:       ${script.source} (${script.duration}ms)`);
    console.log(`  invoked as:         ${script.invoker} [${script.invokerType}]`);
  }

  latency.disconnect();
});
```

Where the Long Animation Frames API is unavailable, `report()` still returns the
interaction; `longAnimationFrame` is simply `null`. Probe support ahead of time
with `handle.longAnimationFramesSupported` or `isLongAnimationFrameSupported()`.

Pass options to react to interactions as they happen:

```ts
observe({
  durationThreshold: 40, // only surface interactions of at least 40ms
  onInteraction(interaction) {
    if (interaction.duration > 200) report(interaction);
  },
});
```

If you only need the raw grouping logic — for instance to feed it entries from
your own observer — use `InteractionTracker` directly:

```ts
import { InteractionTracker } from "leeway";

const tracker = new InteractionTracker();
tracker.record(eventTimingEntry);
tracker.worst; // the worst interaction so far, or null
```

## API

- `observe(options?)` — start observing and return a handle.
- `handle.worst()` — the worst interaction seen so far, or `null`.
- `handle.interactions()` — every distinct interaction seen so far.
- `handle.report()` — the worst interaction paired with its long animation
  frame, or `null` if none seen yet.
- `handle.disconnect()` — stop observing.
- `handle.supported` — whether the environment supports Event Timing.
- `handle.longAnimationFramesSupported` — whether the environment supports Long
  Animation Frames.
- `isSupported()` — probe Event Timing support without starting an observer.
- `isLongAnimationFrameSupported()` — probe Long Animation Frames support.
- `InteractionTracker` — the framework-free interaction grouping core.
- `LoafTracker` — the framework-free frame attribution core.

## Support

leeway relies on the Event Timing API's `event` entry type. Where that is
unavailable, `observe()` still returns a handle: `supported` is `false`, the
readers return empty results, and nothing throws.

Frame and script attribution additionally relies on the `long-animation-frame`
entry type, which has narrower support. When it is missing, interactions are
tracked as usual and every report's `longAnimationFrame` is `null`.

## License

MIT
