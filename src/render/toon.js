// Cel shading in the reference's style: two flat tones (warm lit / teal shadow)
// with a crisp terminator, plus sparse screen-space hatching inside shadows.
// Built on MeshLambertMaterial so shadows, fog, instancing and vertex colors all
// keep working; we only replace how the final color is assembled.
import * as THREE from 'three';

export const toonUniforms = {
  uLitTint: { value: new THREE.Color('#fff6e6') },
  uShadowTint: { value: new THREE.Color('#9fc4cc') },
  uSunIntensity: { value: 3.0 },
  uPixelRatio: { value: 1 },
};

const NOISE_GLSL = /* glsl */ `
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1, 0)), u.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), u.x), u.y);
}
`;

// `piste` (with `snow`): the geometry has an aPiste attribute (across the run,
// along it, how groomed: see world/terrain.js), and groomed snow gets corduroy.
export function makeToon(params = {}, opts = {}) {
  const { hatch = 1, rim = 0, snow = 0, piste = 0 } = opts;
  const mat = new THREE.MeshLambertMaterial(params);
  if (piste) mat.defines = { ...mat.defines, TOON_PISTE: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, toonUniforms);
    shader.uniforms.uHatch = { value: hatch };
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uSnow = { value: snow };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTWorld;
        #ifdef TOON_PISTE
          attribute vec3 aPiste;
          varying vec3 vPiste;
        #endif`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 tw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            tw = instanceMatrix * tw;
          #endif
          vTWorld = (modelMatrix * tw).xyz;
          #ifdef TOON_PISTE
            vPiste = aPiste;
          #endif
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTWorld;
        uniform vec3 uLitTint;
        uniform vec3 uShadowTint;
        uniform float uSunIntensity;
        uniform float uPixelRatio;
        uniform float uHatch;
        uniform float uRim;
        uniform float uSnow;
        #ifdef TOON_PISTE
          varying vec3 vPiste;
        #endif
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 base = diffuseColor.rgb;
          if (uSnow > 0.0) {
            // Painterly snow surface: soft drifts, wind-blown strokes and
            // flecks, faded out with distance so it never shimmers.
            vec2 w = vTWorld.xz;
            float near = 1.0 - smoothstep(60.0, 260.0, length(vViewPosition));
            float drift = tNoise(w * 0.045) * 0.6 + tNoise(w * 0.18) * 0.4;
            base *= 1.0 - drift * 0.05;
            vec2 sw = vec2(w.x * 0.9 + w.y * 0.4, w.y * 0.25 - w.x * 0.1);
            float stroke = smoothstep(0.66, 0.7, tNoise(sw * 1.3)) * smoothstep(0.35, 0.6, tNoise(w * 0.07 + 7.0));
            float fleck = step(0.985, tHash(floor(w * 2.2)));
            float groomed = 0.0;
            #ifdef TOON_PISTE
            {
              // Corduroy: the groomer's ribs along the run, in lanes a tiller
              // wide with a seam between them, scuffed away in patches, and a
              // ragged edge where the grooming stops. Each fades out before
              // it's too fine to draw.
              float along = vPiste.y;
              float o = vPiste.x + (tNoise(vec2(along * 0.008, 1.7)) - 0.5) * 1.2; // the groomer wanders
              float m = smoothstep(0.35, 0.65, vPiste.z + (tNoise(vec2(along * 0.25, o * 0.6)) - 0.5) * 0.35);
              float rib = o / 0.18;
              float ribs = (0.5 + 0.5 * cos(rib * 6.2831853)) * (1.0 - smoothstep(0.3, 0.7, fwidth(rib)));
              float lane = o / 4.4;
              float seamD = min(fract(lane), 1.0 - fract(lane)) * 4.4;
              float seam = (1.0 - smoothstep(0.04, 0.16, seamD)) * (1.0 - smoothstep(0.08, 0.3, fwidth(o)));
              float worn = smoothstep(0.45, 0.8, tNoise(vec2(along * 0.035, o * 0.12) + floor(lane) * 1.31));
              base *= 1.0 - m * (ribs * 0.1 * (1.0 - worn * 0.85) + seam * 0.09);
              groomed = m;
            }
            #endif
            base *= 1.0 - (stroke * 0.07 + fleck * 0.06) * near * (1.0 - groomed);
          }
          float lum = max(dot(base, vec3(0.299, 0.587, 0.114)), 1e-4);
          float direct = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114)) / lum;
          direct *= PI / uSunIntensity;            // ~ N.L * shadow, 0..1
          // Wobble the terminator a little so it reads as painted, not computed.
          float wob = (tNoise(vTWorld.xz * 0.35 + vTWorld.y * 0.2) - 0.5) * 0.08;
          float lit = smoothstep(0.24 + wob, 0.30 + wob, direct);
          float full = smoothstep(0.55 + wob, 0.6 + wob, direct);
          // Three flat tones: shadow, mid (turning away from the sun), lit.
          vec3 col = mix(base * uShadowTint, base * mix(uShadowTint, uLitTint, 0.68), lit);
          col = mix(col, base * uLitTint, full);

          // Hatching: diagonal ink strokes in patches of shadow.
          vec2 sc = gl_FragCoord.xy / uPixelRatio;
          float stripe = abs(fract((sc.x + sc.y) / 7.0) - 0.5);
          float line = 1.0 - smoothstep(0.06, 0.13, stripe);
          float patchy = smoothstep(0.45, 0.7, tNoise(vTWorld.xz * 0.08 + vTWorld.y * 0.05));
          col *= 1.0 - line * patchy * (1.0 - lit) * 0.16 * uHatch;

          // Optional pale rim on the lit side for characters.
          float rimF = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
          col += uRim * rimF * lit * 0.25;

          outgoingLight = col + totalEmissiveRadiance;
        }
        #include <opaque_fragment>`,
      );
  };
  // Distinct program cache key per option combination.
  mat.customProgramCacheKey = () => `toon-${hatch}-${rim}-${snow}-${piste}`;
  return mat;
}
