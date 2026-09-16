# Mobile Code Android APK

The web application in ../public is already PWA-ready and can be installed from Chrome when served from localhost or HTTPS.

## Important terminal architecture

The integrated terminal executes commands through the local Node server. A WebView APK alone cannot execute arbitrary Termux shell commands.

For the current architecture:
- Chrome PWA: run the Node server in Termux, then install the PWA from Chrome.
- APK wrapper: the UI can be packaged as an Android app, but the local terminal backend still needs a local runtime such as Termux unless the terminal is rewritten as a native Android service.

## Live Generator

The Live Generator is embedded inside Mobile Code. It previews index.html in an iframe and does not open an external Chrome tab.

For static HTML/CSS/JS, this works immediately.
For a Next.js/Vite/Node project, use the integrated terminal to start its dev server and then add a future "Local Server" preview target for its port.
