# Mobile Code Editor — Release Candidate

A local-first PWA code editor designed for Android and desktop browsers.

## Included
- Project Explorer and file operations
- Live Generator and PWA
- Standalone multi-terminal: real local OS shell on Termux/Windows/Linux/macOS, or workspace-only fallback where needed
- Developer Hub connections, AI agent, copilot, MCP, plugins
- Workspace path and symlink traversal protection

## Run locally

```sh
npm install
npm start
```

Open the localhost address printed by the server.

## Telegram bot
See [README-TELEGRAM.md](README-TELEGRAM.md) for owner-only Telegram remote control on Windows PowerShell and Android Termux. The bot uses long polling, local API access, an allowlisted command runner, staged file writes, ZIP delivery, and local environment variables for secrets.

## Security
Keep Mobile Code bound to localhost. Its real terminal has the permissions of the OS account running it. Never expose the editor API/terminal publicly, and never commit a real `.env` file.
