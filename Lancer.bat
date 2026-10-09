@echo off
cd /d "%~dp0"
title LittleBigWeb
if not exist node_modules (
  echo Installation des dependances (une seule fois^)...
  call npm install --no-audit --no-fund
)
node server.js
pause
