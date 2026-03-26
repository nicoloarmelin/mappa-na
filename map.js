let data; // caricato via fetch
const width = window.innerWidth;
const height = window.innerHeight;
let currentScale = 1;
let colorsEnabled = false; // Stato globale per la visione cromatica
let currentPageId = 'page_main'; // Id workspace iniziale
let isStatic = false; // Flag per ambiente read-only (e.g. GitHub Pages)

let areaColorMap = new Map();

// Variabili globali per SVG e gruppi per permettere re-rendering
let svg;
let mainGroup;
let zoom;
let defs;
let simulation;
let linkElements;
let whiteBlobs;
let blackBlobs;
let whiteDiamondBlobs;
let blackDiamondBlobs;
let heatCircles;
let paperGroups;
let caseStudyGroups;
let keywordGroups;
let nodes = [];
let links = [];

// Funzione di start che esegue il fetch
async function initMap() {
    try {
        // 1. Carica lista pagine con gestione ambiente statico/dinamico
        let pagesData;
        
        // Verifica se siamo in un ambiente locale servito da Node
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (!isLocalhost || window.location.hostname.includes('github.io')) {
             isStatic = true;
             console.log("Static Environment Detected (GitHub Pages Mode - Read Only)");
             document.body.classList.add('static-mode'); // Utile per nascondere robe con CSS
        }
        
        try {
            const fetchUrl = isStatic ? './pages/meta.json' : '/api/pages';
            const pagesResponse = await fetch(fetchUrl);
            
            if (!pagesResponse.ok && !isStatic) {
                // Forse il server Node è spento ma stiamo leggendo il file da browser file://
                isStatic = true;
                const fallbackResponse = await fetch('./pages/meta.json');
                pagesData = await fallbackResponse.json();
            } else {
                 pagesData = await pagesResponse.json();
            }

        } catch (e) {
             console.log("API Fallback: Forcing static mode");
             isStatic = true;
             const fallbackResponse = await fetch('./pages/meta.json');
             pagesData = await fallbackResponse.json();
        }

        const pages = pagesData.pages || [];

        // Controlla se c'è una pagina da ripristinare dopo un reload (es. dopo salvataggio)
        const savedPageId = sessionStorage.getItem('activePageId');
        if (savedPageId) {
            sessionStorage.removeItem('activePageId');
            currentPageId = savedPageId;
        } else if (!currentPageId && pages.length > 0) {
            currentPageId = pages[0].id;
        }

        // 2. Renderizza la barra pagine
        renderPageBar(pages);

        // 3. Click handler per il bottone "+" (Solo in modalità dinamica)
        const addBtn = document.getElementById('page-add-btn');
        if (addBtn) {
            if (isStatic) {
                addBtn.style.display = 'none'; // Nasconde se statico
            } else if (!addBtn._bound) {
                addBtn._bound = true; // evita doppi binding
                addBtn.addEventListener('click', async () => {
                const pageName = await showCustomPrompt('Nuova Pagina', 'Nome della pagina...');
                if (!pageName) return;

                try {
                    const res = await fetch('/api/pages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: pageName.trim() })
                    });
                    const result = await res.json();
                    if (result.success) {
                        // Aggiorna la lista pagine e switcha alla nuova
                        const pagesRes = await fetch('/api/pages');
                        const pagesData = await pagesRes.json();
                        renderPageBar(pagesData.pages || []);
                        switchPage(result.page.id);
                    }
                } catch (err) {
                    console.error('Errore creazione pagina:', err);
                }
            });
        }
        } // This closing brace was missing for the `if (addBtn)` block

        // Se siamo in static mode, nascondiamo anche il bottone principale di aggiunta
        if (isStatic) {
            const mainAddBtn = document.getElementById('add-paper-btn');
            if (mainAddBtn) mainAddBtn.style.display = 'none';
        }

        // 4. Carica i dati della pagina corrente
        const fetchUrl = isStatic ? `./pages/${currentPageId}.json` : `/api/pages/${currentPageId}/data`;
        const response = await fetch(fetchUrl);
        data = await response.json();

        areaColorMap = new Map(
            (data.areas || []).map(a =>
                typeof a === 'object' ? [a.name, a.color] : [a, '#888888']
            )
        );

        inizializzaFiltri(); // Inizializza l'UI adesso che data.areas esiste
        drawMap();
        
        // Se siamo in modalità statica (online), mostra l'etichetta di ultimo aggiornamento
        if (isStatic) {
            fetchLastUpdate();
        }
    } catch (e) {
        console.error("Errore di caricamento dati dal workspace", e);
    }
}

// ==========================================
//   AGGIORNAMENTO IN-PLACE SENZA RELOAD
// ==========================================
async function refreshPage() {
    try {
        // 1. Ferma simulazione e pulisci SVG
        if (simulation) simulation.stop();
        d3.select('#map-container svg').remove();

        // 2. Ricarica i dati della pagina corrente
        const fetchUrl = isStatic ? `./pages/${currentPageId}.json` : `/api/pages/${currentPageId}/data`;
        const response = await fetch(fetchUrl);
        data = await response.json();

        // 3. Aggiorna la mappa dei colori delle aree
        areaColorMap = new Map(
            (data.areas || []).map(a =>
                typeof a === 'object' ? [a.name, a.color] : [a, '#888888']
            )
        );

        // 4. Aggiorna filtri in alto e ridisegna la mappa
        inizializzaFiltri();
        drawMap();

    } catch (e) {
        console.error('Errore durante il refresh della pagina:', e);
    }
}

// ==========================================
// MODALE CUSTOM (sostituisce prompt/confirm)
// ==========================================
function showCustomPrompt(title, placeholder = '') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-modal-overlay');
        const titleEl = document.getElementById('custom-modal-title');
        const input = document.getElementById('custom-modal-input');
        const okBtn = document.getElementById('custom-modal-ok');
        const cancelBtn = document.getElementById('custom-modal-cancel');

        titleEl.textContent = title;
        input.classList.remove('hidden');
        input.value = '';
        input.placeholder = placeholder;
        okBtn.textContent = 'Conferma';
        okBtn.classList.remove('danger');
        overlay.classList.add('visible');
        setTimeout(() => input.focus(), 50);

        const cleanup = (value) => {
            overlay.classList.remove('visible');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onOk = () => cleanup(input.value.trim() || null);
        const onCancel = () => cleanup(null);
        const onKey = (e) => {
            if (e.key === 'Enter') onOk();
            if (e.key === 'Escape') onCancel();
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKey);
    });
}

function showCustomConfirm(title, message, { danger = false, okText = 'Conferma', cancelText = 'Annulla' } = {}) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-modal-overlay');
        const titleEl = document.getElementById('custom-modal-title');
        const bodyEl = document.getElementById('custom-modal-body');
        const input = document.getElementById('custom-modal-input');
        const okBtn = document.getElementById('custom-modal-ok');
        const cancelBtn = document.getElementById('custom-modal-cancel');

        titleEl.textContent = title;
        bodyEl.innerHTML = message || '';
        input.classList.add('hidden');
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;
        okBtn.classList.toggle('danger', danger);
        overlay.classList.add('visible');
        setTimeout(() => okBtn.focus(), 50);

        const cleanup = (value) => {
            overlay.classList.remove('visible');
            bodyEl.innerHTML = '';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onKey = (e) => {
            if (e.key === 'Enter') onOk();
            if (e.key === 'Escape') onCancel();
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('keydown', onKey);
    });
}

