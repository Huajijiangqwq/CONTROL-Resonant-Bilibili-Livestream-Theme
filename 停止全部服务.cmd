@echo off
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
 echo 请先安装 Node.js 24 或更高版本。
 pause
 exit /b 1
)
node "%~dp0scripts\stop.js"
pause
