import * as THREE from 'three';
import { Director } from '../gameplay/director.js';
import { DIFFICULTIES } from '../gameplay/weapons.js';
import { rockVariantGeo } from '../models/props.js';
import { net } from '../net/net.js';
import { Mission } from '../gameplay/mission.js';
import { NetSync } from '../net/netsync.js';
import { MSG } from '../net/protocol.js';
import { events } from '../core/events.js';

export function startSystemsCheck(){
  const out=document.createElement('pre');out.style.cssText='position:fixed;inset:0;margin:0;padding:30px;background:#101820;color:#d9f7e9;overflow:auto;z-index:999;font:16px monospace';document.body.append(out);
  const assert=(v,m)=>{if(!v)throw Error(m);};
  try{
    const counts=[];
    for(const difficulty of Object.values(DIFFICULTIES)){
      const game={difficulty,players:[{}],world:{level:{spawnPoints:{test:[new THREE.Vector3(80,0,0)]}}}};
      const d=new Director(game);let total=0;d.spawn=()=>{total++;return null;};
      for(let i=0;i<10;i++)d.spawnSquad(['rifleman','rifleman','breacher'],new THREE.Vector3());
      assert(Math.abs(total-30*difficulty.enemyCount)<1.01,'Count scaling '+difficulty.id);counts.push(total);
      d.spawnSquad=()=>{};d.activeCount=()=>0;
      for(let i=0;i<20;i++){d.reinforceCooldown=0;d.callReinforcements(new THREE.Vector3());}
      assert(d.reinforcementsLeft===0,'Finite reinforcement budget');
      assert(d.nearestSpawnPoint(new THREE.Vector3(79,0,0),55,120)===null,'No close spawn fallback');
      out.textContent+=`PASS ${difficulty.name}: ${total} enemies per ten patrols, ${difficulty.reinforcements} reinforcement calls maximum\n`;
    }
    assert(counts.every((n,i)=>i===0||n>counts[i-1]),'Difficulty order');
    for(let v=0;v<4;v++){
      const g=rockVariantGeo(v),edges=new Map(),idx=g.index.array;
      for(let i=0;i<idx.length;i+=3)for(const [a,b] of [[idx[i],idx[i+1]],[idx[i+1],idx[i+2]],[idx[i+2],idx[i]]]){const k=[a,b].sort((a,b)=>a-b).join('/');edges.set(k,(edges.get(k)||0)+1);}
      assert([...edges.values()].every(n=>n===2),'Rock has open or non-manifold edges');
      assert([...g.attributes.normal.array].every(Number.isFinite),'Invalid rock normals');
    }
    out.textContent+='PASS all four rock shapes: closed manifold geometry, finite smooth normals\n';
    net.isHost=true;net.peers.set(2,{});
    const a={id:1,dead:false,position:new THREE.Vector3()},b={id:2,dead:false,position:new THREE.Vector3()};
    const mission=Object.create(Mission.prototype);Object.assign(mission,{active:true,lives:4,reinforcementsUsed:0,pendingRespawns:new Map(),game:{players:[a,b]},fail(){this.active=false;this.failed=true;},pickReinforceSpot(){return new THREE.Vector3();}});
    const delayed=[];mission.later=(fn,ms)=>delayed.push({fn,ms});
    mission.onRemotePlayerDied({p:[0,0,0]},2);mission.onRemotePlayerDied({p:[0,0,0]},2);
    assert(delayed.length===1&&delayed[0].ms===6000&&mission.lives===4&&mission.active,'One death must wait six seconds without double charging');
    delayed.shift().fn();assert(mission.lives===3&&mission.reinforcementsUsed===1&&mission.active,'One surviving player permits reinforcement');
    b.dead=false;mission.onRemotePlayerDied({p:[0,0,0]},2);a.dead=true;
    assert(mission.checkSquadWipe()&&mission.failed,'Both dead must fail even with reinforcements');
    delayed.shift().fn();assert(mission.lives===3,'No respawn after squad wipe');
    mission.active=true;mission.failed=false;mission.game.players.push({id:3,dead:false});assert(!mission.checkSquadWipe(),'Third survivor keeps mission active');mission.game.players[2].dead=true;assert(mission.checkSquadWipe(),'Three-person squad wipe');
    out.textContent+='PASS co-op: 6-second cooldown, duplicate death handling, one survivor respawns, simultaneous squad wipe cancels respawn, third-player survival\n';
    net.isHost=false;net.localId=2;let result;
    const off=events.on('mission:end',r=>result=r);
    const fake={world:{},session:{mission:{active:true},players:[]}};
    const sync=new NetSync(fake);net.dispatch(MSG.EV_MISSION,{stats:{success:true,isHost:true,rewardId:'qa-receipt',xp:1200}},1);
    assert(result?.isHost===false&&result.rewardId==='qa-receipt'&&!fake.session.mission.active,'Client result authority');sync.dispose();off();
    out.textContent+='PASS mission completion replication: guest result authority and shared reward receipt preserved\nALL CHECKS PASSED';
  }catch(e){out.textContent+='FAIL '+e.stack;console.error(e);}finally{net.reset();}
}
