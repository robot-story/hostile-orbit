// Wire protocol constants and payload documentation. All payloads are plain JSON.
export const MAX_PLAYERS = 3;
export const FRIENDLY_FIRE_MULT = 0.35;
export const SNAPSHOT_HZ = 15;      // host -> clients world snapshots
export const PLAYER_SNAP_HZ = 20;   // each client -> host -> others
export const PROTOCOL_VERSION = 3;

export const SQUAD_COLORS = ['#00e5ff', '#ffb020', '#c44dff'];
export const SQUAD_NAMES = ['VANGUARD-1', 'VANGUARD-2', 'VANGUARD-3'];

/**
 * Message types (type: payload shape)
 *
 * Lobby / session
 *  'hello'        client->host { name, version, loadout }                         reliable
 *  'welcome'      host->client { slot, id, players:[…], lobby:{…}, state }          reliable
 *  'lobby'        host->all    { players:[{id,slot,name,ready,loadout,connected}], settings:{difficulty,dropZone}, phase } reliable
 *  'ready'        client->host { ready:boolean, loadout }                            reliable
 *  'start'        host->all    { seed, settings, players }                            reliable
 *  'chat'         any          { text }                                               reliable
 *
 * Gameplay
 *  'snap:player'  any->host->others { id, p:[x,y,z], yaw, pitch, anim:{…}, hp, state }  unreliable
 *  'snap:world'   host->clients { t, enemies:[[id,type,x,y,z,yaw,hp,state,aim]], pods:[…], turrets:[…], boss }  unreliable
 *  'snap:full'    host->client (join in progress) world.serialize()                   reliable
 *  'req:hit'      client->host { targetId, targetType:'enemy'|'player'|'destructible', zone, dmg, weapon, p:[x,y,z], n:[x,y,z], dir:[x,y,z] } reliable
 *  'req:shot'     client->host->others { id, weapon, from:[x,y,z], to:[x,y,z] } (visual replication)       unreliable
 *  'req:grenade'  client->host { p:[…], v:[…] } / host->all 'ev:grenade' { id, p, v, owner }
 *  'req:ability'  client->host { ability, p:[x,y,z] }
 *  'req:interact' client->host { target:'jammer'|'terminal'|'cell0'|'cell1'|'extract'|'cache', phase:'start'|'cancel'|'done' }
 *  'req:reinforce' client->host { p:[x,y,z] }
 *  'ev:damage'    host->all { targetId, targetType, dmg, zone, hp, attackerId, p, n, dir, weapon }
 *  'ev:death'     host->all { targetId, targetType, zone, dir, weapon, gib, attackerId }
 *  'ev:spawn'     host->all { id, type, p, yaw, hp, squad }
 *  'ev:despawn'   host->all { id }
 *  'ev:enemyfire' host->all { id, from, to, weapon }
 *  'ev:objective' host->all { id, state, data }
 *  'ev:pod'       host->all { id, kind, p, t, owner }
 *  'ev:explosion' host->all { p, r, kind }
 *  'ev:destruct'  host->all { id }
 *  'ev:voice'     host->all { line }
 *  'ev:playerdown'host->all { id, by }
 *  'ev:reinforce' host->all { id, p, lives }
 *  'ev:mission'   host->all { result:'complete'|'failed', stats }
 *  'ev:boss'      host->all { hp, phase, armor:[…] }
 */
export const MSG = {
  HELLO: 'hello', WELCOME: 'welcome', LOBBY: 'lobby', READY: 'ready', START: 'start', CHAT: 'chat',
  SNAP_PLAYER: 'snap:player', SNAP_WORLD: 'snap:world', SNAP_FULL: 'snap:full',
  REQ_HIT: 'req:hit', REQ_SHOT: 'req:shot', REQ_GRENADE: 'req:grenade', REQ_ABILITY: 'req:ability', REQ_INTERACT: 'req:interact', REQ_REINFORCE: 'req:reinforce',
  EV_DAMAGE: 'ev:damage', EV_DEATH: 'ev:death', EV_SPAWN: 'ev:spawn', EV_DESPAWN: 'ev:despawn', EV_ENEMYFIRE: 'ev:enemyfire', EV_OBJECTIVE: 'ev:objective',
  EV_POD: 'ev:pod', EV_EXPLOSION: 'ev:explosion', EV_DESTRUCT: 'ev:destruct', EV_VOICE: 'ev:voice', EV_PLAYERDOWN: 'ev:playerdown', EV_REINFORCE: 'ev:reinforce', EV_MISSION: 'ev:mission', EV_BOSS: 'ev:boss', EV_GRENADE: 'ev:grenade',
};

export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const v3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];
