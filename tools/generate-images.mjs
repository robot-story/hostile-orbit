// Build-time menu backdrop generation via OpenAI Images (gpt-image-1). Outputs to public/textures/menus/*.jpg.
// Key: process.env.OPENAI_API_KEY, else dev fallback parsed from ./api.md (never logged, never shipped).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'textures', 'menus');
fs.mkdirSync(OUT, { recursive: true });

function getKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  try { const t = fs.readFileSync(path.join(ROOT, 'api.md'), 'utf8'); const m = t.match(/=\s*(sk-[A-Za-z0-9_\-]+)/); if (m) return m[1]; } catch { /* ignore */ }
  throw new Error('No OpenAI key available (set OPENAI_API_KEY)');
}
const KEY = getKey();

const STYLE = 'Cinematic military science fiction concept art, photoreal 3D render look, dark gunmetal and dirty-white armour palette, bright cyan neon lighting and holographic interface glows, red-orange warning lights, volumetric haze, high detail, wide 16:9 composition, no text, no letters, no logos, no watermark.';

const IMAGES = [
  { id: 'main_menu_alien', prompt: `${STYLE} View from inside an orbital command ship observation deck through a huge angled window at a strange alien planet below: burnt-orange deserts cut by enormous glowing violet and acid-green energy veins that pulse beneath the crust, colossal black glass spires rising kilometres high out of the surface into space, an electrical aurora arcing from the planet's pole up to orbit, bioluminescent cloud rivers, a ring of shattered moon debris, two grey moons, a fleet of dark Commonwealth warships with cyan engine glows in orbit and a docked comms-array station with cyan strips. Foreground right: an armoured soldier in black and dirty-white plated armour with cyan neon helmet slits standing at the rail with his back to camera. Bottom-left: consoles with glowing cyan tactical screens. Left third of frame is dark bulkhead with subtle cyan light strips for menu text. Eerie, beautiful, hostile.` },
  { id: 'main_menu', prompt: `${STYLE} Interior of an orbital command ship observation deck: a huge angled window on the right two thirds of frame looking down at a burnt-orange alien planet with a curved horizon and glowing orange atmosphere rim, cyan city lights and burning zones on the surface, a fleet of dark warships with cyan engine glows in orbit firing occasional orange beams, a docked communications-array space station with cyan light strips, two grey moons. Foreground right: an armoured soldier in black and dirty-white plated armour with cyan neon helmet slits and backpack strip, standing at a rail with his back to camera looking out. Bottom-left: consoles with glowing cyan tactical screens and crates. The left third of the frame is dark structural bulkhead with subtle cyan light strips, mostly empty for menu text.` },
  { id: 'operation', prompt: `${STYLE} Interior of an orbital command centre around a large dark holographic war table seen from a slightly elevated angle, the table surface empty and dark (to be overlaid with a map), cyan light strips along its edges, glass railings, officers in armour silhouetted in the far background, tall windows behind showing the burnt-orange planet and fleet, banners with a chevron emblem, orange and cyan light strips on ceiling struts, thin haze.` },
  { id: 'loadout', prompt: `${STYLE} Hangar bay interior of a military starship: dark reflective deck floor with cyan light strips, rows of crates and shipping containers with hazard stripes on both sides, overhead light bars, a huge open bay door at the far end framed with hazard stripes showing a burnt-orange planet and a dark warship silhouette, a docked dropship on the left, tools and ammunition racks. The centre of the frame is EMPTY deck space with soft cyan key light from the front-left (a character will be composited there). No people.` },
  { id: 'results', prompt: `${STYLE} Inside the troop bay of a dropship looking out of the open rear ramp at a burning alien military base far below: black smoke columns, orange fires, tall towers with cyan neon strips, a burnt-orange canyon landscape, two grey moons in a turquoise-orange sky. The bay interior has ribbed dark walls with red and cyan light strips. On the right side of frame an armoured soldier in black and dirty-white plate armour with cyan helmet slits stands with his back to camera watching the destruction. Left half of frame is darker interior for text.` },
  { id: 'failed', prompt: `${STYLE} Inside the troop bay of a dropship looking out of the open rear ramp at a burning alien military base, dominated by red-orange emergency lighting, sparks falling from the ceiling, cracked armoured helmet in the foreground on a crate, smoke inside the bay, dark and grim, left half of frame is dark for text.` },
  { id: 'lobby', prompt: `${STYLE} Squad ready room aboard a military starship: three armoured soldiers in black and dirty-white plate armour with different coloured neon helmet slits (cyan, amber, violet) standing in a row at a rail facing a large window with a burnt-orange planet and fleet outside, holographic squad status panels floating around them, cyan and amber light strips, dark deck. The upper left of the frame is darker for text.` },
  { id: 'armoury', prompt: `${STYLE} Military starship armoury: a dark wall with racks of futuristic assault rifles, shotguns, light machine guns and pistols in dirty-white and black with cyan neon strips, ammunition crates with hazard stripes, a cyan holographic weapon schematic floating in the air, workbench with tools, cyan under-lighting, left third of the frame darker for text.` },
  { id: 'record', prompt: `${STYLE} A dark command corridor aboard a military starship with holographic cyan data displays and scrolling statistics panels floating along the walls, a large chevron emblem projected in light, armoured soldier silhouettes walking in the far distance, cyan light strips on the floor edges, haze. Mostly dark negative space in the centre-left for text.` },
  { id: 'settings', prompt: `${STYLE} Close-up of a dark starship control console with many glowing cyan and amber buttons, sliders and holographic toggles, shallow depth of field, out-of-focus window with the burnt-orange planet in the background, dark negative space on the left half for menu text.` },
  { id: 'drop_pod_interior', prompt: `${STYLE} First-person view from inside a cramped drop pod: dark ribbed metal walls with red warning strips and cyan status lights, a small viewport showing fire and plasma streaks of atmospheric entry, restraint harness in the foreground, sparks, intense heat glow, claustrophobic.` },
];

