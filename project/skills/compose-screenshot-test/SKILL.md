---
name: compose-screenshot-test
description: Compose Preview Screenshot Testing (AGP com.android.compose.screenshot) — @PreviewTest, reference goldens, updateScreenshotTest / validateScreenshotTest. Use when a UI change needs a screenshot test or the goldens need updating.
---

# Compose Preview Screenshot Testing

`<app>` is `APP_MODULE`, `<Variant>` is `APP_VARIANT` (both in `agent-kit.env`). To render a single preview ad hoc instead, see the
`compose-previews` rule.

| Task | Command |
| --- | --- |
| Check against goldens | `./gradlew <app>:validate<Variant>ScreenshotTest` |
| Record / update goldens | `./gradlew <app>:update<Variant>ScreenshotTest` |

Setup: `alias(libs.plugins.compose.screenshot)` and `experimental.enableScreenshotTest = true` in
the app's `build.gradle.kts`, `android.experimental.enableScreenshotTest=true` in
`gradle.properties`. Tests live in `<app>/src/screenshotTest/kotlin/`, goldens in
`<app>/src/screenshotTest<Variant>/reference/` (committed).

## Writing a test

1. `@PreviewTest` + `@Preview(showBackground = true)`, following the existing tests.
2. Wrap in `AppTheme { }`. Screens taking a DI ViewModel need DI around them
   (`KoinApplication(application = { modules(appModule) }) { }`) or a ViewModel built from fakes.
3. Pass explicit, fixed state and no-op lambdas — nothing device- or time-dependent.

## Workflow

1. Change the UI, run validate. Diffs land in `<app>/build/reports/screenshotTest/` (HTML).
2. Intended change → run update, `Read` a few new PNGs to check them, commit the goldens with the
   code.
