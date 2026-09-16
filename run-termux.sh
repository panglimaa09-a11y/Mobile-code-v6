#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"
printf '\n📱 Mobile Code v6.4\n📂 %s\n\n' "$PWD"
if [ ! -d node_modules ]; then
  echo '📦 Installing dependencies...'
  npm install
fi
exec npm start
