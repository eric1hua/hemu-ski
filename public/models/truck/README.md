# Pickup truck

`pickup.glb`: a red pickup made with Tripo, supplied as `red+pickup+truck+3d+model.glb` and copied verbatim. SHA-256 `e79c6eb212f8b57d4124c527bfa3fe2b02d2c70d526dcc9daada6554c8857276`. One mesh (52k triangles) with a 2k JPEG base colour, nose toward +z, left toward +x, wheels on the ground at y = 0, about 1 unit long.

`src/vehicle/truck.js` scales it to 5.6 m bumper to bumper (about 2.4 m wide without the mirrors and 2.2 m tall), toon-shades it, and splits it at load: the four tyres are the ground-touching connected pieces about as tall as they are long, the pieces centred on their axles (the rims) roll with them, and the brake callipers turn with the front wheels without rolling. If the split doesn't find four tyres, the truck still drives with its wheels fixed.
