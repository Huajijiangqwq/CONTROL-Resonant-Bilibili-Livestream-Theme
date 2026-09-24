@echo off
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo 请使用桌面客户端中的“扫码登录”，或安装 Node.js 24 后再运行此脚本。
  pause
  exit /b 1
)
node "%~dp0scripts\bilibili-login.js"
if errorlevel 1 pause
