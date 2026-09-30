const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const artifacts = new Map();
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_BYTES = 150 * 1024 * 1024;
const ARTIFACT_DIR = path.join(os.tmpdir(), "mobile-code-ai-artifacts");
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function safeWorkspacePath(root, input = "") {
  const rel = String(input).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.split("/").some(part => !part || part === "." || part === "..")) {
    if (rel === "") return root;
    throw new Error("Path tidak valid atau mencoba keluar dari workspace.");
  }
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Path di luar workspace ditolak.");
  let probe = target;
  while (probe !== root && !fs.existsSync(probe)) probe = path.dirname(probe);
  const realRoot = fs.realpathSync.native(root);
  const realProbe = fs.realpathSync.native(probe);
  if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) throw new Error("Symlink keluar workspace ditolak.");
  return target;
}

function shouldSkip(name, rel) {
  const base = name.toLowerCase();
  const p = rel.replace(/\\/g, "/").toLowerCase();
  return base === ".git" || base === "node_modules" || base === ".mce" ||
    base === ".next" || base === "dist" || base === "build" ||
    base === ".vercel" || base === ".env" || base.startsWith(".env.") ||
    base.endsWith(".pem") || base.endsWith(".key") ||
    base.includes("secret") || base.includes("token") ||
    p.startsWith(".mce/") || p.startsWith("node_modules/") || p.startsWith(".git/");
}

function listWorkspaceFiles(root, max = 500) {
  const out = [];
  function walk(dir, rel = "") {
    if (out.length >= max) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rp = path.posix.join(rel, entry.name);
      if (shouldSkip(entry.name, rp)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rp);
      else if (entry.isFile()) {
        const stat = fs.statSync(path.join(dir, entry.name));
        out.push({ path: rp, bytes: stat.size });
      }
      if (out.length >= max) break;
    }
  }
  walk(root);
  return out;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}
function makeZip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const raw = entry.data;
    const packed = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const dt = dosDateTime(entry.mtime || new Date());
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(dt.time, 10);
    header.writeUInt16LE(dt.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, packed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dt.time, 12);
    cd.writeUInt16LE(dt.date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(packed.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += header.length + name.length + packed.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBuffer, end]);
}

function createWorkspaceZip(root) {
  const files = listWorkspaceFiles(root, 10000);
  if (!files.length) throw new Error("Workspace kosong; tidak ada file untuk di-ZIP.");
  const entries = [];
  let total = 0;
  for (const file of files) {
    const full = path.join(root, ...file.path.split("/"));
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    total += stat.size;
    if (total > MAX_ZIP_BYTES) throw new Error("Workspace melebihi batas ZIP 150 MB. Kecualikan folder besar terlebih dahulu.");
    entries.push({ name: file.path, data: fs.readFileSync(full), mtime: stat.mtime });
  }
  const zip = makeZip(entries);
  const id = crypto.randomUUID();
  const filename = "mobile-code-workspace-" + new Date().toISOString().replace(/[:.]/g, "-") + ".zip";
  const filePath = path.join(ARTIFACT_DIR, id + ".zip");
  fs.writeFileSync(filePath, zip);
  artifacts.set(id, { filePath, filename, size: zip.length, createdAt: Date.now() });
  return { id, filename, size: zip.length, url: "/api/ai/artifacts/" + id };
}

function runGit(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 5 * 1024 * 1024, windowsHide: true });
  if (r.error) throw new Error("Git tidak dapat dijalankan: " + r.error.message);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "Git command gagal.").trim().slice(0, 1800));
  return (r.stdout || "").trim();
}
function gitStatus(root) {
  runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  return runGit(root, ["status", "--short", "--branch", "--untracked-files=all"]);
}
function gitPush(root, commitMessage) {
  runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  const status = runGit(root, ["status", "--short", "--untracked-files=all"]);
  runGit(root, ["add", "-A", "--", ".", ":(exclude).env", ":(exclude).env.*", ":(exclude)**/.env", ":(exclude)**/.env.*", ":(exclude).mce/**", ":(exclude)**/.mce/**", ":(exclude)**/node_modules/**", ":(exclude)**/*.pem", ":(exclude)**/*.key", ":(exclude)**/*secret*", ":(exclude)**/*token*"]);
  const staged = runGit(root, ["diff", "--cached", "--name-only"]);
  const sensitive = staged.split(/\r?\n/).filter(Boolean).filter(p => /(^|\/)\.env($|\.)|(^|\/)\.mce\/|(^|\/)node_modules\/|\.pem$|\.key$|secret|token/i.test(p));
  if (sensitive.length) throw new Error("Push dibatalkan karena file berpotensi rahasia sudah staged: " + sensitive.join(", "));
  let commit = "";
  if (staged) {
    const message = String(commitMessage || "Update from Mobile Code AI").replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "Update from Mobile Code AI";
    commit = runGit(root, ["-c", "user.name=Mobile Code AI", "-c", "user.email=mobile-code-ai@users.noreply.github.com", "commit", "-m", message]);
  }
  const push = runGit(root, ["push", "-u", "origin", "HEAD"]);
  return { ok: true, statusBefore: status, stagedFiles: staged ? staged.split(/\r?\n/).filter(Boolean) : [], commit, push, message: staged ? "Perubahan di-commit dan di-push." : "Tidak ada perubahan baru; branch saat ini berhasil di-push." };
}

