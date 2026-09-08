// Shared material library. Neon everywhere: emissive strips are separate materials so bloom picks them up.
import * as THREE from 'three';
import { Tex } from './textures.js';

export const COLORS = {
  cyan: '#00e5ff', cyanDim: '#0a7f8f', red: '#ff3b1f', orange: '#ff7a1a', redOrange: '#ff5a1f',
  green: '#3dff9a', violet: '#9b4dff', amber: '#ffb020', white: '#e8f4f8', blood: '#5a0a12', bloodGlow: '#a3121f',
};

const _cache = new Map();
function cached(key, make) { if (!_cache.has(key)) _cache.set(key, make()); return _cache.get(key); }

export const Mat = {
  armorWhite: () => cached('armorWhite', () => new THREE.MeshStandardMaterial({ map: Tex.armorWhite(), roughness: 0.62, metalness: 0.25, color: '#ffffff' })),
  armorBlack: () => cached('armorBlack', () => new THREE.MeshStandardMaterial({ map: Tex.armorBlack(), roughness: 0.7, metalness: 0.35, color: '#c8c8c8' })),
  underSuit: () => cached('underSuit', () => new THREE.MeshStandardMaterial({ map: Tex.armorBlack(), roughness: 0.9, metalness: 0.1, color: '#7a7a80' })),
  gunMetal: () => cached('gunMetal', () => new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.45, metalness: 0.8 })),
  gunWhite: () => cached('gunWhite', () => new THREE.MeshStandardMaterial({ map: Tex.armorWhite(), roughness: 0.5, metalness: 0.4, color: '#d8d8d8' })),
  darkMetal: () => cached('darkMetal', () => new THREE.MeshStandardMaterial({ map: Tex.metalPanel(1), roughness: 0.6, metalness: 0.7 })),
  panel: (v = 0) => cached('panel' + v, () => new THREE.MeshStandardMaterial({ map: Tex.metalPanel(v), roughness: 0.65, metalness: 0.6 })),
  concrete: () => cached('concrete', () => new THREE.MeshStandardMaterial({ map: Tex.concrete(), roughness: 0.95, metalness: 0.0, color: '#7a7a78' })),
  hazard: () => cached('hazard', () => new THREE.MeshStandardMaterial({ map: Tex.hazard(), roughness: 0.7, metalness: 0.3 })),
  rock: () => cached('rock', () => new THREE.MeshStandardMaterial({ map: Tex.rock(), roughness: 0.95, metalness: 0.02, color: '#8a8a8a' })),
  rockDust: () => cached('rockDust', () => new THREE.MeshStandardMaterial({ map: Tex.rock(), roughness: 0.95, metalness: 0.0, color: '#c07a4a' })),
  // Enemies: dark biomechanical chassis with red-orange glow
  legionArmor: () => cached('legionArmor', () => new THREE.MeshStandardMaterial({ map: Tex.armorBlack(), roughness: 0.55, metalness: 0.7, color: '#8a8f96' })),
  legionFlesh: () => cached('legionFlesh', () => new THREE.MeshStandardMaterial({ color: '#3a1f24', roughness: 0.85, metalness: 0.1, emissive: '#3a0a10', emissiveIntensity: 0.25 })),
  // Neon emissives (unlit-looking; bloom does the rest)
  neon: (color = COLORS.cyan, intensity = 2.2) => cached('neon' + color + intensity, () => new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: intensity, roughness: 0.3, metalness: 0.0, toneMapped: true })),
  neonBasic: (color = COLORS.cyan) => cached('neonBasic' + color, () => new THREE.MeshBasicMaterial({ color: color, toneMapped: false })),
  glowAdditive: (color = COLORS.cyan, opacity = 0.6) => cached('glowAdd' + color + opacity, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
  glass: () => cached('glass', () => new THREE.MeshPhysicalMaterial({ color: '#8fd7e6', roughness: 0.1, metalness: 0.0, transmission: 0.0, transparent: true, opacity: 0.35, emissive: '#0b3a44', emissiveIntensity: 0.4 })),
  visor: () => cached('visor', () => new THREE.MeshStandardMaterial({ color: '#0a1a20', roughness: 0.15, metalness: 0.9, emissive: COLORS.cyan, emissiveIntensity: 0.9 })),
  blood: () => cached('blood', () => new THREE.MeshStandardMaterial({ color: COLORS.blood, roughness: 0.35, metalness: 0.1, emissive: '#3a0008', emissiveIntensity: 0.6 })),
  gib: () => cached('gib', () => new THREE.MeshStandardMaterial({ color: '#4a1218', roughness: 0.6, metalness: 0.15, emissive: '#2a0006', emissiveIntensity: 0.5 })),
  screen: (v = 0) => cached('screen' + v, () => new THREE.MeshStandardMaterial({ map: Tex.screen(v), emissive: '#ffffff', emissiveMap: Tex.screen(v), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2, color: '#222' })),
  poster: (slogan, sub, accent, idx) => new THREE.MeshStandardMaterial({ map: Tex.poster(slogan, sub, accent, idx), emissive: '#ffffff', emissiveMap: Tex.poster(slogan, sub, accent, idx), emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.1, color: '#666' }),
  emblem: (color = COLORS.cyan) => cached('emblem' + color, () => new THREE.MeshBasicMaterial({ map: Tex.emblem(color), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })),
  emblemDecal: (color = '#d8d8d8') => cached('emblemDecal' + color, () => new THREE.MeshStandardMaterial({ map: Tex.emblem(color), transparent: true, depthWrite: false, roughness: 0.8, color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2 })),
  alienMembrane: (color = COLORS.green) => cached('membrane' + color, () => new THREE.MeshStandardMaterial({ map: Tex.membrane(), color: color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 0.4, depthWrite: false })),
  blackGlass: () => cached('blackGlass', () => new THREE.MeshPhysicalMaterial({ color: '#05060a', roughness: 0.05, metalness: 0.4, clearcoat: 1, emissive: COLORS.violet, emissiveIntensity: 0.25 })),
  hologram: (color = COLORS.cyan) => cached('holo' + color, () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.75 }, uMap: { value: null }, uUseMap: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uOpacity, uUseMap; uniform vec3 uColor; uniform sampler2D uMap; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float fres = pow(1.0 - abs(dot(vN, vV)), 2.0); float scan = 0.75 + 0.25 * sin(vUv.y * 180.0 - uTime * 6.0); float flick = 0.92 + 0.08 * sin(uTime * 37.0) * sin(uTime * 13.0);
        vec3 col = uColor; float a = uOpacity; if (uUseMap > 0.5) { vec4 m = texture2D(uMap, vUv); col = mix(uColor * 0.4, m.rgb * 1.2 + uColor * 0.25, 0.85); a *= 0.55 + m.a * 0.45; }
        gl_FragColor = vec4(col * (0.55 + fres * 1.2) * scan * flick, a * (0.5 + fres * 0.6)); }`,
  })),
};

/** Animate all time-based materials. Call once per frame. */
export function updateMaterials(t) {
  for (const m of _cache.values()) if (m.uniforms?.uTime) m.uniforms.uTime.value = t;
}
