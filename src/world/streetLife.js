// Small civilian frontages and street infrastructure, with a clear carriageway.
import * as THREE from 'three';
import { M } from './terrain.js';
import { Mat } from '../render/materials.js';
import { groundStrip } from './dressing.js';
import { surfaceMaterial, surfaceTexture } from '../render/surfaces.js';

const materials={};
const material=(id,color,roughness=.85,metalness=.05)=>materials[id]||(materials[id]=new THREE.MeshStandardMaterial({color,roughness,metalness}));
function box(g,size,p,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...p);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function ground(world,x,y){const p=M(x,y);p.y=world.terrain.getHeight(p.x,p.z);return p;}
function sign(text,color){
  const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#17212a';ctx.fillRect(0,0,512,96);ctx.fillStyle=color;ctx.font='600 43px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,63);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t});
}
export function frontage(world,mx,my,side,index){
  const p=ground(world,mx,my),g=new THREE.Group();g.position.copy(p);g.rotation.y=side>0?-Math.PI/2:Math.PI/2;
  const stone=surfaceMaterial('concrete',{meters:3,color:'#b6bcc1'}),dark=surfaceMaterial('metal',{meters:1.4,metalness:.55}),trim=material('trim','#99a2a8'),warm=Mat.neon('#edbd77',.45);
  // A real recess gives the shop window parallax as the player passes it.
  box(g,[8,3.7,2.1],[0,1.85,-.35],stone);
  box(g,[.25,3.7,.7],[-3.88,1.85,1.05],stone);box(g,[.25,3.7,.7],[3.88,1.85,1.05],stone);
  box(g,[8,.65,.7],[0,3.38,1.05],stone);box(g,[8,.72,.7],[0,.36,1.05],stone);
  box(g,[7.9,.7,.08],[0,.4,1.43],surfaceMaterial('ceramic',{meters:1.5,color:'#c3c8bf'}));
  // The door and recessed windows face the sidewalk. Keep emissive lighting restrained.
  box(g,[1.1,2.35,.08],[-2.75,1.2,1.43],dark);box(g,[.08,.35,.12],[-2.4,1.15,1.51],trim);
  const interiorId=['shop-noodles','shop-repair','shop-market','shop-market','shop-noodles','shop-repair'][index];
  const interiorMap=surfaceTexture(interiorId);
  const interiorMat=new THREE.MeshBasicMaterial({map:interiorMap,color:'#b5b3ad'});
  const interiorGeo=new THREE.PlaneGeometry(5.4,2.12);
  const uv=interiorGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,.18+uv.getY(i)*.59);
  const interior=new THREE.Mesh(interiorGeo,interiorMat);interior.position.set(1.05,1.79,.75);interior.userData.noMerge=true;g.add(interior);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(5.4,2.12),new THREE.MeshPhysicalMaterial({color:'#a6c7cf',transparent:true,opacity:.13,roughness:.16,metalness:.1,clearcoat:1,depthWrite:false}));glass.position.set(1.05,1.79,1.47);g.add(glass);
  for(const x of [-1.7,.1,1.9,3.8])box(g,[.075,2.18,.1],[x,1.79,1.49],dark);
  for(const y of [.72,2.85])box(g,[5.6,.08,.7],[1.05,y,1.1],trim);
  box(g,[5.15,.025,.08],[1.05,2.77,1.12],warm);
  // Thin reflected streaks and a soft spill onto the pavement, without adding
  // six real-time point lights or shadow maps to the street.
  const reflection=new THREE.MeshBasicMaterial({color:'#d5eaf0',transparent:true,opacity:.065,depthWrite:false});
  for(const x of [-1.45,2.8]){const r=new THREE.Mesh(new THREE.PlaneGeometry(.035,1.9),reflection);r.position.set(x,1.79,1.48);r.rotation.z=-.15;g.add(r);}
  const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),grad=ctx.createRadialGradient(32,32,2,32,32,32);grad.addColorStop(0,'rgba(255,200,130,0.32)');grad.addColorStop(1,'rgba(255,200,130,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
  const spill=new THREE.Mesh(new THREE.PlaneGeometry(6,3),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));spill.rotation.x=-Math.PI/2;spill.position.set(1,.035,2.25);g.add(spill);
  let lightT=index;world.addUpdatable({update(dt){lightT+=dt;interiorMat.color.setScalar(.69+Math.sin(lightT*.65)*.012);}});
  const awning=box(g,[7.8,.13,1.7],[0,2.9,2],surfaceMaterial('painted',{meters:3,color:['#93b3b0','#ada098','#999eaf'][index%3]}));awning.rotation.x=.08;
  box(g,[7.9,.25,.1],[0,2.83,2.85],dark);
  const names=['NIGHT NOODLES','REPAIR / 24H','LAUNDRY 07','ORBIT MART','CAFE LANTERN','PARCEL DEPOT'];
  const s=new THREE.Mesh(new THREE.PlaneGeometry(5.7,.78),sign(names[index%names.length],index%2?'#a6dedb':'#e9c391'));s.position.set(.25,3.26,1.42);g.add(s);
  // Utilities and a bench tell a small story without blocking the road.
  box(g,[1.8,.13,.48],[-1,.48,2.15],trim);for(const x of [-1.7,-.3])box(g,[.1,.45,.42],[x,.22,2.15],dark);
  box(g,[.52,.85,.52],[3.3,.43,2.2],surfaceMaterial('rust',{meters:1.2,color:'#aaa69c',metalness:.4}));box(g,[.56,.08,.56],[3.3,.9,2.2],trim);
  for(let i=0;i<3;i++)box(g,[.5,.38,.42],[2.5,.19+i*.38,1.96],material('cardboard','#8d8068'));
  box(g,[.7,.9,.3],[-3.4,2.5,-1.58],dark);
  world.props.add(g);
  world.addBox(p.clone().add(new THREE.Vector3(0,1.85,0)),{x:4,y:1.85,z:1.4},g.rotation.y,{material:'concrete'});
  const bench=new THREE.Vector3(-1,.25,2.15).applyAxisAngle(new THREE.Vector3(0,1,0),g.rotation.y).add(p);
  world.addBox(bench,{x:.95,y:.25,z:.3},g.rotation.y,{material:'metal',cover:true,walkableTop:true});
}

