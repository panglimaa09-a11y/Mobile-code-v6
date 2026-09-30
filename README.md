# Mobile Code Editor — Release Candidate

A local-first PWA code editor designed for Android and desktop browsers.

## Included
- Project Explorer
- File/folder creation, rename/delete via API
- File and folder import via Android/browser picker
- Desktop drag & drop project import
- Monaco editor when CDN is available, textarea fallback when offline
- Integrated static HTML Live Generator with nested-project asset paths
- Standalone workspace terminal (implemented by Mobile Code; does not spawn Termux)
- PWA installation with offline app shell
- Automatic port fallback when the configured localhost port is busy
- Workspace path and symlink traversal protection

## Run locally

```bash
npm install
npm start
```

Open the printed localhost address.

## Real multi-terminal (v6.5)
- Each terminal tab opens an independent local OS shell session.
- Android/Termux: uses the configured `SHELL` (normally Bash), so commands such as `npm`, `node`, `git`, `python`, `pkg`, and shell scripts run in the actual Termux environment.
- Windows: uses `cmd.exe`; Linux/macOS: uses the user's configured shell.
- Terminal tabs can be added and closed independently; commands execute on the machine running the Mobile Code server.
- On Vercel/serverless or when `MCE_TERMINAL_MODE=workspace` is set, the app falls back to a limited workspace-only command runtime because a persistent OS shell is not available there.

**Security:** the real terminal can access the account and files available to the OS shell. Keep the server bound to localhost and do not expose its port to the internet or an untrusted network. Review commands before running them. This WebSocket terminal is pipe-based, not a full PTY; programs requiring a TTY (for example, some interactive installers, `vim`, or `top`) may not behave correctly.

## Production/PWA
Serve over HTTPS for public hosting. The PWA shell is cacheable, but project files are intentionally kept on the local server workspace and are not published to a remote server.

## v6.0.1 Import Sync Fix
- Project Explorer import now accepts nested paths whose parent folders do not exist yet.
- Drag/drop and folder-picker imports are written directly into the Mobile Code workspace.
- No application-level project-size cap is imposed by the import endpoint.
- Live Generator automatically looks for `index.html` (or another HTML entry) after import.
- Terminal is a standalone workspace command runtime and does not execute commands in the user's Termux shell.
- PWA install remains available through Chrome when the browser exposes the install prompt.

## Termux quick start
Run `bash run-termux.sh` from this folder.


## 9Router AI Chat — real workspace actions

Mobile Code includes a local AI chat that can use OpenAI-compatible models through 9Router. The chat is not limited to generating code snippets: when the selected model supports tool calling, the server can list and read project files, write files into the active workspace, build a real ZIP archive, inspect Git status, and commit/push to the configured \`origin\` remote when the user's latest message explicitly requests a push.

### Connect 9Router on the same Android/Termux device

1. Start 9Router in Termux:
   \`\`\`bash
   9router --host 127.0.0.1 --port 20128 --skip-update --no-browser
   \`\`\`
2. Start Mobile Code in another Termux session:
   \`\`\`bash
   cd ~/Mobile-code-v6
   npm install
   npm start
   \`\`\`
3. Open http://127.0.0.1:3010, open **Connect / Developer Hub → Connections**, and save:
   - Name: 9Router
   - Base URL: http://127.0.0.1:20128/v1
   - Model: a model ID returned by http://127.0.0.1:20128/v1/models
   - API key: enter it only if your 9Router configuration requires one.
4. Open **AI Chat**, select the connection, refresh the model list, and send a request.

### Actual output and GitHub behavior

- Ask: “Buat ZIP project ini dan berikan link unduhan.” The server creates a ZIP file and shows a download card. ZIP generation excludes .git, node_modules, .mce, .env files, private keys, and filenames containing secret or token.
- Ask the AI to create or update files. Successful writes are saved in the active workspace and shown as result cards.
- Ask explicitly to “push ke GitHub”. The AI can inspect Git status, stage non-secret project files, commit changes, and push the current branch to origin without force-pushing. The workspace must already be a Git repository with an origin remote and working GitHub credentials configured in the local Termux/PC environment.
- The chat uses model tool-calling support. If a provider/model rejects the tools request, the UI shows the actual API error; choose a compatible model instead of treating a text-only answer as completed work.
- ZIP download links are local to the running Mobile Code server and may expire when the server process restarts.

### Security notes

Run Mobile Code on a trusted local device. AI file-write tools modify the active workspace. Git push only becomes available to the model when the latest user message explicitly asks to push/publish. The server excludes common secret/dependency paths from ZIP and push staging and refuses a push if sensitive paths are already staged. Review git status and your repository's .gitignore before publishing.
