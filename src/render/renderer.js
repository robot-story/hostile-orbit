// Renderer + neon post-processing stack (bloom, grade, FXAA) with quality presets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { settings } from '../core/settings.js';
import { events } from '../core/events.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uAberration: { value: 0.0025 },
    uDamage: { value: 0 },        // red vignette flash 0..1
    uHeal: { value: 0 },          // cyan flash
    uGrain: { value: 0.0 },
    uSaturation: { value: 0.98 },
    uContrast: { value: 1.04 },
    uLowHealth: { value: 0 },     // desaturate + pulse
    uFade: { value: 0 },          // fade to black 0..1
    uFlash: { value: 0 },         // white flash (explosions)
    uScanlines: { value: 0 },     // holo mode
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uAberration, uDamage, uHeal, uGrain, uSaturation, uContrast, uLowHealth, uFade, uFlash, uScanlines;
    uniform vec2 uResolution; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5; float r2 = dot(c,c);
      float ab = uAberration * (1.0 + uDamage * 3.0 + uFlash) * (0.3 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;
      // contrast / saturation
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation * (1.0 - uLowHealth * 0.6));
      col = (col - 0.5) * uContrast + 0.5;
      // vignette
      float vig = smoothstep(0.85, 0.25, r2 * (1.0 + uVignette));
      col *= mix(1.0, vig, uVignette);
      // damage
      float edge = smoothstep(0.15, 0.6, r2);
      col = mix(col, vec3(0.75, 0.02, 0.02), edge * uDamage * 0.9);
      float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
      col = mix(col, vec3(0.5, 0.0, 0.0), edge * uLowHealth * (0.35 + 0.25 * pulse));
      col = mix(col, vec3(0.0, 0.9, 1.0), edge * uHeal * 0.6);
      // scanlines (holo screens)
      if (uScanlines > 0.0) { float s = sin(uv.y * uResolution.y * 1.2 + uTime * 8.0) * 0.5 + 0.5; col *= 1.0 - uScanlines * 0.18 * s; }
      // grain
      float g = hash(uv * uResolution + fract(uTime) * 100.0) - 0.5;
      col += g * uGrain * (1.0 + uLowHealth);
      col += uFlash;
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = true;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(null, null);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.92);
    this.gradePass = new ShaderPass(GradeShader);
    this.outputPass = new OutputPass();
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);
    this.composer.addPass(this.fxaaPass);
    this.width = 1; this.height = 1;
    this.time = 0;
    this.fx = { damage: 0, heal: 0, flash: 0, fade: 0, lowHealth: 0, scanlines: 0 };
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    events.on('settings:changed', (k) => { if (['quality', 'bloom', 'shadows', 'renderScale'].includes(k)) this.applyQuality(); });
    this.resize();
  }
  applyQuality() {
    const q = settings.qualityLevel;
    const scale = settings.data.renderScale;
    const dpr = Math.min(window.devicePixelRatio || 1, [1, 1.25, 1.75, 2][q]) * scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = settings.data.shadows && q >= 1;
    this.shadowSize = [512, 1024, 2048, 4096][q];
    this.bloomPass.enabled = settings.data.bloom;
    this.bloomPass.strength = [0.5, 0.6, 0.7, 0.75][q];
    this.bloomPass.radius = [0.3, 0.45, 0.55, 0.6][q];
    this.fxaaPass.enabled = q >= 1;
    this.gradePass.uniforms.uGrain.value = 0;
    this.resize();
    events.emit('renderer:quality', q);
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    this.gradePass.uniforms.uResolution.value.set(w * pr, h * pr);
    this.bloomPass.setSize(w * Math.min(pr, 1) * 0.5, h * Math.min(pr, 1) * 0.5);
    events.emit('renderer:resize', w, h);
  }
  /** Shared image-based lighting so metals and plastics shade properly (no black metal). */
  environment() {
    if (!this._env) { const pm = new THREE.PMREMGenerator(this.renderer); this._env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
    return this._env;
  }
  setScene(scene, camera) {
    this.renderPass.scene = scene; this.renderPass.camera = camera; this.scene = scene; this.camera = camera;
    if (scene && !scene.environment) { scene.environment = this.environment(); scene.environmentIntensity = 0.55; }
  }
  render(dt) {
    if (!this.scene || !this.camera) return;
    this.time += dt;
    const u = this.gradePass.uniforms;
    u.uTime.value = this.time;
    // decay flashes
    this.fx.damage = Math.max(0, this.fx.damage - dt * 1.6);
    this.fx.heal = Math.max(0, this.fx.heal - dt * 1.2);
    this.fx.flash = Math.max(0, this.fx.flash - dt * 3.0);
    u.uDamage.value = settings.data.hitFlash ? this.fx.damage : this.fx.damage * 0.35;
    u.uHeal.value = this.fx.heal;
    u.uFlash.value = settings.data.reduceFlashing ? this.fx.flash * 0.25 : this.fx.flash;
    u.uFade.value = this.fx.fade;
    u.uLowHealth.value = this.fx.lowHealth;
    u.uScanlines.value = this.fx.scanlines;
    if (this.camera.aspect !== this.width / this.height) { this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix(); }
    this.composer.render(dt);
  }
  damageFlash(v = 0.6) { this.fx.damage = Math.min(1, this.fx.damage + v); }
  healFlash(v = 0.6) { this.fx.heal = Math.min(1, this.fx.heal + v); }
  whiteFlash(v = 0.4) { this.fx.flash = Math.min(1, this.fx.flash + v); }
}
