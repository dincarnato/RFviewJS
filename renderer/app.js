'use strict';
// RFview Desktop — renderer/app.js
// Feeds files directly into RFview's _loadFromFiles pipeline

let viewer = null;
const container = document.getElementById('viewer');
const dropOverlay = document.getElementById('drop-overlay');
const toast = document.getElementById('toast');

// Toast
let toastTimer;

function showToast(msg, ms = 2500) {

    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms);

}

// Viewer
function ensureViewer() {

    if (viewer) return;
    viewer = new RFviewJS(container, { statusBar: true });
    
}

ensureViewer(); // Shows the empty interface right away

// File handling
async function handleIncomingFile({ type, content, name }) {

    try {

        ensureViewer();
        const file = new File([content], name, { type: 'text/plain' });

        if (type === 'db') {

            if (!viewer._accumulatedDbFiles) viewer._accumulatedDbFiles = [];
            if (!viewer._accumulatedDbFiles.some(f => f.name === name))
                viewer._accumulatedDbFiles.push(file);
            if (viewer._upDbNames)
                viewer._upDbNames.textContent = viewer._accumulatedDbFiles.map(f => f.name).join(', ');
            await viewer._previewDbFiles();

        } 
        else if (type === 'xml') {

            if (!viewer._accumulatedXmlFiles) viewer._accumulatedXmlFiles = [];
            if (!viewer._accumulatedXmlFiles.some(f => f.name === name))
                viewer._accumulatedXmlFiles.push(file);
            if (viewer._upXmlNames)
                viewer._upXmlNames.textContent = viewer._accumulatedXmlFiles.map(f => f.name).join(', ');
            await viewer._previewXmlFiles();

        } 
        else if (type === 'tsv') {

            if (!viewer._accumulatedAnnotFiles) viewer._accumulatedAnnotFiles = [];
            if (!viewer._accumulatedAnnotFiles.some(f => f.name === name))
                viewer._accumulatedAnnotFiles.push(file);
            if (viewer._upAnnotNames)
                viewer._upAnnotNames.textContent = viewer._accumulatedAnnotFiles.map(f => f.name).join(', ');
            await viewer._previewAnnotFiles();

            // Auto-select current structure as annotation target
            if (viewer._upAnnotTargetList) {

                const radio = viewer._upAnnotTargetList
                    .querySelector(`input[value="${viewer._currentStructIdx}"]`)
                    || viewer._upAnnotTargetList.querySelector('input[type=radio]');
                if (radio) radio.checked = true;

            }

        }

        const hasDb = viewer._pendingStructures?.length > 0;
        const hasXml = viewer._pendingXmlData?.length   > 0;
        const hasAnnot = viewer._pendingAnnotData?.length  > 0;

        if (hasDb || (hasXml && viewer._rna) || (hasAnnot && viewer._rna)) {

            if (viewer._upLoadBtn) viewer._upLoadBtn.disabled = false;
            await viewer._loadFromFiles();
            showToast(`Loaded "${name}"`);

        }

    } 
    catch (err) {
        showToast(`[!] ${err.message}`, 4000);
    }

}

async function openAndLoad(dialogFn, type) {

    const paths = await dialogFn();

    for (const p of paths) {

        const content = await window.electronAPI.readFile(p);
        const name = p.split(/[\\/]/).pop();
        await handleIncomingFile({ type, content, name });

    }

}

// Keyboard shortcuts
document.addEventListener('keydown', e => {

    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === 'o') { e.preventDefault(); openAndLoad(window.electronAPI.openStructureDialog,  'db'); }
    if (mod && e.key === 'r') { e.preventDefault(); openAndLoad(window.electronAPI.openReactivityDialog, 'xml'); }
    if (mod && e.key === 'a') { e.preventDefault(); openAndLoad(window.electronAPI.openAnnotationDialog,  'tsv'); }
    if (!viewer) return;
    if (mod && e.key === 's') { e.preventDefault(); exportSvg(); }
    if (mod && e.key === '=') { e.preventDefault(); viewer._zoomBy?.(1.25); }
    if (mod && e.key === '-') { e.preventDefault(); viewer._zoomBy?.(1/1.25); }
    if (mod && e.key === '0') { e.preventDefault(); viewer.fit(); }

});

// Drag & drop from OS 
document.addEventListener('dragover', e => { e.preventDefault(); dropOverlay.classList.add('active'); });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) dropOverlay.classList.remove('active'); });
document.addEventListener('drop', async e => {

    e.preventDefault();
    dropOverlay.classList.remove('active');

    for (const file of Array.from(e.dataTransfer.files)) {

        const content = await file.text();
        const ext = file.name.split('.').pop().toLowerCase();
        const type = ext === 'xml' ? 'xml' : ['tsv','csv','cov','helixcov'].includes(ext) ? 'tsv' : 'db';
        await handleIncomingFile({ type, content, name: file.name });

    }

});

// SVG export
async function exportSvg() {

    if (!viewer) return;

    const defaultName = (viewer._id || viewer._structures?.[0]?.label || 'RFview_structure')
        .replace(/[^a-zA-Z0-9_\-\.]/g, '_') + '.svg';
    const filePath = await window.electronAPI.saveSvgDialog(defaultName);

    if (!filePath) return;
    
    const origCreate = URL.createObjectURL.bind(URL);
    let svgText = null;
    
    URL.createObjectURL = blob => {
    
        const url = origCreate(blob);
        blob.text().then(t => { svgText = t; });
        return url;
    
    };
    
    viewer._saveSVG?.();
    await new Promise(r => setTimeout(r, 300));
    URL.createObjectURL = origCreate;
    
    if (svgText) {
    
        await window.electronAPI.writeFile(filePath, svgText);
        showToast(`Saved ${filePath.split(/[\\/]/).pop()}`);
    
    }

}
