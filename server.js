const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3010);
let PROJECT_ROOT = path.resolve(process.env.PROJECT_ROOT || path.join(process.cwd(), "workspace"));
fs.mkdirSync(PROJECT_ROOT, { recursive: true });

function setWorkspaceRoot(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Workspace path wajib diisi.");
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) throw new Error("Folder workspace tidak ditemukan.");
  if (!fs.statSync(resolved).isDirectory()) throw new Error("Workspace harus berupa folder.");
  PROJECT_ROOT = resolved;
  fs.mkdirSync(PROJECT_ROOT, { recursive: true });
  fs.mkdirSync(path.join(PROJECT_ROOT, ".mce", "plugins"), { recursive: true });
  return PROJECT_ROOT;
}

// Large project support: no application-imposed 50 MB import cap.
app.use(express.json({ limit: "2gb" }));
app.use(express.static(path.join(__dirname, "public")));

function safePath(input = "") {
  const normalized = String(input).replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.split("/").some(part => part === "..")) throw new Error("Path traversal is not allowed.");
  const resolved = path.resolve(PROJECT_ROOT, normalized);
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error("Path outside workspace is not allowed.");
  }
  // Prevent symlinks from escaping the workspace. For new nested files,
  // walk upward until we find an existing ancestor before realpath().
  // This is important for imports such as:
  // workspace/project/src/app/page.tsx where several parent directories
  // do not exist yet.
  let probe = resolved;
  while (probe !== PROJECT_ROOT && !fs.existsSync(probe)) {
    probe = path.dirname(probe);
  }
  const real = fs.realpathSync.native(probe);
  if (real !== PROJECT_ROOT && !real.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error("Workspace symlink escapes are not allowed.");
  }
  return resolved;
}

function buildTree(dir, relative = "") {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter(e => true)
    .sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map(e => {
      const rel = path.join(relative, e.name).replaceAll("\\", "/");
      return e.isDirectory()
        ? { name:e.name, path:rel, type:"directory", children:buildTree(path.join(dir,e.name), rel) }
        : { name:e.name, path:rel, type:"file" };
    });
}

app.get("/api/workspace", (req,res) => {
  res.json({ path: PROJECT_ROOT, home: os.homedir(), cwd: process.cwd() });
});

// Local filesystem browser used by the Mobile Code workspace picker.
// It intentionally exposes directory metadata only; file contents stay behind
// the workspace APIs above. This is intended for the local Termux server.
function browseRoots(){
  const roots = new Set([process.cwd(), os.homedir(), "/storage/emulated/0"]);
  return [...roots].filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}
