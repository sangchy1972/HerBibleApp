# Translation rounds

Cowork drops one Python file per round here, e.g. `round2.py`, `round3.py`.

Each file:
1. Defines a `T` dict mapping `hash → {lang: translation_text}`
2. Reads `scripts/.translation_progress/cache.json`
3. Applies the dict (skips keys already present)
4. Writes the updated cache back

User runs `python3 round<N>.py` after cowork delivers it, then commits the
cache change, then rebuilds and pushes the corpus.

See `../README.md` "How a translation round works" for the full template
and command sequence.

## Numbering

| Round | Status | Entries | Books covered |
|-------|--------|---------|---------------|
| 1 (demo) | merged (manual) | 52 | 1 Peter + 1 John partial |
| 2 | pending | — | cowork picks |
| ... | — | — | — |

Cowork: append a row here when starting each round.
