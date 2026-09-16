# Mobile Code v6.1

- Live Generator automatically scans the workspace for `index.html`, nested HTML entry files, then JavaScript/CSS entries.
- HTML preview runs directly in the embedded Live Generator iframe.
- JavaScript entry files can be previewed in a browser sandbox; Node-specific APIs are not available in browser preview.
- TypeScript/TSX entries are detected and reported as requiring a transpile/build step.
- Project Explorer accepts folder/file picker imports and desktop drag & drop.
- Imported projects are synchronized into `workspace/` immediately.
- Terminal is an internal Mobile Code workspace runtime, not a Termux shell UI.
- Multiple independent terminal tabs can be opened with `＋ New Terminal`.
- Each terminal has its own current directory, command history and WebSocket session.
- Terminal commands remain isolated to the Mobile Code workspace.
