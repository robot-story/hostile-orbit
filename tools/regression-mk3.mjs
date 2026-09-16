import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Terrain } from '../src/world/terrain.js';
import { applyMissionRewards, rewardPreview, OPERATION_WEAPONS } from '../src/gameplay/rewards.js';
import { WEAPONS, DIFFICULTIES } from '../src/gameplay/weapons.js';
import { CoverSystem } from '../src/world/cover.js';
import { BoxCollider } from '../src/world/colliders.js';

// Compare physical height against actual rendered triangle intersections on a
// deliberately non-planar grid, not another copy of the interpolation formula.
const terrain=Object.create(Terrain.prototype);
terrain.res=2;terrain.n=201;terrain.heights=new Float32Array(201*201);
for(let j=0;j<201;j++)for(let i=0;i<201;i++)terrain.heights[j*201+i]=Math.sin(i*.83)*Math.cos(j*.67)*4;
const geometry=new THREE.PlaneGeometry(400,400,200,200);geometry.rotateX(-Math.PI/2);
const positions=geometry.attributes.position;
for(let i=0;i<positions.count;i++)positions.setY(i,terrain.getHeight(positions.getX(i),positions.getZ(i)));
const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);
const ray=new THREE.Raycaster();let maxError=0;
for(let i=0;i<160;i++){
  const x=-80+(i*1.781)%160,z=-80+(i*2.313)%160;
  ray.set(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(mesh)[0];assert.ok(hit);
  maxError=Math.max(maxError,Math.abs(hit.point.y-terrain.getHeight(x,z)));
}
assert.ok(maxError<.0001,'Physical terrain differs from rendered terrain: '+maxError);
console.log('PASS: 160 terrain triangle intersections; maximum error '+maxError.toExponential(2)+' m');

const profile={xp:0,level:1,requisition:0,intel:0,unlockedWeapons:['viper','longshot']};
for(const map of Object.keys(OPERATION_WEAPONS))for(const weapon of OPERATION_WEAPONS[map])assert.ok(WEAPONS[weapon]&&!WEAPONS[weapon].hidden);
for(const difficulty of Object.values(DIFFICULTIES))assert.equal(rewardPreview('lantern',difficulty,[]).xp,Math.round(1200*difficulty.xp));
const result={rewardId:'test-1',success:true,map:'lantern',xp:1200,requisition:500,intel:2};
const first=applyMissionRewards(profile,result);assert.deepEqual(first.weaponUnlocks,['arc']);assert.equal(profile.level,2);
const snapshot=structuredClone(profile);applyMissionRewards(profile,result);assert.deepEqual(profile,snapshot,'Duplicate network result paid twice');
applyMissionRewards(profile,{...result,rewardId:'test-2'});assert.ok(profile.unlockedWeapons.includes('lancer'));
const failed=applyMissionRewards(profile,{...result,rewardId:'test-failed',success:false,xp:300});assert.deepEqual(failed.weaponUnlocks,[]);assert.equal(profile.xp,2700);
applyMissionRewards(profile,{...result,rewardId:'test-3'});assert.ok(profile.unlockedWeapons.includes('breaker'));
assert.equal(rewardPreview('lantern',null,profile.unlockedWeapons).weapon,null);
const client={xp:0,level:1,requisition:0,intel:0,unlockedWeapons:['viper','longshot','arc']};
assert.deepEqual(applyMissionRewards(client,result).weaponUnlocks,['lancer'],'Co-op rewards must use each player inventory');
console.log('PASS: rewards persist once per result, advance rank, unlock both weapon slots, respect failures and co-op inventories');

const world={terrain:{getHeight:()=>0,isFloor:()=>true,slope:()=>0},colliders:{all:[]}};
const cover=new CoverSystem(world);
const a=new BoxCollider(new THREE.Vector3(0,1,0),new THREE.Vector3(2,1,2),0,{cover:true});
world.colliders.all.push(a);cover.build();assert.ok(cover.points.length);
const occupied=cover.points[0];occupied.occupant='guard';
const b=new BoxCollider(new THREE.Vector3(8,1,0),new THREE.Vector3(2,1,2),0,{cover:true});cover.addForCollider(b);
assert.equal(cover.points[0],occupied);assert.equal(occupied.occupant,'guard');assert.ok(cover.points.some(p=>p.collider===b));
console.log('PASS: landing pod adds cover without rebuilding or losing occupied points');
