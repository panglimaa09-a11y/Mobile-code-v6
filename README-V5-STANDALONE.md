# Mobile Code v5.1 — Standalone Terminal

Terminal Mobile Code sekarang **tidak spawn bash/sh/Termux**. Terminal adalah runtime command milik aplikasi dan hanya dapat mengakses `workspace/`.

## Commands
`help`, `pwd`, `ls`, `cd`, `tree`, `cat`, `head`, `tail`, `touch`, `mkdir`, `rm`, `mv`, `cp`, `echo`, `grep`, `find`, `wc`, `clear`, `whoami`, `uname`, `date`, `exit`.

## Important
Perintah sistem seperti `npm`, `node`, `python`, `git`, `apt`, dan program Linux lain **tidak dieksekusi** oleh terminal standalone ini. Itu memang disengaja agar APK/PWA tidak bergantung pada Termux.

Untuk menjalankan toolchain seperti Node/Python secara native di APK, diperlukan runtime native yang dibundel ke APK; itu adalah tahap terpisah dari terminal workspace ini.
