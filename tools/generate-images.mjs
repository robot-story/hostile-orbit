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

const STYLE = 'In-engine screenshot from a modern AAA third-person military science fiction shooter (Helldivers 2 art direction): grounded, muted, slightly desaturated palette, matte materials, soft overcast-orbital lighting, real-world military proportions, subtle film grain, no glossy concept-art sheen, no lens flares, no oversaturated neon except small practical light strips in dim cyan and warm amber, wide 16:9, no text, no letters, no logos, no watermark.';

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
  { id: 'map_lantern', ref: 'screenshot/lantern-schematic.png', prompt: `Recreate this top-down city map with EXACTLY the same street layout, plazas, compounds and open areas in the same positions, as a clean photoreal night-time satellite render seen from directly above. The grey/blue shapes are open streets and plazas (dark wet asphalt with faint lane markings); the dark grid blocks are dense neon skyscraper rooftops (dark composite roofs with small cyan, magenta and amber neon lights and rooftop antennas, seen from above). The magenta dot is a tall signal spire on a power substation; the rectangle outlined in cyan is a broadcast compound; the rectangle outlined in amber is a detention block; the large circle outlined in cyan is a rooftop landing pad; the small circle at the bottom is a transit plaza. Remove ALL text, labels, numbers, grid lines, arrows, icons and outlines. Night, no sun, subtle glow from the neon. No text of any kind.` },
  { id: 'map_clean', ref: 'screenshot/level-map.png', prompt: `Recreate this top-down tactical map with EXACTLY the same terrain layout, canyon shapes, routes, outposts, buildings and landing pad in the same positions, as a clean photoreal satellite/terrain render seen from directly above. Remove ALL text, labels, numbers, legend boxes, grid lines, arrows, icons and markers. Burnt-orange desert floor, dark basalt canyon walls, gunmetal military structures with cyan light strips, subtle glowing violet and green energy veins in the ground. No text of any kind.` },
];
const TILE = 'Seamless tileable PBR-style albedo texture, perfectly flat top-down orthographic view, even diffuse lighting, no perspective, no shadows cast by external objects, edges wrap seamlessly, square, no text, no watermark, no borders.';
const MATERIALS = [
  { id: 'tex_armor_white', prompt: `${TILE} Dirty off-white ceramic-composite military armour plating: scuffed, chipped edges revealing dark metal, faint panel seams and hex micro-pattern, grime in the recesses, a few small dark rivets. Power-armour aesthetic (black and dirty white). 1:1 plate scale of roughly 20 cm across the image.` },
  { id: 'tex_armor_black', prompt: `${TILE} Matte black tactical under-suit and armour joint material: woven ballistic fabric with fine hexagonal weave, thin black rubberised plates, subtle grey scuffs, panel stitching.` },
  { id: 'tex_legion_armor', prompt: `${TILE} Dark gunmetal biomechanical armour plating of a synthetic soldier: layered dark grey alloy plates with corroded copper edges, thin red-orange circuit veins glowing faintly in the seams, oily sheen, battle damage.` },
  { id: 'tex_metal_panel', prompt: `${TILE} Dark gunmetal military wall panels: riveted steel plates, recessed seams, rust streaks, dust, faded yellow hazard paint remnants in one corner, scratches.` },
  { id: 'tex_concrete', prompt: `${TILE} Weathered grey military concrete: cracks, dust, dark oil stains, formwork seams, small chips, slightly orange dust deposits.` },
  { id: 'tex_rock', prompt: `${TILE} Dark basalt volcanic rock with burnt-orange dust settling in the crevices, sharp faceted texture, some glossy black glassy patches.` },
  { id: 'tex_terrain', prompt: `${TILE} Burnt-orange alien desert ground: fine dust and coarse grit, small dark pebbles, faint dried mud cracks, footprints and tyre tracks softened by wind.` },
  { id: 'tex_gun_white', prompt: `${TILE} Dirty white polymer and steel weapon receiver surface: matte off-white paint scuffed to bare metal at the edges, small vents and screws, panel lines.` },
];
MATERIALS.push(
  { id: 'tex_rock_strata', prompt: `${TILE} Layered sedimentary canyon rock face seen straight on: horizontal strata bands of burnt orange, rust, ochre and dark brown, deep shadowed crevices between layers, chipped ledges, fine dust in the cracks, some dark basalt inclusions. Scale roughly 3 m across the image.` },
  { id: 'tex_gun_dark', prompt: `${TILE} Dark gunmetal weapon receiver surface: matte charcoal-grey anodised steel with fine machining marks, small vent slots, worn edges showing lighter bare metal, tiny stencilled serial digits, light dust. Plate scale roughly 15 cm across the image.` },
  { id: 'tex_black_glass', prompt: `${TILE} Alien black volcanic glass surface: glossy obsidian with faint internal violet and green light veins deep inside, conchoidal fracture facets, subtle dust in the cracks. Scale roughly 40 cm across the image.` },
  { id: 'tex_membrane', prompt: `${TILE} Translucent alien membrane skin: pale green-cyan organic tissue with branching darker veins and small bioluminescent pores, slightly wet, backlit look. Scale roughly 30 cm across the image.` },
  { id: 'tex_asphalt', prompt: `${TILE} Wet dark asphalt street at night: cracked tarmac, faded painted lane markings partially visible, puddles reflecting faint neon, oil stains, grit. Scale roughly 2 m across the image.` },
  { id: 'tex_city_wall', prompt: `${TILE} Dark composite skyscraper facade panel: matte black-blue metal cladding with recessed seams, a grid of small dark window insets, thin conduit pipes, grime streaks, a few tiny warning labels. Scale roughly 3 m across the image.` },
);
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
// Alien-planet backdrop set (no people, no soldiers, no text): strange glowing worlds seen from orbit or the surface.
const PLANET = 'Cinematic photoreal wide 16:9 science-fiction vista, grounded muted palette with restrained bioluminescent accents, volumetric haze, soft orbital lighting, no people, no soldiers, no characters, no spacecraft interiors with crew, no text, no letters, no logos, no watermark. The left third of the frame is dark and quiet for menu text.';
const PLANETS = [
  { id: 'title_moon', prompt: `${PLANET} Epic title key art: a colossal dark moon filling the right two thirds of the frame, its shadowed face cracked with faint magenta and cyan neon fissures, a razor-thin crescent of cold light on its rim, a distant orange planet limb glowing far below, drifting debris ring fragments catching light, deep space with sparse sharp stars. Ominous, still, cinematic. Left third dark for a title.` },
  { id: 'hero_main', prompt: `${PLANET} Seen from high orbit: a strange alien planet dominating the right of frame, burnt-orange deserts split by enormous pulsing violet and acid-green energy veins glowing beneath the crust, colossal black glass spires rising out of the surface into space, an electrical aurora arcing from the pole up into orbit, rivers of bioluminescent cloud, a shattered ring of moon debris catching the light, two grey moons, stars. Eerie, beautiful, hostile.` },
  { id: 'operation', prompt: `${PLANET} A slow tilt-down view from low orbit over the terminator line of the alien planet: night side below with glowing violet vein networks and cyan pinpoints of outposts, the day side ahead burnt orange with black glass spires, thin luminous atmosphere rim, faint auroral curtains, calm and clinical, mostly dark below for a map overlay.` },
  { id: 'lobby', prompt: `${PLANET} Surface view at dusk on the alien world: a vast plain of cracked orange rock with glowing acid-green veins running toward a horizon of towering black glass spires, a huge ringed gas giant rising behind them, two moons, drifting bioluminescent spores in the air, long shadows.` },
  { id: 'armoury', prompt: `${PLANET} Inside a cavern of black volcanic glass on the alien world: crystalline walls refracting violet and cyan light, glowing green mineral veins, a still pool reflecting a shaft of orange daylight from a crack in the ceiling, mist, no structures, no people.` },
  { id: 'record', prompt: `${PLANET} High altitude aerial view of the alien planet's canyon lands: labyrinthine burnt-orange canyons, black basalt walls, luminous violet veins threading the canyon floors like circuitry, storm clouds lit from within by green lightning, a black glass spire piercing the clouds in the distance.` },
  { id: 'settings', prompt: `${PLANET} Close orbit over the alien planet's aurora pole: curtains of violet and green auroral light rippling above the curved horizon, the star setting behind the limb with a thin orange atmosphere glow, shattered moon fragments drifting in the foreground in shadow, deep space and stars, calm and quiet.` },
  { id: 'results', prompt: `${PLANET} Dawn breaking over the alien world seen from a high ridge: golden-orange light spilling across the vein-lit plains, black glass spires glowing at their tips, the aurora fading, columns of smoke rising far away from a destroyed installation, two moons pale in a turquoise sky, a sense of grim victory.` },
  { id: 'failed', prompt: `${PLANET} Night on the alien world during a violent storm: red-orange lightning tearing through black clouds over the vein-lit plains, black glass spires silhouetted, ash and embers blowing across the frame, the energy veins flaring an angry crimson, ominous and hostile.` },
];
// Propaganda posters and city billboard art (used as emissive textures on posterFrames / billboards / holo boards)
const POSTER = 'Flat 2D propaganda poster design, portrait 2:3, bold retro-futurist constructivist layout, limited palette of cyan, black, dirty white and one accent of burnt orange, heavy geometric shapes, a stylised heroic white-and-black armoured robot soldier, halftone texture, clean vector look, NO text, NO letters, NO words, NO numbers.';
const POSTERS = [
  { id: 'poster_01', prompt: `${POSTER} Motif: the soldier saluting toward a rising planet with a ring of orbital ships.` },
  { id: 'poster_02', prompt: `${POSTER} Motif: a pointing gloved hand and a giant eye made of circuitry, watching.` },
  { id: 'poster_03', prompt: `${POSTER} Motif: rows of identical soldiers marching under a crescent moon, arrows pointing up.` },
  { id: 'poster_04', prompt: `${POSTER} Motif: a smiling family of robots holding a glowing box, sunburst behind them.` },
  { id: 'poster_05', prompt: `${POSTER} Motif: a fist crushing a shattered violet crystal, cyan light rays.` },
  { id: 'poster_06', prompt: `${POSTER} Motif: an orbital strike beam hitting a canyon, stylised, celebratory.` },
  { id: 'holo_01', prompt: `Wide 16:9 flat holographic billboard artwork, dark background, neon cyan and magenta line art of a colossal robot statue with a raised arm over a city skyline, scanline texture, glitch fragments, NO text, NO letters.` },
  { id: 'holo_02', prompt: `Wide 16:9 flat holographic billboard artwork, dark background, neon magenta and amber: an eye-like surveillance lens with radiating rings and tiny drone silhouettes, scanline texture, NO text, NO letters.` },
  { id: 'holo_03', prompt: `Wide 16:9 flat holographic billboard artwork, dark background, neon cyan: a stylised map of a moon colony with routes lighting up, glowing nodes, glitch fragments, NO text, NO letters.` },
  { id: 'holo_04', prompt: `Wide 16:9 flat holographic billboard artwork, dark background, neon amber and cyan: a cheerful robot mascot face giving a thumbs up, halftone, scanlines, NO text, NO letters.` },
];
if (process.argv.includes('--posters')) {
  const OUTP = path.join(ROOT, 'public', 'textures', 'posters'); fs.mkdirSync(OUTP, { recursive: true });
  let k = 0; const w = 4;
  await Promise.all(Array.from({ length: w }, async () => { while (k < POSTERS.length) { const m = POSTERS[k++]; if (only && !only.includes(m.id)) continue; const file = path.join(OUTP, `${m.id}.jpg`); if (fs.existsSync(file) && !process.argv.includes('--force')) { console.log('skip', m.id); continue; } const portrait = m.id.startsWith('poster');
    for (let attempt = 0; attempt < 4; attempt++) { const res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-1', prompt: m.prompt, size: portrait ? '1024x1536' : '1536x1024', quality: 'medium', output_format: 'jpeg', output_compression: 82, n: 1 }) });
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); continue; }
      if (!res.ok) { console.error(m.id, res.status, (await res.text()).slice(0, 200)); break; }
      const json = await res.json(); const b64 = json.data?.[0]?.b64_json; if (b64) { fs.writeFileSync(file, Buffer.from(b64, 'base64')); console.log('wrote', m.id); } break; } } }));
  process.exit(0);
}
if (process.argv.includes('--planets')) {
  let k = 0; const w = 4;
  await Promise.all(Array.from({ length: w }, async () => { while (k < PLANETS.length) { const m = PLANETS[k++]; if (only && !only.includes(m.id)) continue; try { await generate(m); } catch (err) { console.error(String(err.message)); } } }));
  process.exit(0);
}
if (process.argv.includes('--edits')) {
  for (const e of EDITS) { if (only && !only.includes(e.id)) continue; try { await edit(e); } catch (err) { console.error(String(err.message)); } }
  for (const t of TEXTURES) { if (only && !only.includes(t.id)) continue; try { await generate(t); } catch (err) { console.error(String(err.message)); } }
  console.log('done edits'); process.exit(0);
}
if (process.argv.includes('--materials')) {
  const OUT2 = path.join(ROOT, 'public', 'textures', 'gen'); fs.mkdirSync(OUT2, { recursive: true });
  let k = 0; const w = 3;
  await Promise.all(Array.from({ length: w }, async () => { while (k < MATERIALS.length) { const m = MATERIALS[k++]; if (only && !only.includes(m.id)) continue; const file = path.join(OUT2, `${m.id}.jpg`); if (fs.existsSync(file) && !process.argv.includes('--force')) { console.log('skip', m.id); continue; }
    for (let attempt = 0; attempt < 3; attempt++) { try {
      const res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-1', prompt: m.prompt, size: '1024x1024', quality: 'medium', output_format: 'jpeg', output_compression: 88, n: 1 }) });
      if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); continue; }
      if (!res.ok) { console.error(m.id, res.status, (await res.text()).slice(0, 200)); break; }
      const json = await res.json(); fs.writeFileSync(file, Buffer.from(json.data[0].b64_json, 'base64')); console.log('wrote', m.id); break;
    } catch (e) { console.error(m.id, String(e.message)); } } } }));
  console.log('done materials'); process.exit(0);
}
const list = only ? IMAGES.filter(i => only.includes(i.id)) : IMAGES;
let i = 0; const workers = 3;
await Promise.all(Array.from({ length: workers }, async () => { while (i < list.length) { const img = list[i++]; try { await generate(img); } catch (e) { console.error(String(e.message)); } } }));
console.log('done');
