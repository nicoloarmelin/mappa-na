@echo off
echo ==========================================
echo   AGGIORNAMENTO MAPPA SU GITHUB PAGES
echo ==========================================
echo.

git add .
set /p msg="Descrivi brevemente la modifica (es. Aggiunti nuovi paper): "
if "%msg%"=="" set msg="Aggiornamento dati mappa"

git commit -m "%msg%"
echo.
echo Invio dei file a GitHub...
git push origin main

echo.
echo ==========================================
echo   OPERAZIONE COMPLETATA!
echo   Il sito sara' aggiornato tra circa 1 min.
echo ==========================================
pause
