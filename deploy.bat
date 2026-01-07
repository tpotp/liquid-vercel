@echo off
echo ===============================
echo Deploy a GitHub / Vercel
echo ===============================

REM Moverse a la carpeta del proyecto
cd /d %~dp0

REM Ver estado
git status

REM Agregar cambios
git add .

REM Commit con fecha y hora
git commit -m "Auto deploy %date% %time%"

REM Push a GitHub
git push

echo ===============================
echo Deploy enviado a Vercel 🚀
echo ===============================
pause
