# Font policy (bundle size — READ BEFORE TOUCHING FONTS)

The app's package size was once **143 MB**, almost entirely because of fonts. This
file is the standing rule so it never regresses.

## The rule

1. **Never `import { X_400Regular } from '@expo-google-fonts/<family>'`.**
   That package entry statically `require`s *every* weight of the family, and
   Metro cannot tree-shake it — so a single named import drags the **whole
   family** into the bundle (Noto Sans SC = 9 × 10 MB = **90 MB**; Merriweather
   = 14 MB; etc.).

2. **Only bundle the weights actually used**, by `require()`-ing the specific
   `.ttf` for each weight directly in `App.tsx`'s `useFonts({...})`.

3. **Glyph-subset the Latin fonts.** The bundled `.ttf` files in `assets/fonts/`
   are subsets (Latin + Latin-1 + Latin Extended-A/B + General Punctuation +
   the handful of symbols the UI uses: → ✓ ─ …), generated with `fonttools`
   (`pyftsubset`). Full families ≈ 20 MB; the subsets total ≈ 2 MB.

4. **Chinese (CJK) is NOT bundled at all.** Chinese falls back to the device's
   system CJK font (Noto Sans CJK on Android, PingFang on iOS). `FONTS.sans*`
   point at Lato for Latin glyphs; CJK uses the system fallback.

## Regenerating a subset (when adding/replacing a weight)

```bash
pip install fonttools --break-system-packages
UNI="U+0020-007E,U+00A0-00FF,U+0100-024F,U+2000-206F,U+2190-21FF,U+2500-2501,U+2713-2714,U+20A0-20BF,U+2122,U+2026,U+2022"
pyftsubset <source .ttf> --unicodes="$UNI" --layout-features='*' --name-IDs='*' \
  --output-file=assets/fonts/<Name>.ttf
```

For the variable **Source Serif** fonts, do NOT pass `--instance` — that would
drop the `wght`/`opsz` axes the reader relies on via `fontVariationSettings`.

## Verify after any font change

- `assets/fonts/` total stays ~2 MB.
- On a device: check the Bible reader (Source Serif + Merriweather, all
  languages) and Chinese UI render with no missing-glyph boxes (□).
