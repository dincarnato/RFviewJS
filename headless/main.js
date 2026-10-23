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
 RFview (v1.2.0)
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
const STATE_FILE = (() => { try { return path.join(app.getPath('userData'), 'window-state.json'); } catch { return path.join(require('os').tmpdir(), 'rfview-window-state.json'); } })();
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

// Stockholm input (--structureFile, or the alignment downloaded for --rfam) is read in chunks of
// whole lines and fed straight into RFview's own Stockholm reader, so it is never held in memory as
// a whole (RFview keeps the first 1000 sequences as text for the alignment view and uses all of them,
// compactly, for the consensus: GSC up to 1000 sequences, PB above).
// Everything here is synchronous on purpose: handing control back to the event loop would let
// Electron initialise the display, which fails on machines without one.
function syncLineChunks(file, chunkSize = 4 * 1024 * 1024) {
    const { StringDecoder } = require('string_decoder');
    const decoder = new StringDecoder('utf8'); // Keeps multi-byte characters split across reads intact
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.allocUnsafe(chunkSize);
    let carry = '', done = false;
    return {
        // Next block of complete lines (without the final line break), or null at the end of the file
        next() {
            while (!done) {
                const bytesRead = fs.readSync(fd, buf, 0, chunkSize, null);
                if (bytesRead === 0) {
                    done = true;
                    fs.closeSync(fd);
                    const rest = carry + decoder.end();
                    carry = '';
                    return rest.length ? rest : null;
                }
                const text = carry + decoder.write(buf.subarray(0, bytesRead));
                let cut = text.lastIndexOf('\n');
                if (cut < 0) cut = text.lastIndexOf('\r');
                if (cut < 0) { carry = text; continue; } // No line break yet: read more
                carry = text.slice(cut + 1);
                return text.slice(0, cut);
            }
            return null;
        },
    };
}
// Whether a file starts with '# STOCKHOLM' (optionally after a UTF-8 byte-order mark / whitespace)
function isStockholmFile(file) {
    const peek = Buffer.alloc(64);
    const fd = fs.openSync(file, 'r');
    const n = fs.readSync(fd, peek, 0, 64, 0);
    fs.closeSync(fd);
    return peek.subarray(0, n).toString('utf8').replace(/^\uFEFF/, '').trimStart().startsWith('# STOCKHOLM');
}
// Download url to file without leaving the main thread: a child process (this same executable run
// as plain Node) streams the response to disk while execFileSync waits for it.
function downloadSync(url, file) {
    const script = `
        const [url, out] = process.argv.slice(-2);
        require(url.startsWith('http:') ? 'http' : 'https').get(url, res => {
            if (res.statusCode !== 200) { res.resume(); process.stderr.write('HTTP ' + res.statusCode); process.exit(3); }
            const f = require('fs').createWriteStream(out);
            res.pipe(f);
            f.on('finish', () => process.exit(0));
            f.on('error', e => { process.stderr.write(e.message); process.exit(2); });
        }).on('error', e => { process.stderr.write(e.message); process.exit(2); });`;
    try {
        require('child_process').execFileSync(process.execPath, ['-e', script, url, file], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        return null;
    } catch (e) {
        return (e.stderr && e.stderr.toString().trim()) || e.message;
    }
}

// Headless / CLI mode
async function runHeadless(args) {

    if (!args.structureFile && !args.rfam) {
        console.error('[!] Error: either --structureFile or --rfam is required'); process.exit(1);
    }

    if (args.rfam && !/^RF\d+$/i.test(args.rfam)) {
        console.error(`[!] Error: invalid Rfam ID "${args.rfam}", must be RF followed by digits`); process.exit(1);
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

    // Stockholm input (an Rfam alignment, or a --structureFile starting with '# STOCKHOLM') is
    // streamed into RFview's reader (see syncLineChunks), other structure files are read whole.
    let structureText = null, structureName, structureStream = null;
    let removeTmp = () => {}; // Deletes the downloaded Rfam alignment (process.exit skips 'exit' handlers here)
    if (args.rfam) {
        const rfamId = args.rfam.toUpperCase();
        console.log(`Fetching Rfam alignment: ${rfamId}`);
        const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rfview-'));
        removeTmp = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} };
        const tmpFile = path.join(tmpDir, rfamId + '.sto');
        const err = downloadSync(`https://rfam.org/family/${rfamId}/alignment/stockholm?gzip=0&download=0`, tmpFile);
        if (err) {
            removeTmp();
            console.error(/^HTTP \d+$/.test(err) ? `[!] Error: ${err}, family "${rfamId}" not found on Rfam` : `[!] Error: ${err}`);
            process.exit(1);
        }
        if (!isStockholmFile(tmpFile)) {
            removeTmp();
            console.error(`[!] Error: Rfam returned no valid alignment for "${rfamId}". Please verify ID.`);
            process.exit(1);
        }
        structureStream = syncLineChunks(tmpFile);
        structureName = rfamId + '.sto';
    } else {
        if (isStockholmFile(args.structureFile)) structureStream = syncLineChunks(args.structureFile);
        else structureText = fs.readFileSync(args.structureFile, 'utf8');
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

    // Run entirely in the main process using jsdom, no display needed on any platform
    const { JSDOM } = require('jsdom');
    const rfviewSrc = fs.readFileSync(path.join(APP_ROOT, 'scripts', 'RFview.js'), 'utf8');

    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="viewer"></div></body></html>', {
        pretendToBeVisual: true,
        resources: 'usable',
        runScripts: 'dangerously',
    });

    const { window } = dom;
    const { document } = window;

    // Stub out browser APIs that RFview uses but jsdom doesn't provide. The CSS custom properties
    // come from the default theme declared in RFview.js itself (the .rv{...} rule), so the headless
    // build always draws with the same base radius, fonts, offsets and colours as the browser.
    window.requestAnimationFrame = cb => setTimeout(cb, 0);
    window.cancelAnimationFrame  = id => clearTimeout(id);
    // jsdom has no layout, so every element measures 0 x 0. Report the size of the hidden window
    // the desktop CLI renders in (1200 x 900), since the SS_cons label size follows the canvas size.
    for (const [prop, px] of [['clientWidth', 1200], ['clientHeight', 900]])
        Object.defineProperty(window.HTMLElement.prototype, prop, { get: () => px, configurable: true });
    const cssVars = {};
    const rvRule = rfviewSrc.match(/\.rv\{([^}]*)\}/);
    if (rvRule) for (const m of rvRule[1].matchAll(/(--rv-[\w-]+)\s*:\s*([^;]+)/g)) cssVars[m[1]] = m[2].trim();
    window.getComputedStyle = () => ({
        getPropertyValue: prop => cssVars[prop] ?? '',
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

    // Stockholm alignments go line by line into RFview's Stockholm reader (synchronous reads: the
    // reader's awaits resolve without returning to the event loop)
    const feedLines = async (_file, onLine) => {
        for (let chunk; (chunk = structureStream.next()) !== null;) {
            const lines = chunk.split(/\r\n|\r|\n/);
            for (let i = 0; i < lines.length; i++) onLine(lines[i]);
        }
    };
    let structs;
    try {
        structs = structureStream
            ? await RFviewJS.parseStockholmFileChunked(null, structureName, feedLines, false, null)
            : RFviewJS.parseDbFile(structureText, structureName);
    }
    catch (e) { removeTmp(); console.error(`[!] Cannot parse "${structureName}": ${e.message}`); process.exit(1); }
    removeTmp(); // the alignment has been read
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
    if (!viewer._rna) { console.error('[!] Error: Structure failed to render.'); process.exit(1); }

    if (annotText) {
        try { viewer.loadCov(annotText); }
        catch (e) { console.warn('[!] Warning: Cannot load annotations: ' + e.message); }
    }
    if (args.percCanonical && viewer._rna?.pairCanonPct) {
        viewer._covCanonMode = true;
        viewer._applyCovCanonColoring();
    }
    if (helixCovText) {
        try { viewer.loadCov(helixCovText); }
        catch (e) { console.warn('[!] Warning: Cannot load helix annotations: ' + e.message); }
    }

    viewer._render();
    const svgText = viewer.exportSVGString();
    if (!svgText) { console.error('[!] Error: exportSVGString() returned empty.'); process.exit(1); }

    fs.writeFileSync(outPath, svgText, 'utf8');
    console.log(`SVG written to: ${outPath}`);

    if (pdfPath) {
        const PDFDocument = require('pdfkit');
        const SVGtoPDF   = require('svg-to-pdfkit');

        // Prepare SVG for pdf rendering:
        // 1. Inline CSS class rules as element attributes (svg-to-pdfkit classList.indexOf bug)
        // 2. Strip <style> block and duplicate xmlns (breaks XML parser)
        // 3. Shift negative viewBox origin to 0,0 (negative coords get clipped by pdf page boundary)
        const prepareSvgForPdf = (svgStr) => {
            const styleMatch = svgStr.match(/<style[\s\S]*?<\/style>/);
            const classProps = {};
            if (styleMatch)
                for (const m of styleMatch[0].matchAll(/\.([\w-]+)\s*\{([^}]+)\}/g))
                    classProps[m[1]] = m[2].trim();
            let result = svgStr
                .replace(/<([\w]+)((?:\s[^>]*?)?)(\/?)>/g, (tag, name, attrs, selfClose) => {
                    if (!attrs) return tag;
                    const cm = attrs.match(/\bclass="([^"]+)"/);
                    if (!cm) return tag;
                    const props = cm[1].split(/\s+/).map(c => classProps[c]).filter(Boolean).join(';');
                    if (!props) return tag;
                    const sm = attrs.match(/\bstyle="([^"]*)"/);
                    const newStyle = sm ? `style="${props};${sm[1]}"` : `style="${props}"`;
                    const newAttrs = sm ? attrs.replace(/\bstyle="[^"]*"/, newStyle) : attrs + ` ${newStyle}`;
                    return `<${name}${newAttrs}${selfClose}>`;
                })
                .replace(/<style[\s\S]*?<\/style>/g, '')
                .replace(/(<svg\b[^>]*?)\s+xmlns="[^"]*"(\s[^>]*xmlns="[^"]*")/, '$1$2');
            const vbM = result.match(/viewBox="([\d.\s-]+)"/);
            if (vbM) {
                const [vbX, vbY, vbW, vbH] = vbM[1].trim().split(/\s+/).map(Number);
                if (vbX !== 0 || vbY !== 0) {
                    result = result
                        .replace(/viewBox="[\d.\s-]+"/, `viewBox="0 0 ${vbW} ${vbH}"`)
                        .replace(/(<svg\b[^>]*>)/, `$1<g transform="translate(${-vbX},${-vbY})">`)
                        .replace(/<\/svg>/, '</g></svg>');
                }
            }
            // pdfkit's built-in fonts are WinAnsi only: map the glyphs they lack
            return result.replace(/′/g, "'").replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/↔/g, '<->');
        };

        const strippedSvg = prepareSvgForPdf(svgText);
        const vbParts = svgText.match(/viewBox="([\d.\s-]+)"/)?.[1].trim().split(/\s+/).map(Number);
        const wMatch  = svgText.match(/\bwidth="([\d.]+)"/);
        const hMatch  = svgText.match(/\bheight="([\d.]+)"/);
        const svgW = vbParts ? vbParts[2] : wMatch ? parseFloat(wMatch[1]) : 800;
        const svgH = vbParts ? vbParts[3] : hMatch ? parseFloat(hMatch[1]) : 600;
        const doc = new PDFDocument({ size: [svgW, svgH], margin: 0, autoFirstPage: true });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        await new Promise((resolve, reject) => {
            doc.on('end', resolve);
            doc.on('error', reject);
            SVGtoPDF(doc, strippedSvg, 0, 0, { width: svgW, height: svgH });
            doc.end();
        });
        fs.writeFileSync(pdfPath, Buffer.concat(chunks));
        console.log(`PDF written to: ${pdfPath}`);
    }

    process.exit(0);
}

// App lifecycle, in CLI mode run jsdom logic immediately without waiting for
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
