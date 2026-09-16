import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { rockVariantGeo } from '../models/props.js';
import { Mat } from '../render/materials.js';
import { frontage } from '../world/streetLife.js';
import { surfaceMaterial } from '../render/surfaces.js';
import { waitForAssets } from '../core/assets.js';
export async function startAssetReview(){
  document.getElementById('ui').innerHTML='';document.title='Rock and shop materials';
  const scene=new THREE.Scene();scene.background=new THREE.Color('#182029');
  const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('gl'),antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  scene.add(new THREE.HemisphereLight('#e4edf7','#7e6655',2));const sun=new THREE.DirectionalLight('#ffe1bb',3);sun.position.set(4,8,5);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,100);const controls=new OrbitControls(camera,renderer.domElement);
  const rocks=new THREE.Group();scene.add(rocks);for(let i=0;i<3;i++){const rock=new THREE.Mesh(rockVariantGeo(i),Mat.rock(i));rock.position.set((i-1)*3.8,.8,0);rock.scale.set(1.5,1.7,1.5);rocks.add(rock);}
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),surfaceMaterial('regolith',{meters:8}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const shops=new THREE.Group();scene.add(shops);const updates=[];const world={props:shops,terrain:{getHeight:()=>0},addBox(){},addUpdatable(o){updates.push(o);}};frontage(world,200,200,-1,0);shops.rotation.y=-Math.PI/2;shops.visible=false;
  const panel=document.createElement('div');panel.style.cssText='position:fixed;z-index:100;left:20px;top:20px;background:#101820ee;color:white;padding:16px;font:16px sans-serif';panel.innerHTML='<label>Asset <select><option>Rocks</option><option>Shop</option></select></label><p>Drag to orbit · scroll to zoom</p>';document.body.append(panel);
  function view(){const shop=panel.querySelector('select').value==='Shop';shops.visible=shop;rocks.visible=!shop;floor.material=surfaceMaterial(shop?'paving':'regolith',{meters:shop?2:8});camera.position.set(shop?0:6,shop?2.7:4,shop?12:11);controls.target.set(0,shop?1.7:.9,0);controls.update();}panel.querySelector('select').onchange=view;view();await waitForAssets();
  const clock=new THREE.Clock();function frame(){requestAnimationFrame(frame);const dt=Math.min(.05,clock.getDelta());updates.forEach(o=>o.update(dt));controls.update();renderer.render(scene,camera);}frame();
}