// Popola la barra Dynamic Pills in basso
function renderPageBar(pages) {
    const tabsContainer = document.getElementById('page-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    pages.forEach((page, index) => {
        const pill = document.createElement('div');
        pill.className = 'page-pill' + (page.id === currentPageId ? ' active' : '');
        pill.dataset.pageId = page.id;

        // Numero
        const num = document.createElement('span');
        num.className = 'pill-number';
        num.textContent = (index + 1);
        pill.appendChild(num);

        // Nome (espandibile)
        const name = document.createElement('span');
        name.className = 'pill-name';
        name.textContent = page.name;
        pill.appendChild(name);

        if (!isStatic) {
            // Input rinomina (nascosto) - solo se dinamico
            const renameInput = document.createElement('input');
            renameInput.type = 'text';
            renameInput.className = 'pill-rename-input';
            renameInput.value = page.name;
            pill.appendChild(renameInput);

            // Bottone X (eliminazione) - solo se dinamico
            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'pill-delete';
            deleteBtn.textContent = '✕';
            pill.appendChild(deleteBtn);
        }

        tabsContainer.appendChild(pill);
    });

    // Registra gli event listener UNA SOLA VOLTA
    if (!tabsContainer._bound) {
        tabsContainer._bound = true;

        // --- Click handler sulle pillole (cambio pagina) ---
        tabsContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.page-pill');
            if (!pill) return;
            if (e.target.classList.contains('pill-delete')) return;
            if (e.target.classList.contains('pill-rename-input')) return;

            const newPageId = pill.dataset.pageId;
            if (newPageId === currentPageId) return;
            switchPage(newPageId);
        });

        // --- Doppio click: rinomina inline ---
        tabsContainer.addEventListener('dblclick', (e) => {
            if (isStatic) return; // Disabilita in modalità read-only
            
            const pill = e.target.closest('.page-pill');
            if (!pill || !pill.classList.contains('active')) return;

            const nameSpan = pill.querySelector('.pill-name');
            const input = pill.querySelector('.pill-rename-input');
            if (!nameSpan || !input) return;

            nameSpan.style.display = 'none';
            input.classList.add('visible');
            input.value = nameSpan.textContent;
            input.focus();
            input.select();

            const saveRename = async () => {
                const newName = input.value.trim();
                input.classList.remove('visible');
                nameSpan.style.display = '';

                if (!newName || newName === nameSpan.textContent) return;

                try {
                    await fetch(`/api/pages/${pill.dataset.pageId}/rename`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName })
                    });
                    nameSpan.textContent = newName;
                } catch (err) {
                    console.error('Errore rinomina:', err);
                }
            };

            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
                if (ev.key === 'Escape') { input.value = nameSpan.textContent; input.blur(); }
            }, { once: false });

            input.addEventListener('blur', saveRename, { once: true });
        });

        // --- Click sulla X: elimina pagina ---
        tabsContainer.addEventListener('click', async (e) => {
            if (isStatic) return; // Disabilita in modalità read-only
            
            if (!e.target.classList.contains('pill-delete')) return;
            const pill = e.target.closest('.page-pill');
            if (!pill) return;

            const pageId = pill.dataset.pageId;
            const pageName = pill.querySelector('.pill-name')?.textContent || pageId;

            const confirmed = await showCustomConfirm(
                'Elimina Pagina',
                `Sei sicuro di voler eliminare <strong>"${pageName}"</strong>?<br>Tutti i dati della pagina verranno persi.`,
                { danger: true, okText: 'Elimina' }
            );
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/pages/${pageId}`, { method: 'DELETE' });
                const result = await res.json();

                if (result.success) {
                    if (pageId === currentPageId) {
                        const firstPage = result.remainingPages[0];
                        renderPageBar(result.remainingPages);
                        switchPage(firstPage.id);
                    } else {
                        renderPageBar(result.remainingPages);
                    }
                } else {
                    alert(result.error || 'Errore nell\'eliminazione');
                }
            } catch (err) {
                console.error('Errore eliminazione pagina:', err);
            }
        });
    }
}

// Cambia pagina con transizione fade
async function switchPage(newPageId) {
    const mapContainer = document.getElementById('map-container');

    // 0. Chiudi sidebar e info panel se aperti
    const sidebar = document.getElementById('paper-list-sidebar');
    if (sidebar) sidebar.classList.remove('open');

    const infoPanel = document.getElementById('info-panel');
    if (infoPanel && infoPanel.classList.contains('visible')) {
        infoPanel.classList.remove('visible');
        infoPanel.classList.remove('dark-theme');
        setTimeout(() => { if (!infoPanel.classList.contains('visible')) infoPanel.style.display = 'none'; }, 400);
    }

    // 1. Fade out
    mapContainer.classList.add('fade-out');

    // 2. Aspetta la fine della transizione CSS (300ms)
    await new Promise(resolve => setTimeout(resolve, 320));

    // 3. Aggiorna pageId e carica nuovi dati
    currentPageId = newPageId;

    try {
        const fetchUrl = isStatic ? `./pages/${currentPageId}.json` : `/api/pages/${currentPageId}/data`;
        const response = await fetch(fetchUrl);
        data = await response.json();

        areaColorMap = new Map(
            (data.areas || []).map(a =>
                typeof a === 'object' ? [a.name, a.color] : [a, '#888888']
            )
        );

        // 4. Ridisegna la mappa (drawMap pulisce il vecchio SVG)
        drawMap();
        inizializzaFiltri();

        // 5. Aggiorna le pillole (evidenzia quella attiva)
        document.querySelectorAll('.page-pill').forEach(p => {
            p.classList.toggle('active', p.dataset.pageId === currentPageId);
        });

    } catch (e) {
        console.error("Errore nel caricamento della pagina:", e);
    }

    // 6. Fade in
    mapContainer.classList.remove('fade-out');
}


// helper: restituisce il colore dell'area dato il nome
const getAreaColor = (areaName) => areaColorMap.get(areaName) || '#888888';

function drawMap() {
    // Se è chiamato su un cambio pagina, puliamo il vecchio svg prima di ridisegnare
    if (simulation) simulation.stop();
    d3.select("#map-container svg").remove();

    // 1. PREPARAZIONE DATI
    nodes = [
        ...data.keywords.map(d => ({ ...d, type: 'keyword' })),
        ...data.papers.map(d => ({ ...d, type: 'paper' })),
        ...(data.caseStudies || []).map(d => ({ ...d, type: 'casestudy' }))
    ];

    const validLinks = data.links.filter(l => {
        const sourceId = l.paper || l.caseStudy || l.source;
        const targetId = l.keyword || l.target;
        return nodes.find(n => n.id === sourceId) && nodes.find(n => n.id === targetId);
    });

    links = validLinks.map(d => ({
        source: d.paper || d.caseStudy,
        target: d.keyword
    }));

    const emptyPlaceholder = document.getElementById('empty-page-placeholder');
    if (nodes.length === 0) {
        if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
    } else {
        if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');
        // Pre-posizionamento a cerchio molto largo per un esplosione iniziale ariosa
        nodes.forEach((d, i) => {
            const angle = (i / nodes.length) * 2 * Math.PI;
            const radius = 800; // Distribuzione iniziale gigante
            d.x = width / 2 + Math.cos(angle) * radius;
            d.y = height / 2 + Math.sin(angle) * radius;
        });
    }

    // 2. SETUP SVG
    svg = d3.select("#map-container").append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("background-color", "transparent")
        .style("position", "absolute")
        .style("top", 0)
        .style("left", 0)
        .style("z-index", 1)
        .style("touch-action", "none");

    mainGroup = svg.append("g");

    // 3. ZOOM (Aggiornato per partire dezommato)
    zoom = d3.zoom()
        .scaleExtent([0.1, 8])
        .on("zoom", (event) => {
            currentScale = event.transform.k;
            mainGroup.attr("transform", event.transform);
            // Muove il dot grid insieme al canvas
            svg.select("#dot-pattern").attr("patternTransform", event.transform);
            updateLabelsScale(); // Mantiene le etichette della stessa dimensione
        });

    svg.call(zoom).on("dblclick.zoom", null); // Disabilita lo zoom al doppio click per non interferire
    // 4. FILTRI GOOEY (Versione High-Contrast per bordi netti)
    defs = svg.append("defs");


    // --- DOT GRID PATTERN (segue il pan/zoom del canvas) ---
    const dotPattern = defs.append("pattern")
        .attr("id", "dot-pattern")
        .attr("width", 28)
        .attr("height", 28)
        .attr("patternUnits", "userSpaceOnUse");
    dotPattern.append("circle")
        .attr("cx", 14)
        .attr("cy", 14)
        .attr("r", 1)
        .attr("fill", "rgba(0,0,0,0.25)");

    // Rettangolo di sfondo che "indossa" il pattern
    svg.insert("rect", ":first-child")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("fill", "url(#dot-pattern)");

    // --- RADIAL GRADIENT per effetto calore (heat glow B&W) ---
    const heatGradient = defs.append("radialGradient")
        .attr("id", "heat-glow")
        .attr("cx", "50%").attr("cy", "50%")
        .attr("r", "50%");
    heatGradient.append("stop")
        .attr("offset", "0%")
        .attr("class", "heat-stop-center")
        .attr("stop-color", "rgba(0,0,0,0.30)");
    heatGradient.append("stop")
        .attr("offset", "100%")
        .attr("class", "heat-stop-edge")
        .attr("stop-color", "rgba(0,0,0,0)");

    // --- FILTRO GOOEY STROKE (per effetto Cluster a Colori) ---
    // Questo filtro prende i cerchi pieni, ammorbidisce i bordi unendoli (Gooey), e poi ne estrae solo il contorno (Stroke)
    const clusterStrokeFilter = defs.append("filter").attr("id", "cluster-stroke");
    clusterStrokeFilter.append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", "20") // Sfocatura ampia per unire i cerchi
        .attr("result", "blur");
    clusterStrokeFilter.append("feColorMatrix")
        .attr("in", "blur")
        .attr("mode", "matrix")
        .attr("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 60 -15") // Taglio netto per creare forma solida unita
        .attr("result", "gooey");
    // Estrae il bordo espandendo leggermente (erode inverso) e sottraendo l'originale
    clusterStrokeFilter.append("feMorphology")
        .attr("in", "gooey")
        .attr("operator", "dilate")
        .attr("radius", "5") // Spessore del bordo aumentato a 5px
        .attr("result", "dilated");
    clusterStrokeFilter.append("feComposite")
        .attr("in", "dilated")
        .attr("in2", "gooey")
        .attr("operator", "out"); // Sottrae l'interno, lasciando solo la stroke esterna

    // Filtro per la macchia NERA
    const blackFilter = defs.append("filter").attr("id", "gooey-black");
    blackFilter.append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", "15")
        .attr("result", "blur");
    blackFilter.append("feColorMatrix")
        .attr("in", "blur")
        .attr("mode", "matrix")
        // Abbiamo alzato 25 a 80 (contrasto estremo) e -9 a -20 (taglio netto)
        .attr("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 80 -20");

    // Filtro per l'anello BIANCO
    const whiteFilter = defs.append("filter").attr("id", "gooey-white");
    whiteFilter.append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", "18")
        .attr("result", "blur");
    whiteFilter.append("feColorMatrix")
        .attr("in", "blur")
        .attr("mode", "matrix")
        // Stesso trattamento per l'anello esterno
        .attr("values", "1 0 0 0 1  0 1 0 0 1  0 0 1 0 1  0 0 0 80 -20");

    // 5. MOTORE FISICO
    simulation = d3.forceSimulation(nodes)
        .alpha(1)            // Alta energia iniziale per separare tutto
        .alphaDecay(0.015)   // Raffreddamento più lento (default 0.0228) per dare tempo di sbrogliarsi
        .force("link", d3.forceLink(links).id(d => d.id)
            .distance(l => {
                // Controlliamo se il paper ha più di un link (è un ponte)
                const paperId = l.source.id || l.source;
                const linkCount = data.links.filter(link => (link.paper || link.caseStudy) === paperId).length;
                // Aumentata distanza per far respirare i nodi
                return linkCount > 1 ? 280 : 150;
            })
            .strength(l => {
                const paperId = l.source.id || l.source;
                const linkCount = data.links.filter(link => (link.paper || link.caseStudy) === paperId).length;
                // Resa la molla dei nodi terminali più morbida (da 1 a 0.5) per un'espansione organica
                return linkCount > 1 ? 0.3 : 0.5;
            }))
        // Repulsione estrema: Keyword isolate lontanissime (-6000), Paper leggermente più slegati (-250)
        .force("charge", d3.forceManyBody().strength(d => d.type === 'keyword' ? -6000 : -250))
        // Gravità: invece di un centro rigido, una forza debole (0.02) che li richiama al centro, permettendo l'espansione
        .force("x", d3.forceX(width / 2).strength(0.02))
        .force("y", d3.forceY(height / 2).strength(0.02))

        .force("collision", d3.forceCollide().radius(d => {
            if (d.type === 'keyword') return 160; // Aumentato leggermente il raggio di parata (140->160)
            return 45; // Raggio Gooey effect per Paper
        }))

    // 6. DISEGNO ELEMENTI

    // --- HEAT GLOW / CLUSTER STROKE LAYER (sotto tutto) ---
    // Creiamo un gruppo contenitore principale
    const heatGlowContainer = mainGroup.append("g").attr("id", "heat-glow-container");
    
    // Per gestire il filtro SVG stroke clusterizzato correttamente, dobbiamo raggruppare i cerchi per colore.
    // L'SVG applicherà il filtro individualmente ad ogni gruppo, fondendo solo i cerchi dello stesso colore.
    const areasList = Array.from(areaColorMap.keys());
    areasList.push("none"); // per eventuali paper senza area

    // Creiamo un gruppo filtrato per OGNI area tematica (più uno non filtrato per la modalità B&W)
    heatCircles = heatGlowContainer.append("g")
        .attr("id", "heat-glow-group-bw")
        .selectAll("circle")
        .data(nodes.filter(d => d.type === 'paper'))
        .enter().append("circle")
        .attr("class", "heat-circle-bw")
        .attr("r", 110)
        .attr("fill", "url(#heat-glow)")
        .style("pointer-events", "none");

    // Modalità Colori: Layer differenziati per Area
    areasList.forEach(areaName => {
        const safeId = "heat-glow-color-" + areaName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const areaColor = getAreaColor(areaName);
        
        heatGlowContainer.append("g")
            .attr("id", safeId)
            .attr("class", "heat-glow-color-group")
            .attr("filter", "url(#cluster-stroke)") // Applica il filtro metaball stroke a questo gruppo!
            .style("opacity", 0) // Nascosti di default finché il toggle non si accende
            .style("pointer-events", "none")
            .selectAll("circle")
            .data(nodes.filter(d => d.type === 'paper' && (d.area === areaName || (!d.area && areaName === "none"))))
            .enter().append("circle")
            .attr("class", "heat-circle-color")
            .attr("r", 50) // Raggio ridotto a 50
            .attr("fill", areaColor); // Il colore base da cui il filtro SVG estrae la stroke
    });

    linkElements = mainGroup.append("g")
        .selectAll("line").data(links.filter(l => {
            const count = data.links.filter(link => (link.paper || link.caseStudy) === (l.source.id || l.source)).length;
            return count > 1;
        })).enter().append("line")
        .attr("stroke", "#555555").attr("stroke-width", 1.5).attr("stroke-dasharray", "4,4");

    // Aggiungi un ID ai gruppi per selezionarli facilmente
    whiteBlobs = mainGroup.append("g")
        .attr("id", "white-blobs-group") // <--- Aggiungi questo
        .attr("filter", "url(#gooey-white)")
        .selectAll("circle").data(nodes.filter(d => d.type === 'paper')).enter().append("circle")
        .attr("r", 45).attr("fill", "white");

    blackBlobs = mainGroup.append("g")
        .attr("id", "black-blobs-group")
        .attr("filter", "url(#gooey-black)")
        .selectAll("circle").data(nodes.filter(d => d.type === 'paper')).enter().append("circle")
        .attr("r", 35).attr("fill", "black");

    // --- DIAMOND NODES (Casi Studio - No Gooey) ---
    whiteDiamondBlobs = mainGroup.append("g")
        .attr("id", "white-diamonds-group")
        .selectAll("rect").data(nodes.filter(d => d.type === 'casestudy')).enter().append("rect")
        .attr("width", 24).attr("height", 24).attr("x", -12).attr("y", -12)
        .attr("fill", "white")
        .style("opacity", 0.2); // Un leggero sotto-velo di luce

    blackDiamondBlobs = mainGroup.append("g")
        .attr("id", "black-diamonds-group")
        .selectAll("rect").data(nodes.filter(d => d.type === 'casestudy')).enter().append("rect")
        .attr("width", 20).attr("height", 20).attr("x", -10).attr("y", -10)
        .attr("fill", "black")
        .style("opacity", 0.4);

    paperGroups = mainGroup.append("g")
        .selectAll("g.paper-group").data(nodes.filter(d => d.type === 'paper')).enter().append("g")
        .attr("class", "paper-group")
        .style("cursor", "pointer")
        .on("click", handleNodeClick)

    // Area Hit invisibile slargata (30px)
    paperGroups.append("circle")
        .attr("class", "hit-area")
        .attr("r", 30)
        .attr("fill", "transparent");

    // Cerchio Visibile
    paperGroups.append("circle")
        .attr("class", "paper-node")
        .attr("r", 12)
        .attr("fill", "white");

    paperGroups
        .on("mouseover", (event, d) => {
            const details = [];
            if (d.author) details.push(d.author);
            if (d.year) details.push(d.year);
            const areaColor = getAreaColor(d.area);

            d3.select("#tooltip")
                .style("opacity", 1)
                .style("transform", "scale(1)")
                .classed("dark-theme", false) // Assicura che sia tema chiaro per i paper
                .html(`
                <div class="tooltip-title">${d.title || d.label}</div>
                ${details.length ? `<div class="tooltip-meta">${details.join(" · ")}</div>` : ''}
                ${d.area ? `<div class="tooltip-area"><span class="tooltip-dot" style="background:${areaColor}"></span>${d.area}</div>` : ''}
            `);

            // Aggiungi highlight ai link connessi
            mainGroup.selectAll("line").filter(l => (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id)
                .classed("hovered-link", true);
        })
        .on("mousemove", (event) => {
            d3.select("#tooltip")
                .style("left", (event.clientX + 15) + "px")
                .style("top", (event.clientY - 15) + "px");
        })
        .on("mouseout", () => {
            d3.select("#tooltip").style("opacity", 0).style("transform", "scale(0.95)");
            mainGroup.selectAll("line").classed("hovered-link", false);
        });

    // --- CASE STUDY GROUPS (Diamond Nodes) ---
    caseStudyGroups = mainGroup.append("g")
        .selectAll("g.casestudy-group").data(nodes.filter(d => d.type === 'casestudy')).enter().append("g")
        .attr("class", "casestudy-group")
        .style("cursor", "pointer")
        .on("click", handleNodeClick)

    caseStudyGroups.append("circle")
        .attr("class", "hit-area")
        .attr("r", 30)
        .attr("fill", "transparent");

    caseStudyGroups.append("rect")
        .attr("class", "casestudy-node")
        .attr("width", 24).attr("height", 24)
        .attr("x", -12).attr("y", -12)
        .attr("fill", "#111"); // Parte scura come da richiesta

    caseStudyGroups
        .on("mouseover", (event, d) => {
            const details = [];
            if (d.author) details.push(d.author);
            if (d.year) details.push(d.year);
            const areaColor = getAreaColor(d.area);

            d3.select("#tooltip")
                .style("opacity", 1)
                .style("transform", "scale(1)")
                .classed("dark-theme", true) // Tema scuro per i casi studio
                .html(`
                <div class="tooltip-title">◇ ${d.title || d.label}</div>
                ${details.length ? `<div class="tooltip-meta">${details.join(" · ")}</div>` : ''}
                ${d.area ? `<div class="tooltip-area"><span class="tooltip-dot" style="background:${areaColor}"></span>${d.area}</div>` : ''}
            `);

            mainGroup.selectAll("line").filter(l => (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id)
                .classed("hovered-link", true);
        })
        .on("mousemove", (event) => {
            d3.select("#tooltip")
                .style("left", (event.clientX + 15) + "px")
                .style("top", (event.clientY - 15) + "px");
        })
        .on("mouseout", () => {
            d3.select("#tooltip")
                .style("opacity", 0)
                .style("transform", "scale(0.95)")
                .classed("dark-theme", false); // Rimuovi reset classe scura
            mainGroup.selectAll("line").classed("hovered-link", false);
        });

    keywordGroups = mainGroup.append("g")
        .selectAll("g").data(nodes.filter(d => d.type === 'keyword')).enter().append("g")
        .attr("class", "label-group").style("cursor", "grab")
        .on("click", handleNodeClick)
        // --- AGGIUNGI DA QUI ---
        .on("mouseover", (event, d) => {
            const areaColor = getAreaColor(d.area);
            const paperCount = links.filter(l => (l.target.id || l.target) === d.id).length;

            d3.select("#tooltip")
                .style("opacity", 1)
                .style("transform", "scale(1)")
                .html(`
                <div class="tooltip-title">${d.label}</div>
                <div class="tooltip-meta">${paperCount} paper collegati</div>
                ${d.area ? `<div class="tooltip-area"><span class="tooltip-dot" style="background:${areaColor}"></span>${d.area}</div>` : ''}
            `);

            mainGroup.selectAll("line").filter(l => (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id)
                .classed("hovered-link", true);
        })
        .on("mousemove", (event) => {
            d3.select("#tooltip")
                .style("left", (event.clientX + 15) + "px")
                .style("top", (event.clientY - 15) + "px");
        })
        .on("mouseout", () => {
            d3.select("#tooltip").style("opacity", 0).style("transform", "scale(0.95)");
            mainGroup.selectAll("line").classed("hovered-link", false);
        })
        .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended));

    // Hit area invisibile slargata
    keywordGroups.append("rect").attr("class", "hit-area").attr("fill", "transparent");

    // Rettangolo visivo
    keywordGroups.append("rect")
        .attr("class", "keyword-bg")
        .attr("fill", "black")
        .attr("stroke", "transparent")
        .attr("stroke-width", 2)
        .attr("rx", 10);
    keywordGroups.append("text")
        .attr("class", "keyword-text")
        .attr("text-anchor", "middle")
        .attr("dy", ".35em")
        .attr("fill", "white")
        .style("font-family", "'JetBrains Mono', monospace")
        .style("font-size", "13px");

    // 7. FUNZIONI DI AGGIORNAMENTO
    function updateLabelsScale() {
        keywordGroups.attr("transform", d => `translate(${d.x},${d.y}) scale(${1 / currentScale})`);
        // Aggiorna le dimensioni dei rettangoli in base al testo
        keywordGroups.each(function (d) {
            const g = d3.select(this);
            const textNode = g.select("text").text(d.label).node();
            const bbox = textNode.getBBox();
            const baseWidth = bbox.width + 20;
            const baseHeight = 30;

            // Rettangolo visibile
            g.select("rect.keyword-bg")
                .attr("width", baseWidth)
                .attr("height", baseHeight)
                .attr("x", -baseWidth / 2)
                .attr("y", -15);

            // Area Hit invisibile (più grande)
            g.select("rect.hit-area")
                .attr("width", baseWidth + 40)
                .attr("height", baseHeight + 40)
                .attr("x", -(baseWidth + 40) / 2)
                .attr("y", -(baseHeight + 40) / 2);
        });
    }

    function handleNodeClick(event, d) {
        if (event) event.stopPropagation();
        
        // Passa la palla alla funzione logica che non dipende dai click del mouse
        selectAndHighlightNode(d);
    }

    // Funzione disaccoppiata dall'evento DOM per evidenziare un nodo e aprire il pannello
    function selectAndHighlightNode(d) {
        if (!d || !d.id) return;

        const transition = d3.transition().duration(500);

        // 1. Reset classi "Selezionato"
        mainGroup.selectAll(".paper-group, .casestudy-group").classed("selected-node", false);
        mainGroup.selectAll(".label-group").classed("selected-keyword", false);

        // 2. Applica Rosa al nodo interessato cercando nel DOM SVG
        const element = mainGroup.selectAll(".label-group, .paper-group, .casestudy-group")
            .filter(nodeData => String(nodeData.id) === String(d.id));

        if (!element.empty()) {
            if (d.type === 'paper' || d.type === 'casestudy') {
                element.classed("selected-node", true);
            } else {
                element.classed("selected-keyword", true);
            }
        }

        // 3. Identifica i nodi connessi
        const connectedIds = new Set([String(d.id)]);
        links.forEach(l => {
            const s = String(l.source.id || l.source);
            const t = String(l.target.id || l.target);
            if (s === String(d.id)) connectedIds.add(t);
            if (t === String(d.id)) connectedIds.add(s);
        });

        // 4. Gestione Opacità e Animazioni (Versione Ottimizzata)

        // Selezioniamo tutti gli elementi della mappa
        const allVisuals = mainGroup.selectAll(".label-group, .paper-group, .casestudy-group, line, #white-blobs-group circle, #black-blobs-group circle, #white-diamonds-group rect, #black-diamonds-group rect, #heat-glow-group-bw, .heat-glow-color-group");

        // A. Reset totale: abbassiamo opacità di tutto e spegniamo i flussi rosa precedenti
        allVisuals.transition(transition)
            .style("opacity", function() {
                const group = d3.select(this);
                if (group.classed("heat-glow-color-group")) return 0;
                if (group.attr("id") === "heat-glow-group-bw") return 0;
                return 0.1;
            });
            
        mainGroup.selectAll("line").classed("focused-link", false);

        // B. Accendiamo i nodi connessi (Paper e Keyword)
        mainGroup.selectAll(".label-group, .paper-group, .casestudy-group")
            .filter(node => node && node.id && connectedIds.has(String(node.id)))
            .transition(transition)
            .style("opacity", 1);

        // C. Accendiamo e ANIMIAMO le linee che collegano i nodi interessati
        mainGroup.selectAll("line")
            .filter(l => {
                const s = l.source.id || l.source;
                const t = l.target.id || l.target;
                return (s === d.id || t === d.id) && (connectedIds.has(s) && connectedIds.has(t));
            })
            .classed("focused-link", true) // Attiva il rosa e l'animazione @keyframes flow del CSS
            .transition(transition)
            .style("opacity", 1);

        // D. Accendiamo le macchie "Gooey" (Blobs) sotto i nodi connessi
        mainGroup.selectAll("#white-blobs-group circle, #black-blobs-group circle, #white-diamonds-group rect, #black-diamonds-group rect, .heat-circle-bw, .heat-circle-color")
            .filter(node => node && node.id && connectedIds.has(node.id))
            .transition(transition)
            .style("opacity", 1);

        // 5. Apri il pannello laterale
        openPanel(d);
    }

    function focusOnNode(nodeId) {
        // Trova i dati del nodo assicurandoti che i tipi di ID (numero/stringa) combacino
        const targetNode = nodes.find(n => String(n.id) === String(nodeId));
        if (!targetNode) {
            console.warn("focusOnNode: Nodo non trovato per ID", nodeId);
            return;
        }

        // L'offset proporzionale sposta il punto di centratura verso sinistra
        // per bilanciare il pannello info aperto a destra (universale su qualsiasi risoluzione)
        const infoPanelOffset = window.innerWidth * 0.12; // ~12vw = metà del pannello info
        const scale = 0.8;
        const x = (width / 2 - infoPanelOffset) - targetNode.x * scale;
        const y = height / 2 - targetNode.y * scale;

        // Transizione fluida della camera
        svg.transition()
            .duration(1000)
            .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));

        // Evidenziazione visiva e apertura pannello diretta tramite logica scorporata (senza mock event)
        selectAndHighlightNode(targetNode);
    }

    function openPanel(d) {
        const p = d3.select("#info-panel");

        // --- DARK THEME TOGGLE PER CASI STUDIO ---
        if (d.type === 'casestudy') {
            p.classed("dark-theme", true);
        } else {
            p.classed("dark-theme", false);
        }

        // 1. Titolo e Descrizione
        const titlePrefix = d.type === 'casestudy' ? '◇ ' : '';
        p.select("#info-title").text(titlePrefix + (d.title || d.label || "Senza Titolo"));

        // Parse del Markdown via Marked.js invece del testo semplice
        if (d.info) {
            // Opzionale: Configura Marked per supportare a capo automatici come fa pre-wrap
            marked.setOptions({ breaks: true });
            p.select("#info-desc").html(marked.parse(d.info));
        } else {
            p.select("#info-desc").html("<i>Nessuna descrizione disponibile.</i>");
        }

        const areaElem = p.select("#info-area");
        areaElem.html(""); // Pulisce sempre il contenuto precedente

        // 2. LOGICA DIFFERENZIATA
        if (d.type === 'paper' || d.type === 'casestudy') {
            // --- COMPORTAMENTO PER PAPER E CASI STUDIO ---
            const connectedKeywords = links
                .filter(l => (l.source.id || l.source) === d.id)
                .map(l => {
                    const targetId = l.target.id || l.target;
                    return nodes.find(n => n.id === targetId);
                });

            connectedKeywords.forEach((kw, i) => {
                if (!kw) return;
                areaElem.append("span")
                    .text(kw.label.toUpperCase())
                    .style("cursor", "pointer")
                    .style("text-decoration", "underline")
                    .on("click", (event) => {
                        event.stopPropagation();
                        focusOnNode(kw.id);
                    });

                if (i < connectedKeywords.length - 1) {
                    areaElem.append("span").text(" • ").style("cursor", "default").style("text-decoration", "none");
                }
            });
            areaElem.style("color", "#888").style("font-size", "0.7rem");

            // Pallino colorato dell'area del paper sotto le keywords
            if (d.area) {
                const areaColor = getAreaColor(d.area);
                const areaDotRow = p.select("#info-area").append("div")
                    .style("display", "flex")
                    .style("align-items", "center")
                    .style("gap", "6px")
                    .style("margin-top", "6px")
                    .style("text-decoration", "none");
                areaDotRow.append("span")
                    .style("width", "8px")
                    .style("height", "8px")
                    .style("border-radius", "50%")
                    .style("background", areaColor)
                    .style("flex-shrink", "0")
                    .style("display", "inline-block");
                areaDotRow.append("span")
                    .text(d.area.toUpperCase())
                    .style("color", areaColor)
                    .style("font-size", "0.65rem")
                    .style("letter-spacing", "1px")
                    .style("text-decoration", "none");
            }

        } else {
            // --- COMPORTAMENTO PER LE KEYWORD E AREE ---
            if (d.area) {
                const areaColor = getAreaColor(d.area);
                areaElem.html("")
                    .style("display", "flex")
                    .style("align-items", "center")
                    .style("gap", "6px")
                    .style("font-size", "0.8rem")
                    .style("text-decoration", "none")
                    .style("cursor", "default");
                areaElem.append("span")
                    .style("width", "9px")
                    .style("height", "9px")
                    .style("border-radius", "50%")
                    .style("background", areaColor)
                    .style("flex-shrink", "0")
                    .style("display", "inline-block");
                areaElem.append("span")
                    .text(`AREA: ${d.area.toUpperCase()}`)
                    .style("color", areaColor);
            } else {
                areaElem.text("").on("click", null);
            }
        }

        // 3. Gestione ANNO (per paper e casi studio)
        const yearElem = p.select("#info-year");
        if ((d.type === 'paper' || d.type === 'casestudy') && d.year) {
            yearElem.text(d.year).style("display", "block");
        } else {
            yearElem.style("display", "none");
        }

        // 4. Gestione LINK
        const linkCont = p.select("#info-link-container");
        linkCont.html("");
        if (d.url) {
            linkCont.append("a")
                .attr("href", d.url)
                .attr("target", "_blank")
                .attr("class", "info-link-btn")
                .text("LINK ↗");
        }

        // 5. Gestione MODIFICA (Mostrato solo se NON è statico)
        const editInfoBtn = d3.select("#edit-info-btn");
        if (isStatic) {
            editInfoBtn.style("display", "none");
        } else {
            editInfoBtn.style("display", "flex");
            editInfoBtn.on("click", (event) => {
                event.stopPropagation();
                closePanel(); // Chiude il pannello info
                openEditModal(d, d.type); // Apre il form di modifica precompilato
            });
        }


        // 5.5 Gestione Galleria Immagini e Lightbox
        const galleryCont = p.select("#info-gallery");
        galleryCont.html(""); // Pulisci vecchie immagini
        if (d.images && d.images.length > 0) {
            d.images.forEach(imgSrc => {
                 // Correzione path immagini per GitHub Pages: se isStatic, trasforma /uploads/.. in ./uploads/..
                 const finalImgSrc = isStatic && imgSrc.startsWith('/uploads/') 
                                     ? '.' + imgSrc 
                                     : imgSrc;
                                     
                galleryCont.append("img")
                    .attr("src", finalImgSrc)
                    .attr("class", "gallery-thumb")
                    .attr("alt", "Miniatura allegato")
                    .on("click", (event) => {
                        event.stopPropagation();
                        const overlay = document.getElementById("lightbox-overlay");
                        const lightboxImg = document.getElementById("lightbox-img");
                        lightboxImg.src = finalImgSrc;
                        overlay.classList.add("show");
                    });
            });
        }

        // Aggiungi chiusura Lightbox globale (se non già presente)
        if (!window.lightboxEventsAdded) {
            window.lightboxEventsAdded = true;
            const overlay = document.getElementById("lightbox-overlay");
            const chiudiBtn = document.getElementById("close-lightbox");

            const closeModaleImmagine = () => {
                overlay.classList.remove("show");
            };

            chiudiBtn.addEventListener("click", closeModaleImmagine);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) {
                    closeModaleImmagine();
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlay.classList.contains("show")) {
                    closeModaleImmagine();
                }
            });
        }

        // 6. Visualizzazione
        p.style("display", "block");
        setTimeout(() => {
            p.classed("visible", true);
        }, 10);
    }

    function closePanel() {
        const p = d3.select("#info-panel");
        p.classed("visible", false);
        p.classed("dark-theme", false); // Rimuove il tema scuro alla chiusura

        // AGGIUNGI QUESTA RIGA:
        mainGroup.selectAll("line").classed("focused-link", false);

        mainGroup.selectAll(".label-group, .paper-group, .casestudy-group, line, #white-blobs-group circle, #black-blobs-group circle, #white-diamonds-group rect, #black-diamonds-group rect, .heat-circle-bw, .heat-circle-color")
            .transition().duration(400)
            .style("opacity", 1);

        // 3. Rimuovi lo stato Rosa
        mainGroup.selectAll(".selected-node").classed("selected-node", false);
        mainGroup.selectAll(".selected-keyword").classed("selected-keyword", false);

        // AGGIUNTA: Ripristina i bottoni filtro alla condizione di default "ALL"
        const dynamicFiltersContainer = d3.select("#dynamic-filters");
        dynamicFiltersContainer.selectAll(".filter-btn").classed("active", false);
        dynamicFiltersContainer.select(".filter-btn[data-area='all']").classed("active", true);

        // Resetta la variabile globale del filtro e applica (se la funzione è nel DOM)
        if (typeof currentAreaFilter !== 'undefined') {
            currentAreaFilter = "all";
            // Simuliamo l'applicazione dei filtri incrociati se disponibili nello scope global
            // Per evitare errori di scope, la visibilità dei paper viene già forzata nel blocco opacity qui sopra.
        }

        // 4. Nascondi il display:none solo dopo che la transizione è finita (400ms)
        setTimeout(() => {
            if (!p.classed("visible")) {
                p.style("display", "none");
            }
        }, 400);
    }

    d3.select("#close-panel").on("click", closePanel);
    svg.on("click", (event) => {
        closePanel();
        const sidebar = document.getElementById("paper-list-sidebar");
        if (sidebar) sidebar.classList.remove("open");
    });
    // 9. FISICA E DRAG
    simulation.on("tick", () => {
        linkElements.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        
        // Aggiorna posizione sia dei cerchi B&W che dei cerchi color-stroke
        mainGroup.selectAll(".heat-circle-bw, .heat-circle-color").attr("cx", d => d.x).attr("cy", d => d.y);
        
        whiteBlobs.attr("cx", d => d.x).attr("cy", d => d.y);
        blackBlobs.attr("cx", d => d.x).attr("cy", d => d.y);
        whiteDiamondBlobs.attr("transform", d => `translate(${d.x},${d.y}) rotate(45)`);
        blackDiamondBlobs.attr("transform", d => `translate(${d.x},${d.y}) rotate(45)`);
        paperGroups.attr("transform", d => `translate(${d.x},${d.y})`);
        caseStudyGroups.attr("transform", d => `translate(${d.x},${d.y})`);
        updateLabelsScale();
    });

    // Imposta lo zoom di default fisso più lontano (es. 0.6x)
    // Trasla per centrarlo nello schermo, tenendo conto del rimpicciolimento scale
    const initialTransform = d3.zoomIdentity
        .translate(width / 2 * (1 - 0.6), height / 2 * (1 - 0.6))
        .scale(0.6);

    // Applica subito l'inquadratura iniziale alla mappa senza animazione
    svg.call(zoom.transform, initialTransform);

    d3.select("#reset-view").on("click", () => {
        // 1. Chiude Pannelli per pulizia
        closePanel();
        const sidebar = document.getElementById("paper-list-sidebar");
        if (sidebar) sidebar.classList.remove("open");

        if (!nodes.length) return;

        // 2. Calcola i margini estremi dei Nodi (Bounding Box Dinamico)
        const xMin = d3.min(nodes, d => d.x);
        const xMax = d3.max(nodes, d => d.x);
        const yMin = d3.min(nodes, d => d.y);
        const yMax = d3.max(nodes, d => d.y);

        const graphWidth = xMax - xMin;
        const graphHeight = yMax - yMin;
        const graphCenterX = xMin + graphWidth / 2;
        const graphCenterY = yMin + graphHeight / 2;

        // 3. Calcola Scala ideale con margine (padding) per non stare appiccicati ai bordi
        const padding = 150; // pixel di padding sui lati
        const scaleX = width / (graphWidth + padding * 2);
        const scaleY = height / (graphHeight + padding * 2);

        // Limita lo zoom in massimo a 0.8x
        const scale = Math.min(scaleX, scaleY, 0.8);

        // 4. Centra geometricamente
        const translateX = (width / 2) - (scale * graphCenterX);
        const translateY = (height / 2) - (scale * graphCenterY);

        const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

        svg.transition()
            .duration(1000)
            .ease(d3.easeCubicInOut)
            .call(zoom.transform, transform);
    });

    // (Chiamato in initMap invece che qui per asincronia sicura)

    // Esportiamo le funzioni usate da renderList e dal gestore Escape (fuori dalla closure di drawMap)
    window.focusOnNode = focusOnNode;
    window.openPanel = openPanel;
    window.closePanel = closePanel;
} // <-- FINE DRAWMAP

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) {
    d.fx = event.x; d.fy = event.y;
}
function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
}

// --- LOGICA FILTRI (VERSIONE FINALE TESTATA) ---

// --- LOGICA FILTRI (VERSIONE PULITA E FUNZIONANTE) ---

// --- LOGICA FILTRI (VERSIONE FINALE) ---

function inizializzaFiltri() {
    if (!data) return; // Sicurezza extra se chiamato prima del fetch
    console.log("Sistema filtri & Searchbar inizializzati");

    let currentAreaFilter = "all";
    let currentSearchText = "";

    const searchInput = d3.select("#paper-search");
    const dynamicFiltersContainer = d3.select("#dynamic-filters");
    const selectAreaForm = document.getElementById("new-area");

    // Popola dinamicamente le aree se esistono nel file data.js, altrimenti fallback
    const areas = data.areas || ["Design", "Tech", "Ecology"];

    // Pulisce prima di renderizzare
    dynamicFiltersContainer.html("");
    if (selectAreaForm) selectAreaForm.innerHTML = '<option value="" disabled selected>Seleziona Area</option>';

    // Aggiunge le Aree ai filtri e alla Select del form
    areas.forEach(area => {
        // Recupera il colore dell'area (se è oggetto) o usa un grigio di fallback
        const areaName = typeof area === 'object' ? area.name : area;
        const areaColor = typeof area === 'object' ? (area.color || '#222') : '#222';

        // Filtro Mappa
        dynamicFiltersContainer.append("div")
            .attr("class", "filter-btn")
            .attr("data-area", areaName.toLowerCase())
            .attr("data-color", areaColor)
            .style("--btn-color", areaColor)
            .text(areaName.toUpperCase());

        // Opzione Form
        if (selectAreaForm) {
            const opt = document.createElement("option");
            opt.value = areaName;
            opt.textContent = areaName;
            selectAreaForm.appendChild(opt);
        }
    });

    // Filtro "ALL" di default sempre presente (neutro)
    dynamicFiltersContainer.append("div")
        .attr("class", "filter-btn active")
        .attr("data-area", "all")
        .attr("data-color", "#ffffff")
        .style("--btn-color", "#ffffff")
        .text("ALL");

    // Nascondiamo il color input selector dal drawMap dato che inietta duplicati ogni reload
    if (d3.select(".switch-wrapper").empty()) {
        const switchWrapper = d3.select("body").append("div")
            .attr("class", "switch-wrapper");

        const colorSwitchLabel = switchWrapper.append("label")
            .attr("class", "color-switch")
            .attr("title", "Attiva/Disattiva Colori Aree");

        const colorInput = colorSwitchLabel.append("input")
            .attr("type", "checkbox")
            .attr("id", "color-toggle-input")
            .on("change", function () {
                colorsEnabled = this.checked;
                refreshMapColors();
            });

        colorSwitchLabel.append("span").attr("class", "slider");
    }

    // ========================================================
    // DROPDOWN RICERCA CON NAVIGAZIONE TASTIERA (Passi 4 & 5)
    // ========================================================
    let activeDropdownIndex = -1; // -1 = nessun item selezionato da tastiera

    // Selezione del nodo dropdown dal DOM
    const searchDropdown = d3.select("#search-dropdown");

    // Funzione helper per ottenere un'immagine se presente
    const getThumbnail = (d) => {
        if (d.images && d.images.length > 0) {
            // Correzione path immagini per GitHub Pages
            const imgSrc = d.images[0];
            return isStatic && imgSrc.startsWith('/uploads/') ? '.' + imgSrc : imgSrc;
        }
        return null;
    };

    // Helper per prendere tutti gli item cliccabili del dropdown
    const getDropdownItems = () => Array.from(document.querySelectorAll("#search-dropdown .search-result-item"));

    // Helper per aggiornare lo stile dell'item attivo
    const updateDropdownHighlight = () => {
        getDropdownItems().forEach((el, i) => {
            el.classList.toggle("dropdown-item-active", i === activeDropdownIndex);
            if (i === activeDropdownIndex) el.scrollIntoView({ block: "nearest" });
        });
    };

    // Helper per eseguire la selezione di un item dal dropdown
    const selectDropdownItem = (el) => {
        if (!el) return;
        const itemId = el.getAttribute("data-id");
        const itemType = el.getAttribute("data-type");

        // Chiudi dropdown e resetta search
        searchInput.node().value = "";
        currentSearchText = "";
        applicaFiltriIncrociati();
        searchDropdown.classed("hidden", true);
        activeDropdownIndex = -1;

        // Trova il nodo corrispondente
        const targetNode = nodes.find(n => String(n.id) === String(itemId));
        if (!targetNode) return;

        // Usa la funzione già esistente per fly-to + highlight del nodo on-map
        // (L'apertura dell'info panel è già gestita all'interno di focusOnNode)
        focusOnNode(targetNode.id);
    };

    searchInput.on("input", function () {
        currentSearchText = this.value.toLowerCase().trim();
        activeDropdownIndex = -1; // Reset navigazione ad ogni nuova digitazione
        applicaFiltriIncrociati(); // Mantieni anche il filtro sulla mappa classica

        // LOGICA DROPDOWN
        if (currentSearchText.length === 0) {
            searchDropdown.classed("hidden", true);
            searchDropdown.html(""); // Svuota
            return;
        }

        searchDropdown.classed("hidden", false);

        // Separa i risultati per tipo
        let paperMatches = [];
        let keywordMatches = [];
        let casestudyMatches = [];

        nodes.forEach(d => {
            const searchMatches = [];
            if (d.title) searchMatches.push(d.title.toLowerCase());
            if (d.label) searchMatches.push(d.label.toLowerCase());
            if (d.author) searchMatches.push(d.author.toLowerCase());
            if (d.year) searchMatches.push(String(d.year));

            const isMatch = searchMatches.some(str => str.includes(currentSearchText));

            if (isMatch) {
                if (d.type === 'paper') paperMatches.push(d);
                if (d.type === 'keyword') keywordMatches.push(d);
                if (d.type === 'casestudy') casestudyMatches.push(d);
            }
        });

        // Ordina alfabeticamente per titolo/label
        paperMatches.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        keywordMatches.sort((a, b) => (a.label || "").localeCompare(b.label || ""));

        // Costruisci HTML
        let html = "";

        if (paperMatches.length === 0 && keywordMatches.length === 0 && casestudyMatches.length === 0) {
            html = `<div class="dropdown-no-results">Nessun risultato trovato per "${this.value}"</div>`;
        } else {
            // SEZIONE PAPERS
            if (paperMatches.length > 0) {
                html += `<div class="dropdown-group-title">Papers (${paperMatches.length})</div>`;
                renderResultsGroup(paperMatches, 'paper');
            }

            // SEZIONE CASI STUDIO
            if (casestudyMatches.length > 0) {
                html += `<div class="dropdown-group-title">Casi Studio (${casestudyMatches.length})</div>`;
                renderResultsGroup(casestudyMatches, 'casestudy');
            }

            function renderResultsGroup(matches, type) {
                matches.slice(0, 8).forEach(p => {
                    const areaColor = getAreaColor(p.area);
                    const thumb = getThumbnail(p);
                    const thumbHtml = thumb ? `<img src="${thumb}" class="dropdown-item-thumb" />` : '';

                    const details = [];
                    if (p.author) details.push(p.author);
                    if (p.year) details.push(p.year);
                    const metaText = details.join(" • ");

                    const iconHtml = type === 'casestudy' ? `<span style="color:#888; font-size:1.1rem; margin-right:6px;">◇</span> ` : '';

                    html += `
                        <div class="dropdown-item search-result-item" data-id="${p.id}" data-type="${type}">
                            <div class="dropdown-item-color" style="background-color: ${areaColor}"></div>
                            <div class="dropdown-item-content">
                                <div class="dropdown-item-title">${iconHtml}${p.title || 'Senza Titolo'}</div>
                                <div class="dropdown-item-meta">${metaText}</div>
                            </div>
                            ${thumbHtml}
                        </div>
                    `;
                });
            }

            // SEZIONE KEYWORDS
            if (keywordMatches.length > 0) {
                html += `<div class="dropdown-group-title">Keywords (${keywordMatches.length})</div>`;
                keywordMatches.slice(0, 5).forEach(k => {
                    const paperCount = data.links.filter(l => l.keyword === k.id).length;

                    html += `
                        <div class="dropdown-item search-result-item" data-id="${k.id}" data-type="keyword">
                            <div class="dropdown-item-color" style="background-color: #555; border-radius: 4px;"></div>
                            <div class="dropdown-item-content">
                                <div class="dropdown-item-title">${k.label || 'Senza Nome'}</div>
                                <div class="dropdown-item-meta">${paperCount} paper collegati</div>
                            </div>
                        </div>
                    `;
                });
            }
        }

        searchDropdown.html(`<div class="dropdown-inner">${html}</div>`);

        // Click sugli item → Passo 5: Fly-To e apertura info panel
        searchDropdown.selectAll(".search-result-item").on("click", function (event) {
            event.stopPropagation();
            selectDropdownItem(this);
        });
    });

    // NAVIGAZIONE TASTIERA (↑↓ Invio Esc) - Passo 4
    searchInput.on("keydown", function (event) {
        const items = getDropdownItems();
        if (items.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            activeDropdownIndex = Math.min(activeDropdownIndex + 1, items.length - 1);
            updateDropdownHighlight();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            activeDropdownIndex = Math.max(activeDropdownIndex - 1, -1);
            updateDropdownHighlight();
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (activeDropdownIndex >= 0 && items[activeDropdownIndex]) {
                selectDropdownItem(items[activeDropdownIndex]);
            }
        } else if (event.key === "Escape") {
            searchDropdown.classed("hidden", true);
            activeDropdownIndex = -1;
        }
    });

    // Nascondi dropdown se clicco fuori
    d3.select("body").on("click.dropdown", function (event) {
        if (!event.target.closest('.search-wrapper')) {
            searchDropdown.classed("hidden", true);
            activeDropdownIndex = -1;
        }
    });

    // 2. Ascoltatore Evento Click sui Bottoni Categoria RENDERIZZATI ORA
    dynamicFiltersContainer.selectAll(".filter-btn").on("click", function (event) {
        event.stopPropagation();
        const bottone = d3.select(this);
        currentAreaFilter = bottone.attr("data-area").toLowerCase();
        const activeColor = bottone.attr("data-color") || "#222";

        // Reset tutti i bottoni a stato neutro
        dynamicFiltersContainer.selectAll(".filter-btn")
            .classed("active", false);

        // Imposta stato attivo
        bottone.classed("active", true);

        applicaFiltriIncrociati();
    });

    // 3. Funzione di Update Globale (Categoria + Testo)
    function applicaFiltriIncrociati() {
        const transition = d3.transition().duration(400);

        // Funzione di MATCH POTENZIATA per Categoria + Testo
        const matches = (d) => {
            if (!d) return false;

            // --- CHECK AREA (Filtro Bottoni) ---
            let areaMatch = false;

            if (currentAreaFilter === "all") {
                areaMatch = true;
            } else if (d.type === 'keyword') {
                areaMatch = d.area && d.area.toLowerCase() === currentAreaFilter;
            } else if (d.type === 'paper' || d.type === 'casestudy') {
                if (d.area && d.area.toLowerCase() === currentAreaFilter) {
                    areaMatch = true;
                } else {
                    const connectedKeywordAreas = links
                        .filter(l => (l.source.id || l.source) === d.id)
                        .map(l => {
                            const kID = l.target.id || l.target;
                            const targetNode = nodes.find(n => n.id === kID);
                            return targetNode ? targetNode.area.toLowerCase() : null;
                        });
                    areaMatch = connectedKeywordAreas.includes(currentAreaFilter);
                }
            }

            // Se non passa l'area, escludiamolo subito
            if (!areaMatch) return false;

            // --- CHECK TESTO (Searchbar) ---
            if (currentSearchText === "") return true; // Nessuna ricerca = passa

            const searchMatches = [];
            if (d.title) searchMatches.push(d.title.toLowerCase());
            if (d.label) searchMatches.push(d.label.toLowerCase());
            if (d.author) searchMatches.push(d.author.toLowerCase());
            if (d.year) searchMatches.push(String(d.year));
            if (d.info) searchMatches.push(d.info.toLowerCase());

            // Controlla anche se è collegato a una keyword che fa match col testo (per paper/casestudy)
            if (d.type === 'paper' || d.type === 'casestudy') {
                const connectedKeywordLabels = links
                    .filter(l => (l.source.id || l.source) === d.id)
                    .map(l => {
                        const kID = l.target.id || l.target;
                        const targetNode = nodes.find(n => n.id === kID);
                        return targetNode && targetNode.label ? targetNode.label.toLowerCase() : "";
                    });
                searchMatches.push(...connectedKeywordLabels);
            }

            // Ritorna true se almeno una delle proprietà contiene il testo cercato
            return searchMatches.some(str => str.includes(currentSearchText));
        };

        // APPLICAZIONE OPACITÀ 
        mainGroup.selectAll(".label-group, .paper-group, .casestudy-group")
            .transition(transition)
            .style("opacity", d => matches(d) ? 1 : 0.05)
            .style("pointer-events", d => matches(d) ? "all" : "none");

        // Opacità individuale per ogni blob bianco/nero (collegati al nodo d)
        mainGroup.selectAll("#white-blobs-group circle, #black-blobs-group circle, #white-diamonds-group rect, #black-diamonds-group rect")
            .transition(transition)
            .style("opacity", d => matches(d) ? 1 : 0.05);

        // Opacità per heat-circle B&W singoli (radial gradient sotto i paper)
        mainGroup.selectAll(".heat-circle-bw")
            .transition(transition)
            .style("opacity", d => {
                if (colorsEnabled) return 0; // Nascoste in color mode
                return matches(d) ? 0.30 : 0.05;
            });

        // Opacità per heat-circle Color singoli (cluster stroke sotto i paper)
        mainGroup.selectAll(".heat-circle-color")
            .transition(transition)
            .style("opacity", d => {
                if (!colorsEnabled) return 0; // Nascoste in B&W mode
                return matches(d) ? 1 : 0.05;
            });

        // Opacità dei gruppi contenitore (heat-glow-group-bw e heat-glow-color-group)
        mainGroup.selectAll("#heat-glow-group-bw")
            .transition(transition)
            .style("opacity", colorsEnabled ? 0 : 1);
        mainGroup.selectAll(".heat-glow-color-group")
            .transition(transition)
            .style("opacity", colorsEnabled ? 0.5 : 0);

        mainGroup.selectAll("line")
            .transition(transition)
            .style("opacity", l => {
                const sID = l.source.id || l.source;
                const tID = l.target.id || l.target;
                const sNode = nodes.find(n => n.id === sID);
                const tNode = nodes.find(n => n.id === tID);

                return (matches(sNode) && matches(tNode)) ? 0.8 : 0.05;
            });

        // Chiudi pannello laterale se si cambiano filtri o ricerca per pulire la vista
        const p = d3.select("#info-panel");
        if (p.classed("visible")) {
            p.classed("visible", false);
            setTimeout(() => p.style("display", "none"), 400);

            mainGroup.selectAll(".selected-node").classed("selected-node", false);
            mainGroup.selectAll(".selected-keyword").classed("selected-keyword", false);
            mainGroup.selectAll("line").classed("focused-link", false);
        }
    }

    // Esportiamo la funzione sull'oggetto window per poterla chiamare da fuori (es. da closePanel)
    window.applicaFiltriIncrociatiGlobals = applicaFiltriIncrociati;

    // Funzione interna per aggiornare i colori in base allo stato del toggle
    function refreshMapColors() {
        const transition = d3.transition().duration(200); // Ridotto da 600ms a 200ms per maggiore rapidità

        // 1. Aggiorna i box delle Keyword
        keywordGroups.select(".keyword-bg")
            .transition(transition)
            .attr("fill", d => colorsEnabled ? "white" : "black")
            .attr("stroke", d => colorsEnabled ? getAreaColor(d.area) : "transparent");

        // Aggiorna anche il testo dentro i box (ha la classe .keyword-text)
        keywordGroups.select(".keyword-text")
            .transition(transition)
            .attr("fill", d => colorsEnabled ? "black" : "white");

        // 2. Aggiorna i nodi dei Paper
        paperGroups.select(".paper-node")
            .transition(transition)
            .attr("fill", d => colorsEnabled ? getAreaColor(d.area) : "white");

        // 3. Aggiorna i nodi dei Case Study
        caseStudyGroups.select(".casestudy-node")
            .transition(transition)
            .attr("fill", d => colorsEnabled ? getAreaColor(d.area) : "white");

        // 4. Aggiorna i layer bolle/colore (Stroke Gooey vs B&W Glow) E nascondi Blob
        if (colorsEnabled) {
            // Modalità colori: Nascondi Blobs originali (Bianchi/Neri)
            mainGroup.select("#white-blobs-group").transition(transition).style("opacity", 0);
            mainGroup.select("#black-blobs-group").transition(transition).style("opacity", 0);
            mainGroup.select("#white-diamonds-group").transition(transition).style("opacity", 0);
            mainGroup.select("#black-diamonds-group").transition(transition).style("opacity", 0);

            // Modalità colori: Dissolvenza incrociata tra layer B&W e layer Gruppi SVG filtrati (Stroke)
            mainGroup.select("#heat-glow-group-bw")
                .transition(transition)
                .style("opacity", 0);
                
            mainGroup.selectAll(".heat-glow-color-group")
                .transition(transition)
                .style("opacity", 0.5); // Richiesta dell'utente: opacità 0.5 per le stroke

        } else {
            // Modalità B&W: Ripristina Blobs originali
            mainGroup.select("#white-blobs-group").transition(transition).style("opacity", 1);
            mainGroup.select("#black-blobs-group").transition(transition).style("opacity", 1);
            mainGroup.select("#white-diamonds-group").transition(transition).style("opacity", 1);
            mainGroup.select("#black-diamonds-group").transition(transition).style("opacity", 1);

            // Modalità B&W: Dissolvenza incrociata opposta
            mainGroup.select("#heat-glow-group-bw")
                .transition(transition)
                .style("opacity", 1);
                
            mainGroup.selectAll(".heat-glow-color-group")
                .transition(transition)
                .style("opacity", 0);
        }
    }
}


setTimeout(inizializzaFiltri, 300);

// ==========================================
//    LOGICA AGGIUNTA E MODIFICA (Universale)
// ==========================================

const addBtn = document.getElementById("add-paper-btn");
const modal = document.getElementById("add-paper-modal");
const closeModalBtn = document.getElementById("close-modal");
const entityForm = document.getElementById("add-paper-form");
const keywordsContainer = document.getElementById("new-keywords-container");
const segmentedRadios = document.querySelectorAll('input[name="entity-type"]');

// Switch logic del Segmented Control
segmentedRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const newMode = e.target.value;
        const isPaper = newMode === 'paper';
        const isCaseStudy = newMode === 'casestudy';
        const isKw = newMode === 'keyword';
        const isArea = newMode === 'area';

        // 1. Inizia il Fade Out (Pure Dissolve)
        entityForm.classList.add('switching-mode');

        // 2. Aspetta che il form sia completamente trasparente (200ms in CSS)
        setTimeout(() => {
            // 3. CAMBIO STATO (Mentre il form è invisibile)
            entityForm.setAttribute('data-mode', newMode);
            document.getElementById('add-paper-modal').setAttribute('data-mode', newMode);

            // Regolazione required dinamica
            document.getElementById("new-author").required = isPaper;
            document.getElementById("new-year").required = isPaper || isCaseStudy;
            document.getElementById("new-area").required = isPaper || isCaseStudy || isKw;

            if (isKw || isArea) {
                renderAdminChips(newMode);
            }

            // 4. Piccolo buffer per permettere al browser di ricalcolare il layout prima di riapparire
            setTimeout(() => {
                entityForm.classList.remove('switching-mode'); // Inizia il Fade In
            }, 50);

        }, 200);
    });
});
// Imposta lo stato CSS iniziale al caricamento JS
entityForm.setAttribute('data-mode', 'paper');
document.getElementById('add-paper-modal').setAttribute('data-mode', 'paper');

// Popola le checkbox delle Keyword dinamicamente in base ai dati esistenti
function populateKeywordsForm() {
    keywordsContainer.innerHTML = '';
    data.keywords.forEach(kw => {
        const labelElem = document.createElement('label');
        labelElem.className = 'keyword-checkbox-label';

        const inputElem = document.createElement('input');
        inputElem.type = 'checkbox';
        inputElem.value = kw.id;

        // Listener per commutare l'aspetto Chip
        inputElem.addEventListener('change', (e) => {
            if (e.target.checked) labelElem.classList.add('selected');
            else labelElem.classList.remove('selected');
        });

        labelElem.appendChild(inputElem);
        labelElem.appendChild(document.createTextNode(` ${kw.label}`));

        keywordsContainer.appendChild(labelElem);
    });
}

// Genera la UI "Chips" per la modifica rapida di Keyword e Aree nel Modale
function renderAdminChips(type) {
    const container = document.getElementById("entity-chips-container");
    container.innerHTML = "";

    let itemsSource = [];
    if (type === 'keyword') itemsSource = nodes.filter(n => n.type === 'keyword').sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    else if (type === 'area') {
        // Normalizza le aree: supporta sia stringhe che oggetti { name, color }
        itemsSource = (data.areas || []).map(a => {
            const name = typeof a === 'object' ? a.name : a;
            const color = typeof a === 'object' ? a.color : '#888';
            return { isArea: true, label: name, id: name, color };
        }).sort((a, b) => a.label.localeCompare(b.label));
    }

    if (itemsSource.length === 0) {
        container.innerHTML = `<span style="color:#666; font-size:0.8em; font-style:italic;">Nessun elemento presente.</span>`;
        return;
    }

    itemsSource.forEach(item => {
        const chip = document.createElement("div");
        chip.className = `admin-chip ${type}-chip`;

        const labelText = type === 'area'
            ? item.label
            : `${item.label} [${item.area || 'N/A'}]`;
        chip.innerHTML = `<span class="chip-label">${labelText}</span>`;

        // Per le aree: applica il colore come bordo del chip
        if (type === 'area' && item.color) {
            chip.style.borderColor = item.color;
            chip.style.color = item.color;
        }

        // Cliccando il chip, carica nel Form d'aggiunta i parametri, simulando l'apertura Edit
        chip.onclick = (e) => {
            if (e.target.classList.contains('chip-delete')) return;

            document.getElementById("modal-title").textContent = `Modifica ${type === 'keyword' ? 'Keyword' : 'Area Tematica'}`;
            document.getElementById("submit-paper-btn").textContent = "AGGIORNA";
            document.getElementById("edit-entity-id").value = item.id;

            document.getElementById("new-title").value = item.label || "";
            if (type === 'keyword') {
                document.getElementById("new-area").value = item.area || "";
                document.getElementById("new-info").value = item.info || "";
            }
        };

        // Costruzione bottone interno X e logica Doppio Click / Double Confirm integrata
        const deleteBtn = document.createElement("div");
        deleteBtn.className = "chip-delete";
        deleteBtn.innerHTML = "✖";

        let confirmTimeout;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (deleteBtn.classList.contains("confirm-mode")) {
                clearTimeout(confirmTimeout);
                confirmDelete(item.id, type, chip); // Riusa il router polimorfico
            } else {
                deleteBtn.classList.add("confirm-mode");
                deleteBtn.innerHTML = "Conferma";
                confirmTimeout = setTimeout(() => {
                    deleteBtn.classList.remove("confirm-mode");
                    deleteBtn.innerHTML = "✖";
                }, 3000);
            }
        };

        chip.appendChild(deleteBtn);
        container.appendChild(chip);
    });
}

// Event Listeners UI Modale
addBtn.addEventListener('click', () => {
    // Resetta l'interfaccia a Modality INSERIMENTO (nel caso si stesse facendo un edit)
    document.getElementById("modal-title").textContent = "Aggiungi Nuovo Elemento";
    document.getElementById("submit-paper-btn").textContent = "SALVA";
    document.getElementById("edit-entity-id").value = "";
    entityForm.reset();

    // Sblocca lo Slider (in modifica è bloccato)
    segmentedRadios.forEach(r => r.disabled = false);
    document.getElementById('type-paper').checked = true;
    entityForm.setAttribute('data-mode', 'paper');
    document.getElementById('add-paper-modal').setAttribute('data-mode', 'paper');

    // Ripristina rquired di base
    document.getElementById("new-author").required = true;
    document.getElementById("new-year").required = true;
    document.getElementById("new-area").required = true;

    populateKeywordsForm();
    modal.classList.add('show');
});

closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
});

// Gestione invio Form Universale => Router verso Endpoint appropriati
entityForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById("submit-paper-btn");
    const originalBtnText = submitBtn.textContent;
    const mode = entityForm.getAttribute('data-mode'); // paper | keyword | area
    const editIdInput = document.getElementById("edit-entity-id");
    const isEditing = editIdInput.value !== "";
    const newId = isEditing ? editIdInput.value : (mode.charAt(0) + "_custom_" + Date.now());

    let payload = {};
    let apiUrl = "";

    // Per gestire i File il corpo diverrà un mix di JSON e Blobs
    let requestOptions = {
        method: 'POST'
        // header omesso volontariamente per le multipart/form-data
    };

    // Routing Logica di Formattazione Payload
    if (mode === 'paper' || mode === 'casestudy') {
        if (mode === 'paper') {
            apiUrl = isEditing ? 'http://localhost:3000/api/update-paper' : 'http://localhost:3000/api/add-paper';
        } else {
            apiUrl = isEditing ? 'http://localhost:3000/api/update-casestudy' : 'http://localhost:3000/api/add-casestudy';
        }

        // Costruzione dinamica della Data Formattata (GG Testo YYYY) per Paper, solo YYYY per CaseStudy
        const dDay = document.getElementById("new-day").value.trim();
        const dMonth = document.getElementById("new-month").value;
        const dYear = document.getElementById("new-year").value.trim();
        const formattedDate = mode === 'paper' ? [dDay, dMonth, dYear].filter(Boolean).join(" ") : dYear;

        const mainPayload = {
            id: newId,
            title: document.getElementById("new-title").value,
            author: document.getElementById("new-author").value,
            year: formattedDate,
            area: document.getElementById("new-area").value,
            url: document.getElementById("new-url").value || "",
            info: document.getElementById("new-info").value
        };

        if (mode === 'paper') {
            payload = {
                paper: mainPayload,
                links: Array.from(keywordsContainer.querySelectorAll('input:checked')).map(cb => cb.value).map(kwId => ({
                    paper: newId,
                    keyword: kwId
                }))
            };
        } else {
            payload = {
                caseStudy: mainPayload,
                links: Array.from(keywordsContainer.querySelectorAll('input:checked')).map(cb => cb.value).map(kwId => ({
                    caseStudy: newId,
                    keyword: kwId
                }))
            };
        }

        const formPayload = new FormData();
        if (mode === 'paper') {
            formPayload.append('paper', JSON.stringify(payload.paper));
        } else {
            formPayload.append('caseStudy', JSON.stringify(payload.caseStudy));
        }
        formPayload.append('links', JSON.stringify(payload.links));
        formPayload.append('pageId', currentPageId);

        // Se isEditing, ripristiniamo le vecchie immagini dicendolo al Backend Node.js
        if (isEditing) {
            const existingEntity = nodes.find(n => n.id === newId);
            if (existingEntity && existingEntity.images && existingEntity.images.length > 0) {
                formPayload.append('existingImages', JSON.stringify(existingEntity.images));
            }
        }

        // Appendiamo eventuali file allegati
        const fileInput = document.getElementById("new-images");
        if (fileInput && fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
                formPayload.append('images', fileInput.files[i]);
            }
        }

        requestOptions.body = formPayload;
        // Non forziamo alcun header Content-Type, fetch lo setta a multipart con suo boundary automatico.

    } else if (mode === 'keyword') {
        apiUrl = isEditing ? 'http://localhost:3000/api/update-keyword' : 'http://localhost:3000/api/add-keyword';
        payload = {
            keyword: {
                id: newId,
                label: document.getElementById("new-title").value, // Uso il titolo come label
                area: document.getElementById("new-area").value,
                info: document.getElementById("new-info").value
            },
            pageId: currentPageId
        };
        requestOptions.headers = { 'Content-Type': 'application/json' };
        requestOptions.body = JSON.stringify(payload);
    } else if (mode === 'area') {
        // Ora le Aree sono oggetti { name, color }
        apiUrl = 'http://localhost:3000/api/add-area';
        payload = {
            area: {
                name: document.getElementById("new-title").value,
                color: document.getElementById("new-area-color").value || '#888888'
            },
            pageId: currentPageId
        };
        requestOptions.headers = { 'Content-Type': 'application/json' };
        requestOptions.body = JSON.stringify(payload);
    }

    submitBtn.textContent = "SALVATAGGIO...";
    submitBtn.style.backgroundColor = "#fff";
    submitBtn.style.color = "#000";

    try {
        const response = await fetch(apiUrl, requestOptions);

        const result = await response.json();

        if (result.success) {
            submitBtn.textContent = "SALVATO ✓";
            submitBtn.style.backgroundColor = "#28a745";
            setTimeout(() => {
                modal.classList.remove('show');
                submitBtn.textContent = originalBtnText;
                submitBtn.style.background = "";
                submitBtn.style.color = "";
                entityForm.reset();
                refreshPage();
            }, 800);
        } else {
            console.error("Errore salvataggio:", result.error);
            submitBtn.textContent = "ERRORE!";
            submitBtn.style.backgroundColor = "#dc3545";
            setTimeout(() => {
                submitBtn.textContent = originalBtnText;
                submitBtn.style.background = "";
            }, 3000);
        }
    } catch (err) {
        console.error("Errore di rete:", err);
        submitBtn.textContent = "ERRORE DI RETE";
        submitBtn.style.backgroundColor = "#dc3545";
        setTimeout(() => {
            submitBtn.textContent = originalBtnText;
            submitBtn.style.background = "";
        }, 3000);
    }
});

// ==========================================
//    LOGICA PANNELLO LATERALE LISTA/TAB
// ==========================================

const openListBtn = document.getElementById("open-list-btn");
const sidebar = document.getElementById("paper-list-sidebar");
const closeSidebarBtn = document.querySelector(".close-sidebar-btn");
const listContent = document.getElementById("paper-list-content");
const listSearchBar = document.getElementById("list-search-bar");
const sidebarTabs = document.querySelectorAll('.sidebar-tab');

let currentSidebarTab = "paper"; // paper | keyword | area

openListBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    renderList(currentSidebarTab);
});

closeSidebarBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
});

listSearchBar.addEventListener("input", (e) => {
    renderList(currentSidebarTab, e.target.value.toLowerCase());
});

// Ascoltatore Click sulle Linguette (Tabs) in cima alla Sidebar
sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        sidebarTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentSidebarTab = tab.getAttribute('data-tab');
        listSearchBar.value = ""; // Pulisco il search al cambio

        // Mostra/Nascondi il filtro entità solo per la tab "paper"
        const entityFilter = document.getElementById("sidebar-entity-filter");
        if (entityFilter) {
            entityFilter.style.display = currentSidebarTab === 'paper' ? 'flex' : 'none';
        }

        renderList(currentSidebarTab);
    });
});

// Ascoltatore Click sui bottoni filtro Entità (Tutti | Paper | Casi Studio)
let currentEntityFilter = 'all';
const entityFilterRadios = document.querySelectorAll('input[name="list-filter"]');
entityFilterRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentEntityFilter = e.target.value;
        renderList(currentSidebarTab, listSearchBar.value.toLowerCase());
    });
});

// Funzione Polimorfica di rendering Lista (Papers/Keywords/Areas)
function renderList(type, filterText = "") {
    listContent.innerHTML = "";

    let itemsSource = [];
    if (type === 'paper') {
        const paps = nodes.filter(n => n.type === 'paper');
        const cses = nodes.filter(n => n.type === 'casestudy');
        let combined = [...paps, ...cses];

        if (currentEntityFilter === 'paper') combined = paps;
        if (currentEntityFilter === 'casestudy') combined = cses;

        itemsSource = combined.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    else if (type === 'keyword') itemsSource = nodes.filter(n => n.type === 'keyword').sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    else if (type === 'area') {
        itemsSource = (data.areas || []).map(a => {
            const name = typeof a === 'object' ? a.name : a;
            const color = typeof a === 'object' ? a.color : '#888';
            return { isArea: true, label: name, id: name, color };
        }).sort((a, b) => a.label.localeCompare(b.label));
    }

    // Filtra per testo se presente
    if (filterText) {
        itemsSource = itemsSource.filter(p =>
            (p.title && p.title.toLowerCase().includes(filterText)) ||
            (p.label && p.label.toLowerCase().includes(filterText)) ||
            (p.author && p.author.toLowerCase().includes(filterText)) ||
            (p.year && String(p.year).includes(filterText))
        );
    }

    if (itemsSource.length === 0) {
        listContent.innerHTML = "<p style='color: #888; text-align:center; font-size:0.8rem;'>La ricerca non ha prodotto risultati in questa scheda.</p>";
        return;
    }

    itemsSource.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "list-item";

        const title = document.createElement("div");
        title.className = "list-item-title";

        if (item.type === 'casestudy') {
            itemDiv.classList.add("casestudy-card");
            title.innerHTML = `<span style="color:#888; margin-right:4px;">◇</span> ${item.title || "Elemento"}`;
        } else {
            title.textContent = item.title || item.label || "Elemento";
        }

        const meta = document.createElement("div");
        meta.className = "list-item-author-year";
        if (type === 'paper') {
            if (item.type === 'casestudy') {
                meta.textContent = `${item.year || ""} [${item.area || "No Area"}]`;
                if (item.author) meta.textContent = `${item.author} • ` + meta.textContent;
            } else {
                meta.textContent = `${item.author || ""} • ${item.year || ""} [${item.area || "No Area"}]`;
            }
        }
        else if (type === 'keyword') meta.textContent = `Area Collegata: [${item.area || "No Area"}]`;
        else if (type === 'area') meta.textContent = "Categoria Tematica Master";

        const actions = document.createElement("div");
        actions.className = "list-item-actions";

        // Nascondiamo i bottoni Azione se siamo in Static Mode
        if (!isStatic) {
            // Non abilitiamo le MODIFICHE per le stringhe Aree, solo eventuale delete
            if (type !== 'area') {
                const editBtn = document.createElement("button");
                editBtn.className = "action-btn edit-btn";
                editBtn.innerHTML = "✎";
                editBtn.title = "Modifica";
                editBtn.onclick = (e) => { e.stopPropagation(); openEditModal(item, item.type || type); };
                actions.appendChild(editBtn);
            }

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "action-btn delete-btn";
            deleteBtn.innerHTML = "✖";
            deleteBtn.title = "Rimuovi Definitivamente";

            // Logica doppio-click IN-LINE di sicurezza
            let confirmTimeout;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (deleteBtn.classList.contains("confirm-mode")) {
                    clearTimeout(confirmTimeout);
                    confirmDelete(item.id, item.type || type, itemDiv);
                } else {
                    deleteBtn.classList.add("confirm-mode");
                    deleteBtn.innerHTML = "Conferma ✖";
                    confirmTimeout = setTimeout(() => {
                        deleteBtn.classList.remove("confirm-mode");
                        deleteBtn.innerHTML = "✖";
                    }, 3000);
                }
            };

            actions.appendChild(deleteBtn);
        }

        // Click sulla card → chiudi sidebar, vola al nodo, apri info panel
        itemDiv.onclick = () => {
            // Chiudi sidebar
            const sidebar = document.getElementById("paper-list-sidebar");
            if (sidebar) sidebar.classList.remove("open");

            // Fly-to + highlight del nodo sulla mappa
            // (L'apertura dell'info panel è già gestita all'interno di focusOnNode)
            window.focusOnNode(item.id);
        };

        itemDiv.appendChild(title);
        itemDiv.appendChild(meta);
        itemDiv.appendChild(actions);

        listContent.appendChild(itemDiv);
    });
}

// Router universale per l'Apertura del Modale in modalità EDIT
function openEditModal(entity, entityType) {
    document.getElementById("modal-title").textContent = `Modifica ${entityType}`;
    document.getElementById("submit-paper-btn").textContent = "AGGIORNA";

    // Switcha fisicamente lo slide control all'opzione richiesta (e blocca il radiogroup per non creare inconsistenze)
    segmentedRadios.forEach(r => r.disabled = true);
    document.getElementById(`type-${entityType}`).checked = true;
    entityForm.setAttribute('data-mode', entityType);
    // BUGFIX: La visibilità dei campi è guidata dal data-mode sul #add-paper-modal, non sul form!
    document.getElementById('add-paper-modal').setAttribute('data-mode', entityType);

    // Aggiorna dinamica per required
    const isPaper = entityType === 'paper';
    const isCaseStudy = entityType === 'casestudy';
    document.getElementById("new-author").required = isPaper;
    document.getElementById("new-year").required = isPaper || isCaseStudy;
    document.getElementById("new-area").required = true;

    document.getElementById("edit-entity-id").value = entity.id;

    // Filla i value semplici
    document.getElementById("new-title").value = entity.title || entity.label || "";
    document.getElementById("new-author").value = entity.author || "";
    document.getElementById("new-area").value = entity.area || "";
    document.getElementById("new-url").value = entity.url || "";
    document.getElementById("new-info").value = entity.info || "";

    // Reset Date Fields
    document.getElementById("new-day").value = "";
    document.getElementById("new-month").value = "";
    document.getElementById("new-year").value = "";
    
    // Clear file input to prevent accidental re-uploads (which causes duplicate attachments and duplicated files in uploads folder)
    document.getElementById("new-images").value = "";

    // Reverse Engineering della Data Formattata (es: "15 Gennaio 2024" o "2024")
    if (entity.year) {
        const parts = entity.year.split(" ");
        if (parts.length === 3) {
            // Formato completo: Giorno Mese Anno
            document.getElementById("new-day").value = parts[0];
            document.getElementById("new-month").value = parts[1];
            document.getElementById("new-year").value = parts[2];
        } else if (parts.length === 2) {
            // Caso strano ma possibile: Mese Anno 
            document.getElementById("new-month").value = parts[0];
            document.getElementById("new-year").value = parts[1];
        } else {
            // Solo Anno
            document.getElementById("new-year").value = entity.year;
        }
    }

    populateKeywordsForm();

    if (entityType === 'paper' || entityType === 'casestudy') {
        const entityLinks = links.filter(l => (l.source.id || l.source) === entity.id).map(l => l.target.id || l.target);
        const checkboxes = keywordsContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (entityLinks.includes(cb.value)) {
                cb.checked = true;
                cb.parentElement.classList.add('selected');
            }
        });
    }

    sidebar.classList.remove("open");
    modal.classList.add('show');
}

// Router universale di Eliminazione Backend (Polimorfico su base 'type')
async function confirmDelete(entityId, entityType, listItemDiv) {
    listItemDiv.style.opacity = "0.3";
    let endpoint = "";
    let payload = {};

    if (entityType === 'paper') { endpoint = '/api/delete-paper'; payload = { id: entityId, pageId: currentPageId }; }
    else if (entityType === 'keyword') { endpoint = '/api/delete-keyword'; payload = { id: entityId, pageId: currentPageId }; }
    else if (entityType === 'casestudy') { endpoint = '/api/delete-casestudy'; payload = { id: entityId, pageId: currentPageId }; }
    else if (entityType === 'area') { endpoint = '/api/delete-area'; payload = { area: entityId, pageId: currentPageId }; }

    try {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            listItemDiv.remove();
            setTimeout(() => refreshPage(), 400);
        } else {
            console.error("Errore Node del Server: ", result.error);
            alert("Impossibile Eliminare. " + result.error);
            listItemDiv.style.opacity = "1";
        }
    } catch (err) {
        console.error("Delete call failed", err);
        alert("Errore Server. Il Backend Nodejs è raggiungibile?");
        listItemDiv.style.opacity = "1";
    }
}

// ==========================================
//    GESTORE TASTO ESC UNIVERSALE
// ==========================================
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // 1. Lightbox (Immagini)
        const lightbox = document.getElementById("lightbox-overlay");
        if (lightbox && lightbox.classList.contains("show")) {
            lightbox.classList.remove("show");
            return;
        }

        // 2. Modale Aggiunta/Modifica
        const modal = document.getElementById("add-paper-modal");
        if (modal && modal.classList.contains("show")) {
            modal.classList.remove("show");
            return;
        }

        // 3. Dropdown della Ricerca attiva (se visibile)
        const searchDropdown = document.getElementById("search-dropdown");
        if (searchDropdown && !searchDropdown.classList.contains("hidden")) {
            searchDropdown.classList.add("hidden");
            // Rimuoviamo anche il focus dall'input per pulizia
            document.getElementById("paper-search").blur();
            return;
        }

        // 4. Info Panel (usa closePanel per reset highlight mappa)
        const infoPanel = document.getElementById("info-panel");
        if (infoPanel && infoPanel.classList.contains("visible")) {
            window.closePanel();
            return;
        }

        // 5. Sidebar delle liste
        const sidebar = document.getElementById("paper-list-sidebar");
        if (sidebar && sidebar.classList.contains("open")) {
            sidebar.classList.remove("open");
            return;
        }
    }
});

// Funzione per recuperare ed iniettare l'etichetta della data di aggiornamento
async function fetchLastUpdate() {
    try {
        const res = await fetch('./last_update.txt');
        if (!res.ok) return;
        const text = await res.text();
        const rawText = text.trim();
        // Gestione formattazione: togliamo secondi e millisecondi (es. 10:45:30.20 -> 10:45)
        // Prendiamo la data e i primi 5 caratteri del tempo
        const parts = rawText.split(/\s+/).filter(p => p.length > 0);
        const datePart = parts[0] || "";
        const timePart = parts[1] ? parts[1].substring(0, 5) : "";
        
        const div = document.createElement('div');
        div.id = 'last-update-overlay';
        div.textContent = `Last update: ${datePart} ${timePart}`;
        document.body.appendChild(div);
    } catch (e) {
        console.error("Errore recupero data ultimo aggiornamento", e);
    }
}

// Avvia il caricamento della mappa
initMap();
