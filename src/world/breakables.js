// Destruction engine: any prop can register as a breakable. Bullets, rams, slams and blasts deal damage; at zero the
// prop's break parts vanish (or swap for a wreck), its colliders go, debris and scorch spawn, and the break is
// replicated by a stable position key so every peer sees the same world fall apart.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { events } from '../core/events.js';
import { net, MSG } from '../net/net.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * @param world
 * @param def { hp, position, radius, parts: Object3D[] (hidden on break), keep?: Object3D[] (stay), colliders: [], material: 'metal'|'concrete'|'glass'|'wood', kind, onBreak?(b, dir), light?: PointLight }
 */
export function registerBreakable(world, def) {
  const key = `${def.kind || 'b'}:${Math.round(def.position.x * 2)}:${Math.round(def.position.z * 2)}`;
  const b = { key, hp: def.hp, maxHp: def.hp, position: def.position.clone(), radius: def.radius || 1.5, parts: def.parts || [], colliders: def.colliders || [], material: def.material || 'metal', kind: def.kind || 'prop', onBreak: def.onBreak || null, light: def.light || null, broken: false, wobble: 0 };
  for (const c of b.colliders) if (c) c.breakable = b;
  for (const p of b.parts) p.traverse?.((o) => { o.userData.noMerge = true; });
  world.breakables.push(b); world.breakableByKey.set(key, b);
  return b;
}

/** Apply damage locally; the host decides breaks and tells peers. Clients only show hit feedback until told. */
export function damageBreakable(world, b, dmg, point, dir, fx) {
  if (!b || b.broken) return false;
  b.hp -= dmg; b.wobble = Math.min(1, b.wobble + 0.4);
  if (fx) { const n = dir ? dir.clone().negate() : UP.clone(); fx.impact?.(point || b.position, n, b.material === 'glass' ? 'metal' : b.material); if (b.material === 'glass' || b.material === 'metal') fx.sparksBurst?.(point || b.position, n, 6, '#ffd27a'); }
  if (b.hp <= 0 && net.isHost) { breakIt(world, b, fx, dir); net.send(MSG.EV_BREAK, { key: b.key, dir: dir ? [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)] : [0, 1, 0] }, { reliable: true }); return true; }
  return false;
}

export function breakIt(world, b, fx, dir) {
  if (!b || b.broken) return; b.broken = true;
  for (const p of b.parts) { if (p) p.visible = false; }
  for (const c of b.colliders) { if (c) { try { world.removeCollider(c); } catch { /* ignore */ } } }
  if (b.light) { b.light.intensity = 0; b.light.visible = false; }
  const d = dir ? dir.clone().setY(Math.max(0.2, dir.y)) : UP.clone();
  if (fx) {
    const p = b.position.clone(); p.y += b.radius * 0.5;
    fx.gibs?.(p, d, { armour: b.material !== 'wood', count: 6 + Math.round(b.radius * 6) });
    fx.sparksBurst?.(p, UP, b.material === 'concrete' ? 8 : 26, b.material === 'concrete' ? '#d8c8b0' : '#ffd27a');
    fx.dust?.(b.position.clone(), 1 + b.radius);
    if (b.material === 'concrete' || b.radius > 2) fx.scorch?.(b.position.clone(), b.radius);
  }
  audio.play(b.material === 'concrete' ? 'hit_rock' : b.material === 'glass' ? 'armor_break' : 'impact_metal', { pos: b.position, volume: 1, pitch: b.material === 'concrete' ? 0.7 : 0.9, pitchVar: 0.1 });
  events.emit('fx:shake', Math.min(0.5, 0.1 + b.radius * 0.08));
  events.emit('world:broke', b);
  try { b.onBreak?.(b, d); } catch (e) { console.warn('[breakables] onBreak failed', e); }
}

/** Blast damage to every breakable inside the radius (host only; peers get the break message). */
export function blastBreakables(world, pos, radius, damage, fx) {
  if (!net.isHost) return;
  for (const b of world.breakables) { if (b.broken) continue; const d = b.position.distanceTo(pos); if (d > radius + b.radius) continue; const fall = 1 - Math.max(0, d - b.radius) / radius; damageBreakable(world, b, damage * Math.max(0.15, fall), b.position, b.position.clone().sub(pos).normalize(), fx); }
}

/** Small per-frame wobble on recently hit breakables so bullets feel like they land. */
export function updateBreakables(world, dt) {
  for (const b of world.breakables) { if (b.wobble <= 0 || b.broken) continue; b.wobble = Math.max(0, b.wobble - dt * 2.5); const k = Math.sin(performance.now() * 0.04) * 0.012 * b.wobble; for (const p of b.parts) { if (p && p.rotation) p.rotation.z = (p.userData._rz ?? (p.userData._rz = p.rotation.z)) + k; } }
}