function getConnection(file, id) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const c = list.find(x => x.id === id);
  if (!c) throw new Error("Pilih koneksi AI terlebih dahulu di Developer Hub → Connections.");
  return c;
}
function apiUrl(base, suffix) {
  const clean = String(base || "").replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(clean) && suffix === "chat/completions") return clean;
  if (/\/models$/i.test(clean) && suffix === "models") return clean;
  return clean + "/" + suffix.replace(/^\/+/, "");
}
async function requestJson(url, headers, body) {
  const r = await fetch(url, { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 2000) }; }
  if (!r.ok) throw new Error("AI API " + r.status + ": " + String(data?.error?.message || data?.message || raw).slice(0, 900));
  return data;
}

const TOOL_DEFS = [
  { type: "function", function: { name: "list_files", description: "List project files in the workspace, excluding secrets, dependencies, and Git internals.", parameters: { type: "object", properties: { query: { type: "string", description: "Optional substring to filter paths." } }, additionalProperties: false } } },
  { type: "function", function: { name: "read_file", description: "Read a text file from the current workspace to inspect the project.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "write_file", description: "Create or update a text file in the current workspace. Use complete file content, not a diff. Do not write secrets or generated dependencies.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } } },
  { type: "function", function: { name: "create_zip", description: "Create a real downloadable ZIP of the workspace, excluding .git, node_modules, .mce, .env files, keys and secret/token files. Use when the user asks for a ZIP/archive/downloadable project.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "git_status", description: "Inspect current Git branch and changed files in the workspace.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "git_push", description: "Stage safe project files, create a commit when there are changes, and push the current branch to origin. Only call when the user explicitly requested push/publish in their latest message. Never force push.", parameters: { type: "object", properties: { commitMessage: { type: "string" } }, additionalProperties: false } } }
];

function makeHeaders(c) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (c.apiKey) headers.Authorization = "Bearer " + c.apiKey;
  return headers;
}
function toolResult(name, args, root) {
  if (name === "list_files") {
    const q = String(args.query || "").toLowerCase();
    const files = listWorkspaceFiles(root).filter(x => !q || x.path.toLowerCase().includes(q));
    return { files, count: files.length, truncated: files.length >= 500 };
  }
  if (name === "read_file") {
    const f = safeWorkspacePath(root, args.path);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) throw new Error("File tidak ditemukan: " + args.path);
    const stat = fs.statSync(f);
    if (stat.size > MAX_FILE_BYTES) throw new Error("File lebih dari 2 MB; gunakan terminal atau baca bagian yang diperlukan.");
    const content = fs.readFileSync(f, "utf8");
    return { path: args.path, content, bytes: stat.size };
  }
  if (name === "write_file") {
    const rel = String(args.path || "");
    if (!rel || shouldSkip(path.basename(rel), rel)) throw new Error("Path sensitif atau folder terlarang tidak boleh ditulis oleh AI.");
    if (typeof args.content !== "string") throw new Error("Konten file harus berupa teks.");
    const bytes = Buffer.byteLength(args.content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new Error("Batas konten file AI adalah 2 MB.");
    const f = safeWorkspacePath(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, args.content, "utf8");
    return { ok: true, path: rel.replace(/\\/g, "/"), bytes, action: "written" };
  }
  if (name === "create_zip") return createWorkspaceZip(root);
  if (name === "git_status") return { status: gitStatus(root) };
  if (name === "git_push") return gitPush(root, args.commitMessage);
  throw new Error("Tool tidak dikenal: " + name);
}

