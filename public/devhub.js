(() => {
  const $ = id => document.getElementById(id);
  const panel = $('devPanel');
  let connections = [];
  let plugins = [];
  const json = async (url, options={}) => { const r=await fetch(url, options); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d; };
  const open = () => { panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); refreshAll().catch(e=>toast(e.message)); };
  const close = () => { panel.classList.remove('open'); panel.setAttribute('aria-hidden','true'); };
  const toast = msg => window.showToast ? window.showToast(msg) : alert(msg);
  $('connectBtn').onclick=open; $('connectBottom').onclick=open; $('devClose').onclick=close;
  panel.addEventListener('click', e=>{ if(e.target===panel) close(); });
  document.querySelectorAll('[data-devtab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-devtab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-devpanel]').forEach(x=>x.classList.toggle('active',x.dataset.devpanel===b.dataset.devtab));});
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderConnections(){ $('connectionList').innerHTML=connections.length?connections.map(c=>`<div class="dev-card"><div><b>${esc(c.name)}</b><small>${esc(c.baseUrl)} · ${esc(c.model||'default')}</small></div><button data-del-conn="${esc(c.id)}">×</button></div>`).join(''):'<div class="empty">Belum ada koneksi.</div>'; document.querySelectorAll('[data-del-conn]').forEach(b=>b.onclick=async()=>{await json('/api/connections/'+encodeURIComponent(b.dataset.delConn),{method:'DELETE'});await refreshConnections();}); }
  function fillSelect(id){const el=$(id);el.innerHTML=connections.length?connections.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.model||'default')}</option>`).join(''):'<option value="">Tambahkan connection dulu</option>';}
  async function refreshConnections(){connections=await json('/api/connections');renderConnections();fillSelect('agentConnection');fillSelect('copilotConnection');}
  $('saveConnection').onclick=async()=>{try{await json('/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('connName').value,baseUrl:$('connBase').value,model:$('connModel').value,apiKey:$('connKey').value})});$('connKey').value='';$('connName').value='';$('connBase').value='';$('connModel').value='';await refreshConnections();toast('Connection tersimpan');}catch(e){toast(e.message)}};
  async function context(){let path=window.currentPath; if(!path)return {path:null,content:''}; try{const r=await fetch('/api/file?path='+encodeURIComponent(path)); return {path,content:await r.text()};}catch{return {path,content:''};}}
  $('runAgent').onclick=async()=>{const out=$('agentOutput');out.textContent='Menjalankan agent...';try{const c=await context();const d=await json('/api/ai/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:$('agentConnection').value,prompt:$('agentPrompt').value,context:c})});out.textContent=d.text||'(tidak ada output)';}catch(e){out.textContent='Error: '+e.message;}};
  $('runCopilot').onclick=async()=>{const out=$('copilotOutput');out.textContent='Menganalisis...';try{const c=await context();const d=await json('/api/ai/copilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:$('copilotConnection').value,prompt:$('copilotPrompt').value,context:c})});out.textContent=d.text||'(tidak ada saran)';}catch(e){out.textContent='Error: '+e.message;}};
  function renderMcp(list){$('mcpList').innerHTML=list.length?list.map(x=>`<div class="dev-card"><div><b>${esc(x.name)}</b><small>${esc(x.url)}</small></div><button data-del-mcp="${esc(x.id)}">×</button></div>`).join(''):'<div class="empty">Belum ada MCP.</div>';document.querySelectorAll('[data-del-mcp]').forEach(b=>b.onclick=async()=>{await json('/api/mcp/'+encodeURIComponent(b.dataset.delMcp),{method:'DELETE'});refreshMcp();});}
  async function refreshMcp(){renderMcp(await json('/api/mcp'));}
  $('saveMcp').onclick=async()=>{try{await json('/api/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('mcpName').value,url:$('mcpUrl').value,token:$('mcpToken').value})});$('mcpName').value='';$('mcpUrl').value='';$('mcpToken').value='';await refreshMcp();toast('MCP tersimpan');}catch(e){toast(e.message)}};
  $('probeMcp').onclick=async()=>{try{$('mcpOutput').textContent=JSON.stringify(await json('/api/mcp/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('mcpUrl').value,token:$('mcpToken').value})}),null,2);}catch(e){$('mcpOutput').textContent='Error: '+e.message;}};

  function renderPluginCommands(){
    const commands=[];
    for(const p of plugins) if(p.enabled) for(const c of (p.contributes?.commands||[])) commands.push({...c,pluginId:p.id,pluginName:p.name});
    $('pluginCommands').innerHTML=commands.length?commands.map(c=>`<div class="dev-card"><div><b>${esc(c.title||c.command)}</b><small>${esc(c.pluginName)} · ${esc(c.command)}</small></div><button data-plugin-command="${esc(c.pluginId)}" data-command="${esc(c.command)}">Run</button></div>`).join(''):'<div class="empty">Tidak ada command aktif.</div>';
    document.querySelectorAll('[data-plugin-command]').forEach(b=>b.onclick=()=>runPluginCommand(b.dataset.pluginCommand,b.dataset.command));
  }
  async function runPluginCommand(id,command){
    try{
      const payload={command};
      if(command==='codeNotes.add') payload.note=prompt('Catatan developer:')||'';
      const d=await json('/api/plugins/'+encodeURIComponent(id)+'/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(d.action==='preview.refresh') window.dispatchEvent(new Event('mce:refresh-preview'));
      $('pluginOutput').textContent=JSON.stringify(d,null,2); toast('Command selesai');
    }catch(e){$('pluginOutput').textContent='Error: '+e.message;toast(e.message);}
  }
  async function activatePlugin(p){
    const frame=$('pluginHostFrame');
    frame.src='/api/plugins/'+encodeURIComponent(p.id)+'/frame';
    await new Promise(resolve=>{const done=e=>{if(e.data?.type==='mce:plugin'&&e.data.pluginId===p.id){window.removeEventListener('message',done);resolve();}};window.addEventListener('message',done);setTimeout(()=>{window.removeEventListener('message',done);resolve();},1500);});
    frame.contentWindow?.postMessage({type:'mce:host',action:'activate',pluginId:p.id,permissions:p.permissions||[]},'*');
  }
  async function renderPlugins(){
    const [list,catalog]=await Promise.all([json('/api/plugins'),json('/api/plugins/catalog')]); plugins=list;
    $('pluginList').innerHTML=list.length?list.map(x=>`<div class="dev-card plugin-card"><div><b>${esc(x.name)}</b><small>${esc(x.publisher)} · v${esc(x.version)} · ${x.enabled?'enabled':'disabled'}<br>Permissions: ${esc((x.permissions||[]).join(', ')||'none')}</small></div><span><button data-open-plugin="${esc(x.id)}">Open</button><button data-toggle-plugin="${esc(x.id)}">${x.enabled?'Disable':'Enable'}</button><button data-remove-plugin="${esc(x.id)}">Remove</button></span></div>`).join(''):'<div class="empty">Belum ada plugin terpasang.</div>';
    $('pluginCatalog').innerHTML=catalog.map(x=>`<div class="dev-card"><div><b>${esc(x.name)}</b><small>${esc(x.publisher)} · v${esc(x.version)}<br>${esc(x.description)}<br>Permissions: ${esc((x.permissions||[]).join(', ')||'none')}</small></div><button data-install-plugin="${esc(x.id)}" ${x.installed?'disabled':''}>${x.installed?'Installed':'Install'}</button></div>`).join('');
    document.querySelectorAll('[data-toggle-plugin]').forEach(b=>b.onclick=async()=>{try{await json('/api/plugins/'+encodeURIComponent(b.dataset.togglePlugin)+'/toggle',{method:'POST'});await renderPlugins();}catch(e){toast(e.message)}});
    document.querySelectorAll('[data-open-plugin]').forEach(b=>b.onclick=async()=>{const p=plugins.find(x=>x.id===b.dataset.openPlugin);if(p)await activatePlugin(p);});
    document.querySelectorAll('[data-remove-plugin]').forEach(b=>b.onclick=async()=>{if(!confirm('Hapus extension ini?'))return;try{await json('/api/plugins/'+encodeURIComponent(b.dataset.removePlugin),{method:'DELETE'});await renderPlugins();}catch(e){toast(e.message)}});
    document.querySelectorAll('[data-install-plugin]').forEach(b=>b.onclick=async()=>{try{await json('/api/plugins/install/'+encodeURIComponent(b.dataset.installPlugin),{method:'POST'});await renderPlugins();toast('Extension terpasang dan siap diaktifkan.');}catch(e){toast(e.message)}});
    renderPluginCommands();
  }
  $('refreshPlugins').onclick=()=>renderPlugins().catch(e=>toast(e.message));
  $('openPluginHost').onclick=()=>{const p=plugins.find(x=>x.enabled);if(p)activatePlugin(p);else toast('Aktifkan extension terlebih dahulu.');};
  window.addEventListener('message',e=>{if(e.data?.type!=='mce:plugin')return;if(e.data.action==='register')renderPluginCommands();if(e.data.action==='ready')$('pluginOutput').textContent=`Extension Host: ${e.data.pluginId} ready`;});
  async function refreshAll(){await refreshConnections();await refreshMcp();await renderPlugins();}
})();
