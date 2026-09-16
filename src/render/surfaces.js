import * as THREE from 'three';
const replacements={tex_asphalt:'asphalt',tex_terrain:'regolith',tex_city_wall:'facade',tex_rock_strata:'basalt',tex_rock:'basalt',tex_concrete:'concrete',tex_metal_panel:'facade'};
export const generatedTextureUrl=id=>(import.meta.env.BASE_URL||'./')+'textures/'+(replacements[id]?'surfaces-v2/'+replacements[id]:'gen/'+id)+'.jpg';
const textures=new Map(),materials=new Map(),loader=new THREE.TextureLoader();
export function surfaceTexture(id){
  if(!textures.has(id)){const t=loader.load((import.meta.env.BASE_URL||'./')+'textures/surfaces-v2/'+id+'.jpg');t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;textures.set(id,t);}
  return textures.get(id);
}
// World projection keeps density consistent on the street ribbons, buildings and merged props.
export function surfaceMaterial(id,{meters=3,color='#ffffff',roughness=.86,metalness=0}={}){
  const key=[id,meters,color,roughness,metalness].join('/');if(materials.has(key))return materials.get(key);
  const mat=new THREE.MeshStandardMaterial({map:surfaceTexture(id),color,roughness,metalness});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.surfaceScale={value:1/meters};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 surfaceP; varying vec3 surfaceN;').replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 surfaceLocal=vec4(position,1.);vec3 surfaceNormal=normal;
      #ifdef USE_INSTANCING
        surfaceLocal=instanceMatrix*surfaceLocal;surfaceNormal=mat3(instanceMatrix)*surfaceNormal;
      #endif
      surfaceP=(modelMatrix*surfaceLocal).xyz;surfaceN=normalize(mat3(modelMatrix)*surfaceNormal);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 surfaceP; varying vec3 surfaceN; uniform float surfaceScale;').replace('#include <map_fragment>',`vec3 sw=pow(abs(surfaceN),vec3(8.));sw/=max(dot(sw,vec3(1.)),.0001);
      vec4 surfaceC=texture2D(map,surfaceP.zy*surfaceScale)*sw.x+texture2D(map,surfaceP.xz*surfaceScale)*sw.y+texture2D(map,surfaceP.xy*surfaceScale)*sw.z;
      diffuseColor*=surfaceC;`);
  };
  mat.customProgramCacheKey=()=> 'world-surface-v2';materials.set(key,mat);return mat;
}
