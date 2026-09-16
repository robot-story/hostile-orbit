import { el, icon, actionButton, screenHeader } from '../components.js';

const LABEL = {primary:'PRIMARY WEAPON',secondary:'SECONDARY WEAPON',grenade:'GRENADE'};
export function createLoadoutScreen(api,mgr){
  const root=el('div',{class:'screen loadout-screen'});
  let loadout,openSlot=null,inspectedSlot='primary';
  const inLobby=()=>api.mp.state().connected;
  const isHost=()=>!inLobby()||api.mp.state().isHost;
  function saveLoadout(){api.save.setLoadout(loadout);if(inLobby())api.mp.setLoadout(loadout);}
  function weaponIcon(id){return {shotgun:'shotgun',lmg:'lmg',pistol:'pistol'}[api.WEAPONS[id]?.kind]||'rifle';}
  function buildCard(slot){
    const selectable=slot!=='grenade',w=selectable?api.WEAPONS[loadout[slot]]:api.GRENADE;
    const card=el(selectable?'button':'div',{type:selectable?'button':null,class:'load-card panel '+(openSlot===slot?'open':''),'aria-expanded':selectable?String(openSlot===slot):null},[
      el('div',{class:'lc-icon',html:icon(selectable?weaponIcon(w.id):'grenade')}),
      el('div',{class:'lc-info'},[el('div',{class:'lc-label',text:LABEL[slot]}),el('div',{class:'lc-name',text:w.name})]),
      selectable?el('div',{class:'chev'}):el('span',{class:'lc-label',text:'×'+api.GRENADE.count})
    ]);
    if(selectable)card.addEventListener('click',()=>{api.ui.click();openSlot=openSlot===slot?null:slot;inspectedSlot=slot;api.preview.setWeapon(loadout[slot]);render();});
    const nodes=[card];
    if(selectable&&openSlot===slot){
      const list=el('div',{class:'weapon-picker panel','aria-label':LABEL[slot]+' choices'});
      for(const weapon of Object.values(api.WEAPONS).filter(w=>w.slot===slot&&!w.hidden)){
        const unlocked=api.save.hasWeapon(weapon.id);
        list.appendChild(el('button',{type:'button',class:'wp-item '+(weapon.id===loadout[slot]?'active ':'')+(unlocked?'':'locked'),disabled:!unlocked,'aria-pressed':String(weapon.id===loadout[slot]),
          onclick:()=>{loadout[slot]=weapon.id;saveLoadout();api.preview.setWeapon(weapon.id);openSlot=null;api.ui.click();render();}},[
          el('span',{class:'wp-name',text:weapon.name}),!unlocked?el('span',{class:'wp-lock',text:'MISSION REWARD / FIELD RECOVERY'}):null
        ]));
      }
      nodes.push(list);
    }
    return nodes;
  }
  function buildFrames(){
    return el('div',{class:'frame-panel panel'},[el('div',{class:'panel-title',text:'FRAME VARIANT'}),
      ...Object.entries(api.FRAME_VARIANTS).map(([color,frame])=>el('button',{type:'button',class:'frame-choice'+(loadout.neon===color?' active':''),style:{'--frame-color':color},'aria-pressed':String(loadout.neon===color),
        onclick:()=>{loadout.neon=color;saveLoadout();api.preview.setNeon(color);api.ui.click();render();}},[
        el('span',{class:'frame-light'}),el('div',{class:'frame-info'},[el('div',{class:'frame-name',text:frame.name}),el('div',{class:'frame-role',text:frame.role}),el('div',{class:'frame-description',text:frame.blurb})]),
        loadout.neon===color?el('span',{class:'frame-check',html:icon('check')}):null
      ]))
    ]);
  }
  function buildStats(){
    const w=api.WEAPONS[loadout[inspectedSlot]];
    const stats=[['DAMAGE',w.pellets>1?w.damage+' × '+w.pellets:w.damage],['FIRE RATE',w.rpm+' RPM'],['MAGAZINE',w.mag],['RANGE',w.range+' m']];
    return el('div',{class:'stats-panel panel'},[el('div',{class:'panel-title',text:LABEL[inspectedSlot]}),el('div',{class:'sp-weapon',text:w.name}),
      el('div',{class:'weapon-facts'},stats.map(([label,value])=>el('div',{},[el('span',{text:label}),el('strong',{text:value})])))
    ]);
  }
  function buildSupport(){
    return el('div',{class:'support-row'},[el('div',{class:'sr-title',text:'ORBITAL SUPPORT'}),el('div',{class:'sr-tiles'},Object.values(api.ABILITIES).map(a=>el('div',{class:'sr-tile panel',title:a.description},[
      el('div',{class:'sr-key',text:api.keyLabel(api.settings.data.binds[a.key])}),el('div',{html:icon(a.id)}),el('div',{class:'sr-name',text:a.name})
    ])))]);
  }
  function render(){
    root.replaceChildren(screenHeader(api,{title:'DEPLOYMENT LOADOUT'}));
    const left=el('div',{class:'lo-col-left'},[el('div',{class:'lo-sub',text:'EQUIPMENT'}),...['primary','secondary','grenade'].flatMap(buildCard),buildSupport()]);
    const center=el('div',{class:'lo-col-center'},[el('div',{class:'preview-hint',text:'DRAG TO ROTATE'})]);
    let drag=null;
    center.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag=e.clientX;center.setPointerCapture(e.pointerId);});
    center.addEventListener('pointermove',e=>{if(drag===null)return;api.preview.rotate((e.clientX-drag)*.01);drag=e.clientX;});
    center.addEventListener('pointerup',()=>{drag=null;});center.addEventListener('pointercancel',()=>{drag=null;});
    const right=el('div',{class:'lo-col-right'},[buildFrames(),buildStats()]);
    const map=api.MAPS[loadout.map]||api.MAPS[api.DEFAULT_MAP];
    const bottom=el('div',{class:'lo-bottom'},[
      actionButton(api,{label:inLobby()?'BACK TO LOBBY':'BACK TO OPERATION',sound:'back',onClick:()=>mgr.show(inLobby()?'multiplayer':'operation')}),
      el('div',{class:'lo-deploy-context',text:map.name+' · '+(api.DIFFICULTIES[loadout.difficulty]?.name||'VETERAN')+' · SAVED AUTOMATICALLY'}),
      actionButton(api,{label:inLobby()?'SAVE & RETURN TO LOBBY':'DEPLOY',disabled:false,kind:'primary',icon:'deploy',sound:'deploy',onClick:()=>{
        loadout.dropZone='main';saveLoadout();
        if(inLobby())mgr.show('multiplayer');else api.startDeployment({difficulty:loadout.difficulty,dropZone:'main',map:loadout.map,loadout});
      }})
    ]);
    root.append(left,center,right,bottom);
  }
  return {el:root,onShow(){loadout={...api.save.profile.loadout};loadout.neon||='#00e5ff';openSlot=null;inspectedSlot='primary';api.preview.setMode('loadout');api.preview.setWeapon(loadout.primary);api.preview.setNeon(loadout.neon);render();},onHide(){}};
}
