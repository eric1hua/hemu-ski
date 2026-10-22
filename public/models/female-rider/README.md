# Female rider runtime assets

Copied verbatim from the asset lab's `03-tripo-exports/female-rider-studio-v03/` for Vite production serving. `player.glb` remains the male rider.

- `female-rider-rigfix-walk-run-tex2k-v03.glb`: SHA-256 `3b0a183b0d0e80b8953a5142340347ce399990f4397f76538cdb7a9d2d8f871d`; includes the existing rigid-head and run-hip corrections. No runtime reprocessing.
- `board-assembly-seg-tex2k-v01.glb`: SHA-256 `31c402f7d86537671f8104a89607946d3478999e844fb0224cbabfc9147301b4`.

Female total height is independently set to 1.8 m (including cat ears), male 1.7 m. Riding uses the unchanged procedural pose and two-bone IK. Walking uses AnimationMixer, with smooth speed weights between walk (1.4 m/s) and run (4 m/s). The 0.25 s mode transition blends from the outgoing complete bone pose; returning to riding restores all 65 bones before applying IK.

Deck local X is length, Z width. Its runtime dimensions are 1.56 × 0.27 m; only the deck's width is compressed relative to uniform length scaling. Binding sets 2/3/6 and 1/4/7 are recentered on `rider.feet[0]` and `[1]` in body space, with uniform 1.2 binding scale and a thin sole offset below the boot datum. Existing orange bindings and procedural deck are hidden for this rider.

Play: `/?rider=female`, or choose Female rider under Outfit & gear. F toggles on foot when grounded; W walks, Shift runs, A/D turn, S stops. R resets to riding. Male/classic do not expose walking without clips.

Dev inspection: `/rider-review.html` uses the same Rider implementation, with ride/walk/run, head turn, camera and binding close-up controls. It is intentionally excluded from the production entry points. Browser verification screenshots are in `output/playwright/female-*.png`. User visual approval is separate from these checks.

Verification (2026-10-17): production build and diff checks passed. `node scripts/test-rider-animation.mjs` passes six cases across all 65 bones, including frozen idle entry, authored walk/run mixtures and complete restoration after returning to riding. Focused walk physics checks covered speed, stopping, slopes, holes, boundaries, buildings, trees and cliffs. Chrome checked game input and all three rider selections plus same-runtime close-ups for binding fit, head turn, walk/run and return to riding. Zero console errors; the game still emits its pre-existing THREE.Clock deprecation warning. Settled riding ankle horizontal offsets were about 2.7 / 4.3 mm. Stopped on-foot movement holds the current walk frame because no idle clip was supplied.

- `female-rider-swim-v01.glb`: the swimsuit, for the hot spring, supplied as `anime+girl+3d+model.glb` and copied verbatim. SHA-256 `0ebb2f4420fb2d00d9cbeed490a61cb20d189b2798b3a03e0aff42d758e340c9`. One mesh (a pink string bikini, bare feet, long brown hair, no face drawn on) on the same 65-bone Mixamo skeleton in a T-pose, a 2k JPEG base colour, a unit tall. Listed as her `swim` outfit in `RIDER_MODELS` (`src/player/rider-model.js`). Scale comes from the skeleton (Hips-to-Head trunk matched to the ski model's), not from height, so the missing beanie and boots don't change her size: it comes out 1.72 times the file's units. No rigid-head fix has been applied.

  Its three clips, all in place (no travel), are used for getting in, by how their names start: `Go upstairs, then go downstairs.001` (5 s; `ledge`: a high step up of 0.48 m, a pause on top, then three small steps down that end 0.21 m up), `walk.001` (2.4 s; `wade`, the same walk as the ski model's) and `Like stepping down a few steps, then putting one foot into the ` (5 s, the name cut off at 63 characters; `sitDown`: arms stretched overhead, a squat, then sitting on the ground with legs out, leaning back, hands resting forward). There is no undressing clip, and the sitting down is the end of `sitDown`, not a clip of its own.

Inputs and Tripo steps for the swimsuit: the asset lab's `02-inputs/female-rider-swim-v01/README.md` (local only).