export function dressStreetLife(world){
  const paving=surfaceMaterial('paving',{meters:2}),paint=material('paint','#aaa996');
  paint.polygonOffset=true;paint.polygonOffsetFactor=-4;paint.polygonOffsetUnits=-4;
  // Road and sidewalk textures are painted directly by Terrain's shader. A broad
  // overlaid ribbon bridged terrain dips and hid the player's wheel below it.
  for(const side of [-1,1]){
    for(let y=76;y<279;y+=4){
      const p=ground(world,200+side*8.65,y),g=new THREE.Group();g.position.copy(p);
      box(g,[.2,.17,3.8],[0,.065,0],paving);
      if(y%20===16){const grate=box(g,[.58,.025,.95],[side*.55,.07,0],Mat.darkMetal());for(let n=0;n<5;n++)box(g,[.05,.026,.85],[side*.55-.23+n*.115,.09,0],material('grate','#81898f'));grate.castShadow=false;}
      world.props.add(g);
    }
  }
  for(let y=80;y<280;y+=10)groundStrip(world,[[200,y],[200,y+3]],.13,{material:paint});
  for(const y of [91,145,222,271])for(let i=-6;i<=6;i+=2)groundStrip(world,[[200+i,y-1.5],[200+i,y+1.5]],.8,{material:paint});
  const shops=[[185.6,94,-1],[214.4,154,1],[185.6,177,-1],[214.4,248,1],[185.6,259,-1],[214.4,276,1]];
  shops.forEach((v,i)=>frontage(world,...v,i));
  // Parking bays and a few bollards stay at the curb, leaving 16 m between them.
  for(const [x,y] of [[207,104],[193,157],[207,230]]){
    for(const end of [y-3,y+3])groundStrip(world,[[x-1.3,end],[x+1.3,end]],.09,{material:paint});
    groundStrip(world,[[x+1.3,y-3],[x+1.3,y+3]],.09,{material:paint});
  }
  for(const y of [89,93,143,147,220,224,269,273])for(const side of [-1,1]){
    const p=ground(world,200+side*9.2,y),g=new THREE.Group();g.position.copy(p);box(g,[.16,.7,.16],[0,.35,0],Mat.darkMetal());box(g,[.17,.08,.17],[0,.59,0],material('reflector','#d8be77'));world.props.add(g);
  }
}
