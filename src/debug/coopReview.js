import { save } from '../core/save.js';
import { input } from '../core/input.js';
import { net } from '../net/net.js';
// Explicit local-only controls for repeatable co-op mission smoke tests.
export function addCoopReview(game){
  const p=document.createElement('div');p.style.cssText='position:fixed;z-index:2000;right:8px;top:8px;width:270px;background:#0b182bee;color:#dbeeff;padding:12px;font:12px monospace;pointer-events:auto';
  p.innerHTML='<b>LOCAL CO-OP QA / isolated save</b><p><input placeholder="QA room code" maxlength="6"></p><button>Host QA</button> <button>Join QA</button> <button>Ready</button> <button>Deploy</button><p><button>Kill local</button> <button>Roll & fire</button> <button>Complete</button> <button>Lobby</button></p><pre style="white-space:pre-wrap"></pre>';document.body.append(p);
  const actions=[async()=>{await game.mpApi().host('QA HOST');game.transport.setSettings({map:'lantern',difficulty:'recruit'});game.menus.show('multiplayer');},async()=>{await game.mpApi().join(p.querySelector('input').value,'QA GUEST');game.menus.show('multiplayer');},()=>game.mpApi().setReady(true),()=>game.hostStartMission(),()=>{const pl=game.localPlayer;if(pl&&!pl.dead){pl.health=0;pl.die({});}},()=>{input.keys.add('ShiftLeft');input.keys.add('KeyW');input.mouseButtons.add(0);setTimeout(()=>{input.keys.delete('ShiftLeft');input.keys.delete('KeyW');input.mouseButtons.delete(0);},2000);},()=>{if(net.isHost)game.mission?.complete();},()=>game.abortToOrbit()];
  p.querySelectorAll('button').forEach((b,i)=>b.onclick=async()=>{try{await actions[i]();}catch(e){p.querySelector('pre').textContent=e.message;}});
  setInterval(()=>{const pl=game.localPlayer,m=game.mission,trans=game.transport;p.querySelector('pre').textContent=JSON.stringify({mode:game.mode,code:trans?.code,phase:trans?.phase,players:game.players?.map(x=>({id:x.id,dead:x.dead,hp:Math.round(x.health)})),stage:m?.stage,active:m?.active,lives:m?.lives,ammo:pl?.weapon?.ammo,xp:save.profile.xp,unlocks:save.profile.unlockedWeapons},null,2);},500);
}
