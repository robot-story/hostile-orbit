import * as THREE from 'three';

// Track the actual Three.js requests, including material/terrain textures and GLBs.
const pending=new Map();
const manager=THREE.DefaultLoadingManager;
const start=manager.itemStart.bind(manager),end=manager.itemEnd.bind(manager);
manager.itemStart=url=>{pending.set(url,(pending.get(url)||0)+1);start(url);};
manager.itemEnd=url=>{const n=(pending.get(url)||1)-1;if(n)pending.set(url,n);else pending.delete(url);end(url);};
export async function waitForAssets(onProgress=()=>{}) {
  let quiet=0;const began=performance.now();
  while(quiet<2){
    onProgress(pending.size);quiet=pending.size?0:quiet+1;
    if(performance.now()-began>90000)throw new Error('Asset loading timed out: '+[...pending.keys()].slice(0,3).join(', '));
    await new Promise(resolve=>setTimeout(resolve,50));
  }
}
