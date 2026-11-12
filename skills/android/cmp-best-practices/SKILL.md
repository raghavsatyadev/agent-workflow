---
name: cmp-best-practices
description: Compose Multiplatform conventions — source-set layout, UDF state, resources, dependencies, Compose stability and recomposition, expect/actual boundaries. Use when writing or reviewing shared Kotlin or Compose code.
---

# Compose Multiplatform conventions

Targets for new or rewritten code. In a bug fix, apply them to what you touch only. Project
exceptions (module names, strings policy, test policy) are in `.agents/rules/project.md` and win.

## Layout

```text
<shared-module>/src/
├── commonMain/composeResources/{values,drawable,font}/   # strings.xml, images, fonts
├── commonMain/kotlin/<package>/                          # logic, ui/, di/, theme/
└── androidMain/ iosMain/ jvmMain/                        # platform bindings only
<app-module>/src/                                         # host app shell (APP_MODULE in agent-kit.env)
```

Logic goes in `commonMain`; platform source sets only bridge to OS APIs.

## Rules

- **Strings:** user-facing text in `composeResources/values/strings.xml`, via
  `stringResource(Res.string.x)`.
- **Dependencies:** only through `gradle/libs.versions.toml`; never inline coordinates.
- **UDF:** per screen an `@Immutable` `UiState`, a sealed `UiEvent` handled by one `onEvent`,
  one-shot effects via `Channel` → `Flow`. Private `MutableStateFlow` exposed as `StateFlow`,
  updated with `update { it.copy(...) }`.
- **expect/actual:** small, primitive bridges at the system boundary; no platform types in
  `commonMain` signatures.
- **Colours:** scheme tokens only — see [material3-expressive](../material3-expressive/SKILL.md).
  UI states get golden images — see [compose-screenshot-test](../compose-screenshot-test/SKILL.md).

## Recomposition

From [skydoves/compose-performance-skills](https://github.com/skydoves/compose-performance-skills).

- `@Immutable`/`@Stable` only when true; prefer `ImmutableList`/`persistentListOf` parameters.
- No `Flow` parameters: collect at the screen (`collectAsStateWithLifecycle()`), pass values down
  (or `() -> T` for very hot values).
- Hoist fresh literals (`listOf`, objects, non-capturing lambdas) into `remember {}` or top-level
  constants; strong skipping compares unstable args by `===`.
- Hot values in later phases: `graphicsLayer { }`, `Modifier.offset { }`, never
  `Modifier.alpha(state.value)`. Never write state already read in the same pass.
- `derivedStateOf` only inside `remember(keys)` and when output changes less than input; never on a
  `collectAsState` result — filter the flow (`distinctUntilChanged`, `conflate`).
- Key every effect on what it captures; `rememberUpdatedState` for callbacks in long-lived
  `LaunchedEffect`; `DisposableEffect` for listeners; no allocation in `SideEffect`.
- Lazy lists: `key` = stable domain id (never index), plus `contentType`. No `BoxWithConstraints`
  in items, no nested `Scaffold`.
- Claim a performance win only from a release build on a device, before and after.
