(() => {
  const $ = id => document.getElementById(id);
  const state = { connections: [], messages: [], busy: false };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  async function json(url, options = {}) {
    const r = await fetch(url, options);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
    return d;
  }
  function setStatus(text, kind = "") {
    const el = $("aiChatStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "ai-chat-status " + kind;
  }
  function renderConnections() {
    const select = $("aiChatConnection");
    select.innerHTML = state.connections.length
      ? state.connections.map(c => "<option value=\"" + esc(c.id) + "\">" + esc(c.name) + " · " + esc(c.model || "default") + "</option>").join("")
      : "<option value=\"\">Tambahkan koneksi di tab Connections</option>";
    if (state.connections.length) refreshModels().catch(e => setStatus(e.message, "error"));
  }
  async function loadConnections() {
    state.connections = await json("/api/connections");
    renderConnections();
  }
  async function refreshModels() {
    const connectionId = $("aiChatConnection").value;
    const select = $("aiChatModel");
    if (!connectionId) {
      select.innerHTML = "<option value=\"\">Pilih koneksi dahulu</option>";
      return;
    }
    setStatus("Memuat model…", "busy");
    try {
      const d = await json("/api/ai/models?connectionId=" + encodeURIComponent(connectionId));
      const models = (d.models || []).slice(0, 300);
      const conn = state.connections.find(c => c.id === connectionId);
      const current = conn?.model || "";
      select.innerHTML = "<option value=\"\">Gunakan model koneksi (" + esc(current || "default") + ")</option>" +
        models.map(m => "<option value=\"" + esc(m) + "\">" + esc(m) + "</option>").join("");
      if (current && models.includes(current)) select.value = current;
      setStatus(models.length + " model dimuat", "ok");
    } catch (e) {
      select.innerHTML = "<option value=\"\">Gunakan model koneksi</option>";
      setStatus("Model belum bisa dimuat: " + e.message, "error");
    }
  }
  function addMessage(role, text, extra = {}) {
    state.messages.push({ role, content: text });
    const wrap = document.createElement("article");
    wrap.className = "ai-chat-message " + (role === "user" ? "user" : "assistant");
    const label = document.createElement("div");
    label.className = "ai-chat-role";
    label.textContent = role === "user" ? "KAMU" : "9ROUTER AI";
    const body = document.createElement("div");
    body.className = "ai-chat-text";
    body.textContent = text;
    wrap.append(label, body);
    if (extra.artifacts?.length) {
      const cards = document.createElement("div");
      cards.className = "ai-result-cards";
      for (const item of extra.artifacts) {
        const a = document.createElement("a");
        a.className = "ai-result-card";
        a.href = item.url;
        a.download = item.filename || "workspace.zip";
        a.innerHTML = "<span class=\"ai-result-icon\">ZIP</span><span><b>" + esc(item.filename || "Project ZIP") + "</b><small>" + (Number(item.size || 0) / 1024).toFixed(1) + " KB · arsip nyata</small></span><strong>Unduh ↗</strong>";
        cards.appendChild(a);
      }
      wrap.appendChild(cards);
    }
    if (extra.changes?.length) {
      const cards = document.createElement("div");
      cards.className = "ai-result-cards";
      for (const item of extra.changes) {
        const card = document.createElement("div");
        card.className = "ai-result-card changed";
        card.innerHTML = "<span class=\"ai-result-icon\">FILE</span><span><b>" + esc(item.path) + "</b><small>" + Number(item.bytes || 0).toLocaleString() + " bytes · tersimpan di workspace</small></span>";
        cards.appendChild(card);
      }
      wrap.appendChild(cards);
      if (typeof window.loadTree === "function") window.loadTree().catch(() => {});
    }
    if (extra.operations?.length) {
      const cards = document.createElement("div");
      cards.className = "ai-result-cards";
      for (const op of extra.operations) {
        const card = document.createElement("div");
        card.className = "ai-result-card changed";
        if (op.type === "github-push") {
          const remote = String(op.remote || "");
          const safeRemote = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(remote) ? remote : "";
          card.innerHTML = "<span class=\"ai-result-icon\">GIT</span><span><b>" + esc(op.message || "GitHub push selesai") + "</b><small>Branch: " + esc(op.branch || "current") + " · " + (op.stagedFiles?.length || 0) + " file di-commit</small></span>" + (safeRemote ? "<a href=\"" + safeRemote + "\" target=\"_blank\" rel=\"noopener\">Buka ↗</a>" : "");
        } else {
          card.innerHTML = "<span class=\"ai-result-icon\">GIT</span><span><b>Status Git</b><small>" + esc(op.status || "Tidak ada output") + "</small></span>";
        }
        cards.appendChild(card);
      }
      wrap.appendChild(cards);
    }
    if (extra.usage) {
      const usage = document.createElement("small");
      usage.className = "ai-usage";
      usage.textContent = "Model: " + (extra.model || "default") + " · Token masuk: " + (extra.usage.prompt_tokens ?? "—") + " · keluar: " + (extra.usage.completion_tokens ?? "—");
      wrap.appendChild(usage);
    }
    $("aiChatMessages").appendChild(wrap);
    $("aiChatMessages").scrollTop = $("aiChatMessages").scrollHeight;
  }
  function setBusy(busy) {
    state.busy = busy;
    $("aiChatSend").disabled = busy;
    $("aiChatPrompt").disabled = busy;
    $("aiChatSend").textContent = busy ? "Memproses…" : "Kirim ➤";
    setStatus(busy ? "AI sedang bekerja di workspace…" : "Siap", busy ? "busy" : "ok");
  }
  async function send() {
    const prompt = $("aiChatPrompt").value.trim();
    if (!prompt || state.busy) return;
    if (!$("aiChatConnection").value) {
      setStatus("Simpan koneksi 9Router di Developer Hub → Connections terlebih dahulu.", "error");
      return;
    }
    $("aiChatPrompt").value = "";
    addMessage("user", prompt);
    setBusy(true);
    const pending = document.createElement("div");
    pending.className = "ai-chat-pending";
    pending.textContent = "AI membaca workspace dan menjalankan tools bila diperlukan…";
    $("aiChatMessages").appendChild(pending);
    try {
      const d = await json("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: $("aiChatConnection").value,
          model: $("aiChatModel").value,
          messages: state.messages
        })
      });
      pending.remove();
      addMessage("assistant", d.text || "Selesai.", { artifacts: d.artifacts || [], changes: d.changes || [], operations: d.operations || [], usage: d.usage, model: d.model });
      if (d.artifacts?.length) setStatus("ZIP berhasil dibuat · siap diunduh", "ok");
      else if (d.operations?.some(op => op.type === "github-push")) setStatus("GitHub push selesai", "ok");
      else if (d.changes?.length) setStatus(d.changes.length + " file berhasil ditulis", "ok");
      else setStatus("Selesai", "ok");
    } catch (e) {
      pending.remove();
      addMessage("assistant", "Operasi gagal: " + e.message);
      setStatus("Gagal · lihat pesan error", "error");
    } finally {
      setBusy(false);
      $("aiChatPrompt").focus();
    }
  }
  $("aiChatSend").addEventListener("click", send);
  $("aiChatPrompt").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $("aiChatConnection").addEventListener("change", () => refreshModels().catch(e => setStatus(e.message, "error")));
  $("aiChatRefreshModels").addEventListener("click", () => refreshModels().catch(e => setStatus(e.message, "error")));
  $("aiChatNew").addEventListener("click", () => {
    state.messages = [];
    $("aiChatMessages").innerHTML = "<div class=\"ai-chat-welcome\"><div class=\"ai-chat-orb\">✦</div><h3>AI Coding Workspace</h3><p>AI bisa membaca project, membuat atau mengubah file, membuat ZIP unduhan, dan menjalankan Git push saat kamu memintanya secara eksplisit.</p><div class=\"ai-quick-prompts\"><button data-prompt=\"Analisis struktur project dan beri ringkasan singkat.\">🔎 Analisis project</button><button data-prompt=\"Buat ZIP project ini dan berikan link unduhan.\">📦 Buat ZIP</button><button data-prompt=\"Periksa status Git project ini.\">⑂ Git status</button></div></div>";
    $("aiChatMessages").querySelectorAll("[data-prompt]").forEach(b => b.onclick = () => { $("aiChatPrompt").value = b.dataset.prompt; send(); });
  });
  const openChat = () => {
    const panel = $("devPanel");
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    document.querySelectorAll("[data-devtab]").forEach(x => x.classList.toggle("active", x.dataset.devtab === "ai-chat"));
    document.querySelectorAll("[data-devpanel]").forEach(x => x.classList.toggle("active", x.dataset.devpanel === "ai-chat"));
    loadConnections().catch(e => setStatus(e.message, "error"));
  };
  $("aiChatBtn").addEventListener("click", openChat);
  $("aiChatBottom").addEventListener("click", openChat);
  $("aiChatOpenConnections").addEventListener("click", () => {
    document.querySelector('[data-devtab="connections"]').click();
  });
  window.addEventListener("mce:connections-updated", () => loadConnections().catch(() => {}));
  $("aiChatNew").click();
})();
