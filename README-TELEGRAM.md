# Telegram Bot for Mobile Code v6

Owner-only Telegram remote control for a local Mobile Code v6 server. Uses Telegram long polling; no public webhook, tunnel, or inbound port is needed. No additional npm dependencies are required.

## Requirements
- Node.js 20+ recommended (Node 18+ with built-in fetch/FormData/Blob).
- Mobile Code v6 running on the same computer/phone.
- Telegram bot token from BotFather and numeric Telegram user ID.
- A provider configured in Mobile Code Developer Hub → Connections for AI commands.

## Windows PowerShell
1. Open PowerShell in the Mobile Code project directory.
2. Run `npm install` if dependencies are not installed.
3. Copy `.env.example` to `.env`, then fill `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, and `MCE_URL` locally. Use your numeric Telegram user ID, not username. Default URL is `http://127.0.0.1:3010`; change it if Mobile Code selected another port.
4. In one window, run `npm start`.
5. In a second window, run `npm run bot`.
6. Open the bot in a private Telegram chat and send `/start`.

## Android Termux
From the project directory run:

```sh
pkg update
pkg install nodejs git
npm install
cp .env.example .env
nano .env
```

Fill the same three environment values. Start `npm start` in one Termux session and `npm run bot` in a second. Both processes must remain running. Set `MCE_URL` to the actual loopback port printed by Mobile Code.

## Commands
- `/status`, `/models`: local server/workspace/provider status and model list.
- `/files [filter]`, `/read path`: list files and read text files.
- `/write path`: stage the next message as file content. Nothing is written until `/confirmwrite`; use `/cancel` to abort.
- `/chat instruction` or ordinary text: send instructions to the existing `/api/ai/chat` endpoint. Context is kept in bot memory until restart or `/new`.
- `/zip`: create a real ZIP and send it to Telegram. Excludes `.git`, `.mce`, `node_modules`, build/cache folders, `.env*`, logs, and common private key/database files. ZIP64 is not supported; Telegram upload limit is set to 45 MB.
- `/git status`, `/git push`: Git status or a normal push to the existing remote, with no force push.
- `/run git-status`, `/run git-log`, `/run npm-test`, `/run npm-build`, `/run node-check relative/file.js`: fixed allowlist only. No arbitrary shell commands are accepted.

## Security
- Never commit `.env` or expose the bot token. If leaked, revoke it via BotFather.
- Only the configured numeric sender ID in a private chat is accepted; group chats are ignored.
- The bot refuses non-local `MCE_URL`. Do not expose the editor API or real terminal to the internet.
- File writes require a separate confirmation. The server applies its own workspace path validation too.
- Git push uses credentials and remote configured on the local machine. Check `/git status` first.
- ZIP intentionally excludes `.mce` because it may contain provider/API credentials.

## Troubleshooting
- API 404 on `/api/ai/chat` or `/api/ai/models`: your local Mobile Code version needs those routes. This integration uses the existing routes; it does not fake AI results.
- Bot not responding: verify token, numeric owner ID, and that no other process is polling with the same token.
- Connection refused: start Mobile Code and correct `MCE_URL`.
