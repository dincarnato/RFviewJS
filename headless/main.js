'use strict';
const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');

// Parse CLI arguments.
// In dev: process.argv = [electron, main.js, ...userArgs]
// In packaged: process.argv = [RFview, ...userArgs]
function parseCliArgs(argv) {

    const args = {};
    const raw = argv.slice(app.isPackaged ? 1 : 2).filter(a => a !== '--');

    for (let i = 0; i < raw.length; i++) {

        const a = raw[i];

        if (!a.startsWith('--')) continue;

        const eq = a.indexOf('=');

        if (eq !== -1) {

            args[a.slice(2, eq)] = a.slice(eq + 1);

        } 
        else {

            const next = raw[i + 1];
            if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++; }
            else args[a.slice(2)] = true;
        }

    }

    return args;

}

const cliArgs = parseCliArgs(process.argv);

// Resolve the app root reliably in both dev and packaged modes
const APP_ROOT = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');
const isCLI = Boolean(cliArgs.structureFile || cliArgs.rfam);

// These must be called immediately in CLI mode
if (isCLI) {

    app.dock?.hide();

}

// Command line help
if (cliArgs.help || cliArgs.h) {

    console.log(`
 RFview (v1.1.2)
 RNA Framework Structure Viewer [https://github.com/dincarnato/RFviewJS]

 Author:   Danny Incarnato (dincarnato[at]rnaframework.com)

 Usage:    RFview [options] --structureFile /path/to/file
 Examples:
  
 RFview --structureFile structure.db
 RFview --structureFile alignment.sto --basePairAnno alignment.cov --layout naview --svg output.svg
 RFview --structureFile structure.db --xml reactivity.xml --svg plot.svg
 

 Options                        Description
 --structureFile    <string>    Path to a structure file (.db, .dbn, .ct, .txt) or to 
                                a Stockholm alignment [required]
 --rfam             <string>    Rfam family ID to fetch directly from Rfam (e.g., RF00162)
                                Note: --rfam and --structureFile are mutually exclusive
 --xml              <string>    Reactivity file (in RNA Framework's XML format)
 --basePairAnno     <string>    Pair-annotation file (.tsv, .txt) or R-scape's .cov file
 --percCanonical                For Stockholm alignments, colors every base-pair by % canonical pairs 
                                computed from the alignment
 --helixCovAnno     <string>    R-scape's .helixcov helix-level covariation file
 --layout           <string>    Layout for RNA secondary structure rendering:
                                  - auto (automatically determines the best layout 
                                    between naview and radiate to avoid overlaps
                                    between helices) [default]
                                  - naview
                                  - radiate
 --svg              <string>    Path to the output SVG file (Default: <structureFile basename>.svg)
 --pdf              <string>    Path to the output PDF file
 --noLegend                     Omits legends from the exported SVG/PDF
 --noPk                         Omits pseudoknot archs from the exported SVG/PDF
                                Note: this has no effect on Stockholm alignments (use --noLabels and
                                      --noInsets instead)
 --noLabels                     Omits Stockholm annotation labels (SS_cons lines) from the exported SVG/PDF
 --noInsets                     Omits inset panels for non-nested interactions in Stockholm alignments from 
                                the exported SVG/PDF
 --incSsEnds                    Includes single-stranded 5'/3' ends in Stockholm structures
 --help                         Shows this help message

`);

    process.exit(0);

}

