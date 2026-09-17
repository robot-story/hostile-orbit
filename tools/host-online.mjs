import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.PORT || 4175);
if (!fs.existsSync(path.join(root, 'index.html'))) throw Error('Run npm run build first.');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.glb':'model/gltf-binary', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (pathname === '/relay-info.json') { res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify({transport:'hostile-orbit-relay'})); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, stat) => { if (err || !stat.isFile()) { res.writeHead(404).end(); return; } res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache'}); fs.createReadStream(file).pipe(res); });
});
const wss = new WebSocketServer({server, path:'/game-peer', maxPayload:1024*1024});
const peers = new Map(), connections = new Map();
const send = (s,m) => { if(s.readyState === WebSocket.OPEN && s.bufferedAmount<4*1024*1024)s.send(JSON.stringify(m)); };
function closeConnection(id) { const pair=connections.get(id); if(!pair)return; connections.delete(id); for(const p of pair)send(p,{type:'closed',connection:id}); }
wss.on('connection', socket => {
  if(wss.clients.size>32){socket.close();return;}
  socket.alive=true; socket.on('pong',()=>socket.alive=true);
  socket.on('message', bytes => {
    let m;try{m=JSON.parse(bytes);}catch{return;}
    if(!m||typeof m!=='object')return;
    if(m.type==='register') {
      if(socket.peerId)return;
      const id=m.id || crypto.randomUUID();
      if(typeof id!=='string'||id.length>100||peers.has(id)){send(socket,{type:'error',code:'unavailable-id',message:'Room already exists'});return;}
      socket.peerId=id;peers.set(id,socket);send(socket,{type:'registered',id});return;
    }
    if(!socket.peerId)return;
    if(m.type==='connect') {
      const target=peers.get(m.target);
      if(!target){send(socket,{type:'error',code:'peer-unavailable',message:'No online lobby with that code'});return;}
      if(typeof m.connection!=='string'||m.connection.length>150||connections.has(m.connection)||connections.size>=96)return;
      connections.set(m.connection,[socket,target]);send(target,{type:'incoming',connection:m.connection});return;
    }
    const pair=connections.get(m.connection);if(!pair||!pair.includes(socket))return;
    const other=pair[0]===socket?pair[1]:pair[0];
    if(m.type==='accept'&&socket===pair[1])send(other,{type:'opened',connection:m.connection});
    else if(m.type==='data')send(other,{type:'data',connection:m.connection,data:m.data});
    else if(m.type==='close')closeConnection(m.connection);
  });
  socket.on('close',()=>{if(peers.get(socket.peerId)===socket)peers.delete(socket.peerId);for(const [id,pair] of connections)if(pair.includes(socket))closeConnection(id);});
  socket.on('error',()=>{});
});
const heartbeat=setInterval(()=>{for(const s of wss.clients){if(!s.alive){s.terminate();continue;}s.alive=false;s.ping();}},15000);
server.on('close',()=>clearInterval(heartbeat));
server.listen(port,'127.0.0.1',()=>console.log(`Online game relay listening at http://127.0.0.1:${port}`));
