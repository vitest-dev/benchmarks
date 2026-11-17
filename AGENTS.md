# Agent notes

- The pinned vitest (4.1.10) is the baseline of the 4.1 vs 5.0 comparison in the README. It is not a reference for current work. Don't measure against it or treat a run on it as validation.
- To measure a change, compare two local builds: vitest `main` and your branch, both linked as in "Benchmarking a local vitest build" in the README. A run that passes on those builds is the check that matters.
- New apps keep the repo-wide pin, only so that they match the other apps. CI's smoke job only checks that every app generates and passes on it.
- The overrides and the `node_modules/vitest` link from that section are local only. Remove them and reinstall when you're done, so the checkout is left on the pinned release.