// GUI-mode menu setup
if (!isCLI) {

    if (process.platform === 'darwin') {

        Menu.setApplicationMenu(Menu.buildFromTemplate([{
            label: app.name,
            submenu: [
                { role: 'hide'       },
                { role: 'hideOthers' },
                { role: 'unhide'     },
                { type: 'separator'  },
                { role: 'quit'       },
            ],
        }, {
            label: 'Edit',
            submenu: [
                { role: 'undo'      },
                { role: 'redo'      },
                { type: 'separator' },
                { role: 'cut'       },
                { role: 'copy'      },
                { role: 'paste'     },
                { role: 'selectAll' },
            ],
        }]));

    } 
    else {

        Menu.setApplicationMenu(Menu.buildFromTemplate([{
            label: 'File',
            submenu: [
                { role: 'quit' },
            ],
        }, {
            label: 'Edit',
            submenu: [
                { role: 'undo'      },
                { role: 'redo'      },
                { type: 'separator' },
                { role: 'cut'       },
                { role: 'copy'      },
                { role: 'paste'     },
                { role: 'selectAll' },
            ],
        }]));

    }

    app.on('browser-window-created', (_, win) => win.setMenu(null));

}

// Window state (GUI only)
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function saveState(win) {

    if (!win || win.isMaximized() || win.isMinimized()) return;
    const [x, y] = win.getPosition(), [w, h] = win.getSize();
    try { fs.writeFileSync(STATE_FILE, JSON.stringify({ x, y, w, h, maximized: win.isMaximized() })); } catch {}

}

