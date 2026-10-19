# Snowmobile

`snowmobile.glb`: an orange touring snowmobile made with Tripo, supplied as `orange snowmobile 3d model.glb` and copied verbatim. SHA-256 `81ba31bd109f707a20eb811c37ea2e460e1418681fb0b8cf280ff7a6c6a50424`. One mesh (23k triangles, one connected piece) with a 2k JPEG base colour plus roughness and normal maps, nose toward +x, its left toward -z, skis and track on the ground at y = 0, about 1 unit long. It has a seat with a backrest, a cargo box on a rear rack, running boards and a windscreen.

`src/vehicle/snowmobile.js` turns it to the pickup's axes (nose +z, left +x), scales it to 2.6 m (about 1 m wide and 1.3 m to the top of the windscreen), toon-shades it, and cuts the skis out at load by place, since the mesh is one piece: each ski is the triangles wholly ahead of the running boards, below the bumper and outside the tunnel, with the foot of its spindle, and it steers about the spindle. The track doesn't move.

A real touring sled is about 3.2 m; this one is smaller because the riders are chibi, with legs about 0.6 m and arms 0.35–0.47 m long. At 2.6 m each of them can sit with their feet on the running boards and their hands on the grips. The seat, grips, running boards, spindles and the track's footprint are measured off the model and listed at the top of `snowmobile.js`.
