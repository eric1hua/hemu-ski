// Ink outlines + paper finish.
// Pass 1 renders the lit scene with a depth texture; pass 2 renders view-space
// normals. Stable, thin depth/normal edges preserve the ink style without
// animated sampling offsets or a second halo outside each silhouette.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uPixelRatio;
uniform float uDepthScale;
uniform float uLineWidth;
uniform float uLineOpacity;
uniform vec3 uInk;
uniform vec3 uFogInk;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float viewDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(z, uNear, uFar) * uDepthScale;
}
vec3 nrm(vec2 uv) {
  vec3 n = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
  return n / max(length(n), 0.001);
}
float crease(vec3 centre, vec2 uv, float dc) {
  // A different depth surface belongs to the silhouette pass. Comparing its
  // normal as well paints a second, displaced contour (especially on hair).
  float dz = abs(viewDepth(uv) - dc) / max(dc, 0.001);
  float sameSurface = 1.0 - smoothstep(0.008, 0.025, dz);
  float covered = step(0.5, texture2D(tNormal, vUv).a) * step(0.5, texture2D(tNormal, uv).a);
  return (1.0 - clamp(dot(centre, nrm(uv)), -1.0, 1.0)) * sameSurface * covered;
}

void main() {
  vec2 px = 1.0 / uRes;
  float dc = viewDepth(vUv);
  // Radius in CSS pixels, independent of DPR. Keep sampling fixed in time:
  // moving it at 6 Hz used to make even a stationary model's outline jump.
  float near = 1.0 - smoothstep(4.0, 260.0, dc);
  float w = mix(0.65, 0.95, near) * uLineWidth * uPixelRatio;
  vec2 o = vec2(w) * px;

  float dl = viewDepth(vUv - vec2(o.x, 0.0));
  float dr = viewDepth(vUv + vec2(o.x, 0.0));
  float dd = viewDepth(vUv - vec2(0.0, o.y));
  float du = viewDepth(vUv + vec2(0.0, o.y));
  // Keep the near-surface half of the Laplacian: abs() marked both sides,
  // doubling the band and leaving a halo outside the actual model.
  float lap = max(0.0, dl + dr + dd + du - 4.0 * dc) / max(dc, 0.001);
  float depthEdge = smoothstep(0.035, 0.09, lap);

  vec3 nc = nrm(vUv);
  float ndiff = 0.0;
  ndiff += crease(nc, vUv - vec2(o.x, 0.0), dc);
  ndiff += crease(nc, vUv + vec2(o.x, 0.0), dc);
  ndiff += crease(nc, vUv - vec2(0.0, o.y), dc);
  ndiff += crease(nc, vUv + vec2(0.0, o.y), dc);
  float normalEdge = smoothstep(0.55, 0.95, ndiff) * (1.0 - smoothstep(150.0, 600.0, dc));

  float edge = max(depthEdge, normalEdge * 0.55);
  // Break long lines up a touch, like a dry pen.
  edge *= 0.75 + 0.25 * noise(vUv * uRes / uPixelRatio * 0.12);

  vec3 col = texture2D(tColor, vUv).rgb;
  // Distant lines fade toward the haze color instead of staying black.
  float far = smoothstep(800.0, 14000.0, dc);
  vec3 ink = mix(uInk, uFogInk, far);
  col = mix(col, ink, edge * uLineOpacity * mix(1.0, 0.6, far));

  // Paper grain + soft vignette.
  vec2 sc = gl_FragCoord.xy / uPixelRatio;
  float grain = hash(floor(sc * 0.5)) - 0.5;
  col *= 1.0 + grain * 0.05;
  float vig = smoothstep(1.25, 0.45, length(vUv - 0.5) * 1.6);
  col *= mix(0.9, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class InkPost {
  // `depthScale` maps view depth onto the metre-based line thresholds below, so a
  // scene viewed from far away (the diorama) still gets close-up line weights.
  constructor(renderer, { depthScale = 1, lineWidth = 1, lineOpacity = 0.72 } = {}) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType };
    this.colorRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, samples: 4 });
    this.colorRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.normalRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, samples: 4 });
    // Imported character/gear materials are DoubleSide. FrontSide normals
    // omitted visible back faces, outlining a different silhouette than color.
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tDepth: { value: this.colorRT.depthTexture },
        tNormal: { value: this.normalRT.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uPixelRatio: { value: 1 },
        uDepthScale: { value: depthScale },
        uLineWidth: { value: lineWidth },
        uLineOpacity: { value: lineOpacity },
        uInk: { value: new THREE.Color('#1f2a33') },
        uFogInk: { value: new THREE.Color('#5d8f97') },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h, pixelRatio) {
    const W = Math.floor(w * pixelRatio), H = Math.floor(h * pixelRatio);
    this.colorRT.setSize(W, H);
    this.normalRT.setSize(W, H);
    this.material.uniforms.uRes.value.set(W, H);
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  // `hideForNormals` objects (sky, particles) are skipped in the normal pass.
  render(scene, camera, time, hideForNormals = []) {
    const r = this.renderer;
    r.setRenderTarget(this.colorRT);
    r.render(scene, camera);

    const bg = scene.background, fog = scene.fog;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMat;
    // MeshNormalMaterial cannot billboard/cut out sprites, and lines/points or
    // position-only snow trails don't supply mesh normals. Keep their original
    // color/depth, but don't invent creases from an incompatible override.
    const hidden = new Map(hideForNormals.map((o) => [o, o.visible]));
    scene.traverse((o) => {
      if (o.isSprite || o.isLine || o.isPoints || (o.isMesh && !o.geometry.attributes.normal)) {
        if (!hidden.has(o)) hidden.set(o, o.visible);
      }
    });
    for (const o of hidden.keys()) o.visible = false;
    const clearColor = r.getClearColor(new THREE.Color()), clearAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.normalRT);
    r.clear();
    const shadows = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.render(scene, camera);
    r.shadowMap.autoUpdate = shadows;
    for (const [o, visible] of hidden) o.visible = visible;
    r.setClearColor(clearColor, clearAlpha);
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;

    const u = this.material.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
