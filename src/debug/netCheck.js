// Real multiplayer transport integration check. Each iframe has its own net singleton.
import { Transport } from '../net/transport.js';
import { net, MSG } from '../net/net.js';
import { events } from '../core/events.js';
const lo={primary:'viper',secondary:'longshot',neon:'#00e5ff',robot:'a'};
export function startNetCheck(){
  if(new URLSearchParams(location.search).get('netcheck')==='peer'){
    const t=new Transport();let received=0;
    net.on(MSG.CHAT,()=>received++);
    window.addEventListener('message',async e=>{
      if(e.origin!==location.origin||e.source!==parent||!e.data?.command)return;
      const {id,command,args=[]}=e.data;
      try{let value;
        if(command==='state')value={...t.state(),received,peerCount:t.peerCount};
        else if(command==='burst'){for(let i=0;i<args[0];i++)t.send(MSG.CHAT,{text:'stability '+i});value=true;}
        else if(command==='prepare'){t.setPhase('loading');value=true;}
        else if(command==='loaded')value=await t.waitForSquad();
        else if(command==='close'){t.close();value=true;}
        else if(command==='host')value=await t.host(args[0],lo);
        else if(command==='join')value=await t.join(args[0],args[1],lo);
        else if(command==='ready'){t.setReady(args[0],lo);value=true;}
        else if(command==='frame'){t.setLoadout({...lo,neon:args[0]});value=true;}
        else if(command==='settings'){t.setSettings(args[0]);value=true;}
        else throw Error('Unknown test command');
        parent.postMessage({id,value},location.origin);
      }catch(error){parent.postMessage({id,error:error.message},location.origin);}
    });parent.postMessage({testPeerReady:true},location.origin);return;
  }
  document.title='Co-op connection test';document.getElementById('ui').innerHTML='';
  const panel=document.createElement('div');panel.style.cssText='position:fixed;inset:0;z-index:999;padding:28px;overflow:auto;background:#101820;color:#deeff3;font:16px monospace';
  panel.innerHTML='<h2>Co-op / real connection test</h2><p>Three independent players use the same active connection transport as the game.</p><button>Run online checks</button><pre></pre>';document.body.append(panel);
  const out=panel.querySelector('pre'),button=panel.querySelector('button');let serial=0;
  button.onclick=async()=>{
    button.disabled=true;out.textContent='Opening isolated peers…\n';const frames=[];
    const pending=new Map();
    const receive=e=>{if(e.origin!==location.origin||!frames.some(f=>f.contentWindow===e.source))return;const item=pending.get(e.data?.id);if(item){pending.delete(e.data.id);clearTimeout(item.timer);e.data.error?item.reject(Error(e.data.error)):item.resolve(e.data.value);}};
    window.addEventListener('message',receive);
    const rpc=(i,command,...args)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(Error(command+' test timed out'));},55000)});frames[i].contentWindow.postMessage({id,command,args},location.origin);});
    const wait=ms=>new Promise(r=>setTimeout(r,ms));const check=(yes,msg)=>{if(!yes)throw Error(msg);out.textContent+='PASS '+msg+'\n';};
    try{
      for(let i=0;i<4;i++)await new Promise(resolve=>{const f=document.createElement('iframe');f.hidden=true;frames.push(f);const ready=e=>{if(e.source===f.contentWindow&&e.data?.testPeerReady){window.removeEventListener('message',ready);resolve();}};window.addEventListener('message',ready);f.src='?netcheck=peer';panel.append(f);});
      const room=await rpc(0,'host','QA HOST');out.textContent+='Room '+room.code+'\n';
      await rpc(1,'join',room.code,'QA GUEST');await rpc(2,'join',room.code,'QA THIRD');await wait(500);
      check((await rpc(0,'state')).players.filter(p=>p.connected).length===3,'Host + two guests join and share roster');
      let full=false;try{await rpc(3,'join',room.code,'QA FOURTH');}catch(e){full=e.message.includes('FULL');}check(full,'Fourth player gets LOBBY FULL');
      await rpc(1,'frame','#c44dff');await wait(250);check((await rpc(0,'state')).players.find(p=>p.name==='QA GUEST').loadout.neon==='#c44dff','Guest robot variant replicates');
      for(let i=0;i<3;i++)await rpc(i,'ready',true);await wait(250);check((await rpc(0,'state')).players.every(p=>p.ready),'Ready state replicates');
      await rpc(0,'settings',{difficulty:'elite',map:'lantern'});await wait(250);check((await rpc(1,'state')).settings.map==='lantern'&&!(await rpc(0,'state')).players.some(p=>p.ready),'Host settings sync and invalidate readiness');
      await rpc(0,'prepare');await wait(250);
      const hostLoaded=rpc(0,'loaded'),guestLoaded=rpc(1,'loaded');await wait(300);
      check((await rpc(0,'state')).phase==='loading','Deployment waits for slow third player');
      await Promise.all([hostLoaded,guestLoaded,rpc(2,'loaded')]);await wait(250);
      check((await rpc(1,'state')).phase==='mission','All peers cross loading barrier together');
      let inProgress=false;await rpc(2,'close');await wait(250);try{await rpc(3,'join',room.code,'QA LATE');}catch(e){inProgress=e.message.includes('PROGRESS');}check(inProgress,'Late join gets clear mission-in-progress response');
      await rpc(0,'burst',400);await rpc(1,'burst',400);await wait(11000);
      const host=await rpc(0,'state'),guest=await rpc(1,'state');check(host.received===400&&guest.received===400&&host.connected&&guest.connected,'800 ordered messages plus two heartbeat cycles remain connected');
      await rpc(0,'close');let disconnected=false;const until=Date.now()+10000;while(Date.now()<until){await wait(250);if(!(await rpc(1,'state')).connected){disconnected=true;break;}}check(disconnected,'Host disconnect reaches guest within 10 seconds');
      out.textContent+='ALL ONLINE TRANSPORT CHECKS PASSED\n';
    }catch(error){out.textContent+='FAIL '+error.message+'\n';console.error(error);}
    finally{for(let i=0;i<frames.length;i++)try{await rpc(i,'close');}catch{}for(const f of frames)f.remove();window.removeEventListener('message',receive);button.disabled=false;}
  };
}
