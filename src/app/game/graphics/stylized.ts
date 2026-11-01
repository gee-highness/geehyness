import * as THREE from 'three';
import { addLampLight } from './lamp-light';

/**
 * Stylized procedural materials: every pattern is computed in the fragment shader from world position with hashed per-cell
 * variation and domain warping, so nothing repeats and no image textures are loaded (less memory, faster start).
 */
export type StyleKind = 'asphalt' | 'panel' | 'tile' | 'metal' | 'slab' | 'gravel' | 'plate';
const KIND_ID: Record<StyleKind, number> = { asphalt: 0, panel: 1, tile: 2, metal: 3, slab: 4, gravel: 5, plate: 6 };

/** Noise + pattern library (functions only; usable by any shader that already has world position). */
export const STYLE_FUNCS = /* glsl */ `
float sh1(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 sh2(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float svn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(sh1(i),sh1(i+vec2(1.,0.)),f.x), mix(sh1(i+vec2(0.,1.)),sh1(i+vec2(1.,1.)),f.x), f.y); }
float sfbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*svn(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }
float sridge(vec2 p){ return 1.-abs(sfbm(p)*2.-1.); }
`;

const FRAG_STYLE = /* glsl */ `
struct SM { vec3 col; float h; float rough; vec3 em; };
// seam mask for a (warped, optionally brick-staggered) panel grid; returns x = seam 0..1, y = panel id hash, z = panel hash 2
vec3 spanel(vec2 p, vec2 size, float warp, float stagger){
  p += warp * vec2(sfbm(p*0.11), sfbm(p*0.11+9.3));
  vec2 q = p / size; float row = floor(q.y); q.x += stagger * sh1(vec2(row, 3.7));
  vec2 id = floor(q), f = fract(q); vec2 e = min(f, 1. - f) * size;
  float px = fwidth(p.x) + fwidth(p.y);                                   // metres per pixel: fade seams that would shimmer
  float seam = (1. - smoothstep(0.012, 0.045 + px*0.6, min(e.x, e.y))) * clamp(1. - px*2.2, 0., 1.);
  return vec3(seam, sh1(id + 11.), sh1(id + 47.));
}
SM styleMat(vec2 sp, vec3 wp, vec3 n){
  SM m; m.col = vec3(1.); m.h = 0.; m.rough = 0.; m.em = vec3(0.);
  float big = sfbm(sp*0.045 + 3.1), mid = sfbm(sp*0.42 + 7.7);
  float aaF = clamp(1. - fwidth(sp.x + sp.y) * 5.0, 0., 1.);            // fade high-frequency detail with distance (no shimmer)
  float fine = mix(0.5, sfbm(sp*2.6 + 1.3), aaF);
#if SK == 0
  // asphalt: graphite with worn lanes, patches, aggregate sparkle, hairline cracks
  float wornp = smoothstep(0.42, 0.62, big);
  float crack = 0.;
  float spark = step(0.97, sh1(floor(sp*16.))) * (0.5 + 0.5*sh1(floor(sp*16.)+3.)) * aaF * aaF;
  m.col = mix(vec3(0.74,0.78,0.9), vec3(1.12,1.1,1.2), wornp) * (0.86 + 0.28*mid) * (0.92 + 0.16*fine) - crack*0.12 + spark*0.12;
  m.h = fine*0.6; m.rough = -0.12*wornp + 0.1*(1.-mid);
#elif SK == 1
  // large composite panels, per-panel hue/tone shift, weathered vertical streaks
  vec3 pn = spanel(sp, vec2(2.6, 1.3), 0.18, 0.5);
  float streak = sfbm(vec2(sp.x*1.4, wp.y*0.09) + 5.);
  vec3 hue = mix(vec3(0.94,1.0,1.06), vec3(1.07,1.0,0.93), pn.z);
  m.col = 0.84 * hue * (0.9 + 0.18*pn.y) * (0.9 + 0.2*streak) * (1. - 0.22*pn.x) * (0.95 + 0.1*fine);
  m.h = -pn.x*0.7 + fine*0.15; m.rough = 0.12*pn.x - 0.1*pn.y;
  m.em = vec3(0.0);
#elif SK == 2
  // staggered ceramic tiles, strong per-tile hue variation
  vec3 pn = spanel(sp, vec2(0.62, 0.24), 0.04, 0.5);
  vec3 hue = mix(vec3(1.08,0.94,0.88), vec3(0.92,1.0,1.1), pn.z);
  m.col = 0.86 * hue * (0.82 + 0.3*pn.y) * (1. - 0.3*pn.x) * (0.94 + 0.12*fine);
  m.h = -pn.x*0.9 + pn.y*0.1; m.rough = -0.15 + 0.3*pn.x;
#elif SK == 3
  // standing-seam metal sheets: ribs, per-sheet tone, seam lines, rust blooms
  float sheetW = 0.92 + 0.5*sh1(vec2(floor(sp.y/9.), 5.));
  float sx = sp.x + 0.35*sfbm(vec2(sp.y*0.05, 2.));
  float sid = floor(sx / sheetW), sf = fract(sx / sheetW);
  float rib = 0.5 + 0.5*sin(sf*6.2832*4.);
  float seam = 1. - smoothstep(0.0, 0.03, min(sf, 1.-sf));
  float rust = smoothstep(0.55, 0.8, sfbm(sp*0.6 + sid*3.)) * 0.5;
  vec3 tone = mix(vec3(0.9,0.96,1.05), vec3(1.06,0.98,0.92), sh1(vec2(sid, 8.)));
  m.col = tone * (0.84 + 0.2*rib) * (1. - 0.3*seam) * mix(vec3(1.), vec3(1.15,0.7,0.5), rust);
  m.h = rib*0.5 - seam*0.8; m.rough = -0.18 + 0.3*rust; 
#elif SK == 4
  // irregular paving slabs with joints and per-slab shade
  vec3 pn = spanel(sp, vec2(1.15, 0.78), 0.55, 0.45);
  m.col = mix(vec3(0.82,0.86,0.95), vec3(1.1,1.06,1.0), pn.y) * (1. - 0.38*pn.x) * (0.92 + 0.14*fine);
  m.h = -pn.x*0.8 + fine*0.2; m.rough = 0.1*pn.x;
#elif SK == 5
  // gravel: layered speckle, no tiling
  float s1 = mix(0.5, sh1(floor(sp*9.)), aaF), s2 = mix(0.5, sh1(floor(sp*23.)+7.), aaF);
  m.col = mix(vec3(0.78,0.74,0.7), vec3(1.15,1.08,1.0), mid) * (0.8 + 0.3*s1) * (0.9 + 0.2*s2);
  m.h = (s1*0.6 + s2*0.4) * 0.25; m.rough = 0.04;
#else
  // plate (decor / default): clean sci-fi plating with thin inset lines
  vec3 pn = spanel(sp, vec2(1.8, 1.8), 0.15, 0.0);
  m.col = vec3(0.92 + 0.16*pn.y) * (1. - 0.3*pn.x); m.h = -pn.x*0.6; m.rough = -0.05;
#endif
  return m;
}
`;

