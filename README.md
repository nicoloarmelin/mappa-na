# 🗺️ Interactive Map Project

Questa repository contiene la mappa interattiva. Se vuoi usare questo progetto come base per crearti una mappa tutta tua e personalizzarla in totale autonomia, segui questi passaggi passo-passo!

## 🚀 Istruzioni (Come scaricare e modificare la Mappa)

### 1️⃣ Prerequisiti
Prima di iniziare, assicurati di avere installato sul tuo computer:
- **Node.js**: (scaricabile da [nodejs.org](https://nodejs.org)) ci serve per avviare il pannello che permette di aggiungere e togliere i nodi.
- **Git**: (scaricabile da [git-scm.com](https://git-scm.com)).
- Un account attivo su **GitHub**.

### 2️⃣ Crea la TUA copia (Il "Fork")
Non scaricare semplicemente la cartella con un file .zip, ma crea una derivazione del progetto collegata al tuo account:
1. Vai sulla vista principale di questa pagina GitHub.
2. Clicca in alto a destra sul pulsante **"Fork"**.
3. Conferma. Questo creerà una copia esatta dell'intero progetto sul tuo profilo GitHub (sarà completamente indipendente e tutto tuo).

### 3️⃣ Scarica il progetto sul tuo computer (Il "Clone")
1. Vai sul TUO nuovo repository GitHub appena creato.
2. Clicca sul pulsante verde **"Code"** e copia l'indirizzo (es: `https://github.com/TuoNome/map.git`).
3. Apri il Terminale (su Mac/Linux) o il Prompt dei Comandi (su Windows).
4. Digita il comando per clonare la cartella:
   ```bash
   git clone [INCOLLA_IL_LINK_CHE_HAI_COPIATO]
   ```
5. Entra nella cartella appena scaricata digitando:
   ```bash
   cd map
   ```

### 4️⃣ Avvia il progetto in locale (Per Modificare i dati)
Per vedere la mappa, aggiungere o rimuovere nodi, devi avviare il pannello di controllo locale.
1. Sempre dal Terminale, installa i moduli necessari (da fare solo la prima volta):
   ```bash
   npm install
   ```
2. Avvia il server:
   ```bash
   node server.js
   ```
3. Apri il tuo browser preferito (Chrome/Safari) e vai all'indirizzo `http://localhost:3000`. 
4. **Fatto!** Ora usa i pulsanti integrati nella mappa in locale per aggiungere ed eliminare i nodi o editare i file. Tutte le modifiche vengono salvate automaticamente nei file della cartella locale.

### 5️⃣ Pubblica la tua mappa aggiornata online
Quando hai finito le tue modifiche in locale, la tua "Read-Only Version" non è ancora aggiornata sul web per il pubblico. Devi inviare i nuovi file modificati al tuo GitHub! Fermati dal modificare sul browser e fai così:
- **Se usi Windows:** fai doppio clic sul file `update_map.bat` presente nella cartella e inserisci un messaggio quando richiesto.
- **Se usi Mac/Linux:** apri un nuovo Terminale nella cartella del progetto e digita:
  ```bash
  ./update_map.sh
  ```
  *(Nota: Se è la prima volta, dai prima al file i permessi digitando `chmod +x update_map.sh`)*.

### 6️⃣ Attiva GitHub Pages (Solo la primissima volta)
Per rendere la mappa visibile su internet come un vero e proprio sito web in sola lettura:
1. Vai sulla pagina GitHub del tuo repository online.
2. Clicca su **Settings** (Impostazioni) in alto e poi seleziona **Pages** (nel menù laterale a sinistra).
3. Sotto la voce "Build and deployment", come Source seleziona **"Deploy from a branch"**.
4. Spunta il branch **`main`** (o master) e salva.
5. In 1/2 minuti, in alto nella stessa pagina di GitHub Pages comparirà un link verde. Quello sarà il link pubblico alla tua mappa "read-only"! Ogni volta che userai lo script del Punto 5, questo sito web si aggiornerà in un minuto da solo con i tuoi nuovi dati.
