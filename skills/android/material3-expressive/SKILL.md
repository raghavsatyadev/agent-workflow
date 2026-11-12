---
name: material3-expressive
description: Material 3 Expressive UI conventions — motion roles, shapes, type, colour, reduced motion, haptics, container transforms and frame-by-frame motion checks. Use when building, restyling or reviewing a Compose screen, component or animation.
---

# Material 3 Expressive

The app theme (`AppTheme`, usually `.../support/theme/Theme.kt`) wraps `MaterialExpressiveTheme`
with `MotionScheme.expressive()`, the project type and shapes. Files using expressive APIs need
`@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)`. In a CMP app all of this is `commonMain`.
The app's own theme path and components are in `.agents/rules/project.md`.

Helpers named here (`AppMotion`, `animationsEnabled()`, `StaggeredEntrance`, `DriftingShape`,
`sharedContainer`, `liquidRipple`, `ThemeReveal`, `CelebrationOverlay`) have a reference
implementation in [SimpleCricketUmpireScorer](https://github.com/raghavsatyadev/SimpleCricketUmpireScorer/tree/migration-cmp)
(`composeApp/.../support/theme/` and `support/components/`). Copy one in the first time a screen
needs it instead of re-deriving its numbers.

## Motion roles (`AppMotion`)

Pick the spec by what moves:

| What moves | Spec |
| --- | --- |
| A value read as data (count, %, progress end) | `dataSpec()` / `tapDataSpec()` (changes every tap) — critically damped, never shows a value it doesn't have |
| A container (card, pane, sheet, button size, list placement) | `containerSpec()` / `motionScheme.*SpatialSpec()` — may bounce a little |
| Alpha, colour, tint, scrim, elevation | `effectsSpec()` / `motionScheme.*EffectsSpec()` — never past 0 or 1 |
| A gesture-driven transition (predictive back) | `scrubSpec()` (linear tween) |
| A decorative endless loop | `driftSpec()` (linear, 60 s) |
| First-open list cascade | `StaggeredEntrance` (180 ms, 40 ms steps, cap 120 ms, `play = false` after the first) |

- Springs from `MaterialTheme.motionScheme` for state changes; `tween` only for the last three rows.
  Fast tier for toggles/icons, default for cards/dialogs/sheets, slow for full-screen transforms.
- Animate scale/translation/rotation/alpha in `Modifier.graphicsLayer { }` and read state inside it.
- Grow a container from its own edge, not the centre.
- Desktop hover changes effects only (`fastEffectsSpec`), never size or position. iOS: never block
  the edge-swipe back.

**Reduced motion:** `animationsEnabled()` is false when system animations are off or
`LocalReduceMotion` is set. Check it for motion Compose doesn't time (infinite loops, wavy
indicators) and to swap spatial motion for a short fade. Every meaning carried by motion also needs a
static form (colour, text, icon).

## Shape, type, colour

- Cards 24 dp (`shapes.large`), sheets/hero 28–32 dp, pills `shapes.small`. Buttons take
  `shapes = ButtonDefaults.shapes()` so they morph on press; connected groups use
  `ButtonGroupDefaults.connectedLeading/TrailingButtonShapes()`.
- `MaterialShapes` (`Cookie9Sided`, `Clover4Leaf`, `Sunny`, `Gem`, …) `.toShape()` for identity:
  each identity gets its own shape as well as colour. Morph with
  `Morph(a, b)` built once, drawn via a `Shape` calling `morph.toPath(progress, Path())`.
- `MaterialTheme.typography` only; emphasise with weight. Display/headline use `"tnum"` so changing
  numbers don't shift.
- `MaterialTheme.colorScheme` roles only — never `Color(0x…)` in UI; add new colours to the theme.
  Error for "behind"/destructive. Shimmer light: white 0.65 alpha on light, 0.45 on dark.

## Patterns

- **Wavy stays wavy.** Pick a progress style per screen, never per state. Pass
  `amplitude = { 1f }` to `LinearWavyProgressIndicator` or it flattens near 0 and 1. Flat
  (`StrokeCap.Round`) only when animations are off. Signal trouble with colour and text.
- **One hero motion per screen** (a slow `DriftingShape`), not motion everywhere.
- **Selection pop:** newly selected chip → 1.25 on `StiffnessMedium`, back on
  `DampingRatioMediumBouncy` + `StiffnessLow`. **Press:** custom surfaces scale to ~0.96.
- **Swapping content:** `AnimatedContent` slide + fade, `SizeTransform(clip = false)`; pane swap
  `fadeIn + scaleIn(0.98f)`.
- **Loading:** `LoadingIndicator`/`ContainedLoadingIndicator`, shown only after ~400 ms. Late
  content fades in; never `animateContentSize` on a block that loads during a transition.
- **FAB:** `SmallExtendedFloatingActionButton` on list screens; Medium/Large only when that action
  is the screen's one job. A form's submit is `ButtonDefaults.MediumContainerHeight`, full width.
