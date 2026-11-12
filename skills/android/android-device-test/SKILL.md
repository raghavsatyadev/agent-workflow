---
name: android-device-test
description: On-device testing and bug reproduction for an Android app. Fixed steps run as Maestro (or Mobly) flows, ARTEMIS only for really dynamic flows, ADB and dev.sh for install, permissions, logcat and files. Use when a change needs checking on a phone or a bug needs reproducing.
---

# Android device test

Package = `APPLICATION_ID`, module = `APP_MODULE`, variant = `APP_VARIANT` (all in `agent-kit.env`).
The app's own flows, prompts, log tags and gotchas live in the project at **`.agents/flows/`**
(`flows.md` + `*.yaml`) — read that first.

**Use the developer's physical phone** (`adb devices -l`; a preferred model may be named in the
user's global CLAUDE.md). An emulator only when no phone is attached or the user asks — then the global
`headless-emulator` skill (`emu up`), never a windowed one.

## Pick the driver

- **Known steps** (every tap can be written down, system pickers and permission dialogs included):
  a **Maestro** flow in `.agents/flows/`, or a **Mobly** test when it needs Python logic or two
  devices. Fast, no model calls.
- **Really dynamic** (exploration, bug hunts with no known path, accessibility overlays):
  **ARTEMIS**. When a run finds a fixed path, save it as a Maestro flow and replay that next time.
- **Below the UI** (install, grants, logs, files): ADB / `dev.sh`.

## Maestro

```bash
MAESTRO_CLI_NO_ANALYTICS=1 ~/.maestro/maestro/bin/maestro --platform android --device <serial> test .agents/flows
```

Maestro can drive other apps' screens. It **cannot test accessibility overlays**: Android unbinds
the app's accessibility service during a run. If the app has one, keep
`launchApp: {stopApp: false}` in every flow (a force-stop disables the service).

## ARTEMIS

Basics are in the `artemis-mobile-testing` rule. `mobile_get_device_state` for ground truth,
`mobile_inspect_trace` screenshots as evidence; never guess coordinates. Write prompts as explicit
steps: the current screen, each element to tap by name, and what to report (local models loop on
vague goals). Skip `locked_app_package` when the flow leaves the app; check at one minute and stop a
run that hasn't moved, finishing with Maestro or adb.

## ADB and dev.sh

`D=.agents/skills/android-device-test/scripts/dev.sh` — device cache in `memory/devices/`, dumps
in `tmp/` ([workspace-cleanup](../workspace-cleanup/SKILL.md)).

| Task | Command |
| --- | --- |
| Install | `./gradlew <APP_MODULE>:install<APP_VARIANT>` |
| Grant overlay / accessibility | `bash $D grant overlay` / `bash $D grant a11y` |
| Logs | `bash $D log <Tag>` |
| App files | `bash $D files` |
| Launch (not `monkey`) | `adb shell am start -n "$(adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER <pkg> \| tail -1 \| tr -d '\r')"` |
| Keep awake | `adb shell "svc power stayon true; settings put system screen_off_timeout 600000"` |
| Reset app (wipes data) | `adb shell pm clear <pkg>` |

## Gotchas

1. `uiautomator dump` (and `dev.sh dump/find/tap/scroll/wait/gone`) rebinds every accessibility
   service — fine for setup, never while testing one.
2. PowerShell corrupts `adb exec-out screencap -p > f.png`; use `screencap -p /sdcard/s.png` + pull.
3. Git Bash rewrites `/sdcard/…`; prefix `MSYS_NO_PATHCONV=1` (dev.sh does).
4. Wireless debugging may list a phone twice (`… (2)`); `adb disconnect` the `(2)` one, or
   `adb mdns services` → `adb connect ip:port`.
5. Lookalike overlays from other apps (keyboards, assistants): check the owner with
   `adb shell dumpsys window windows | grep -E "Window #|package="`.
6. `connectedDebugAndroidTest` uninstalls the app. Instead install app + test APK, then
   `adb shell am instrument -w -e class <Test> <pkg>.test/androidx.test.runner.AndroidJUnitRunner`.
7. Reinstalling stops overlay/accessibility services: start and grant again, then confirm with
   `adb shell dumpsys accessibility | grep "Bound services"`.
8. `monkey` (and ARTEMIS launches) turn auto-rotate on. Check
   `settings get system accelerometer_rotation` before/after; restore to `0`.
9. A Room schema older than the device DB can stop writes silently: stop the app, then
   `run-as <pkg> sh -c 'rm -f databases/<db>*'`.
10. Screenshot before a coordinate tap; aim at plain text, confirm the next screen.
11. Put back every global setting you change (`animator_duration_scale`, `font_scale`) in the same
    command, and read it back. Record at `--size 720x1560`.
12. Samsung dims and palm-rejects when idle — `svc power stayon true` for long runs.
