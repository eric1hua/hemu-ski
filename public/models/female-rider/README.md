# Female rider runtime assets

Copied verbatim from `tirpo assets lab/03-tripo-exports/female-rider-studio-v03/` for Vite production serving. `player.glb` remains the male rider.

- `female-rider-rigfix-walk-run-tex2k-v03.glb`: SHA-256 `3b0a183b0d0e80b8953a5142340347ce399990f4397f76538cdb7a9d2d8f871d`; includes the existing rigid-head and run-hip corrections. No runtime reprocessing.
- `board-assembly-seg-tex2k-v01.glb`: SHA-256 `31c402f7d86537671f8104a89607946d3478999e844fb0224cbabfc9147301b4`.

Female total height is independently set to 1.8 m (including cat ears), male 1.7 m. Riding uses the unchanged procedural pose and two-bone IK. Walking uses AnimationMixer, with smooth speed weights between walk (1.4 m/s) and run (4 m/s). The 0.25 s mode transition blends from the outgoing complete bone pose; returning to riding restores all 65 bones before applying IK.

Deck local X is length, Z width. Its runtime dimensions are 1.56 × 0.27 m; only the deck's width is compressed relative to uniform length scaling. Binding sets 2/3/6 and 1/4/7 are recentered on `rider.feet[0]` and `[1]` in body space, with uniform 1.2 binding scale and a thin sole offset below the boot datum. Existing orange bindings and procedural deck are hidden for this rider.

Play: `/?rider=female`, or choose Female rider under Outfit & gear. F toggles on foot when grounded; W walks, Shift runs, A/D turn, S stops. R resets to riding. Male/classic do not expose walking without clips.

Dev inspection: `/rider-review.html` uses the same Rider implementation, with ride/walk/run, head turn, camera and binding close-up controls. It is intentionally excluded from the production entry points. Browser verification screenshots are in `output/playwright/female-*.png`. User visual approval is separate from these checks.

Verification (2026-10-17): production build and diff checks passed. `node scripts/test-rider-animation.mjs` passes six cases across all 65 bones, including frozen idle entry, authored walk/run mixtures and complete restoration after returning to riding. Focused walk physics checks covered speed, stopping, slopes, holes, boundaries, buildings, trees and cliffs. Chrome checked game input and all three rider selections plus same-runtime close-ups for binding fit, head turn, walk/run and return to riding. Zero console errors; the game still emits its pre-existing THREE.Clock deprecation warning. Settled riding ankle horizontal offsets were about 2.7 / 4.3 mm. Stopped on-foot movement holds the current walk frame because no idle clip was supplied.
