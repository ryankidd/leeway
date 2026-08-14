# leeway

Attributes slow interactions to the frame, script, and component that caused them.

Knowing that your page has a 340ms interaction is not the same as knowing
*why*. leeway watches real user interactions through the
[Event Timing API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming)
and breaks each one down into the phases that make up its latency, so a slow
tap points at a cause instead of just a number.

- **Zero runtime dependencies.** One small module, nothing pulled in at runtime.
- **Degrades safely.** In browsers without Event Timing (and in Node), it
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
- `handle.disconnect()` — stop observing.
- `handle.supported` — whether the environment supports Event Timing.
- `isSupported()` — probe support without starting an observer.
- `InteractionTracker` — the framework-free grouping and attribution core.

## Support

leeway relies on the Event Timing API's `event` entry type. Where that is
unavailable, `observe()` still returns a handle: `supported` is `false`, the
readers return empty results, and nothing throws.

## License

MIT
