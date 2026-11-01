import * as THREE from 'three';

/**
 * Street lamps that really light the world. The 16 lamps nearest the player are fed to every world material as shader uniforms
 * (position + radius), which is far cheaper than real lights and works on any number of materials. At night they add a warm,
 * distance-attenuated wash to roads, kerbs, walls, roofs and props; by day the strength is zero.
 */
export const LAMP = {
  uLamp: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uLampOn: { value: 0 },
};

const DECL = 'uniform vec4 uLamp[16]; uniform float uLampOn; varying vec3 vLW; varying vec3 vLN;';
const FRAG = /* glsl */ `
  if (uLampOn > 0.01) {
    vec3 lampAcc = vec3(0.0); vec3 lN = normalize(vLN);
    for (int i = 0; i < 16; i++) {
      float R = uLamp[i].w; if (R <= 0.0) continue;
      vec3 dv = uLamp[i].xyz - vLW; float dist = length(dv); if (dist > R) continue;
      float att = 1.0 - dist / R; att *= att;
      float lam = clamp(dot(lN, dv / dist) * 0.8 + 0.28, 0.0, 1.0);          // wrapped lambert so walls and ground both catch the light
      lampAcc += vec3(1.0, 0.7, 0.38) * att * lam;
    }
    reflectedLight.directDiffuse += diffuseColor.rgb * lampAcc * uLampOn * 2.0;
  }`;

/** Make a standard material receive the lamp light. Safe to call on materials that already patch their shader. */
export function addLampLight(m: THREE.Material): void {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey, prevSrc = String(prev);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r); sh.uniforms['uLamp'] = LAMP.uLamp; sh.uniforms['uLampOn'] = LAMP.uLampOn;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vLW; varying vec3 vLN;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz; vLN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${DECL}`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG}`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : prevSrc) + '|lamp';
}
