# Old English Sheepdog

`old-english-sheepdog.glb`: Mantou (馒头), the dog who lives at the top of the mountain (`src/dog/`). A Tripo-made shaggy cream sheepdog, rigged in Blender with Rigify's wolf rig, exported by `scripts/export-dog.py` from `tirpo assets lab/03-tripo-exports/white-dog-wolf-rig-v01/white-dog-wolf-rig-v06.blend` (local only). The .blend is read and never saved:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b "tirpo assets lab/03-tripo-exports/white-dog-wolf-rig-v01/white-dog-wolf-rig-v06.blend" --python scripts/export-dog.py -- "$PWD/public/models/dog/old-english-sheepdog.glb"
```

One mesh (8,640 vertices, 10.9k faces, every vertex weighted, four weights each at most), one material with a 2K JPEG base colour (down from the source's 8K), no animations. About a unit long nose to tail and 0.71 tall to the top of its head, its paws on the ground at y = 0, facing +z with its left toward +x. The game shows it at 1.3 times that: 0.6 m at the shoulder.

The skeleton is 35 bones, every one a deform bone, built from the Rigify rig's deform bones at their rest positions; its 823 controls, mechanism bones and constraints stay in Blender. Each bone points along its own +y to the next joint:

- `root` (on the ground under the hips) → `hips` → `spine` → `spine1` → `spine2` → `chest` → `neck` → `neck1` → `head` → `jaw` → `tongue` → `tongue1` → `tongue2`
- `hips` → `tail` → `tail1` → `tail2` → `tail3` (root to tip; Rigify chains it tip first)
- `chest` → `shoulder_L` → `upperArm_L` → `forearm_L` → `pastern_L` → `paw_L`, and `_R`
- `hips` → `thigh_L` → `shin_L` → `hock_L` → `hindPaw_L`, and `_R`

Rigify's second half of each limb bone (`thigh.001` and so on) carries no weights, so each leg bone runs on to the next joint instead. The neck bones carry no weights either (the mesh bends between `chest` and `head`); the ears, eyelids and lips have none, so they don't move. A few weights on the rig's own root bone (on the rump, left by automatic weighting) were moved to `hips`. The sides are `_L` and `_R` because three.js drops the dots from node names.

The game poses the dog in code each frame (`src/dog/rig.js`, `body.js`): no clips. The source .blend's five clips (walk, run, sit, look up and wag, lie down) are on the original Tripo skeleton, not this one, and aren't used. Folding the hind legs far (sitting, lying down) stretches the fur a little at the hips, as it does in Blender.

Dev inspection: `/dog-review.html` (dev server only) shows the same rig and body on a grid, with every posture, gait speed and one-off on a button and the head, tail, mouth and mood on sliders.
