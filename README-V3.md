# Mobile Code Editor v3

Features:
- Monaco code editor
- File explorer
- Integrated Termux terminal via WebSocket
- PWA installation from Chrome
- Standalone display mode
- Offline shell for UI assets
- Live Generator embedded inside the app
- Automatic live refresh for HTML
- Android wrapper scaffold

## Start
cd ~/storage/downloads/Mobile-code-editor
npm install
npm start

Open:
http://127.0.0.1:3000

## PWA
In Chrome open the address, then use Chrome's Install app / Add to Home screen option.

## Live Generator
Create/open `index.html`. Press `▶ Run` or `⚡ Live`.
The result is rendered inside Mobile Code.

## APK
See `android-wrapper/README.md`. A truly standalone APK with an internal shell requires an Android-native terminal runtime; the current terminal backend is intentionally local and safe for development.
