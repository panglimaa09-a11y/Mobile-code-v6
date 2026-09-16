# Mobile Code Editor v4

## Termux-like terminal controls
The terminal now includes a horizontal shortcut bar:
ESC, CTRL, ALT, TAB, arrows, HOME, END, PGUP, PGDN, CTRL+C and CTRL+D.

## Import project from Android
- 📁 opens the Android/browser system file picker using `webkitdirectory`.
- If ZArchiver or another document provider is available, Android may offer it through the picker.
- Drag & drop works in desktop browsers where folder drag/drop is supported.
- Imported files are stored in the workspace.
- `.git` and `node_modules` are excluded.
- No application-defined project size or file-count limit is enforced during import.

## Important note
A normal web page cannot force Android to launch a specific file manager such as ZArchiver. The supported approach is the system file picker. A native APK can later use Android Storage Access Framework for a more integrated folder picker.

## Start
cd ~/storage/downloads/Mobile-code-editor
PORT=3010 npm start

Open http://127.0.0.1:3010
