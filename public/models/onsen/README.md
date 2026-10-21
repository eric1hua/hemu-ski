# Hot spring

Two Tripo models, copied verbatim, that `src/world/onsen.js` puts together into the hot spring behind the East Service Centre.

`stone-arena.glb`: a ring of snow-capped boulders round a flagstone floor, supplied as `stone+arena+3d+model.glb`. SHA-256 `6ab2a530ca8f1115acd0c8d21602541af292d126cb72f9b1a4bb342f988c4d1b`. One mesh (9.1k triangles) with a 2k JPEG base colour, a unit across and 0.26 tall, on the ground at y = 0. Its rocks stand tallest along -z and -x and lowest along +x and +z, where a flat stone (0.12 tall) spans a gap in the ring; the floor inside is 0.02–0.06 up.

`cave-rock.glb`: a snowy boulder with a cave in its face and a wooden trough running out of it, supplied as `rock with snow cave 3d model.glb`. SHA-256 `3fe3c4e48700e9cd8e5988c58d99eedb3083687d55b3c20bf0eea2522b3b7f55`. One mesh (2k triangles) with a 1k JPEG base colour, 0.9 tall, on the ground at y = 0. The rock runs from z -0.49 to 0.08 and the trough on out to its lip at z 0.488, its two rails either side of x -0.04, about 0.48 up. It has no floor between them.

`onsen.js` scales the ring to 7.2 m across and 6 tall (its rocks 0.9–1.6 m), with the gap facing the hall, and stands the cave rock 3 times its size (2.7 m) just outside the ring on the +x side, its trough reaching in over the rocks. The water's outline is found at load from the ring's own shape: the highest surface over a 5 cm grid, then from the middle outward to where the rocks first stand above the water, 0.66 m up. A re-export with a different shape still fills; one turned or resized needs the numbers at the top of `onsen.js` measured again.
