// Static geometry merging: folds level props that share a material into one mesh per material (huge draw-call win).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function isMergeable(mesh, dynamicSet) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh) return false;
  if (dynamicSet.has(mesh)) return false;
  for (let o = mesh; o; o = o.parent) if (o.userData?.noMerge) return false;
  const m = mesh.material; if (!m || Array.isArray(m)) return false;
  if (m.transparent || m.isShaderMaterial || m.morphTargets) return false;
  const g = mesh.geometry; if (!g || !g.attributes.position) return false;
  if (g.attributes.position.count > 20000) return false;
  return true;
}

/** Merge static props under world.props. `dynamic` = meshes that gameplay moves/hides later. */
export function mergeStaticProps(world, dynamic = []) {
  const dynamicSet = new Set(dynamic.filter(Boolean));
  world.props.updateMatrixWorld(true);
  const groups = new Map(); // material -> [{geo, mesh}]
  const list = [];
  world.props.traverse((o) => { if (isMergeable(o, dynamicSet)) list.push(o); });
  for (const mesh of list) {
    const geo = mesh.geometry.clone();
    // normalise attribute sets so merge does not fail (drop uv2/tangents etc.)
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) { const n = geo.attributes.position.count; geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); }
    if (geo.index) { /* keep indexed */ } else geo.setIndex(null);
    geo.applyMatrix4(mesh.matrixWorld);
    const key = mesh.material;
    if (!groups.has(key)) groups.set(key, { geos: [], castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow });
    groups.get(key).geos.push(geo);
  }
  let merged = 0, removed = 0;
  const out = new THREE.Group(); out.name = 'merged-props';
  for (const [mat, g] of groups) {
    if (g.geos.length < 2) { for (const geo of g.geos) geo.dispose(); continue; }
    // merge in chunks to keep individual meshes frustum-cullable by region (split by x/z quadrant)
    const buckets = new Map();
    for (const geo of g.geos) { geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3()); const k = `${Math.floor((c.x + 200) / 100)}_${Math.floor((c.z + 200) / 100)}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(geo); }
    for (const [, geos] of buckets) {
      const allIndexed = geos.every(x => !!x.index);
      const norm = geos.map(x => allIndexed ? x : x.toNonIndexed());
      let mg = null;
      try { mg = mergeGeometries(norm, false); } catch (e) { console.warn('[merge] failed bucket', e); }
      if (!mg) continue;
      const mesh = new THREE.Mesh(mg, mat); mesh.castShadow = g.castShadow; mesh.receiveShadow = g.receiveShadow; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      out.add(mesh); merged++;
      for (const x of geos) x.dispose();
    }
    // remove originals that used this material
    for (const mesh of list) if (mesh.material === mat) { mesh.parent?.remove(mesh); removed++; }
  }
  world.props.add(out);
  console.info(`[merge] ${removed} meshes -> ${merged} merged meshes`);
  return { merged, removed };
}

/** Merge a weapon/prop Group's child meshes by material, keeping non-mesh children (sockets). */
export function mergeGroupByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map(); const meshes = [];
  group.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
  for (const m of meshes) { const geo = m.geometry.clone(); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(geo); }
  for (const m of meshes) m.parent?.remove(m);
  for (const [mat, geos] of byMat) { const allIdx = geos.every(x => !!x.index); const mg = mergeGeometries(geos.map(x => allIdx ? x : x.toNonIndexed()), false); const mesh = new THREE.Mesh(mg, mat); mesh.castShadow = true; group.add(mesh); }
  return group;
}