- **Stale data:** 0.6 alpha, 0.15 saturation, plus a text reason.
- **Empty state:** `DriftingShape` + icon, `headlineSmall` title, `bodyLarge` hint; collect with
  `initial = null` so it doesn't flash on open.
- **Delete confirms** in an `AlertDialog`, confirm button in `colorScheme.error`. **Form errors**
  are inline (`isError` + `supportingText`).
- **Search/filter/sort:** `SearchBar` or pill field; `FilterChip` row; sort via `DropdownMenu`;
  keep choices in `rememberSaveable`/ViewModel.
- **Haptics:** `SegmentTick` add, `Reject` undo, `GestureThresholdActivate`/`GestureEnd` drags,
  `Confirm` done.
- **Busy controls never scroll away.** Pin repeated-input controls and their value below the scroll;
  only secondary details scroll (`BoxWithConstraints(weight(1f))` + `verticalScroll` +
  `heightIn(min = maxHeight)`).
- **Font scale 1.5:** `adb shell settings put system font_scale 1.5`, check every changed screen,
  reset to 1.0. Shared rows need `weight`/`preferredWrapContent`; "place · time" lines are `FlowRow`.
- Icons: `Icons.Rounded.*` selected, `Icons.Outlined.*` unselected — no emoji.

## Motion judgement ([rock3r/android-ux-skills](https://github.com/rock3r/android-ux-skills))

- **Frequency sets the ceiling** (T-009): 100+ taps/day → component press only; tens → fast;
  rare → delight allowed.
- **A correction is not a celebration** (T-027): undo resolves plainer and faster, `Reject` haptic.
- **Never gate input on animation** (T-012); **motion starts on the input frame** (T-023).
- **Exits only fade** (T-010); **back retraces forward** (T-024).
- **`animateContentSize` clips** (F-006): never on an elevated `Card`/`Surface`; put it inside.

## Container transform (card → screen)

Each rule fixed a glitch seen frame by frame; keep all of them.

1. `SharedTransitionLayout` around `NavDisplay(sharedTransitionScope = this)`; entries pass
   `LocalNavAnimatedContentScope.current`. Card and screen `Scaffold` share one key, `sharedBounds`
   outermost.
2. `resizeMode = scaleToBounds(ContentScale.FillWidth, Alignment.TopCenter)` — `RemeasureToBounds`
   reflows text mid-flight.
3. Bounds on `screenTransformSpec()` (critically damped, ~450 ms): no edge overshoot.
4. Keep the list behind: `fadeIn(tween(500), initialAlpha = 0.99f) togetherWith
   fadeOut(tween(120, delayMillis = 380))`. `EnterTransition.None` makes bounds snap.
5. Complete on frame one: pass the record in the route and show it synchronously until the DB copy
   arrives.
6. Animate the overlay clip corner from the card radius to 0 on the entry's visibility transition.
7. `enter = fadeIn(defaultEffectsSpec)`, `exit = fadeOut(fastEffectsSpec)`.
8. Reduced motion: no shared bounds, just fade.
9. Key pieces (title, number, pill) fly on their own: `sharedBounds` per piece
   (`item-<id>-score`), `scaleToBounds(ContentScale.Fit, Alignment.Center)`, same spec. A piece
   shown twice on one side gets one key.
10. Every piece needs a twin: split composite labels into parts on the card, and show them in a
    compact destination header, or they only fade.

## Verify motion on a device

Screenshots and previews don't show motion bugs. Record and read frame by frame on an emulator or
test device (not the user's phone). Judge jank only on a release build (F-009); glitches in what
moves show in debug too.

```bash
adb -s <serial> shell screenrecord --time-limit 6 --size 720x1560 /sdcard/rec.mp4 &   # then tap
adb -s <serial> pull /sdcard/rec.mp4 tmp/rec.mp4
ffmpeg -i tmp/rec.mp4 -vf "crop=iw:ih-120:0:120,select='gt(scene,0.004)',showinfo" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*'
ffmpeg -y -ss <t-0.1> -i tmp/rec.mp4 -t 1.06 -vf "fps=30,scale=180:-1,tile=8x4" tmp/sheet.png
```

A jump, a pop-in, a frozen region or two layers at once is a glitch. Seed realistic data first
(`run-as <pkg>`). `dumpsys gfxinfo <pkg> framestats` separates jank from a transition bug.

## Review checklist

- [ ] No overshoot on data values or alpha; `tween` only where the table allows.
- [ ] Transforms in `graphicsLayer`; infinite motion stops when `animationsEnabled()` is false.
- [ ] Scheme colours, theme type and shapes only.
- [ ] New transitions recorded and read frame by frame; jank claims from release.
- [ ] Input live during animation; undo plainer than do; exits fade; back retraces.
- [ ] Busy controls pinned; checked at font scale 1.5; progress style fixed per screen.

Sketch new screens in [M3E Canvas](https://lnkiai.github.io/m3e-canvas/). Patterns adapted from
[rock3r/headroom](https://github.com/rock3r/headroom) and rock3r/android-ux-skills (Apache-2.0).
