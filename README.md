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

## Important runtime scope
The standalone terminal is intentionally a workspace command runtime, not a full Linux shell. It cannot execute arbitrary Android/Linux processes. Next.js/Vite/Node applications need a separate project runtime before they can be previewed internally.

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
