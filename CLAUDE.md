# HOSTILE ORBIT — engineering constraints

Neon military sci-fi third-person shooter (Helldivers-2 mission loop energy, original IP). Vite + Three.js, plain ES modules, no TypeScript, no UI framework. Menus and HUD are DOM/CSS in `src/ui/`; the 3D scene is Three.js. All models are procedural geometry (`src/models/`); all textures are canvas-generated (`src/render/textures.js`); audio files are rendered offline by `tools/` scripts into `public/audio/` (never at runtime).

## Secrets
- The OpenAI key is used only by `tools/generate-voice.mjs` at build time, read from `process.env.OPENAI_API_KEY` or the git-ignored `api.md`. Never import it, log it, or reference it from anything under `src/` or `public/`. Never print the contents of `api.md`.

## Coordinate conventions
- Map coordinates `(mx, my)` come from the 400 m × 400 m tactical map (my up = north). World: `x = mx - 200`, `z = 200 - my`, north is `-z`. Use `M(mx, my, y)` from `src/world/terrain.js` when placing anything from the map.
- Player and enemy capsules stand with `position.y` at the feet. Height comes from `world.groundHeight(x, z, y)`; never sample the terrain mesh with a Three.js Raycaster (use `world.raycast` / `terrain.getHeight`).

## Network boundary (the part that must not be broken)
The game always runs as **host + N peers**; single player is the host with zero peers. `src/net/net.js` exposes `net.isHost`, `net.localId`, `net.send(type, payload, { reliable })`, `net.on(type, handler)`.

Invariants:
1. **Only the host mutates authoritative state**: enemy health/state/spawn/despawn, objective progress, the reinforcement pool, destructible objects, boss phases, pods/abilities, mission timers. Clients *request* (`req:*` messages) and *apply* (`ev:*` / `snap:*` messages). If you find yourself writing `enemy.health -= x` outside a `net.isHost` branch, stop.
2. **Every replicated entity has a stable numeric `id`** allocated by the host (`world.allocId()`). Never identify entities across the wire by array index or object reference.
3. **Local player movement is client-authoritative** (for responsiveness) and broadcast as `snap:player` at 20 Hz. Shots are resolved locally for feel, then sent as `req:hit` (entityId, zone, damage, weaponId, point, normal); the host applies damage and broadcasts `ev:damage` / `ev:death`. Do not apply damage locally on a client, only predicted visual effects.
4. **Cosmetic effects (blood, sparks, decals, ragdolls, sounds, muzzle flashes, camera shake) are local-only** and driven by events. They must never feed back into gameplay state.
5. **Seeded randomness for anything replicated**: gore direction is local, but spawn positions, loot, and wave composition come from the host. Never rely on `Math.random()` agreeing between peers.
6. **Message payloads are plain JSON-serialisable objects** (numbers rounded to 2 dp for positions, 3 dp for quaternions). No Three.js objects, no class instances, no functions on the wire. Add new message types to `src/net/protocol.js` and document the payload shape there.
7. **Join-in-progress is a full state snapshot** (`snap:world`) produced by `world.serialize()` and consumed by `world.deserialize()`. Any new authoritative field must be added to both, or a late joiner will desync.
8. Player count scaling lives only in `src/gameplay/director.js` (`scaleForPlayers(n)`). Do not sprinkle player-count multipliers elsewhere.
9. Friendly fire is applied by the host at the reduced multiplier in `protocol.js` (`FRIENDLY_FIRE_MULT`). Player-on-player damage is still reported via `req:hit` with `entityType: 'player'`.
10. Max players is `MAX_PLAYERS` in `protocol.js`. Do not hardcode 3.

## Event names
Cross-system communication uses `events` from `src/core/events.js`. Names are `noun:verb` (`enemy:died`, `player:damaged`, `objective:complete`, `subtitle:show`). Check existing names before adding a near-duplicate.

## Performance rules
- Pool particles, decals, tracers, shells, ragdolls (`src/fx/`). No `new THREE.Mesh` in per-frame or per-shot code paths.
- Max active enemies is capped by the director; distant enemies drop to reduced AI tick rate before anything near the squad is culled.
- Shared materials come from `src/render/materials.js`; do not clone materials per instance unless they animate independently.

## Running
- `npm run dev` (port 5173), `npm run build`, `npm run gen:audio`, `npm run gen:voice`.
- Test in the in-app browser; check `read_console_messages` for errors after every UI or gameplay change.
