# Mobile Code Editor v6 Fixed

- Termux-like WebSocket terminal with explicit upgrade handling.
- Android file/folder picker via browser document provider.
- `+` opens New File / New Folder / Import File / Import Project.
- Desktop drag-and-drop import.
- No artificial 50 MB import limit in the application.
- Live Generator runs inside the app via iframe/srcdoc.
- PWA install remains available in supported browsers.

## Termux
```sh
cd ~/storage/downloads/Mobile-code-editor
pkill -f "node server.js" 2>/dev/null || true
npm install
PORT=3010 npm start
```
Then open `http://127.0.0.1:3010`.