async function generate(img) {
  const file = path.join(OUT, `${img.id}.jpg`);
  if (fs.existsSync(file) && !process.argv.includes('--force')) { console.log('skip', img.id); return; }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: img.prompt, size: '1536x1024', quality: 'medium', output_format: 'jpeg', output_compression: 82, n: 1 }),
    });
    if (res.status === 429 || res.status >= 500) { const wait = 4000 * (attempt + 1); console.log(`retry ${img.id} in ${wait}ms (${res.status})`); await new Promise(r => setTimeout(r, wait)); continue; }
    if (!res.ok) { const t = await res.text(); throw new Error(`${img.id}: ${res.status} ${t.slice(0, 300)}`); }
    const json = await res.json();
    const b64 = json.data?.[0]?.b64_json; if (!b64) throw new Error(`${img.id}: no image data`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('wrote', img.id, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
    return;
  }
  throw new Error(`${img.id}: gave up`);
}

// Reference-guided edits (gpt-image-1 /images/edits): the model paints from the supplied image.
const EDITS = [
  { id: 'hero_main', ref: 'screenshot/character-model.png', prompt: `Using the exact armour design of the soldier in the reference (black and dirty-white plated armour, cyan neon visor slits, chest bar, backpack strip, chevron emblem), create a cinematic, photoreal, wide 16:9 heroic propaganda-style scene: the soldier stands on an orbital command deck at a rail with his back three-quarters to camera, rifle held ready, looking down through a huge window at a strange alien planet with glowing violet and green energy veins, black glass spires, and an aurora tethering the planet to orbit; a fleet of dark warships with cyan engines descends past him; dramatic rim light in cyan and burnt orange, volumetric haze, propaganda-poster heroism played completely straight, the composition leaves the left third dark for menu text. No text, no letters, no logos.` },
  { id: 'map_clean', ref: 'screenshot/level-map.png', prompt: `Recreate this top-down tactical map with EXACTLY the same terrain layout, canyon shapes, routes, outposts, buildings and landing pad in the same positions, as a clean photoreal satellite/terrain render seen from directly above. Remove ALL text, labels, numbers, legend boxes, grid lines, arrows, icons and markers. Burnt-orange desert floor, dark basalt canyon walls, gunmetal military structures with cyan light strips, subtle glowing violet and green energy veins in the ground. No text of any kind.` },
];
const TEXTURES = [
  { id: 'planet_equirect', prompt: `Seamless equirectangular (2:1 projection) planet surface texture of an alien desert world seen from orbit: burnt-orange deserts, dark basalt mountain ranges, vast glowing violet and acid-green energy vein networks cracking the crust, scattered cyan city-light clusters, dust storms, small polar ice caps at the very top and bottom edges. Continuous across left and right edges. No text, no watermark, no borders.` },
];

async function edit(img) {
  const file = path.join(OUT, `${img.id}.jpg`);
  if (fs.existsSync(file) && !process.argv.includes('--force')) { console.log('skip', img.id); return; }
  const refPath = path.join(ROOT, img.ref);
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', img.prompt);
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  form.append('output_format', 'jpeg');
  form.append('output_compression', '85');
  form.append('image[]', new Blob([fs.readFileSync(refPath)], { type: 'image/png' }), path.basename(refPath));
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { 'Authorization': `Bearer ${KEY}` }, body: form });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); continue; }
    if (!res.ok) { const t = await res.text(); throw new Error(`${img.id}: ${res.status} ${t.slice(0, 300)}`); }
    const json = await res.json(); const b64 = json.data?.[0]?.b64_json; if (!b64) throw new Error(`${img.id}: no image`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64')); console.log('wrote', img.id, (fs.statSync(file).size / 1024).toFixed(0) + ' KB'); return;
  }
  throw new Error(`${img.id}: gave up`);
}

const only = process.argv.find(a => a.startsWith('--only='))?.slice(7)?.split(',');
if (process.argv.includes('--edits')) {
  for (const e of EDITS) { if (only && !only.includes(e.id)) continue; try { await edit(e); } catch (err) { console.error(String(err.message)); } }
  for (const t of TEXTURES) { if (only && !only.includes(t.id)) continue; try { await generate(t); } catch (err) { console.error(String(err.message)); } }
  console.log('done edits'); process.exit(0);
}
const list = only ? IMAGES.filter(i => only.includes(i.id)) : IMAGES;
let i = 0; const workers = 3;
await Promise.all(Array.from({ length: workers }, async () => { while (i < list.length) { const img = list[i++]; try { await generate(img); } catch (e) { console.error(String(e.message)); } } }));
console.log('done');