export interface StyleOpts { color?: number; rough?: number; metal?: number; vertexColors?: boolean; bump?: number; side?: THREE.Side }

/** Creates a world-space procedural material. Chains with an existing onBeforeCompile (e.g. the window shader) via a STYLE_DONE marker comment. */
export function styledMaterial(kind: StyleKind, o: StyleOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0.04, vertexColors: o.vertexColors ?? false, side: o.side ?? THREE.FrontSide });
  const bump = (o.bump ?? 1.0).toFixed(3);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW; varying vec3 vSN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n#define SK ${KIND_ID[kind]}\nvarying vec3 vSW; varying vec3 vSN;\n${STYLE_FUNCS}\n${FRAG_STYLE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 smN = normalize(vSN);
        vec2 smP = abs(smN.y) > 0.7 ? vSW.xz : vec2(dot(vSW.xz, vec2(-smN.z, smN.x)) / max(length(smN.xz), 1e-3), vSW.y);
        SM sm = styleMat(smP, vSW, smN);
        diffuseColor.rgb *= sm.col;
        /*STYLE_DONE*/`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + sm.rough, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float dHx = dFdx(sm.h), dHy = dFdy(sm.h);
          vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition); vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
          float det = dot(sX, R1) * faceDirection; vec3 gH = sign(det) * (dHx * R1 + dHy * R2);
          normal = normalize(abs(det) * normal - ${bump} * 0.0025 * gH * 60.0); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sm.em;');
  };
  m.customProgramCacheKey = () => 'styled-' + kind;
  addLampLight(m);
  return m;
}