function resolveBrowsePath(input){
  const raw=String(input||"").trim();
  const candidate=path.resolve(raw || "/storage/emulated/0");
  const allowed=browseRoots().some(root => candidate===root || candidate.startsWith(root+path.sep));
  if(!allowed) throw new Error("Folder berada di luar area yang dapat dipilih.");
  return candidate;
}
app.get("/api/browse", (req,res) => {
  try {
    const dir=resolveBrowsePath(req.query.path);
    const parent=path.dirname(dir);
    const entries=fs.readdirSync(dir,{withFileTypes:true})
      .filter(e => e.isDirectory() && e.name!=="node_modules" && e.name!==".git")
      .sort((a,b)=>a.name.localeCompare(b.name))
      .map(e=>({name:e.name,path:path.join(dir,e.name),type:"directory"}));
    res.json({ok:true,path:dir,parent:parent===dir?null:parent,roots:browseRoots(),entries});
  } catch(e) { res.status(400).json({error:e.message}); }
});
app.post("/api/workspace", (req,res) => {
  try {
    const previous = PROJECT_ROOT;
    const workspace = setWorkspaceRoot(req.body?.path);
    res.json({ ok:true, path:workspace, previous });
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.get("/api/tree", (req,res) => { try { res.json(buildTree(PROJECT_ROOT)); } catch(e) { res.status(500).json({error:e.message}); } });
app.get("/api/file", (req,res) => {
  try { const f=safePath(req.query.path); if(!fs.statSync(f).isFile()) throw new Error("Not a file."); res.type("text/plain").send(fs.readFileSync(f,"utf8")); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.put("/api/file", (req,res) => {
  try { if(!req.body?.path || typeof req.body.content !== "string") throw new Error("Invalid payload."); const f=safePath(req.body.path); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,req.body.content,"utf8"); res.json({ok:true}); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post("/api/item", (req,res) => {
  try {
    if(!req.body?.path) throw new Error("Path is required.");
    const target=safePath(req.body.path);
    if(req.body.type === "folder") fs.mkdirSync(target,{recursive:false});
    else { fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,"",{flag:"wx"}); }
    res.json({ok:true});
  } catch(e){ res.status(400).json({error:e.message}); }
});
app.delete("/api/item", (req,res) => {
  try { const target=safePath(req.body?.path); if(target===PROJECT_ROOT) throw new Error("Cannot delete workspace root."); fs.rmSync(target,{recursive:true,force:false}); res.json({ok:true}); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post("/api/rename", (req,res) => {
  try { if(!req.body?.oldPath||!req.body?.newPath) throw new Error("Both paths are required."); const a=safePath(req.body.oldPath), b=safePath(req.body.newPath); fs.mkdirSync(path.dirname(b),{recursive:true}); fs.renameSync(a,b); res.json({ok:true}); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post("/api/move", (req,res) => {
  try {
    if(!req.body?.source || !req.body?.destination) throw new Error("Source dan destination wajib.");
    const a=safePath(req.body.source), b=safePath(req.body.destination);
    if(a===PROJECT_ROOT) throw new Error("Workspace root tidak bisa dipindahkan.");
    fs.mkdirSync(path.dirname(b),{recursive:true});
    fs.renameSync(a,b);
    res.json({ok:true});
  } catch(e){ res.status(400).json({error:e.message}); }
});
app.post("/api/copy", (req,res) => {
  try {
    if(!req.body?.source || !req.body?.destination) throw new Error("Source dan destination wajib.");
    const a=safePath(req.body.source), b=safePath(req.body.destination);
    fs.mkdirSync(path.dirname(b),{recursive:true});
    fs.cpSync(a,b,{recursive:true,errorOnExist:true});
    res.json({ok:true});
  } catch(e){ res.status(400).json({error:e.message}); }
});

app.post("/api/import", (req,res) => {
  try {
    const files=Array.isArray(req.body?.files)?req.body.files:[];
    if(!files.length) throw new Error("No files supplied.");
    let total=0,count=0;
    for(const item of files){
      if(!item || typeof item.path!=="string" || typeof item.data!=="string") continue;
      const rel=item.path.replace(/\\/g,"/").replace(/^\/+/,"");
      const parts=rel.split("/");
      if(parts.some(p=>!p || p==="." || p==="..")) continue;
      const target=safePath(rel);
      const buffer=Buffer.from(item.data,"base64");
      total += buffer.length;
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,buffer);
      count++;
    }
    res.json({ok:true,count,bytes:total});
  } catch(e){ res.status(400).json({error:e.message}); }
});

app.get("/api/info", (req,res) => res.json({platform:process.platform,arch:process.arch,node:process.version,workspace:PROJECT_ROOT,home:os.homedir()}));
function findPreviewEntry(dir, relative = "") {
  const preferred = [
    "index.html", "index.htm", "public/index.html", "src/index.html",
    "index.js", "main.js", "app.js", "src/main.js", "src/app.js",
    "main.ts", "src/main.ts", "main.jsx", "src/main.jsx",
    "main.tsx", "src/main.tsx", "style.css", "src/style.css"
  ];
  const files = new Map();
  function walk(d, rel) {
    let entries=[];
    try { entries=fs.readdirSync(d,{withFileTypes:true}); } catch { return; }
    for(const e of entries){
      if(e.name===".git"||e.name==="node_modules"||e.name==="android-wrapper") continue;
      const rp=path.join(rel,e.name).replaceAll("\\","/");
      if(e.isDirectory()) walk(path.join(d,e.name),rp);
      else files.set(rp,e.name.toLowerCase());
    }
  }
  walk(dir, relative);
  const rank = (rp, name) => {
    const n=name.toLowerCase();
    if(n==="index.html") return 0;
    if(n==="index.htm") return 1;
    if(n.endsWith("/index.html")) return 2;
    if(n.endsWith("/index.htm")) return 3;
    if(n==="index.js") return 10;
    if(n==="main.js") return 11;
    if(n==="app.js") return 12;
    if(/(^|\/)main\.(jsx|tsx|ts)$/.test(rp)) return 13;
    if(/(^|\/)app\.(jsx|tsx|ts)$/.test(rp)) return 14;
    if(n.endsWith(".html")) return 20;
    if(n.endsWith(".htm")) return 21;
    if(n.endsWith(".js")) return 30;
    if(n.endsWith(".jsx")) return 31;
    if(n.endsWith(".css")) return 40;
    return 99;
  };
  let best=null,bestRank=Infinity;
  for(const [rp,n] of files){ const r=rank(rp,n); if(r<bestRank){best=rp;bestRank=r;} }
  if(!best) return null;
  const ext=path.extname(best).toLowerCase();
  const type=[".html",".htm"].includes(ext)?"html":[".js",".jsx"].includes(ext)?"javascript":[".ts",".tsx"].includes(ext)?"typescript":ext===".css"?"css":"text";
  return {entry:best,type};
}
app.get("/api/live-entry", (req,res) => {
  try { res.json(findPreviewEntry(PROJECT_ROOT) || { entry:null, type:null }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});


/* ---------- Developer Hub: Connections / Agent / Copilot / MCP / Plugins ---------- */
function mceDir(){ return path.join(PROJECT_ROOT, ".mce"); }
function connectionsFile(){ return path.join(mceDir(), "connections.json"); }
function mcpFile(){ return path.join(mceDir(), "mcp.json"); }
function pluginsDir(){ return path.join(mceDir(), "plugins"); }
function ensureMce(){ fs.mkdirSync(pluginsDir(), { recursive: true }); }
ensureMce();

function readJson(file, fallback){ try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch { return fallback; } }
function writeJson(file, data){ fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file, JSON.stringify(data,null,2),"utf8"); }
function cleanUrl(value){ const u=new URL(String(value||"")); if(!["http:","https:"].includes(u.protocol)) throw new Error("URL harus http/https."); return u.toString().replace(/\/$/,""); }
function publicConnection(c){ return {id:c.id,name:c.name,baseUrl:c.baseUrl,model:c.model||""}; }
app.get("/api/connections", (req,res)=>res.json(readJson(connectionsFile(),[]).map(publicConnection)));
app.post("/api/connections", (req,res)=>{ try { const name=String(req.body?.name||"").trim(); const baseUrl=cleanUrl(req.body?.baseUrl); const model=String(req.body?.model||"").trim(); const apiKey=String(req.body?.apiKey||""); if(!name||!baseUrl) throw new Error("Nama dan Base URL wajib."); const all=readJson(connectionsFile(),[]); const item={id:crypto.randomUUID(),name,baseUrl,model,apiKey}; all.push(item); writeJson(connectionsFile(),all); res.json(publicConnection(item)); } catch(e){res.status(400).json({error:e.message});} });
app.delete("/api/connections/:id",(req,res)=>{const all=readJson(connectionsFile(),[]);writeJson(connectionsFile(),all.filter(x=>x.id!==req.params.id));res.json({ok:true});});
async function aiRequest(connectionId, system, user){ const all=readJson(connectionsFile(),[]); const c=all.find(x=>x.id===connectionId); if(!c) throw new Error("Connection belum dipilih."); const endpoint=c.baseUrl.endsWith("/chat/completions")?c.baseUrl:c.baseUrl+"/chat/completions"; const headers={"Content-Type":"application/json"}; if(c.apiKey) headers.Authorization=`Bearer ${c.apiKey}`; const r=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({model:c.model||undefined,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.2})}); const text=await r.text(); if(!r.ok) throw new Error(`AI ${r.status}: ${text.slice(0,500)}`); let d;try{d=JSON.parse(text)}catch{throw new Error("Response AI bukan JSON.");} return d?.choices?.[0]?.message?.content||d?.choices?.[0]?.text||JSON.stringify(d,null,2); }
app.post("/api/ai/agent",async(req,res)=>{try{const c=req.body?.context||{};const prompt=String(req.body?.prompt||"").trim()||"Analisis project ini.";const system="You are a coding agent inside Mobile Code. Give a concise actionable engineering analysis. Do not claim to have changed files. Identify risks, files involved, and exact next steps. Keep changes user-approved.";const user=`User request: ${prompt}\nCurrent file: ${c.path||"none"}\nCurrent file content:\n${String(c.content||"").slice(0,120000)}`;res.json({text:await aiRequest(req.body?.connectionId,system,user)});}catch(e){res.status(400).json({error:e.message});}});
app.post("/api/ai/copilot",async(req,res)=>{try{const c=req.body?.context||{};const prompt=String(req.body?.prompt||"").trim()||"Suggest an improvement.";const system="You are a coding copilot. Return a useful code suggestion or explanation based only on supplied context. Prefer a short answer and code block when appropriate.";const user=`Request: ${prompt}\nFile: ${c.path||"none"}\nCode:\n${String(c.content||"").slice(0,120000)}`;res.json({text:await aiRequest(req.body?.connectionId,system,user)});}catch(e){res.status(400).json({error:e.message});}});
function readMcp(){return readJson(mcpFile(),[]);}
app.get("/api/mcp",(req,res)=>res.json(readMcp().map(x=>({id:x.id,name:x.name,url:x.url}))));
app.post("/api/mcp",(req,res)=>{try{const name=String(req.body?.name||"").trim();const url=cleanUrl(req.body?.url);const token=String(req.body?.token||"");if(!name||!url)throw new Error("Nama dan URL wajib.");const all=readMcp();const item={id:crypto.randomUUID(),name,url,token};all.push(item);writeJson(mcpFile(),all);res.json({id:item.id,name:item.name,url:item.url});}catch(e){res.status(400).json({error:e.message});}});
app.delete("/api/mcp/:id",(req,res)=>{writeJson(mcpFile(),readMcp().filter(x=>x.id!==req.params.id));res.json({ok:true});});
app.post("/api/mcp/probe",async(req,res)=>{try{const url=cleanUrl(req.body?.url);const headers={Accept:"application/json, text/event-stream"};if(req.body?.token)headers.Authorization=`Bearer ${String(req.body.token)}`;let r=await fetch(url+"/tools",{headers});if(!r.ok){r=await fetch(url,{headers});}const text=await r.text();res.status(r.ok?200:r.status).json({ok:r.ok,status:r.status,contentType:r.headers.get("content-type"),body:text.slice(0,20000)});}catch(e){res.status(400).json({error:e.message});}});
function pluginIdSafe(id){
  const v=String(id||"");
  if(!/^[a-zA-Z0-9._-]+$/.test(v)) throw new Error("Invalid plugin id.");
  return v;
}
function pluginFiles(){
  let dirs=[];
  try{dirs=fs.readdirSync(pluginsDir(),{withFileTypes:true}).filter(x=>x.isDirectory());}catch{}
  return dirs.map(d=>{
    const id=d.name;
    const m=readJson(path.join(pluginsDir(),id,"plugin.json"),{});
    return {
      id,
      name:m.name||id,
      description:m.description||"",
      version:m.version||"1.0.0",
      publisher:m.publisher||"Local",
      enabled:!!m.enabled,
      entry:m.entry||"index.html",
      permissions:Array.isArray(m.permissions)?m.permissions:[],
      activationEvents:Array.isArray(m.activationEvents)?m.activationEvents:[],
      contributes:m.contributes||{}
    };
  });
}
const BUILTIN_PLUGINS = {
  "project-inspector": {
    name:"Project Inspector", publisher:"Mobile Code",
    description:"Project statistics and structure commands.", version:"1.0.0",
    permissions:["workspace.read"],
    contributes:{commands:[{command:"projectInspector.stats",title:"Project: Show Statistics"}]}
  },
  "html-preview-tools": {
    name:"HTML Preview Tools", publisher:"Mobile Code",
    description:"Preview helpers for HTML projects.", version:"1.0.0",
    permissions:["workspace.read","preview.read"],
    contributes:{commands:[{command:"htmlPreview.refresh",title:"Preview: Refresh Live Generator"}]}
  },
  "code-notes": {
    name:"Code Notes", publisher:"Mobile Code",
    description:"Developer notes stored inside the workspace.", version:"1.0.0",
    permissions:["workspace.read","workspace.write"],
    contributes:{commands:[{command:"codeNotes.add",title:"Notes: Add Note"}]}
  }
};
function builtinPluginFiles(id){
  const commonHead=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`;
  const scripts={
    "project-inspector":`<script>parent.postMessage({type:'mce:plugin',action:'ready',pluginId:'project-inspector'},'*');</script>`,
    "html-preview-tools":`<script>parent.postMessage({type:'mce:plugin',action:'ready',pluginId:'html-preview-tools'},'*');</script>`,
    "code-notes":`<script>parent.postMessage({type:'mce:plugin',action:'ready',pluginId:'code-notes'},'*');</script>`
  };
  return `<!doctype html><html><head>${commonHead}</head><body>${scripts[id]||''}</body></html>`;
}
function pluginManifest(id){
  const f=path.join(pluginsDir(),id,"plugin.json");
  const m=readJson(f,null);
  if(!m) throw new Error("Plugin tidak ditemukan.");
  return m;
}
app.get("/api/plugins/catalog",(req,res)=>res.json(Object.entries(BUILTIN_PLUGINS).map(([id,m])=>({id,...m,installed:pluginFiles().some(p=>p.id===id)}))));
app.get("/api/plugins",(req,res)=>res.json(pluginFiles()));
app.get("/api/plugins/:id/manifest",(req,res)=>{try{const id=pluginIdSafe(req.params.id);res.json(pluginManifest(id));}catch(e){res.status(404).json({error:e.message});}});
app.get("/api/plugins/:id/frame",(req,res)=>{
  try{
    const id=pluginIdSafe(req.params.id); const dir=path.join(pluginsDir(),id); const m=pluginManifest(id);
    const file=path.resolve(dir,String(m.entry||"index.html"));
    if(file!==path.join(dir,String(m.entry||"index.html")) || !fs.existsSync(file)) throw new Error("Plugin entry tidak ditemukan.");
    if(!file.startsWith(dir+path.sep)) throw new Error("Invalid plugin entry.");
    res.sendFile(file);
  }catch(e){res.status(404).send(e.message);}
});
app.post("/api/plugins/install/:id",(req,res)=>{
  try{
    const id=pluginIdSafe(req.params.id); const meta=BUILTIN_PLUGINS[id];
    if(!meta) throw new Error("Plugin catalog tidak ditemukan.");
    const dir=path.join(pluginsDir(),id); fs.mkdirSync(dir,{recursive:true});
    const manifest={
      id,name:meta.name,description:meta.description,version:meta.version,publisher:meta.publisher,
      enabled:true,entry:"index.html",permissions:meta.permissions||[],activationEvents:["onStartup"],contributes:meta.contributes||{}
    };
    const pluginJs={
      "project-inspector":`window.addEventListener('message',e=>{if(e.data?.type==='mce:host'&&e.data.action==='activate'){parent.postMessage({type:'mce:plugin',action:'register',pluginId:'project-inspector',commands:[{command:'projectInspector.stats',title:'Project: Show Statistics'}]},'*')}});`,
      "html-preview-tools":`window.addEventListener('message',e=>{if(e.data?.type==='mce:host'&&e.data.action==='activate'){parent.postMessage({type:'mce:plugin',action:'register',pluginId:'html-preview-tools',commands:[{command:'htmlPreview.refresh',title:'Preview: Refresh Live Generator'}]},'*')}});`,
      "code-notes":`window.addEventListener('message',e=>{if(e.data?.type==='mce:host'&&e.data.action==='activate'){parent.postMessage({type:'mce:plugin',action:'register',pluginId:'code-notes',commands:[{command:'codeNotes.add',title:'Notes: Add Note'}]},'*')}});`
    };
    const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${meta.name}</title></head><body><h3>${meta.name}</h3><p>${meta.description}</p><script src="plugin.js"></script><script>parent.postMessage({type:'mce:plugin',action:'ready',pluginId:${JSON.stringify(id)}},'*');</script></body></html>`;
    fs.writeFileSync(path.join(dir,"plugin.json"),JSON.stringify(manifest,null,2));
    fs.writeFileSync(path.join(dir,"plugin.js"),pluginJs[id]||"");
    fs.writeFileSync(path.join(dir,"index.html"),html);
    res.json({ok:true,id});
  }catch(e){res.status(400).json({error:e.message});}
});
app.delete("/api/plugins/:id",(req,res)=>{try{const id=pluginIdSafe(req.params.id);const dir=path.join(pluginsDir(),id);if(!fs.existsSync(dir))throw new Error("Plugin tidak ditemukan.");fs.rmSync(dir,{recursive:true,force:false});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.post("/api/plugins/:id/toggle",(req,res)=>{try{const id=pluginIdSafe(req.params.id);const file=path.join(pluginsDir(),id,"plugin.json");if(!fs.existsSync(file))throw new Error("Plugin tidak ditemukan.");const m=readJson(file,{});m.enabled=!m.enabled;writeJson(file,m);res.json({ok:true,enabled:m.enabled});}catch(e){res.status(400).json({error:e.message});}});
app.post("/api/plugins/:id/command",async(req,res)=>{
  try{
    const id=pluginIdSafe(req.params.id), m=pluginManifest(id);
    if(!m.enabled) throw new Error("Plugin disabled.");
    const command=String(req.body?.command||"");
    if(!(m.contributes?.commands||[]).some(x=>x.command===command)) throw new Error("Command tidak dikontribusikan plugin.");
    if(command==="projectInspector.stats"){
      const files=[]; (function walk(d,rel=""){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name===".git"||e.name==="node_modules")continue;const rp=path.join(rel,e.name).replaceAll("\\","/");if(e.isDirectory())walk(path.join(d,e.name),rp);else files.push(rp)}})(PROJECT_ROOT);
      const byExt={}; for(const f of files){const ext=path.extname(f).toLowerCase()||"[no extension]";byExt[ext]=(byExt[ext]||0)+1;}
      return res.json({ok:true,message:`${files.length} file(s) in workspace`,files,byExt});
    }
    if(command==="htmlPreview.refresh") return res.json({ok:true,action:"preview.refresh"});
    if(command==="codeNotes.add"){
      const note=String(req.body?.note||"").trim(); if(!note) throw new Error("Catatan kosong.");
      if(!(m.permissions||[]).includes("workspace.write")) throw new Error("Plugin tidak punya permission workspace.write.");
      const file=path.join(mceDir(),"notes.json"); const notes=readJson(file,[]); notes.push({id:crypto.randomUUID(),note,createdAt:new Date().toISOString()}); writeJson(file,notes); return res.json({ok:true});
    }
    throw new Error("Command belum diimplementasikan.");
  }catch(e){res.status(400).json({error:e.message});}
});

app.use("/workspace", (req,res,next) => express.static(PROJECT_ROOT)(req,res,next));
app.use((req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

// Standalone Mobile Code terminal.
// IMPORTANT: this is NOT a Termux/Linux shell. Commands are implemented by
// Mobile Code itself and operate only inside the workspace.
const wss = new WebSocketServer({ noServer:true });
server.on("upgrade", (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if(url.pathname !== "/terminal") { socket.destroy(); return; }
    wss.handleUpgrade(request,socket,head,ws => wss.emit("connection",ws,request));
  } catch { socket.destroy(); }
});

function cleanArgs(line){
  const out=[]; const re=/(?:"([^"]*)"|'([^']*)'|(\\.)|([^\\s]+))/g; let m;
  while((m=re.exec(line))) out.push(m[1] ?? m[2] ?? (m[3] ? m[3][1] : m[4]));
  return out;
}
function resolveCwd(cwd, target="."){
  const base=path.resolve(cwd);
  const result=path.resolve(base,target || ".");
  if(result!==PROJECT_ROOT && !result.startsWith(PROJECT_ROOT+path.sep)) throw new Error("Access denied: workspace only.");
  return result;
}
function displayPath(dir){
  const rel=path.relative(PROJECT_ROOT,dir).replaceAll("\\","/");
  return rel ? `~/workspace/${rel}` : "~/workspace";
}
function listDir(dir, detailed=false){
  const entries=fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));
  return entries.map(e=>{
    const mark=e.isDirectory()?"/":"";
    if(!detailed) return e.name+mark;
    const st=fs.statSync(path.join(dir,e.name));
    return `${e.isDirectory()?"d":"-"} ${String(st.size).padStart(10)} ${new Date(st.mtimeMs).toISOString().slice(0,16).replace("T"," ")} ${e.name}${mark}`;
  }).join("\n");
}
function walkFiles(dir, out=[], prefix=""){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name===".git"||e.name==="node_modules") continue;
    const rel=path.join(prefix,e.name).replaceAll("\\","/");
    if(e.isDirectory()) walkFiles(path.join(dir,e.name),out,rel); else out.push(rel);
  }
  return out;
}
function standaloneCommand(line,state){
  const args=cleanArgs(line.trim()); const cmd=args.shift() || "";
  const arg=args.join(" ");
  const out=x=>({out:String(x??"")});
  try{
    switch(cmd){
      case "": return out("");
      case "help": return out([
        "Mobile Code Terminal (standalone)",
        "Commands:",
        "  help                 Show this help",
        "  pwd                  Show current workspace directory",
        "  ls [-l] [path]       List files/folders",
        "  cd [path]            Change directory",
        "  tree [path]          Show project tree",
        "  cat <file>           Read a text file",
        "  head <file>          First 20 lines",
        "  tail <file>          Last 20 lines",
        "  touch <file>         Create an empty file",
        "  mkdir <dir>          Create a folder",
        "  rm <path>             Delete file/folder",
        "  mv <old> <new>       Rename/move",
        "  cp <src> <dest>      Copy file/folder",
        "  echo <text>          Print text",
        "  grep <text> <file>   Search text",
        "  find [text]          Find project paths",
        "  wc <file>            Count lines/words/bytes",
        "  clear                Clear terminal",
        "  whoami               Mobile Code",
        "  uname                Mobile Code Runtime",
        "  date                 Current date/time",
        "  exit                 Close terminal session",
        "",
        "This terminal is isolated to the Mobile Code workspace."
      ].join("\n"));
      case "pwd": return out(displayPath(state.cwd));
      case "whoami": return out("mobile-code");
      case "uname": return out("Mobile-Code-Runtime standalone");
      case "date": return out(new Date().toString());
      case "echo": return out(arg);
      case "clear": return {clear:true};
      case "cd": { const target=args[0] || PROJECT_ROOT; state.cwd=resolveCwd(state.cwd,target); return out(""); }
      case "ls": { let detailed=false; if(args[0]==="-l"||args[0]==="--long"){detailed=true;args.shift();} const d=resolveCwd(state.cwd,args[0]||"."); if(!fs.statSync(d).isDirectory()) throw new Error("Not a directory."); return out(listDir(d,detailed)); }
      case "tree": { const root=resolveCwd(state.cwd,args[0]||"."); const lines=[]; function rec(d,prefix=""){const es=fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.name!==".git"&&e.name!=="node_modules").sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name)); es.forEach((e,i)=>{const last=i===es.length-1;lines.push(prefix+(last?"└── ":"├── ")+e.name+(e.isDirectory()?"/":""));if(e.isDirectory())rec(path.join(d,e.name),prefix+(last?"    ":"│   "));});} lines.push(path.basename(root)||"workspace"); rec(root); return out(lines.join("\n")); }
      case "cat": case "head": case "tail": { if(!args[0]) throw new Error("File required."); const f=resolveCwd(state.cwd,args[0]); if(!fs.statSync(f).isFile()) throw new Error("Not a file."); const text=fs.readFileSync(f,"utf8"); if(cmd==="cat") return out(text); const lines=text.split(/\\r?\\n/); return out((cmd==="head"?lines.slice(0,20):lines.slice(-20)).join("\n")); }
      case "touch": { if(!args[0]) throw new Error("File required."); const f=resolveCwd(state.cwd,args[0]); fs.mkdirSync(path.dirname(f),{recursive:true}); if(!fs.existsSync(f))fs.writeFileSync(f,""); else fs.utimesSync(f,new Date(),new Date()); return out(""); }
      case "mkdir": { if(!args[0]) throw new Error("Directory required."); fs.mkdirSync(resolveCwd(state.cwd,args[0]),{recursive:true}); return out(""); }
      case "rm": { if(!args[0]) throw new Error("Path required."); const f=resolveCwd(state.cwd,args[0]); if(f===PROJECT_ROOT)throw new Error("Cannot remove workspace root."); fs.rmSync(f,{recursive:true,force:false}); return out(""); }
      case "mv": { if(args.length<2)throw new Error("Usage: mv old new"); const a=resolveCwd(state.cwd,args[0]),b=resolveCwd(state.cwd,args[1]); fs.mkdirSync(path.dirname(b),{recursive:true}); fs.renameSync(a,b); return out(""); }
      case "cp": { if(args.length<2)throw new Error("Usage: cp source destination"); const a=resolveCwd(state.cwd,args[0]),b=resolveCwd(state.cwd,args[1]); const st=fs.statSync(a); if(st.isDirectory())fs.cpSync(a,b,{recursive:true});else{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b)} return out(""); }
      case "grep": { if(args.length<2)throw new Error("Usage: grep text file"); const f=resolveCwd(state.cwd,args.pop()); const needle=args.join(" "); const lines=fs.readFileSync(f,"utf8").split(/\\r?\\n/); return out(lines.map((x,i)=>x.toLowerCase().includes(needle.toLowerCase())?`${i+1}:${x}`:null).filter(Boolean).join("\n")); }
      case "find": { const q=args.join(" ").toLowerCase(); const files=walkFiles(PROJECT_ROOT); return out(files.filter(x=>!q||x.toLowerCase().includes(q)).join("\n")); }
      case "wc": { if(!args[0])throw new Error("File required."); const text=fs.readFileSync(resolveCwd(state.cwd,args[0]),"utf8"); const lines=text?text.split(/\\r?\\n/).length:0, words=(text.match(/\\S+/g)||[]).length, bytes=Buffer.byteLength(text); return out(`${lines} ${words} ${bytes}`); }
      case "exit": return {exit:true};
      default: return out(`${cmd}: command not found\nUse 'help' to see commands available in Mobile Code.`);
    }
  }catch(e){ return {error:e.message}; }
}

wss.on("connection", ws => {
  const state={cwd:PROJECT_ROOT};
  const send=(type,data="")=>{if(ws.readyState===1)ws.send(JSON.stringify({type,data}));};
  send("status","connected");
  send("output","Mobile Code Terminal — standalone workspace runtime\r\nType 'help' for commands.\r\n");
  send("prompt",displayPath(state.cwd));
  ws.on("message",raw=>{
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type!=="command"||typeof msg.data!=="string")return;
      const result=standaloneCommand(msg.data,state);
      if(result.clear){send("clear");send("prompt",displayPath(state.cwd));return;}
      if(result.out)send("output",result.out+"\r\n");
      if(result.error)send("output",`Error: ${result.error}\r\n`);
      send("prompt",displayPath(state.cwd));
      if(result.exit){send("status","closed");ws.close();}
    }catch(e){send("output",`Error: ${e.message}\r\n`);}
  });
});

function startServer(port) {
  server.once("error", err => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} dipakai. Mencoba port ${port + 1}...`);
      setTimeout(() => startServer(port + 1), 50);
    } else {
      console.error(err);
      process.exitCode = 1;
    }
  });
  server.listen(port, "127.0.0.1", () => console.log(`Mobile Code v6 → http://127.0.0.1:${port}`));
}
// Vercel runs Express as a serverless function and must not call server.listen().
// Keep the HTTP/WebSocket server for local Termux, but export the Express app for Vercel.
if (process.env.VERCEL) {
  module.exports = app;
} else {
  startServer(PORT);
}
