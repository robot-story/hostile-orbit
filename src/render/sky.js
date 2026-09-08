// Procedural sky dome: turquoise sky to burnt-orange horizon, moons, stars, auroras, distant orbital beams.
import * as THREE from 'three';

export function createSky(opts = {}) {
  const geo = new THREE.SphereGeometry(1800, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(opts.top || '#0f5f6e') },
      uMid: { value: new THREE.Color(opts.mid || '#2fa8a8') },
      uHorizon: { value: new THREE.Color(opts.horizon || '#e07a3a') },
      uSunDir: { value: new THREE.Vector3(-0.38, 0.8, 0.45).normalize() },
      uSunColor: { value: new THREE.Color('#ffb06a') },
      uAurora: { value: opts.aurora ?? 1 },
      uSpace: { value: opts.space ?? 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform float uTime, uAurora, uSpace; uniform vec3 uTop, uMid, uHorizon, uSunDir, uSunColor; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); float a = fract(sin(dot(i, vec2(12.9898,78.233)))*43758.5453); float b = fract(sin(dot(i+vec2(1,0), vec2(12.9898,78.233)))*43758.5453); float c = fract(sin(dot(i+vec2(0,1), vec2(12.9898,78.233)))*43758.5453); float d = fract(sin(dot(i+vec2(1,1), vec2(12.9898,78.233)))*43758.5453); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.25, h));
        col = mix(col, uTop, smoothstep(0.2, 0.75, h));
        // space blend (menu orbit view)
        col = mix(col, vec3(0.005, 0.01, 0.02), uSpace);
        // sun glow
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 260.0) * 0.9 + pow(sd, 10.0) * 0.12) * (1.0 - uSpace * 0.7);
        // dusty haze band near horizon
        col += uHorizon * 0.25 * exp(-abs(h) * 12.0) * (1.0 - uSpace);
        // stars (visible high up / in space)
        vec3 sp = floor(d * 260.0);
        float st = hash(sp);
        float starMask = smoothstep(0.0, 0.5, h) * (0.35 + uSpace * 0.65);
        if (st > 0.992) { float tw = 0.6 + 0.4 * sin(uTime * 3.0 + st * 100.0); col += vec3(0.8, 0.9, 1.0) * (st - 0.992) * 90.0 * tw * starMask; }
        // aurora ribbons
        if (uAurora > 0.0 && h > 0.05) {
          float a = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float band = sin(d.x * (3.0 + fi) + uTime * (0.15 + fi * 0.05) + noise(d.xz * 4.0 + uTime * 0.05) * 3.0) * 0.5 + 0.5;
            float y0 = 0.18 + fi * 0.16 + band * 0.1;
            a += smoothstep(0.06, 0.0, abs(h - y0)) * (0.5 + 0.5 * noise(vec2(d.x * 8.0 + fi * 10.0, uTime * 0.2)));
          }
          vec3 ac = mix(vec3(0.0, 0.9, 0.7), vec3(0.55, 0.15, 1.0), sin(d.x * 2.0 + uTime * 0.1) * 0.5 + 0.5);
          col += ac * a * 0.22 * uAurora;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

/** Two moons + distant fleet silhouettes + orbital beams, parented to a group that follows the camera in XZ. */
export function createCelestials() {
  const g = new THREE.Group();
  g.name = 'celestials';
  const moonMat = new THREE.MeshStandardMaterial({ color: '#c9d3d8', roughness: 1, emissive: '#1a2a30', emissiveIntensity: 0.5, fog: false });
  const moon1 = new THREE.Mesh(new THREE.SphereGeometry(95, 32, 24), moonMat);
  moon1.position.set(-600, 520, -1200);
  const moon2 = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), moonMat);
  moon2.position.set(-250, 620, -1300);
  g.add(moon1, moon2);
  // Orbital beams (distant, animated)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beams = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, 1400, 8, 1, true), beamMat.clone());
    b.position.set(-900 + i * 600 + (i % 2) * 200, 600, -1500 + (i % 2) * 300);
    b.userData.phase = i * 1.7;
    g.add(b); beams.push(b);
  }
  // fleet silhouettes
  const shipMat = new THREE.MeshStandardMaterial({ color: '#2a2f36', roughness: 0.8, metalness: 0.6, emissive: '#00ccff', emissiveIntensity: 0.15, fog: false });
  const ships = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 14), shipMat);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 8), shipMat); tower.position.set(-8, 8, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(24, 2, 40), shipMat); wing.position.set(6, -2, 0);
    s.add(hull, tower, wing);
    s.position.set(-500 + i * 190, 380 + (i % 3) * 60, -1100 - (i % 2) * 200);
    s.rotation.y = -0.4;
    s.userData.speed = 4 + (i % 3) * 2;
    g.add(s); ships.push(s);
  }
  g.userData.update = (t, dt) => {
    for (const b of beams) { const p = (Math.sin(t * 0.35 + b.userData.phase) + 1) * 0.5; b.material.opacity = p > 0.85 ? (p - 0.85) * 3.0 : 0; b.scale.x = b.scale.z = 0.8 + p; }
    for (const s of ships) { s.position.x += s.userData.speed * dt; if (s.position.x > 900) s.position.x = -900; }
  };
  return g;
}