function registerAiWorkspaceRoutes(app, { getWorkspaceRoot, getConnectionsFile }) {
  app.get("/api/ai/models", async (req, res) => {
    try {
      const c = getConnection(getConnectionsFile(), String(req.query.connectionId || ""));
      const data = await requestJson(apiUrl(c.baseUrl, "models"), makeHeaders(c));
      const raw = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
      res.json({ ok: true, models: raw.map(m => typeof m === "string" ? m : m.id || m.name).filter(Boolean) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/ai/artifacts/:id", (req, res) => {
    const item = artifacts.get(String(req.params.id || ""));
    if (!item || !fs.existsSync(item.filePath)) return res.status(404).json({ error: "File ZIP tidak ditemukan atau sesi server sudah dimulai ulang. Buat ZIP lagi." });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", item.size);
    res.setHeader("Content-Disposition", 'attachment; filename="' + item.filename.replace(/["\\\r\n]/g, "_") + '"');
    res.sendFile(item.filePath);
  });

  app.post("/api/ai/chat", async (req, res) => {
    const root = getWorkspaceRoot();
    try {
      const c = getConnection(getConnectionsFile(), String(req.body?.connectionId || ""));
      const promptMessages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-16) : [];
      const lastUser = [...promptMessages].reverse().find(m => m && m.role === "user");
      const latestPrompt = String(lastUser?.content || "").trim();
      if (!latestPrompt) throw new Error("Pesan chat kosong.");
      const allowPush = /\b(push|push\s+ke\s+github|push\s+github|publish|unggah\s+ke\s+github|commit\s+dan\s+push)\b/i.test(latestPrompt);
      const tools = TOOL_DEFS.filter(t => t.function.name !== "git_push" || allowPush);
      const messages = [
        { role: "system", content: "Kamu adalah AI coding agent di Mobile Code. Kamu bekerja pada workspace lokal melalui tools nyata. Periksa file sebelum mengubahnya; gunakan write_file untuk benar-benar menyimpan file. Setelah perubahan, jelaskan file yang dibuat/diubah secara ringkas. Jika pengguna meminta ZIP, panggil create_zip dan berikan hasil unduhan yang dibuat. Jika pengguna secara eksplisit meminta push GitHub, periksa git_status lalu panggil git_push; jangan force-push. Jangan pernah mengklaim aksi selesai jika tool gagal. Jangan menampilkan rahasia, token, .env, .mce, node_modules atau isi file credential. Jawab dalam Bahasa Indonesia kecuali diminta lain. Jika model/provider tidak mendukung tool calls, jelaskan error provider secara jujur." },
        ...promptMessages.filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").map(m => ({ role: m.role, content: m.content.slice(0, 20000) }))
      ];
      const model = String(req.body?.model || c.model || "").trim();
      const headers = makeHeaders(c);
      const artifactsMade = [];
      const changes = [];
      let usage = null;
      let finalText = "";
      for (let turn = 0; turn < 7; turn++) {
        const payload = { messages, temperature: 0.2 };
        if (model) payload.model = model;
        if (tools.length) { payload.tools = tools; payload.tool_choice = "auto"; payload.parallel_tool_calls = false; }
        const data = await requestJson(apiUrl(c.baseUrl, "chat/completions"), headers, payload);
        usage = data.usage || usage;
        const msg = data?.choices?.[0]?.message;
        if (!msg) throw new Error("Provider tidak mengembalikan choices[0].message.");
        if (!Array.isArray(msg.tool_calls) || !msg.tool_calls.length) {
          finalText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || data);
          break;
        }
        messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
          const name = call.function?.name;
          let args = {};
          try { args = JSON.parse(call.function?.arguments || "{}"); } catch { throw new Error("Argumen tool dari model bukan JSON yang valid."); }
          let result;
          try {
            result = toolResult(name, args, root);
            if (name === "write_file") changes.push({ path: result.path, bytes: result.bytes });
            if (name === "create_zip") artifactsMade.push({ ...result, url: result.url });
          } catch (e) { result = { ok: false, error: e.message }; }
          messages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(result).slice(0, 12000) });
        }
      }
      if (!finalText) finalText = "Tools telah dijalankan. Lihat hasil file/arsip di kartu hasil.";
      res.json({ ok: true, text: finalText, model: model || c.model || "(default provider)", usage, artifacts: artifactsMade, changes });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}

module.exports = { registerAiWorkspaceRoutes };
