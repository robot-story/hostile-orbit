// Roll-through supplies: glowing field crates that restock ammo or patch health the moment a frame touches them,
// then rebuild themselves after a cooldown. Placed by the level dressing; picked up by any player on contact.
import * as THREE from 'three';
import { Mat, COLORS } from '../render/materials.js';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';

const KINDS = {
  ammo: { color: '#ffb020', label: 'AMMO RESTOCKED', respawn: 75 },
  health: { color: '#2ee6a6', label: 'PATCHED UP', respawn: 60 },
  both: { color: '#00e5ff', label: 'FULL RESUPPLY', respawn: 120 },
};

export function supplyPickup(world, pos, kind = 'ammo') {
  const K = KINDS[kind] || KINDS.ammo;
  const g = new THREE.Group(); g.position.copy(pos); g.userData.noMerge = true;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), Mat.neon(K.color, 2.2)); core.position.y = 0.9; core.castShadow = false; g.add(core);
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: '#0a0e12', roughness: 0.4, metalness: 0.8, transparent: true, opacity: 0.55, wireframe: true })); shell.position.y = 0.9; g.add(shell);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.12, 8), Mat.darkMetal()); base.position.y = 0.06; base.receiveShadow = true; g.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 8, 24), Mat.neon(K.color, 1.4)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.13; ring.castShadow = false; g.add(ring);
  const light = new THREE.PointLight(K.color, 1.6, 6, 2); light.position.y = 1.0; light.castShadow = false; g.add(light);
  world.props.add(g);
  const pk = { kind, K, group: g, core, shell, ring, light, position: pos.clone(), radius: 1.35, taken: 0, active: true, phase: Math.random() * 6 };
  world.pickups.push(pk); return pk;
}

/** Loot drop from a dead enemy: small, quick, expires. */
export function dropLoot(world, pos, kind = 'ammo', ttl = 35) {
  const pk = supplyPickup(world, pos, kind); pk.ttl = ttl; pk.loot = true; pk.group.scale.setScalar(0.6); pk.radius = 1.2;
  pk.group.remove(pk.light); pk.light = { intensity: 0 }; // no runtime point lights: adding one forces every material to recompile
  return pk;
}
export function updatePickups(world, dt, players) {
  const t = performance.now() * 0.001;
  for (let i = world.pickups.length - 1; i >= 0; i--) { const pk = world.pickups[i];
    if (pk.loot) { pk.ttl -= dt; if (pk.ttl < 5) pk.group.visible = Math.floor(pk.ttl * 6) % 2 === 0; if (pk.ttl <= 0 || (!pk.active)) { world.props.remove(pk.group); world.pickups.splice(i, 1); continue; } }
    if (!pk.active) { pk.taken -= dt; if (pk.taken <= 0) { pk.active = true; pk.group.visible = true; pk.group.scale.setScalar(0.01); } else continue; }
    if (!pk.loot && pk.group.scale.x < 1) pk.group.scale.setScalar(Math.min(1, pk.group.scale.x + dt * 2.5));
    pk.core.rotation.y = t * 1.6 + pk.phase; pk.core.position.y = 0.9 + Math.sin(t * 2.2 + pk.phase) * 0.08; pk.shell.rotation.y = -t * 0.8; pk.shell.rotation.x = t * 0.5; pk.light.intensity = 1.4 + Math.sin(t * 3 + pk.phase) * 0.4;
    for (const p of players || []) {
      if (p.dead || !p.position) continue;
      const dx = p.position.x - pk.position.x, dz = p.position.z - pk.position.z, dy = p.position.y - pk.position.y;
      if (dx * dx + dz * dz < pk.radius * pk.radius && Math.abs(dy) < 2.2) { takePickup(world, pk, p); break; }
    }
  }
}

function takePickup(world, pk, p) {
  const K = pk.K; let gained = false;
  if ((pk.kind === 'ammo' || pk.kind === 'both') && p.weapons) { for (const w of Object.values(p.weapons)) { if (w.reserve < w.def.maxReserve) { w.reserve = w.def.maxReserve; gained = true; } if (w.ammo < w.def.mag) { w.ammo = w.def.mag; gained = true; } } if (p.grenades != null && p.grenades < (p.maxGrenades || 4)) { p.grenades = p.maxGrenades || 4; gained = true; } }
  if ((pk.kind === 'health' || pk.kind === 'both') && p.health < p.maxHealth) { p.health = Math.min(p.maxHealth, p.health + (pk.kind === 'both' ? p.maxHealth : 60)); gained = true; }
  if (!gained) return; // full: leave it for someone who needs it
  pk.active = false; pk.taken = K.respawn; pk.group.visible = false;
  if (p.isLocal !== false && !p.isRemote) { audio.play(pk.kind === 'health' ? 'heal' : 'ammo_pickup', { volume: 0.9 }); events.emit('toast', K.label, 'good'); events.emit('hud:pickup', pk.kind); }
  world.game?.fx?.sparksBurst?.(pk.position.clone().setY(pk.position.y + 0.9), new THREE.Vector3(0, 1, 0), 18, K.color);
}
