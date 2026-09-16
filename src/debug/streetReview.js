import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from '../world/world.js';
import { LANTERN } from '../world/maps/lantern.js';
import { MERIDIAN } from '../world/maps/meridian.js';
import { M } from '../world/terrain.js';
import { mergeStaticProps } from '../world/merge.js';
import { Renderer } from '../render/renderer.js';
import { Player } from '../entities/player.js';
import { input } from '../core/input.js';

export async function startStreetReview() {
  document.title='Black Lantern — Street review';
  document.getElementById('ui').innerHTML='';
  const loading=document.createElement('div');loading.textContent='BUILDING BLACK LANTERN…';loading.style.cssText='position:fixed;inset:0;background:#0b121a;color:#dce7ed;display:grid;place-items:center;z-index:200;font:20px system-ui';document.body.append(loading);
  await new Promise(r=>setTimeout(r,150));
  const map=new URLSearchParams(location.search).has('rockreview')?MERIDIAN:LANTERN;
  document.title=map.name+' — World review';
  const world=new World(map), level=map.build(world), dynamic=[];
  loading.textContent='PREPARING STREET MATERIALS…';await new Promise(r=>setTimeout(r,0));
  if(level.jammer?.group) level.jammer.group.userData.noMerge=true;
  for(const d of level.destructibles||[]) d.mesh?.traverse?.(o=>dynamic.push(o));
  for(const p of level.posters||[]) dynamic.push(p);
  for(const a of level.animated||[]) { if(a?.group)a.group.userData.noMerge=true;if(a?.mesh)dynamic.push(a.mesh); }
  mergeStaticProps(world,dynamic); world.finalize();
  const renderer=new Renderer(document.getElementById('gl'));
  const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,0.1,1500);
  const controls=new OrbitControls(camera,renderer.renderer.domElement); controls.enableDamping=true;
  renderer.setScene(world.scene,camera);
  const views=map===MERIDIAN?{Arrival:[200,48,3,185,62,4],Rocks:[192,66,2,175,74,3],Canyon:[200,90,3,176,100,3]}:{Arrival:[200,56,2,200,110,2],Avenue:[201,160,2,201,200,3],Shops:[193,177,2,185,177,1.8],Square:[206,106,2,198,130,4],Skyway:[265,118,3,286,165,5],Canal:[130,154,2,128,200,3],Overview:[247,166,40,222,207,14]};
  const panel=document.createElement('div');panel.style.cssText='position:fixed;z-index:100;top:20px;left:20px;width:240px;background:#101923ed;color:#dce7ed;padding:20px;border:1px solid #4b6874;border-radius:10px;font:13px system-ui';
  panel.innerHTML='<b>BLACK LANTERN / STREET REVIEW</b><p>Drag to orbit · scroll to move closer</p><label>View <select id="street-view">'+Object.keys(views).map(k=>`<option>${k}</option>`).join('')+'</select></label><p><label>Rail <select id="street-rail">'+world.rails.map((r,i)=>`<option value="${i}">${r.name||'Rail '+(i+1)}</option>`).join('')+'</select></label></p><button id="street-ride">Ride selected rail</button><button id="street-check">Check rail clearance</button><p id="street-result"></p><a href="/" style="color:#7ce5ef">Open game</a>';
  document.body.append(panel);
  let ride=null;
  function view(){ride=null;const v=views[document.getElementById('street-view').value],p=M(v[0],v[1]),t=M(v[3],v[4]);p.y=world.terrain.getHeight(p.x,p.z)+v[2];t.y=world.terrain.getHeight(t.x,t.z)+v[5];camera.position.copy(p);controls.target.copy(t);controls.update();}
  document.getElementById('street-view').onchange=view;
  document.getElementById('street-ride').onclick=()=>{ride={rail:world.rails[+document.getElementById('street-rail').value],u:0};};
  document.getElementById('street-check').onclick=()=>{
    const failures=[];
    for(const r of world.rails.filter(r=>r.elevated)) {
      for(let i=0;i<r.samples.length;i++) {const p=r.samples[i];if(p.y-world.terrain.getHeight(p.x,p.z)<0.9) failures.push(r.name+': ground clearance');
        if(world.colliders.all.some(c=>c.enabled&&c.maxY>p.y+.12&&c.minY<p.y+2&&c.containsXZ(p.x,p.z,.5)))failures.push(r.name+': obstructed at '+i);
      }
      const wasEnabled=input.enabled;input.enabled=false;
      try { for(const dir of [-1,1]) {
        const actor={grind:{rail:r,i:dir===1?0:r.samples.length-1,dir,speed:9},position:new THREE.Vector3(),velocity:new THREE.Vector3(),yaw:0,rollMode:true,state:'grind',stateT:0,reloadT:-1,cam:{},anim:{update(){}},_grindSound:{setPosition(){}},exitGrind(){this.state='normal';}};
        for(let f=0;f<6000&&actor.state==='grind';f++){Player.prototype.updateGrind.call(actor,1/60,{x:0});if(!actor.position.toArray().every(Number.isFinite)){failures.push(r.name+': invalid traversal');break;}}
        if(actor.state!=='normal')failures.push(r.name+': failed to reach exit');
      }} finally {input.enabled=wasEnabled;}
    }
    document.getElementById('street-result').textContent=failures.length?[...new Set(failures)].slice(0,12).join('\n'):`${world.rails.filter(r=>r.elevated).length} elevated rails: body clearance and gameplay traversal in both directions passed.`;
  };
  view();await renderer.renderer.compileAsync(world.scene,camera);loading.remove();let then=performance.now();
  function frame(now){requestAnimationFrame(frame);const dt=Math.min(.04,(now-then)/1000);then=now;
    if(ride){ride.u=Math.min(1,ride.u+dt*13/ride.rail.length);const p=ride.rail.curve.getPointAt(ride.u),t=ride.rail.curve.getPointAt(Math.min(1,ride.u+.025));camera.position.copy(p).add(new THREE.Vector3(0,1.3,0));controls.target.copy(t).add(new THREE.Vector3(0,1.1,0));if(ride.u===1)ride=null;}
    controls.update();world.update(dt,camera);renderer.render(dt);
  }requestAnimationFrame(frame);
}
