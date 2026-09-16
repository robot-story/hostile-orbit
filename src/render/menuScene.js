// The loadout is the only menu that renders a 3D scene. Keep its hangar and
// articulated character independent of unused orbit/results sets.
import * as THREE from 'three';
import { buildSoldier } from '../models/soldier.js';
import { CharacterAnimator } from '../entities/animator.js';
import { WEAPON_BUILDERS } from '../models/weapons.js';

export function createMenuScene(){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#111922');scene.userData.envIntensity=.45;
  const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.05,40);
  camera.position.set(0,1.25,4.8);camera.lookAt(0,.94,0);
  const backdrop=new THREE.TextureLoader().load((import.meta.env.BASE_URL||'/')+'textures/menus/loadout.jpg',tex=>{tex.colorSpace=THREE.SRGBColorSpace;scene.background=tex;});
  scene.add(new THREE.HemisphereLight('#d6ecff','#566070',2));
  const key=new THREE.DirectionalLight('#fff0db',2.6);key.position.set(3,6,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-3,right:3,top:4,bottom:-2,near:.1,far:15});key.shadow.bias=-.0003;scene.add(key);
  const rim=new THREE.DirectionalLight('#80c9ed',2.2);rim.position.set(-3,3,-4);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({opacity:.32}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  let color='#00e5ff',weaponId='viper',model,anim,weapon;
  function removeWeapon(){if(!weapon)return;weapon.removeFromParent();weapon.userData.dispose?.();}
  function attachWeapon(){removeWeapon();weapon=(WEAPON_BUILDERS[weaponId]||WEAPON_BUILDERS.viper)(color);anim.weaponSocket.add(weapon);}
  function rebuild(){const yaw=model?.root.rotation.y||0;if(model){scene.remove(model.root);removeWeapon();model.dispose();}
    model=buildSoldier('vanguard',{robot:'a',neon:color});anim=new CharacterAnimator(model);model.root.rotation.y=yaw;scene.add(model.root);attachWeapon();
  }
  rebuild();
  function setWeapon(id){if(id===weaponId)return;weaponId=id;attachWeapon();}
  function setNeon(value){if(value===color)return;color=value;rebuild();}
  function update(dt){
    camera.aspect=innerWidth/Math.max(1,innerHeight);camera.updateProjectionMatrix();
    if(scene.background?.isTexture){const a=camera.aspect,ia=1.5;if(a>ia){backdrop.repeat.set(1,ia/a);backdrop.offset.set(0,(1-ia/a)/2);}else{backdrop.repeat.set(a/ia,1);backdrop.offset.set((1-a/ia)/2,0);}}
    anim.update(Math.min(dt,.05),{speed:0,sprint:0,crouch:0,aim:0,cover:null,weaponLow:0});model.motion?.(0,0,dt,0,model.root.rotation.y,0);
  }
  return {scene,camera,update,setMode(){},setWeapon,setNeon,rotate(delta){model.root.rotation.y+=delta;},dispose(){removeWeapon();model.dispose();floor.geometry.dispose();floor.material.dispose();backdrop.dispose();key.shadow.map?.dispose();scene.clear();}};
}
