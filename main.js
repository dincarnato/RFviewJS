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
const isCLI = Boolean(cliArgs.structureFile || cliArgs.rfam);

// These must be called immediately in CLI mode
if (isCLI) {

    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.dock?.hide();

}

// Command line help
if (cliArgs.help || cliArgs.h) {

    console.log(`
 RFview (v1.1.0)
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
            preload:          path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
        backgroundColor: '#ffffff',
        show: false,
        icon: path.join(__dirname, 'assets', 'icon.png'),

    });

    if (s.maximized) win.maximize();

    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(__dirname, 'scripts', 'index.html'));
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
        console.error('[!] Error: either --structureFile or --rfam is required'); app.exit(1); return;
    }

    if (args.rfam && !/^RF\d+$/i.test(args.rfam)) {
        console.error(`[!] Error: invalid Rfam ID "${args.rfam}" — must be RF followed by digits`); app.exit(1); return;
    }

    if (args.structureFile && !fs.existsSync(args.structureFile)) {
        console.error(`[!] Error: Structure file ${args.structureFile} not found`); app.exit(1); return;
    }

    if (args.xml && !fs.existsSync(args.xml)) {
        console.error(`[!] Error: Reactivity file ${args.xml} not found`); app.exit(1); return;
    }

    if (args.basePairAnno && !fs.existsSync(args.basePairAnno)) {
        console.error(`[!] Error: Base-pair annotation/covariation file ${args.basePairAnno} not found`); app.exit(1); return;
    }

    if (args.helixCovAnno && !fs.existsSync(args.helixCovAnno)) {
        console.error(`[!] Error: Helix covariation file ${args.helixCovAnno} not found`); app.exit(1); return;
    }

    const validLayouts = ['auto', 'naview', 'radiate'];
    const layout = (args.layout || 'auto').toLowerCase();
    if (!validLayouts.includes(layout)) {
        console.error(`[!] Error: unknown layout "${layout}" (available: ${validLayouts.join(', ')})`); app.exit(1); return;
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
        app.exit(1);
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

    const headlessWin = new BrowserWindow({

        width: 1200, height: 900, show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },

    });

    // Forward renderer console output so errors are visible in the terminal
    headlessWin.webContents.on('console-message', (event) => {

        const level = event.level ?? 0;
        const message = event.message ?? '';

        if (level >= 1) console.log(['[dbg]', '[inf]', '[warn]', '[err]'][level] ?? '[log]', message);

    });

    headlessWin.webContents.on('did-fail-load', (_, code, desc) => {

        console.error(`[!] Error: renderer failed to load (${code} ${desc})`);
        app.exit(1);

    });

    // Loads the existing index.html and loads RFview.js.
    // app.js also runs, creating a GUI viewer, but we create a second one below
    headlessWin.loadFile(path.join(__dirname, 'scripts', 'index.html'));

    headlessWin.webContents.once('did-finish-load', () => {

        // Embeds all data as JSON so no IPC hand-off is needed.
        // executeJavaScript runs in the renderer's main world where RFviewJS is defined.
        const payload = JSON.stringify({ structureText, structureName, xmlText, annotText, annotName, helixCovText, helixCovName, layout, outPath, pdfPath, noLegend: !!args.noLegend, noPk: !!args.noPk, noLabels: !!args.noLabels, noInsets: !!args.noInsets, incSsEnds: !!args.incSsEnds, percCanonical: !!args.percCanonical });

        const code = `
(function () {
  try {
    const d = ${payload};

    /* Creates a fresh viewer. app.js already added a .rv div; RFviewJS adds
       another and works entirely within its own root — no conflict.        */
    const viewer = new RFviewJS(document.getElementById('viewer'), { statusBar: false });
    if (d.layout && d.layout !== 'auto') viewer.setLayoutAlgorithm(d.layout);
    if (d.noLegend) viewer._noLegend = true;

    /* Parse structure */
    let structs;
    try { structs = RFviewJS.parseDbFile(d.structureText, d.structureName); }
    catch (e) { window.electronAPI.headlessError('Cannot parse "' + d.structureName + '": ' + e.message); return; }
    if (!structs || !structs.length) {
      window.electronAPI.headlessError('No structure records found in "' + d.structureName + '".');
      return;
    }

    /* Parse reactivity XML */
    if (d.xmlText) {
      let recs;
      try { recs = RFviewJS.parseXmlReactivity(d.xmlText); }
      catch (e) { window.electronAPI.headlessError('Cannot parse reactivity XML: ' + e.message); return; }
      const norm = function(s) { return (s || '').replace(/[Tt]/g, 'U').toUpperCase(); };
      for (const s of structs) {
        const rec = recs.find(function(r) { return norm(r.sequence) === norm(s.sequence); });
        if (rec && rec.values && rec.values.length === s.sequence.length) s.values = rec.values;
      }
    }

    /* Load structure first (no annotations yet) */
    const hasReact = structs.some(function(s) { return s.values; });
    const defaultCM = hasReact ? {
      type: 'discrete', min: 0, nanColor: '#999999',
      stops: [
        { value: 0.3, color: '#111111' },
        { value: 0.7, color: '#f5c518' },
        { value: 1.0, color: '#cc0000' }
      ]
    } : undefined;
    viewer.load({ sequence: structs[0].sequence, structures: structs, colorMap: defaultCM });
    if (hasReact) viewer._showColors = true;
    if (d.noPk) viewer._showPseudoknots = false;   
    if (d.noLabels) viewer._showR3dLabels = false;     
    if (d.noInsets) viewer._showR3dInsets = false;
    if (d.incSsEnds) viewer.setShowSsEnds(true);
    if (!viewer._rna) { window.electronAPI.headlessError('Structure failed to render.'); return; }

    /* Apply pair annotations post-load
       Doing this after load() means we can use viewer._rna.pairs (the real
       pair table) to remap Stockholm alignment coordinates and filter out
       any pairs that are not present in the consensus structure.            */
    if (d.annotText) {
      try {
        viewer.loadCov(d.annotText);
      } catch (e) {
        window.electronAPI.headlessError('Cannot load annotations: ' + e.message);
        return;
      }
    }
    if (d.percCanonical && viewer._rna?.pairCanonPct) {
        viewer._covCanonMode = true;
        viewer._applyCovCanonColoring();
    }

    /* Apply helix-level covariation post-load */
    if (d.helixCovText) {
      try {
        viewer.loadCov(d.helixCovText); // auto-detects helixcov format
      } catch (e) {
        window.electronAPI.headlessError('Cannot load helix annotations: ' + e.message);
        return;
      }
    }

    /* Export SVG (synchronous, no download dialog) */
    viewer._render();  // re-render to apply any visibility flags (noPk, noLabels, noInsets)
    const svgText = viewer.exportSVGString();
    if (!svgText) { window.electronAPI.headlessError('exportSVGString() returned empty.'); return; }

    window.electronAPI.headlessDone(svgText, d.outPath, d.pdfPath);

  } catch (err) {
    window.electronAPI.headlessError(err && err.message ? err.message : String(err));
  }
})();
`;
        headlessWin.webContents.executeJavaScript(code).catch(err => {

            console.error('executeJavaScript failed:', err.message);
            app.exit(1);

        });

    });

    setTimeout(() => {

        console.error('[!] Error: timed out — renderer did not respond within 30 s.');
        app.exit(1);

    }, 30_000);

}

// App lifecycle

app.whenReady().then(() => {
    if (isCLI) runHeadless(cliArgs).catch(err => {
        console.error(`[!] Error: ${err.message}`);
        app.exit(1);
    });
    else createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || isCLI) app.quit();
});

app.on('activate', () => {
    if (!isCLI && BrowserWindow.getAllWindows().length === 0) createWindow();
});
