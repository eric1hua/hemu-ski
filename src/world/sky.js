// Flat teal sky with painted, stretched cloud shapes in three tones. `uFloat` 1
// mirrors the sky below the horizon too, for the title's island in the clouds.
import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color('#6dbbb8'),
  horizon: new THREE.Color('#bfe2da'),
  cloudLight: new THREE.Color('#e8f5ef'),
  cloudDark: new THREE.Color('#58a7a8'),
};

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uCloudLight: { value: SKY.cloudLight },
      uCloudDark: { value: SKY.cloudDark },
      uTime: { value: 0 },
      uFloat: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uCloudLight, uCloudDark;
      uniform float uTime;
      uniform float uFloat;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        d.y = mix(d.y, abs(d.y), uFloat);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
        col = mix(col, uZenith, uFloat * 0.35);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.18);
          uv = vec2(uv.x * 0.55, uv.y * 1.3) + vec2(uTime * 0.004, 0.0);
          // Domain warp gives the swirled, brushed look.
          vec2 warp = vec2(fbm(uv * 0.9 + 3.1), fbm(uv * 0.9 + 8.4));
          float n = fbm(uv * 1.1 + warp * 1.2);
          float fade = smoothstep(0.0, 0.25, d.y);
          float light = smoothstep(0.56, 0.575, n) * fade;
          float dark = smoothstep(0.6, 0.615, fbm(uv * 1.6 + warp * 1.6 + 5.0)) * (1.0 - light) * fade;
          col = mix(col, uCloudDark, dark * 0.55);
          col = mix(col, uCloudLight, light * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
