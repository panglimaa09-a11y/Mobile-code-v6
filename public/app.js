let editor=null,currentPath=null,tabs=new Map(); Object.defineProperty(window,"currentPath",{get:()=>currentPath});
const $=id=>document.getElementById(id);
const languageFor=p=>({js:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",json:"json",html:"html",css:"css",scss:"scss",md:"markdown",py:"python",sh:"shell",bash:"shell",sql:"sql",xml:"xml",yaml:"yaml",yml:"yaml"})[(p.split(".").pop()||"").toLowerCase()]||"plaintext";
function setDirty(v){$("dirty").style.display=v?"block":"none"}
function showToast(message){let t=$("toast");if(!t){t=document.createElement("div");t.id="toast";document.body.appendChild(t)}t.textContent=message;t.classList.add("show");clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
function setLiveStatus(text,color){const e=$("liveStatus");e.textContent=text;if(color)e.style.color=color}

/* ---------- EDITOR ---------- */
function initFallbackEditor(){const host=$("editor");host.innerHTML="";const ta=document.createElement("textarea");ta.id="fallbackEditor";ta.spellcheck=false;ta.autocapitalize="off";ta.autocomplete="off";ta.wrap="off";ta.value="// Pilih file dari Project Explorer\n";host.appendChild(ta);editor={getValue:()=>ta.value,setValue:v=>{ta.value=v},getModel:()=>null,onDidChangeModelContent:cb=>ta.addEventListener("input",cb)};ta.addEventListener("input",()=>{if(currentPath)setDirty(true)})}
function initEditor(){if(typeof require!=="function"){initFallbackEditor();return}try{require.config({paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs"}});require(["vs/editor/editor.main"],()=>{if(typeof monaco==="undefined"){initFallbackEditor();return}editor=monaco.editor.create($("editor"),{value:"// Pilih file dari Project Explorer\n",language:"plaintext",theme:"vs-dark",automaticLayout:true,minimap:{enabled:false},fontSize:14,wordWrap:"on",padding:{top:12},scrollBeyondLastLine:false});editor.onDidChangeModelContent(()=>{if(currentPath)setDirty(true)})},()=>initFallbackEditor());setTimeout(()=>{if(!editor)initFallbackEditor()},5000)}catch{initFallbackEditor()}}
initEditor();

/* ---------- PROJECT EXPLORER ---------- */
async function loadTree(){const r=await fetch("/api/tree");if(!r.ok)throw new Error("Tree gagal dimuat");renderTree(await r.json())}
function renderTree(nodes){
  const root=$("tree"); root.innerHTML="";
  function walk(ns,p){
    for(const n of ns){
      const row=document.createElement("div");
      row.className="node "+n.type;
      row.dataset.path=n.path; row.dataset.type=n.type;
      const icon=n.type==="directory"?"📁":"📄";
      row.innerHTML=`<span class="node-icon">${icon}</span><span class="node-name"></span><span class="node-more">⋮</span>`;
      row.querySelector(".node-name").textContent=n.name;
      p.appendChild(row);
      let child=null;
      if(n.type==="directory"){
        child=document.createElement("div"); child.className="children";
        p.appendChild(child); walk(n.children||[],child);
        row.onclick=e=>{ if(e.target.closest(".node-more"))return; child.classList.toggle("collapsed"); row.classList.toggle("expanded",!child.classList.contains("collapsed")); };
      } else {
        row.onclick=e=>{if(e.target.closest(".node-more"))return;openFile(n.path)};
      }
      let timer=null, moved=false;
      row.addEventListener("touchstart",()=>{moved=false;timer=setTimeout(()=>{timer=null;showNodeMenu(n,row)},520)},{passive:true});
      row.addEventListener("touchmove",()=>{moved=true;clearTimeout(timer);timer=null},{passive:true});
      row.addEventListener("touchend",e=>{if(timer){clearTimeout(timer);timer=null}},{passive:true});
      row.addEventListener("contextmenu",e=>{e.preventDefault();showNodeMenu(n,row)});
    }
  }
  walk(nodes,root);
}
function closeActionMenus(){document.querySelectorAll(".action-menu.node-menu").forEach(x=>x.remove())}
function showNodeMenu(n,anchor){
  closeActionMenus();
  const menu=document.createElement("div"); menu.className="action-menu node-menu";
  const actions=n.type==="directory"
    ? [["open","📂 Buka"],["new-file","📄 File baru"],["new-folder","📁 Folder baru"],["rename","✏️ Rename"],["copy","📋 Copy"],["move","✂️ Move"],["delete","🗑️ Delete"]]
    : [["open","📄 Buka"],["rename","✏️ Rename"],["copy","📋 Copy"],["move","✂️ Move"],["delete","🗑️ Delete"]];
  menu.innerHTML=actions.map(([a,t])=>`<button data-a="${a}">${t}</button>`).join("");
  document.body.appendChild(menu);
  const r=anchor.getBoundingClientRect();
  menu.style.left=Math.min(Math.max(8,r.left),Math.max(8,innerWidth-220))+"px";
  menu.style.top=Math.min(r.bottom+4,Math.max(8,innerHeight-menu.offsetHeight-8))+"px";
  menu.querySelectorAll("button").forEach(b=>b.onclick=async()=>{
    const a=b.dataset.a; menu.remove();
    try{
      if(a==="open"){ if(n.type==="file") await openFile(n.path); else anchor.classList.toggle("expanded"); return; }
      if(a==="new-file"||a==="new-folder"){ const name=prompt(a==="new-file"?"Nama file baru":"Nama folder baru"); if(!name)return; await apiItem((n.path.replace(/\\?$/,"")+"/"+name).replace(/^\//,""),a==="new-file"?"file":"folder"); return; }
      if(a==="rename"){const name=prompt("Nama/path baru",n.name);if(!name)return;await apiRename(n.path,n.type==="directory"?parentPath(n.path)+"/"+name:name.includes("/")?name:parentPath(n.path)+"/"+name);return;}
      if(a==="copy"||a==="move"){const dest=prompt((a==="copy"?"Copy ke":"Move ke")+" (path tujuan)",n.path);if(!dest)return;await apiMoveCopy(a,n.path,dest);return;}
      if(a==="delete"){if(!confirm("Hapus "+n.name+"?"))return;await apiDelete(n.path);return;}
    }catch(e){showToast(e.message||"Operasi gagal")}
  });
  setTimeout(()=>document.addEventListener("click",()=>menu.remove(),{once:true}),0);
}
function parentPath(p){const x=String(p).replace(/\\/g,"/");return x.includes("/")?x.slice(0,x.lastIndexOf("/")):""}
async function apiItem(path,type){const r=await fetch("/api/item",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path,type})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Gagal membuat item");await loadTree();if(type==="file")await openFile(path)}
async function apiRename(oldPath,newPath){const r=await fetch("/api/rename",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPath,newPath})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Rename gagal");if(currentPath===oldPath)currentPath=newPath;await loadTree();showToast("Berhasil rename")}
async function apiMoveCopy(action,source,destination){
  const endpoint=action==="copy"?"/api/copy":"/api/move";
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source,destination})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Operasi gagal");
  if(action==="move"&&currentPath===source)currentPath=destination;
  await loadTree();showToast(action==="copy"?"Berhasil copy":"Berhasil move");
}
async function apiDelete(p){const r=await fetch("/api/item",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:p})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Delete gagal");if(currentPath===p){currentPath=null;$("fileName").textContent="No file";editor?.setValue("")}tabs.delete(p);renderTabs();await loadTree();showToast("Berhasil dihapus")}
function renderTabs(){const t=$("tabs");t.innerHTML="";for(const [p] of tabs){const tab=document.createElement("div");tab.className="tab"+(p===currentPath?" active":"");const s=document.createElement("span");s.textContent=p.split("/").pop();const c=document.createElement("button");c.textContent="×";tab.append(s,c);s.onclick=()=>openFile(p);c.onclick=e=>{e.stopPropagation();tabs.delete(p);if(p===currentPath){currentPath=tabs.keys().next().value||null;if(currentPath)openFile(currentPath);else{$("fileName").textContent="No file";editor?.setValue("")}}renderTabs()};t.appendChild(tab)}}
async function openFile(p,opts={}){const r=await fetch("/api/file?path="+encodeURIComponent(p));if(!r.ok)return showToast("Tidak bisa membuka file.");const c=await r.text();currentPath=p;window.currentPath=p;tabs.set(p,true);if(editor){editor.setValue(c);if(typeof monaco!=="undefined"&&editor.getModel?.())monaco.editor.setModelLanguage(editor.getModel(),languageFor(p))}$('fileName').textContent=p;setDirty(false);renderTabs();$("sidebar").classList.remove("open");if(opts.runPreview!==false&&/\.html?$/i.test(p))runLive()}
async function createItem(type){const p=prompt(type==="file"?"Nama/path file baru":"Nama/path folder baru",type==="file"?"index.html":"src");if(!p)return;try{await apiItem(p,type)}catch(e){showToast(e.message)}}
$("saveBtn").onclick=async()=>{if(!currentPath||!editor)return showToast("Pilih file terlebih dahulu.");const r=await fetch("/api/file",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:currentPath,content:editor.getValue()})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||"Gagal menyimpan");setDirty(false);if(/\.html?$/i.test(currentPath))runLive();showToast("Tersimpan")};
$("newFile").onclick=()=>openNewMenu();$("refresh").onclick=()=>loadTree().catch(e=>showToast(e.message));$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");$("filesBtn").onclick=()=>$("sidebar").classList.toggle("open");

/* ---------- WORKSPACE ---------- */
async function loadWorkspaceInfo(){
  try{const r=await fetch("/api/workspace");const d=await r.json();if(r.ok)$("workspaceLabel").textContent=d.path;return d}catch{}
}
let workspacePickerState={path:"",parent:null,entries:[],roots:[]};
function closeWorkspacePicker(){document.getElementById("workspacePicker")?.remove()}
function escHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function browseWorkspace(pathValue){
  const r=await fetch("/api/browse?path="+encodeURIComponent(pathValue||""));
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Folder tidak bisa dibuka");
  workspacePickerState=d;
  const pathEl=document.querySelector("#workspacePicker .wp-path");
  const list=document.querySelector("#workspacePicker .wp-list");
  const up=document.querySelector("#workspacePicker [data-wp=up]");
  if(pathEl)pathEl.textContent=d.path;
  if(up)up.disabled=!d.parent;
  if(list){
    list.innerHTML=d.entries.length?d.entries.map(e=>`<button class="wp-row" data-path="${escHtml(e.path)}"><span>📁</span><span>${escHtml(e.name)}</span><span>›</span></button>`).join(""):"<div class=wp-empty>Folder ini tidak memiliki subfolder.</div>";
    list.querySelectorAll(".wp-row").forEach(b=>b.onclick=()=>browseWorkspace(b.dataset.path).catch(e=>showToast(e.message)));
  }
}
function openWorkspacePicker(){
  closeWorkspacePicker();
  const modal=document.createElement("div");modal.id="workspacePicker";modal.className="workspace-picker";
  modal.innerHTML=`<div class="wp-card"><div class="wp-head"><div><b>Ganti Workspace</b><small>Pilih folder project yang akan digunakan Mobile Code</small></div><button data-wp=close>×</button></div><div class="wp-toolbar"><button data-wp=home>🏠 Home</button><button data-wp=storage>📱 Internal Storage</button><button data-wp=up>⬆️ Naik</button></div><div class="wp-path"></div><div class="wp-list"></div><div class="wp-foot"><button data-wp=cancel>Cancel</button><button class="wp-open" data-wp=open>Buka Workspace</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-wp=close]').onclick=closeWorkspacePicker;
  modal.querySelector('[data-wp=cancel]').onclick=closeWorkspacePicker;
  modal.querySelector('[data-wp=home]').onclick=()=>browseWorkspace("/data/data/com.termux/files/home").catch(e=>showToast(e.message));
  modal.querySelector('[data-wp=storage]').onclick=()=>browseWorkspace("/storage/emulated/0").catch(e=>showToast(e.message));
  modal.querySelector('[data-wp=up]').onclick=()=>browseWorkspace(workspacePickerState.parent).catch(e=>showToast(e.message));
  modal.querySelector('[data-wp=open]').onclick=async()=>{
    const p=workspacePickerState.path;if(!p)return;
    try{
      const r=await fetch("/api/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:p})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Gagal mengganti workspace");
      tabs.clear();currentPath=null;$("fileName").textContent="No file";editor?.setValue("");
      await loadWorkspaceInfo();await loadTree();await runLive();closeWorkspacePicker();
      showToast("Workspace aktif: "+d.path);
    }catch(e){showToast(e.message)}
  };
  browseWorkspace("").catch(e=>showToast(e.message));
}
async function changeWorkspace(){openWorkspacePicker()}
$("workspaceBtn").onclick=changeWorkspace;
loadWorkspaceInfo();

/* ---------- IMPORT / DROP ---------- */
$("importFolder").onclick=chooseProjectDirectory;
$("filePicker").onchange=e=>{importFiles(e.target.files);e.target.value=""};$("folderPicker").onchange=e=>{importFiles(e.target.files);e.target.value=""};
async function importFiles(files){const list=Array.from(files||[]).filter(f=>f&&f.name);if(!list.length)return;setLiveStatus("syncing...","#fbbf24");try{const payload=[];for(const f of list){const rel=(f.webkitRelativePath||f.name).replace(/\\/g,"/").replace(/^\/+/,"");if(!rel||rel.split("/").some(x=>!x||x==='.'||x==='..'))continue;const b=new Uint8Array(await f.arrayBuffer());let s="";for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,i+0x8000));payload.push({path:rel,data:btoa(s)})}if(!payload.length)throw new Error("Tidak ada file valid.");const r=await fetch("/api/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({files:payload})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Import gagal");await loadTree();const meta=await fetch("/api/live-entry").then(x=>x.ok?x.json():({entry:null,type:null}));if(meta.entry&&["html","javascript","css"].includes(meta.type)){await openFile(meta.entry,{runPreview:false});await runLive();setLiveStatus("synced · "+meta.entry,"#4ade80")}else{await runLive();setLiveStatus("synced · "+(d.count||payload.length)+" files","#4ade80");const first=payload.find(x=>/\.(html?|css|js|jsx|ts|tsx|json|md|txt)$/i.test(x.path));if(first)await openFile(first,{runPreview:false})}showToast("Project tersinkron: "+(d.count||payload.length)+" file")}catch(e){setLiveStatus("import error","#f87171");showToast(e.message||"Import gagal")}}
async function importDirectoryHandle(handle,prefix=""){const out=[];for await(const [name,entry] of handle.entries()){if(name==="node_modules"||name===".git")continue;const rel=prefix+name;if(entry.kind==="file"){const file=await entry.getFile();try{Object.defineProperty(file,"webkitRelativePath",{value:rel,configurable:true})}catch{}out.push(file)}else out.push(...await importDirectoryHandle(entry,rel+"/"))}return out}
async function chooseProjectDirectory(){if(!window.showDirectoryPicker){$("folderPicker").click();return}try{const h=await window.showDirectoryPicker({mode:"read"});await importFiles(await importDirectoryHandle(h))}catch(e){if(e?.name!=="AbortError")showToast("Folder gagal dibuka: "+(e?.message||e))}}
const treeEl=$("tree");treeEl.addEventListener("dragover",e=>{e.preventDefault();treeEl.classList.add("drop-target")});treeEl.addEventListener("dragleave",()=>treeEl.classList.remove("drop-target"));treeEl.addEventListener("drop",e=>{e.preventDefault();e.stopPropagation();treeEl.classList.remove("drop-target");if(e.dataTransfer?.files?.length)importFiles(e.dataTransfer.files)});
let dragDepth=0;addEventListener("dragenter",e=>{e.preventDefault();dragDepth++;document.body.classList.add("dragging")});addEventListener("dragover",e=>e.preventDefault());addEventListener("dragleave",e=>{e.preventDefault();if(--dragDepth<=0){dragDepth=0;document.body.classList.remove("dragging")}});addEventListener("drop",e=>{e.preventDefault();dragDepth=0;document.body.classList.remove("dragging");if(e.dataTransfer?.files?.length)importFiles(e.dataTransfer.files)});

/* ---------- NEW MENU ---------- */
function openNewMenu(){const menu=document.createElement("div");menu.className="action-menu";menu.innerHTML='<button data-a="file">📄 New File</button><button data-a="folder">📁 New Folder</button><button data-a="import-file">📥 Import File</button><button data-a="import-folder">📂 Import Project / Folder</button>';document.body.appendChild(menu);menu.querySelector('[data-a="file"]').onclick=()=>{menu.remove();createItem("file")};menu.querySelector('[data-a="folder"]').onclick=()=>{menu.remove();createItem("folder")};menu.querySelector('[data-a="import-file"]').onclick=()=>{menu.remove();$("filePicker").click()};menu.querySelector('[data-a="import-folder"]').onclick=()=>{menu.remove();chooseProjectDirectory()};setTimeout(()=>document.addEventListener("click",()=>menu.remove(),{once:true}),0)}

/* ---------- LIVE GENERATOR ---------- */
function workspaceBaseFor(filePath){const clean=String(filePath||"").replace(/\\/g,"/").replace(/^\/+|\/+$/g,"");const dir=clean.includes("/")?clean.slice(0,clean.lastIndexOf("/")+1):"";return location.origin+"/workspace/"+dir}
function addBase(html,filePath=""){const b='<base href="'+workspaceBaseFor(filePath)+'">';return /<head[^>]*>/i.test(html)?html.replace(/<head([^>]*)>/i,'<head$1>'+b):'<!doctype html><html><head>'+b+'</head><body>'+html+'</body></html>'}
function jsPreview(code,filePath){const safe=code.replace(/<\//g,"<\\/");return `<!doctype html><html><head><meta charset="utf-8"><base href="${workspaceBaseFor(filePath)}"><style>body{font-family:system-ui;margin:0;padding:20px}#mce-console{white-space:pre-wrap;background:#111;color:#eee;padding:12px;border-radius:8px;margin-top:16px;font-family:monospace}</style></head><body><div id="app"></div><div id="mce-console"></div><script>const __log=[];const __print=(...a)=>{__log.push(a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '));document.getElementById('mce-console').textContent=__log.join('\\n')};console.log=__print;try{${safe}}catch(e){__print('RuntimeError:',e.message)}</script></body></html>`}
async function getLiveSource(){const meta=await fetch('/api/live-entry').then(r=>r.ok?r.json():({entry:null,type:null}));if(!meta.entry)return{html:'<!doctype html><html><body style="font-family:system-ui;padding:24px"><h2>Live Generator</h2><p>Belum ada entry file. Import project atau buat index.html.</p></body></html>',path:'',type:'none'};const r=await fetch('/api/file?path='+encodeURIComponent(meta.entry));if(!r.ok)throw new Error('Entry tidak dapat dibaca.');const content=await r.text();if(meta.type==='html')return{html:content,path:meta.entry,type:'html'};if(meta.type==='javascript')return{html:jsPreview(content,meta.entry),path:meta.entry,type:'javascript'};if(meta.type==='css')return{html:`<!doctype html><html><head><base href="${workspaceBaseFor(meta.entry)}"><style>${content}</style></head><body><h2>CSS Preview</h2><p>Loaded: ${meta.entry}</p></body></html>`,path:meta.entry,type:'css'};if(meta.type==='typescript')return{html:`<!doctype html><html><body style="font-family:system-ui;padding:24px"><h2>TypeScript entry</h2><p>${meta.entry}</p><p>TypeScript perlu transpile/build sebelum dijalankan browser.</p></body></html>`,path:meta.entry,type:'typescript'};return{html:addBase(content,meta.entry),path:meta.entry,type:'text'}}
async function runLive(){const st=$("liveStatus");st.textContent="scanning...";try{const src=await getLiveSource();$("liveFrame").srcdoc=src.html;st.textContent=src.type==='none'?"waiting":"preview · "+src.path}catch(e){st.textContent="error";showToast(e.message||"Preview gagal")}}
$("liveRun").onclick=runLive;$("liveRefresh").onclick=runLive;$("previewBtn").onclick=runLive;$("liveBtn").onclick=()=>{$("livePanel").scrollIntoView({behavior:"smooth"});setTimeout(runLive,200)};$("liveNew").onclick=()=>createItem("file");

/* ---------- INSTALL ---------- */
let deferredInstallPrompt=null;addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;$("installBtn").classList.remove("hidden")});$("installBtn").onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$("installBtn").classList.add("hidden")};addEventListener("appinstalled",()=>$("installBtn").classList.add("hidden"));

/* ---------- MULTI TERMINAL ---------- */
const terminalSessions=[];let activeTerminalId=0,terminalSeq=0;
function activeTerminal(){return terminalSessions.find(s=>s.id===activeTerminalId)||terminalSessions[0]}
function terminalStatus(t,k){const e=$("terminalStatus");e.textContent=t;e.className="status "+k}
function appendTerminal(text,id){const s=terminalSessions.find(x=>x.id===id);if(!s)return;s.output+=text;if(id===activeTerminalId){$("terminalOutput").textContent=s.output;$("terminalOutput").scrollTop=$("terminalOutput").scrollHeight}}
function renderTerminalTabs(){const w=$("terminalTabs");w.innerHTML="";for(const s of terminalSessions){const b=document.createElement("button");b.className="terminal-tab"+(s.id===activeTerminalId?" active":"");const name=document.createElement("span");name.textContent="⌁ "+s.name;const close=document.createElement("i");close.textContent="×";b.append(name,close);b.onclick=()=>switchTerminal(s.id);close.onclick=e=>{e.stopPropagation();closeTerminal(s.id)};w.appendChild(b)}const plus=document.createElement("button");plus.className="terminal-tab-add";plus.textContent="＋";plus.onclick=newTerminal;w.appendChild(plus)}
function updateTerminalView(){const s=activeTerminal();if(!s)return;$("terminalOutput").textContent=s.output;$("terminalOutput").scrollTop=$("terminalOutput").scrollHeight;$("terminalPrompt").textContent=s.prompt;$("terminalInput").value=s.input||"";terminalStatus(s.connected?"connected":"disconnected",s.connected?"connected":"error");renderTerminalTabs()}
function switchTerminal(id){const old=activeTerminal();if(old)old.input=$("terminalInput").value;activeTerminalId=id;updateTerminalView();$("terminalInput").focus()}
function newTerminal(){const id=++terminalSeq;const s={id,name:"Terminal "+id,output:"",prompt:"~/workspace",input:"",history:[],historyIndex:-1,socket:null,connected:false};terminalSessions.push(s);activeTerminalId=id;connectTerminal(s);updateTerminalView()}
function closeTerminal(id){const i=terminalSessions.findIndex(x=>x.id===id);if(i<0)return;const s=terminalSessions[i];try{s.socket?.close()}catch{};terminalSessions.splice(i,1);if(!terminalSessions.length){newTerminal();return}if(activeTerminalId===id)activeTerminalId=terminalSessions[Math.max(0,i-1)].id;updateTerminalView()}
function connectTerminal(s){if(s.socket&&(s.socket.readyState===WebSocket.OPEN||s.socket.readyState===WebSocket.CONNECTING))return;const proto=location.protocol==='https:'?'wss':'ws';if(s.id===activeTerminalId)terminalStatus('connecting...','connecting');const ws=new WebSocket(`${proto}://${location.host}/terminal`);s.socket=ws;ws.onopen=()=>{s.connected=true;if(s.id===activeTerminalId)terminalStatus('connected','connected');renderTerminalTabs()};ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type==='output')appendTerminal(m.data,s.id);if(m.type==='clear'){s.output='';if(s.id===activeTerminalId)$("terminalOutput").textContent=''}if(m.type==='prompt'){s.prompt=m.data;if(s.id===activeTerminalId)$("terminalPrompt").textContent=m.data}if(m.type==='status'&&m.data==='closed'){s.connected=false;if(s.id===activeTerminalId)terminalStatus('closed','error')}if(m.type==='error')appendTerminal(`\r\n[Terminal error] ${m.data}\r\n`,s.id)};ws.onerror=()=>{s.connected=false;if(s.id===activeTerminalId)terminalStatus('error','error')};ws.onclose=()=>{s.connected=false;if(s.id===activeTerminalId)terminalStatus('disconnected','error');renderTerminalTabs()}}
function sendTerminal(data,s=activeTerminal()){if(!s)return false;if(!s.socket||s.socket.readyState!==WebSocket.OPEN){appendTerminal('\r\n[Terminal belum terhubung]\r\n',s.id);connectTerminal(s);return false}s.socket.send(JSON.stringify({type:'command',data}));return true}
$("terminalInput").addEventListener("keydown",e=>{const s=activeTerminal();if(!s)return;if(e.key==='Enter'){e.preventDefault();const v=$("terminalInput").value;s.input='';if(v.trim()){s.history=s.history.filter(x=>x!==v);s.history.unshift(v)}s.historyIndex=-1;appendTerminal((s.prompt||'~/workspace')+' $ '+v+'\r\n',s.id);sendTerminal(v,s);$("terminalInput").value=''}else if(e.key==='ArrowUp'){e.preventDefault();if(s.history.length){s.historyIndex=Math.min(s.historyIndex+1,s.history.length-1);$("terminalInput").value=s.history[s.historyIndex]}}else if(e.key==='ArrowDown'){e.preventDefault();if(s.historyIndex<=0){s.historyIndex=-1;$("terminalInput").value=''}else $("terminalInput").value=s.history[--s.historyIndex]}});
$("terminalOutput").onclick=()=>$("terminalInput").focus();$("terminalBtn").onclick=()=>{$("terminalPanel").scrollIntoView({behavior:'smooth'});setTimeout(()=>$("terminalInput").focus(),200)};$("clearTerminal").onclick=()=>{const s=activeTerminal();if(s){s.output='';updateTerminalView();sendTerminal('clear',s)}};$("restartTerminal").onclick=()=>{const s=activeTerminal();if(s){try{s.socket?.close()}catch{}setTimeout(()=>connectTerminal(s),100)}};$("newTerminal").onclick=newTerminal;
$("terminalKeys").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const key=b.dataset.key;if(key==='CTRL'||key==='ALT'){b.classList.toggle('active');return}let seq=b.dataset.seq||'';const ctrl=$("terminalKeys [data-key=CTRL]")?.classList.contains('active'),alt=$("terminalKeys [data-key=ALT]")?.classList.contains('active');if(ctrl&&seq.length===1)seq=String.fromCharCode(seq.toUpperCase().charCodeAt(0)-64);if(alt)seq='\x1b'+seq;sendTerminal(seq);$("terminalKeys [data-key=CTRL]")?.classList.remove('active');$("terminalKeys [data-key=ALT]")?.classList.remove('active');$("terminalInput").focus()});

addEventListener("load",()=>{loadTree().catch(()=>{});newTerminal();runLive().catch(()=>{})});
window.addEventListener('mce:refresh-preview',()=>{ if(typeof runLive==='function') runLive().catch(()=>{}); });
