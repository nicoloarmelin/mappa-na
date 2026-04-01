#!/bin/bash
echo "=========================================="
echo "  AGGIORNAMENTO MAPPA SU GITHUB PAGES"
echo "=========================================="
echo ""

date > last_update.txt
git add .
read -p "Descrivi brevemente la modifica (es. Aggiunti nuovi paper): " msg
if [ -z "$msg" ]; then
    msg="Aggiornamento dati mappa"
fi

git commit -m "$msg"
echo ""
echo "Invio dei file a GitHub..."
git push origin main

echo ""
echo "=========================================="
echo "  OPERAZIONE COMPLETATA!"
echo "  Il sito sara' aggiornato tra circa 1 min."
echo "=========================================="
read -n 1 -s -r -p "Premi un tasto per uscire..."
echo ""
