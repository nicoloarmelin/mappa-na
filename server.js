const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Configurazione multer per l'upload immagini
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'img_' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve file statici da uploads
app.use(express.static(__dirname)); // Rende accessibili index.html, map.js e style.css da http://localhost:3000

// Path file
const dataFilePath = path.join(__dirname, 'data.js'); // Vecchio file per legacy fallbacks (per ora)
const pagesDir = path.join(__dirname, 'pages');
const metaFilePath = path.join(pagesDir, 'meta.json');

// Assicura che la directory pages e meta.json esistano all'avvio
if (!fs.existsSync(pagesDir)) {
    fs.mkdirSync(pagesDir);
}
if (!fs.existsSync(metaFilePath)) {
    fs.writeFileSync(metaFilePath, JSON.stringify({ pages: [{ id: 'page_main', name: 'Main', createdAt: Date.now() }] }, null, 4), 'utf8');
}

// ------------------------------------------
// API ENDPOINTS - PAGES
// ------------------------------------------

app.get('/api/pages', (req, res) => {
    try {
        const metaContent = fs.readFileSync(metaFilePath, 'utf8');
        res.json(JSON.parse(metaContent));
    } catch (error) {
        console.error('Errore lettura meta.json:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

app.post('/api/pages', (req, res) => {
    const pageName = req.body.name;
    if (!pageName) return res.status(400).json({ error: 'Nome pagina richiesto' });

    try {
        const metaContent = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        const newId = 'page_' + Date.now() + '_' + Math.round(Math.random() * 1E9);

        const newPage = { id: newId, name: pageName, createdAt: Date.now() };
        metaContent.pages.push(newPage);

        // Crea il file JSON vuoto associato
        const emptyDataStructure = { areas: [], keywords: [], papers: [], caseStudies: [], links: [] };
        fs.writeFileSync(path.join(pagesDir, `${newId}.json`), JSON.stringify(emptyDataStructure, null, 4), 'utf8');

        fs.writeFileSync(metaFilePath, JSON.stringify(metaContent, null, 4), 'utf8');

        res.json({ success: true, page: newPage });
    } catch (error) {
        console.error('Errore creazione pagina:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

app.get('/api/pages/:id/data', (req, res) => {
    const pageId = req.params.id;
    const pageFilePath = path.join(pagesDir, `${pageId}.json`);
    try {
        if (!fs.existsSync(pageFilePath)) {
            return res.status(404).json({ error: 'Pagina non trovata' });
        }
        const pageContent = fs.readFileSync(pageFilePath, 'utf8');
        res.json(JSON.parse(pageContent));
    } catch (error) {
        console.error('Errore lettura dati pagina:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

app.put('/api/pages/:id/rename', (req, res) => {
    const pageId = req.params.id;
    const newName = req.body.name;
    if (!newName || !newName.trim()) return res.status(400).json({ error: 'Nome richiesto' });

    try {
        const metaContent = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        const page = metaContent.pages.find(p => p.id === pageId);
        if (!page) return res.status(404).json({ error: 'Pagina non trovata' });

        page.name = newName.trim();
        fs.writeFileSync(metaFilePath, JSON.stringify(metaContent, null, 4), 'utf8');
        res.json({ success: true, page });
    } catch (error) {
        console.error('Errore rinomina pagina:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

app.delete('/api/pages/:id', (req, res) => {
    const pageId = req.params.id;
    try {
        const metaContent = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        const pageIndex = metaContent.pages.findIndex(p => p.id === pageId);
        if (pageIndex === -1) return res.status(404).json({ error: 'Pagina non trovata' });

        if (metaContent.pages.length <= 1) {
            return res.status(400).json({ error: 'Non puoi eliminare l\'unica pagina rimasta' });
        }

        metaContent.pages.splice(pageIndex, 1);
        fs.writeFileSync(metaFilePath, JSON.stringify(metaContent, null, 4), 'utf8');

        const pageFilePath = path.join(pagesDir, `${pageId}.json`);
        if (fs.existsSync(pageFilePath)) fs.unlinkSync(pageFilePath);

        res.json({ success: true, remainingPages: metaContent.pages });
    } catch (error) {
        console.error('Errore eliminazione pagina:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// ==========================================
// HELPER: Lettura/Scrittura dati di una pagina
// ==========================================
function readPageData(pageId) {
    const filePath = path.join(pagesDir, `${pageId}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`Pagina ${pageId} non trovata`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writePageData(pageId, dataStruct) {
    const filePath = path.join(pagesDir, `${pageId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(dataStruct, null, 4), 'utf8');
}

// ==========================================
// ENDPOINT PAPERS
// ==========================================

app.post('/api/add-paper', upload.array('images'), (req, res) => {
    let newPaper;
    let newLinks = [];

    try {
        newPaper = typeof req.body.paper === 'string' ? JSON.parse(req.body.paper) : req.body.paper;
        newLinks = req.body.links ? (typeof req.body.links === 'string' ? JSON.parse(req.body.links) : req.body.links) : [];
    } catch (e) {
        return res.status(400).json({ error: 'Payload JSON invalido' });
    }

    if (!newPaper) {
        return res.status(400).json({ error: 'Nessun paper fornito' });
    }

    const pageId = req.body.pageId || 'page_main';

    if (req.files && req.files.length > 0) {
        newPaper.images = req.files.map(f => '/uploads/' + f.filename);
    }

    try {
        const dataStruct = readPageData(pageId);

        dataStruct.papers.push(newPaper);
        if (newLinks.length > 0) {
            dataStruct.links.push(...newLinks);
        }

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Paper aggiunto con successo', paper: newPaper });
    } catch (error) {
        console.error('Errore durante il salvataggio:', error);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

app.post('/api/update-paper', upload.array('images'), (req, res) => {
    let updatedPaper;
    let newLinks = [];

    try {
        updatedPaper = typeof req.body.paper === 'string' ? JSON.parse(req.body.paper) : req.body.paper;
        newLinks = req.body.links ? (typeof req.body.links === 'string' ? JSON.parse(req.body.links) : req.body.links) : [];
    } catch (e) {
        return res.status(400).json({ error: 'Payload JSON invalido' });
    }

    if (!updatedPaper || !updatedPaper.id) {
        return res.status(400).json({ error: 'Nessun paper valido fornito per l\'update' });
    }

    const pageId = req.body.pageId || 'page_main';

    let finalImages = [];
    if (req.body.existingImages) {
        try {
            finalImages = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
        } catch (e) { console.error("Error parsing existingImages", e); }
    }
    if (req.files && req.files.length > 0) {
        finalImages = finalImages.concat(req.files.map(f => '/uploads/' + f.filename));
    }
    if (finalImages.length > 0) {
        updatedPaper.images = finalImages;
    }

    try {
        const dataStruct = readPageData(pageId);

        const paperIndex = dataStruct.papers.findIndex(p => p.id === updatedPaper.id);
        if (paperIndex === -1) {
            return res.status(404).json({ error: 'Paper non trovato' });
        }
        dataStruct.papers[paperIndex] = updatedPaper;

        dataStruct.links = dataStruct.links.filter(l => l.paper !== updatedPaper.id);
        if (newLinks.length > 0) {
            dataStruct.links.push(...newLinks);
        }

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Paper aggiornato con successo' });
    } catch (error) {
        console.error('Errore durante l\'aggiornamento:', error);
        res.status(500).json({ error: 'Errore interno del server durante l\'update.' });
    }
});

app.post('/api/delete-paper', (req, res) => {
    const paperId = req.body.id;
    const pageId = req.body.pageId || 'page_main';

    if (!paperId) {
        return res.status(400).json({ error: 'Nessun ID fornito per l\'eliminazione' });
    }

    try {
        const dataStruct = readPageData(pageId);

        const initialLength = dataStruct.papers.length;
        dataStruct.papers = dataStruct.papers.filter(p => p.id !== paperId);

        if (dataStruct.papers.length === initialLength) {
            return res.status(404).json({ error: 'Paper da eliminare non trovato' });
        }

        dataStruct.links = dataStruct.links.filter(l => l.paper !== paperId);

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Paper eliminato con successo' });
    } catch (error) {
        console.error('Errore durante l\'eliminazione:', error);
        res.status(500).json({ error: 'Errore interno del server durante la delete.' });
    }
});

// ==========================================
// ENDPOINT KEYWORDS
// ==========================================

app.post('/api/add-keyword', (req, res) => {
    const newKeyword = req.body.keyword;
    const pageId = req.body.pageId || 'page_main';
    if (!newKeyword) return res.status(400).json({ error: 'Nessuna keyword fornita' });

    try {
        const dataStruct = readPageData(pageId);

        dataStruct.keywords.push(newKeyword);

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Keyword aggiunta con successo', keyword: newKeyword });
    } catch (error) {
        console.error('Errore durante il salvataggio keyword:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

app.post('/api/update-keyword', (req, res) => {
    const updatedKeyword = req.body.keyword;
    const pageId = req.body.pageId || 'page_main';
    if (!updatedKeyword || !updatedKeyword.id) return res.status(400).json({ error: 'Nessuna keyword valida fornita' });

    try {
        const dataStruct = readPageData(pageId);

        const kwIndex = dataStruct.keywords.findIndex(k => k.id === updatedKeyword.id);
        if (kwIndex === -1) return res.status(404).json({ error: 'Keyword non trovata' });

        dataStruct.keywords[kwIndex] = updatedKeyword;

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Keyword aggiornata con successo' });
    } catch (error) {
        console.error('Errore durante l\'aggiornamento keyword:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

app.post('/api/delete-keyword', (req, res) => {
    const keywordId = req.body.id;
    const pageId = req.body.pageId || 'page_main';
    if (!keywordId) return res.status(400).json({ error: 'Nessun ID keyword fornito' });

    try {
        const dataStruct = readPageData(pageId);

        const initialLength = dataStruct.keywords.length;
        dataStruct.keywords = dataStruct.keywords.filter(k => k.id !== keywordId);

        if (dataStruct.keywords.length === initialLength) {
            return res.status(404).json({ error: 'Keyword non trovata' });
        }

        dataStruct.links = dataStruct.links.filter(l => l.keyword !== keywordId);

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Keyword eliminata con successo' });
    } catch (error) {
        console.error('Errore durante l\'eliminazione keyword:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// ==========================================
// ENDPOINT AREE TEMATICHE
// ==========================================

app.post('/api/add-area', (req, res) => {
    let newArea = req.body.area;
    const pageId = req.body.pageId || 'page_main';
    if (!newArea) return res.status(400).json({ error: 'Nessuna area fornita' });

    if (typeof newArea === 'string') {
        newArea = { name: newArea.trim(), color: '#888888' };
    } else {
        newArea.name = (newArea.name || '').trim();
        newArea.color = newArea.color || '#888888';
    }

    if (!newArea.name) return res.status(400).json({ error: 'Nome area mancante' });

    try {
        const dataStruct = readPageData(pageId);

        if (!dataStruct.areas) dataStruct.areas = [];

        const exists = dataStruct.areas.some(a => {
            const name = typeof a === 'object' ? a.name : a;
            return name.toLowerCase() === newArea.name.toLowerCase();
        });

        if (!exists) {
            dataStruct.areas.push(newArea);
            writePageData(pageId, dataStruct);
        }

        res.json({ success: true, message: 'Area aggiunta con successo', area: newArea });
    } catch (error) {
        console.error('Errore durante il salvataggio area:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

app.post('/api/delete-area', (req, res) => {
    let targetArea = req.body.area;
    const pageId = req.body.pageId || 'page_main';
    if (!targetArea) return res.status(400).json({ error: 'Nessuna area fornita' });

    const targetName = (typeof targetArea === 'object' ? targetArea.name : targetArea).trim().toLowerCase();

    try {
        const dataStruct = readPageData(pageId);

        if (!dataStruct.areas) dataStruct.areas = [];

        const initialLength = dataStruct.areas.length;
        dataStruct.areas = dataStruct.areas.filter(a => {
            const name = typeof a === 'object' ? a.name : a;
            return name.toLowerCase() !== targetName;
        });

        if (dataStruct.areas.length === initialLength) {
            return res.status(404).json({ error: 'Area non trovata' });
        }

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Area eliminata con successo' });
    } catch (error) {
        console.error('Errore durante l\'eliminazione area:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// ==========================================
// ENDPOINT CASI STUDIO
// ==========================================

app.post('/api/add-casestudy', upload.array('images'), (req, res) => {
    let newCaseStudy;
    let newLinks = [];

    try {
        newCaseStudy = typeof req.body.caseStudy === 'string' ? JSON.parse(req.body.caseStudy) : req.body.caseStudy;
        newLinks = req.body.links ? (typeof req.body.links === 'string' ? JSON.parse(req.body.links) : req.body.links) : [];
    } catch (e) {
        return res.status(400).json({ error: 'Payload JSON invalido' });
    }

    if (!newCaseStudy) {
        return res.status(400).json({ error: 'Nessun caso studio fornito' });
    }

    const pageId = req.body.pageId || 'page_main';

    if (req.files && req.files.length > 0) {
        newCaseStudy.images = req.files.map(f => '/uploads/' + f.filename);
    }

    try {
        const dataStruct = readPageData(pageId);

        if (!dataStruct.caseStudies) dataStruct.caseStudies = [];

        dataStruct.caseStudies.push(newCaseStudy);
        if (newLinks.length > 0) {
            dataStruct.links.push(...newLinks);
        }

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Caso studio aggiunto con successo', caseStudy: newCaseStudy });
    } catch (error) {
        console.error('Errore durante il salvataggio caso studio:', error);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

app.post('/api/update-casestudy', upload.array('images'), (req, res) => {
    let updatedCS;
    let newLinks = [];

    try {
        updatedCS = typeof req.body.caseStudy === 'string' ? JSON.parse(req.body.caseStudy) : req.body.caseStudy;
        newLinks = req.body.links ? (typeof req.body.links === 'string' ? JSON.parse(req.body.links) : req.body.links) : [];
    } catch (e) {
        return res.status(400).json({ error: 'Payload JSON invalido' });
    }

    if (!updatedCS || !updatedCS.id) {
        return res.status(400).json({ error: 'Nessun caso studio valido fornito per l\'update' });
    }

    const pageId = req.body.pageId || 'page_main';

    let finalImages = [];
    if (req.body.existingImages) {
        try {
            finalImages = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
        } catch (e) { console.error("Error parsing existingImages", e); }
    }
    if (req.files && req.files.length > 0) {
        finalImages = finalImages.concat(req.files.map(f => '/uploads/' + f.filename));
    }
    if (finalImages.length > 0) {
        updatedCS.images = finalImages;
    }

    try {
        const dataStruct = readPageData(pageId);

        if (!dataStruct.caseStudies) dataStruct.caseStudies = [];

        const csIndex = dataStruct.caseStudies.findIndex(cs => cs.id === updatedCS.id);
        if (csIndex === -1) {
            return res.status(404).json({ error: 'Caso studio non trovato' });
        }
        dataStruct.caseStudies[csIndex] = updatedCS;

        dataStruct.links = dataStruct.links.filter(l => l.caseStudy !== updatedCS.id);
        if (newLinks.length > 0) {
            dataStruct.links.push(...newLinks);
        }

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Caso studio aggiornato con successo' });
    } catch (error) {
        console.error('Errore durante l\'aggiornamento caso studio:', error);
        res.status(500).json({ error: 'Errore interno del server durante l\'update.' });
    }
});

app.post('/api/delete-casestudy', (req, res) => {
    const csId = req.body.id;
    const pageId = req.body.pageId || 'page_main';
    if (!csId) return res.status(400).json({ error: 'Nessun ID fornito per l\'eliminazione' });

    try {
        const dataStruct = readPageData(pageId);

        if (!dataStruct.caseStudies) dataStruct.caseStudies = [];

        const initialLength = dataStruct.caseStudies.length;
        dataStruct.caseStudies = dataStruct.caseStudies.filter(cs => cs.id !== csId);

        if (dataStruct.caseStudies.length === initialLength) {
            return res.status(404).json({ error: 'Caso studio non trovato' });
        }

        dataStruct.links = dataStruct.links.filter(l => l.caseStudy !== csId);

        writePageData(pageId, dataStruct);

        res.json({ success: true, message: 'Caso studio eliminato con successo' });
    } catch (error) {
        console.error('Errore durante l\'eliminazione caso studio:', error);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server avviato su http://localhost:${PORT}`);
});