let win;
function createWindow() {

    const s = loadState();
    win = new BrowserWindow({

        x: s.x, y: s.y,
        width:     s.w || 1280,
        height:    s.h || 800,
        minWidth:  900, minHeight: 600,
        webPreferences: {
            preload:          path.join(APP_ROOT, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
        backgroundColor: '#ffffff',
        show: false,
        icon: path.join(APP_ROOT, 'assets', 'icon.png'),

    });

    if (s.maximized) win.maximize();

    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(APP_ROOT, 'scripts', 'index.html'));
    win.on('close', () => saveState(win));

    // Enable Cmd-A (macOS) / Ctrl-A (other) select-all in text inputs
    win.webContents.on('before-input-event', (event, input) => {
        if ((input.meta || input.control) && input.key.toLowerCase() === 'a') {
            win.webContents.executeJavaScript(`
                (function() {
                    const el = document.activeElement;
                    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                        el.select();
                    }
                })();
            `);
        }
    });

}

// IPC for file dialogs & I/O (GUI mode)
ipcMain.handle('write-file', async (_, p, c) => { fs.writeFileSync(p, c, 'utf8'); return true; });
ipcMain.handle('save-svg-dialog', async (_, name) => {

    if (!win) return null;

    const { canceled, filePath } = await dialog.showSaveDialog(win, {

        title: 'Export SVG',
        defaultPath: name || 'RF_structure.svg',
        filters: [{ name: 'SVG', extensions: ['svg'] }],

    });

    return canceled ? null : filePath;

});

// IPC for headless SVG result
ipcMain.handle('headless-done', async (_, svgText, outPath, pdfPath) => {
    fs.writeFileSync(outPath, svgText, 'utf8');
    console.log(`SVG written to: ${outPath}`);
    if (pdfPath) {
        try {
            const hw = BrowserWindow.getAllWindows().find(w => !w.isVisible());

            // Extract SVG dimensions from viewBox or width/height attributes
            const vbMatch = svgText.match(/viewBox=["'][\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)["']/);
            const wMatch  = svgText.match(/\bwidth=["']([\d.]+)["']/);
            const hMatch  = svgText.match(/\bheight=["']([\d.]+)["']/);
            const svgW = vbMatch ? parseFloat(vbMatch[1]) : wMatch ? parseFloat(wMatch[1]) : 800;
            const svgH = vbMatch ? parseFloat(vbMatch[2]) : hMatch ? parseFloat(hMatch[1]) : 600;

            const html =
                '<!DOCTYPE html><html><head><style>' +
                `@page { margin: 0; size: ${svgW}px ${svgH}px; }` +
                'html, body { margin: 0; padding: 0; background: white; width: ' + svgW + 'px; height: ' + svgH + 'px; overflow: hidden; }' +
                'svg { display: block; width: ' + svgW + 'px !important; height: ' + svgH + 'px !important; }' +
                '</style></head><body>' + svgText + '</body></html>';

            await hw.webContents.executeJavaScript(`
                document.open();
                document.write(${JSON.stringify(html)});
                document.close();
            `);
            await new Promise(r => setTimeout(r, 200));
            const pdfData = await hw.webContents.printToPDF({
                printBackground: true,
                margins: { marginType: 'none' },
            });
            fs.writeFileSync(pdfPath, pdfData);
            console.log(`PDF written to: ${pdfPath}`);
        } catch (err) {
            console.error(`[!] PDF export failed: ${err.message}`);
        }
    }
    app.quit();
    return true;
});

ipcMain.handle('headless-error', async (_, message) => {

    console.error(`[!] Error: ${message}`);
    app.exit(1);
    return false;

});

// Rfam fetch proxy (bypasses CORS in renderer)
ipcMain.handle('fetch-rfam', async (_, rfamId) => {
    const https = require('https');
    const url = `https://rfam.org/family/${rfamId}/alignment/stockholm?gzip=0&download=0`;
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
});

// Headless / CLI mode
async function runHeadless(args) {

    if (!args.structureFile && !args.rfam) {
        console.error('[!] Error: either --structureFile or --rfam is required'); process.exit(1);
    }

    if (args.rfam && !/^RF\d+$/i.test(args.rfam)) {
        console.error(`[!] Error: invalid Rfam ID "${args.rfam}" — must be RF followed by digits`); process.exit(1);
    }

    if (args.structureFile && !fs.existsSync(args.structureFile)) {
        console.error(`[!] Error: Structure file ${args.structureFile} not found`); process.exit(1);
    }

    if (args.xml && !fs.existsSync(args.xml)) {
        console.error(`[!] Error: Reactivity file ${args.xml} not found`); process.exit(1);
    }

    if (args.basePairAnno && !fs.existsSync(args.basePairAnno)) {
        console.error(`[!] Error: Base-pair annotation/covariation file ${args.basePairAnno} not found`); process.exit(1);
    }

    if (args.helixCovAnno && !fs.existsSync(args.helixCovAnno)) {
        console.error(`[!] Error: Helix covariation file ${args.helixCovAnno} not found`); process.exit(1);
    }

    const validLayouts = ['auto', 'naview', 'radiate'];
    const layout = (args.layout || 'auto').toLowerCase();
    if (!validLayouts.includes(layout)) {
        console.error(`[!] Error: unknown layout "${layout}" (available: ${validLayouts.join(', ')})`); process.exit(1);
    }

    let structureText, structureName;
    if (args.rfam) {
        const rfamId = args.rfam.toUpperCase();
        console.log(`Fetching Rfam alignment: ${rfamId}`);
        try {
          structureText = await new Promise((resolve, reject) => {
          const https = require('https');
          const url = `https://rfam.org/family/${rfamId}/alignment/stockholm?gzip=0&download=0`;
          https.get(url, res => {
              if (res.statusCode !== 200) {
                  res.resume();
                  reject(new Error(`HTTP ${res.statusCode} — family "${rfamId}" not found on Rfam`));
                  return;
              }
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve(data));
          }).on('error', err => reject(err));
        });
        } catch (err) {
          console.error(`[!] Error: ${err.message}`);
          app.exit(1);
          return;
        }
    if (!structureText.trimStart().startsWith('# STOCKHOLM')) {
        console.error(`[!] Error: Rfam returned no valid alignment for "${rfamId}". Please verify ID.`);
        process.exit(1);
        return;
    }
    structureName = rfamId + '.sto';
    } else {
        structureText = fs.readFileSync(args.structureFile, 'utf8');
        structureName = path.basename(args.structureFile);
    }
    const xmlText = args.xml ? fs.readFileSync(args.xml, 'utf8') : null;
    const annotText = args.basePairAnno ? fs.readFileSync(args.basePairAnno, 'utf8') : null;
    const annotName = args.basePairAnno ? path.basename(args.basePairAnno) : null;
    const helixCovText = args.helixCovAnno ? fs.readFileSync(args.helixCovAnno, 'utf8') : null;
    const helixCovName = args.helixCovAnno ? path.basename(args.helixCovAnno) : null;

    const outPath = args.svg
        ? path.resolve(args.svg)
        : args.structureFile
            ? path.join(
                path.dirname(path.resolve(args.structureFile)),
                path.basename(args.structureFile, path.extname(args.structureFile)) + '.svg'
              )
            : path.join(process.cwd(), args.rfam.toUpperCase() + '.svg');
    console.log(`SVG output: ${outPath}`);
    const pdfPath = args.pdf ? path.resolve(args.pdf) : null;
    if (pdfPath) console.log(`PDF output: ${pdfPath}`);

    console.log(`Loading:  ${structureName}`);

    if (xmlText) console.log(`Reactivity file: ${args.xml}`);
    if (annotText) console.log(`Base-pair annotation file: ${args.basePairAnno}`);
    if (helixCovText) console.log(`Helix covariation file: ${args.helixCovAnno}`);

    console.log(`Layout: ${layout}`);

    // Run entirely in the main process using jsdom — no display needed on any platform
    const { JSDOM } = require('jsdom');
    const rfviewSrc = fs.readFileSync(path.join(APP_ROOT, 'scripts', 'RFview.js'), 'utf8');

    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="viewer"></div></body></html>', {
        pretendToBeVisual: true,
        resources: 'usable',
        runScripts: 'dangerously',
    });

    const { window } = dom;
    const { document } = window;

    // Stub out browser APIs that RFview uses but jsdom doesn't provide
    window.requestAnimationFrame = cb => setTimeout(cb, 0);
    window.cancelAnimationFrame  = id => clearTimeout(id);
    window.getComputedStyle = (el) => ({
        getPropertyValue: (prop) => {
            const map = {
                '--rv-base-radius': '12', '--rv-basepair-width': '2',
                '--rv-backbone-width': '2', '--rv-base-stroke-width': '2',
                '--rv-pair-annot-opacity': '0.5', '--rv-pair-annot-stroke-width': '1.5',
                '--rv-pair-annot-padding': '5', '--rv-helix-annot-padding': '20',
                '--rv-helix-annot-opacity': '0.5', '--rv-noncanon-dot-r': '4.5',
                '--rv-base-index-font-size': '11', '--rv-base-label-font-size': '13',
                '--rv-base-index-offset': '3',
                '--rv-backbone': '#1f2328', '--rv-basepair': '#1f2328',
                '--rv-pseudopair': '#1f2328', '--rv-text': '#1f2328',
                '--rv-base-fill': '#ffffff', '--rv-base-stroke': '#1f2328',
                '--rv-bg': '#ffffff', '--rv-surface': '#f6f8fa',
                '--rv-muted': '#656d76', '--rv-accent': '#0969da',
            };
            return map[prop] ?? '';
        },
        cssText: '',
    });

    // Execute RFview.js directly in the jsdom window context via vm
    const vm = require('vm');
    vm.runInContext(rfviewSrc, dom.getInternalVMContext());

    const RFviewJS = window.RFviewJS;
    if (!RFviewJS) throw new Error('RFviewJS failed to initialise in jsdom');

    // Run the same logic as the renderer payload
    const viewer = new RFviewJS(document.getElementById('viewer'), { statusBar: false });
    if (layout && layout !== 'auto') viewer.setLayoutAlgorithm(layout);
    if (args.noLegend) viewer._noLegend = true;

    let structs;
    try { structs = RFviewJS.parseDbFile(structureText, structureName); }
    catch (e) { console.error(`[!] Cannot parse "${structureName}": ${e.message}`); process.exit(1); }
    if (!structs?.length) { console.error(`[!] No structure records found in "${structureName}".`); process.exit(1); }

    if (xmlText) {
        let recs;
        try { recs = RFviewJS.parseXmlReactivity(xmlText); }
        catch (e) { console.error(`[!] Cannot parse reactivity XML: ${e.message}`); process.exit(1); }
        const norm = s => (s || '').replace(/[Tt]/g, 'U').toUpperCase();
        for (const s of structs) {
            const rec = recs.find(r => norm(r.sequence) === norm(s.sequence));
            if (rec?.values?.length === s.sequence.length) s.values = rec.values;
        }
    }

    const hasReact = structs.some(s => s.values);
    const defaultCM = hasReact ? {
        type: 'discrete', min: 0, nanColor: '#999999',
        stops: [{ value: 0.3, color: '#111111' }, { value: 0.7, color: '#f5c518' }, { value: 1.0, color: '#cc0000' }]
    } : undefined;

    viewer.load({ sequence: structs[0].sequence, structures: structs, colorMap: defaultCM });
    if (hasReact) viewer._showColors = true;
    if (args.noPk)      viewer._showPseudoknots = false;
    if (args.noLabels)  viewer._showR3dLabels   = false;
    if (args.noInsets)  viewer._showR3dInsets   = false;
    if (args.incSsEnds) viewer.setShowSsEnds(true);
    if (!viewer._rna) { console.error('[!] Structure failed to render.'); process.exit(1); }

    if (annotText) {
        try { viewer.loadCov(annotText); }
        catch (e) { console.error(`[!] Cannot load annotations: ${e.message}`); process.exit(1); }
    }
    if (args.percCanonical && viewer._rna?.pairCanonPct) {
        viewer._covCanonMode = true;
        viewer._applyCovCanonColoring();
    }
    if (helixCovText) {
        try { viewer.loadCov(helixCovText); }
        catch (e) { console.error(`[!] Cannot load helix annotations: ${e.message}`); process.exit(1); }
    }

    viewer._render();
    const svgText = viewer.exportSVGString();
    if (!svgText) { console.error('[!] exportSVGString() returned empty.'); process.exit(1); }

    fs.writeFileSync(outPath, svgText, 'utf8');
    console.log(`SVG written to: ${outPath}`);

    if (pdfPath) {
        // PDF still needs a BrowserWindow — use a minimal one just for printToPDF
        const pdfWin = new BrowserWindow({ width: 800, height: 600, show: false,
            webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: true } });
        const vbMatch = svgText.match(/viewBox="[\d.\s-]+[\s-]+([\d.]+)\s+([\d.]+)"/);
        const wMatch  = svgText.match(/\bwidth="([\d.]+)"/);
        const hMatch  = svgText.match(/\bheight="([\d.]+)"/);
        const svgW = vbMatch ? parseFloat(vbMatch[1]) : wMatch ? parseFloat(wMatch[1]) : 800;
        const svgH = vbMatch ? parseFloat(vbMatch[2]) : hMatch ? parseFloat(hMatch[1]) : 600;
        const html = `<!DOCTYPE html><html><head><style>@page{margin:0;size:${svgW}px ${svgH}px}` +
            `html,body{margin:0;padding:0;width:${svgW}px;height:${svgH}px;overflow:hidden}` +
            `svg{display:block;width:${svgW}px!important;height:${svgH}px!important}</style></head><body>${svgText}</body></html>`;
        await pdfWin.webContents.loadURL('about:blank');
        await pdfWin.webContents.executeJavaScript(`document.open();document.write(${JSON.stringify(html)});document.close();`);
        await new Promise(r => setTimeout(r, 200));
        const pdfData = await pdfWin.webContents.printToPDF({ printBackground: true, margins: { marginType: 'none' } });
        fs.writeFileSync(pdfPath, pdfData);
        console.log(`PDF written to: ${pdfPath}`);
        pdfWin.close();
    }

    process.exit(0);
}

// App lifecycle — in CLI mode run jsdom logic immediately without waiting for
// app.whenReady(), which would trigger display/GTK initialization on Linux.
if (isCLI) {

    runHeadless(cliArgs).catch(err => {
        console.error(`[!] Error: ${err.message}`);
        process.exit(1);
    });

} else {

    app.whenReady().then(() => createWindow());

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

}
