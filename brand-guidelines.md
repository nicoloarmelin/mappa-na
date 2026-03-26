# Brand Guidelines & Design System
*Documento di riferimento per UI/UX e stile visivo esteso*

Questo documento riassume le regole visive, i colori, la tipografia e l'effetto "Glassmorphism" utilizzati all'interno della mappa interattiva. L'obiettivo è fornire un riferimento unico e coerente per applicare questo specifico design ad altre applicazioni web o siti.

---

## 1. Tipografia (Typography System)

Il progetto utilizza tre diverse famiglie di font ospitate su Google Fonts per definire una precisa gerarchia dell'informazione.

| Ruolo | Font Family | Pesi (Weights) | Utilizzo |
| :--- | :--- | :--- | :--- |
| **Heading / UI** | `Outfit`, sans-serif | 300, 400, 600, 700 | Titoli, bottoni principali, tooltip titles, input search |
| **Body / Copy** | `Inter`, sans-serif | 300, 400, 500, 600 | Testi lunghi, descrizioni, paragrafi nel pannello info |
| **Mono / Meta** | `Space Mono`, monospace | 400, 700 | Etichette di sistema, metadati (es. data, area), aree tematiche |

### Scala Tipografica (Rem-based)
- `--text-xs` (0.7rem / 11.2px) - Micro-testo, tag, etichette laterali.
- `--text-sm` (0.8rem / 12.8px) - Metadati, piccoli bottoni, input placeholder.
- `--text-base` (0.95rem / 15.2px) - Corpo del testo di default (es. `#info-desc`).
- `--text-md` (1.1rem / 17.6px) - Sottotitoli.
- `--text-lg` (1.25rem / 20px) - Titoli secondari.
- `--text-xl` (1.6rem / 25.6px) - Titolo principale del nodo (`#info-title`).

> **💡 Suggerimento:** Per coerenza, importa le font tramite CDN nel tag `<head>` o nel CSS principale:
> ```css
> @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&family=Outfit:wght@300;400;600;700&display=swap');
> ```

---

## 2. Palette Colori (Color Palette)

Il design utilizza una palette molto neutra come base per far risaltare il colore primario (Arancione) e l'effetto translucido dei pannelli.

### Sfondi (Backgrounds)
- **Base (Light):** `#cecece` (Grigio / Silver)
- **Base (Dark Theme):** `#141414` (Quasi nero)

### Colori di Brand (Accenti)
- **Primary Accent:** `#FF4D00` — Usato per link, blockquote, e interazioni principali.
- **Secondary Accent:** `#FF7B00` — Una variante più chiara e luminosa, usata nei focus e nel tema scuro per garantire leggibilità.

### Colori Semantici (Feedback e Azioni)
- **Edit (Warning):** `#ffc107` (Hover effect per bottoni di modifica).
- **Delete/Close (Danger):** `#dc3545` (Hover effect per chiusura o eliminazione).

### Colori di Testo
- **Titoli:** `#111111` (Grigio scurissimo/nero).
- **Corpo:** `#333333` (Grigio scuro).
- **Muted/Bordi testuali:** `#555555`.

---

## 3. Il Sistema "Glassmorphism"

Il cardine estetico del sito è l'utilizzo raffinato della sfocatura sullo sfondo abbinata a bordi e ombre sottili per dare l'illusione del vetro (Glassmorphism).

Esistono tre "livelli" principali di profondità:

### A. Livello Base (Bottoni, Searchbar, Tooltip)
Superficie semi-trasparente e sfocatura leggera. Utile per elementi piccoli che galleggiano sulla mappa.
```css
/* LIGHT GLASS */
background: rgba(255, 255, 255, 0.25);
backdrop-filter: blur(12px) saturate(150%);
border: 1px solid rgba(255, 255, 255, 0.4);
box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); /* Ombra molto morbida */
border-radius: 18px; /* --radius-md */
```

### B. Livello Profondo / Pannelli (Info Panel, Dropdowns)
Ideale per contenitori estesi. La sfocatura è maggiore per garantire leggibilità del testo.
```css
/* DEEP GLASS */
background: rgba(255, 255, 255, 0.15);
backdrop-filter: blur(40px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.4);
box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3), 0 15px 50px rgba(0, 0, 0, 0.2);
border-radius: 24px; /* --radius-lg */
```

### C. Tema Scuro (Casi Studio)
Si inverte il contrasto utilizzando sfondi traslucidi neri e bordi bianchi a bassissima opacità.
```css
/* DARK GLASS */
background: rgba(20, 20, 20, 0.85);
backdrop-filter: blur(40px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.15);
color: #eeeeee;
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
```

---

## 4. Spaziature e Forme (Shapes & Radius)

L'interfaccia privilegia forme ammorbidite e arrotondate, evitando tagli netti o spigolosi:

- `--radius-sm` (**10px**): Usato per input date, tag microscopici, pillole informative.
- `--radius-md` (**18px**): Usato per bottoni, searchbar, elementi cliccabili, filtri.
- `--radius-lg` (**24px**): Usato per i contenitori strutturali (Info Panel, Dropdown, Modali).
- **Componenti Circolari:** Bottoni come il reset visuale o "Aggiungi pillole" tendono a mantenere aspect-ratio 1:1 o forme "pill-shaped".

---

## Come esportare questo design altrove?
Accanto a questo file Markdown, troverai un file denominato `theme-guidelines.css`.
Questo file CSS contiene al suo interno:
1. Tutte le **variabili CSS `:root`** (Token di design).
2. Delle **Utility Classes** preconfigurate (es. `.glass-panel-deep`, `.glass-btn`, `.bg-default`).

Basterà implementare `theme-guidelines.css` in qualsiasi nuovo progetto HTML/React/Vue per usufruire istantaneamente della combinazione colori/font/glassmorphism adottata nella pagina originale.
