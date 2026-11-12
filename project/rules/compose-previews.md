# Compose previews — render with the Android CLI

Render any `@Preview` to a PNG without driving the IDE by hand:

```bash
android studio render-compose-preview <path/to/File.kt> <PreviewFunction> --output-image-file=tmp/preview.png
```

- Needs a running Android Studio (Quail 1+) with this project open and synced
  (`android studio check` lists instances). `--project=.` when several are open,
  `--print-semantics` for the semantics tree as text.
- `Read` the PNG to look at it. Outputs go in the gitignored `tmp/`.
- New previews sit next to the component (or a `*Previews.kt` beside it), wrapped in the app
  theme, with fake data — never a real ViewModel.
- A known-good example path for this app is in `.agents/rules/project.md`.
