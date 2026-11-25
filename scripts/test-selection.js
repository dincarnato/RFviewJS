// Self-check for the multi-base selection, its pivot and its rotation. Needs a DOM, so it
// runs in Electron: ./node_modules/.bin/electron scripts/test-selection.js
const assert = require('assert');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const SEQ = 'GGGAAACCCUUUGGGAAACCCUUUGGGAAACCCUUUAAGGGAAACCCUU';
const DB  = '(((...)))...(((...)))...(((...)))....(((...)))...';
const DB2 = '(((...)))...(((...)))...((.....))....(((...)))...'; // the third hairpin pairs differently

app.whenReady().then(async () => {

	const win = new BrowserWindow({ width: 1000, height: 800, show: false });
	win.webContents.on('console-message', (_e, _l, m) => console.log('  [page]', m));
	await win.loadFile(path.join(__dirname, 'index.html'));
	const out = await win.webContents.executeJavaScript(`(async () => {
		const r = {};
		if (typeof viewer !== 'undefined' && viewer) viewer.destroy(); // the app shell's own viewer
		const v = new RFviewJS(document.getElementById('viewer'));
		v.load({ fileText: '>t\\n${SEQ}\\n${DB}\\n' });
		const svg = v._svgEl, coords = v._rna.coords;
		const s2c = p => { const b = svg.getBoundingClientRect();
			return { x: p.x * v._vscale + v._vx + b.left, y: p.y * v._vscale + v._vy + b.top }; };
		const ev = (el, type, c, mod = {}) => el.dispatchEvent(new MouseEvent(type,
			Object.assign({ bubbles: true, cancelable: true, button: 0, clientX: c.x, clientY: c.y }, mod)));
		const baseEl = i => svg.querySelector('[data-idx="' + i + '"]');
		const drag = (el, from, to, mod) => { ev(el, 'mousedown', from, mod);
			ev(window, 'mousemove', to, mod); ev(window, 'mouseup', to, mod); };

		// Ctrl+drag from empty space: box-select bases 12..20
		let bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
		for (let i = 12; i <= 20; i++) { bb.x0 = Math.min(bb.x0, coords[i].x); bb.x1 = Math.max(bb.x1, coords[i].x);
			bb.y0 = Math.min(bb.y0, coords[i].y); bb.y1 = Math.max(bb.y1, coords[i].y); }
		drag(svg, s2c({ x: bb.x0 - 4, y: bb.y0 - 4 }), s2c({ x: bb.x1 + 4, y: bb.y1 + 4 }), { ctrlKey: true });
		r.boxed = [...v._sel].sort((a, b) => a - b);
		r.overlay = ['.rv-sel-box', '.rv-sel-rot', '.rv-sel-pivot'].every(s => svg.querySelector(s));
		// The pivot defaults to the hinge: the selected end still attached to the chain
		r.pivotIsHinge = Math.hypot(v._selPivot.x - coords[r.boxed[0]].x, v._selPivot.y - coords[r.boxed[0]].y) < 1e-9;

		// Ctrl+click adds a base, Ctrl+click again removes it
		const t = 40;
		drag(baseEl(t), s2c(coords[t]), s2c(coords[t]), { ctrlKey: true });
		r.added = v._sel.has(t);
		drag(baseEl(t), s2c(coords[t]), s2c(coords[t]), { ctrlKey: true });
		r.removed = !v._sel.has(t);

		// Ctrl+Alt+drag subtracts from the selection
		const lo = r.boxed[0], hi = r.boxed[0] + 1;
		let b2 = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
		for (const i of [lo, hi]) { b2.x0 = Math.min(b2.x0, coords[i].x); b2.x1 = Math.max(b2.x1, coords[i].x);
			b2.y0 = Math.min(b2.y0, coords[i].y); b2.y1 = Math.max(b2.y1, coords[i].y); }
		drag(svg, s2c({ x: b2.x0 - 2, y: b2.y0 - 2 }), s2c({ x: b2.x1 + 2, y: b2.y1 + 2 }), { ctrlKey: true, altKey: true });
		r.subtracted = !v._sel.has(lo) && !v._sel.has(hi) && v._sel.size === r.boxed.length - 2;

		// The pivot can be dragged to put the bend somewhere else
		const pv = s2c(v._selPivot), was = { x: v._selPivot.x, y: v._selPivot.y };
		drag(svg.querySelector('.rv-sel-pivot'), pv, { x: pv.x + 35, y: pv.y + 15 });
		r.pivotMoved = v._pivotUser && Math.hypot(v._selPivot.x - was.x, v._selPivot.y - was.y) > 5;

		// Dragging the handle rotates the selection - and only the selection - about the pivot
		const P = { x: v._selPivot.x, y: v._selPivot.y };
		const sel = [...v._sel], before = sel.map(i => ({ i, x: coords[i].x, y: coords[i].y }));
		const free = [...Array(v._rna.n).keys()].filter(i => !v._sel.has(i));
		const freeBefore = free.map(i => ({ i, x: coords[i].x, y: coords[i].y }));
		const h = svg.querySelector('.rv-sel-rot');
		const hx = +h.getAttribute('cx'), hy = +h.getAttribute('cy');
		const rad = Math.hypot(hx - P.x, hy - P.y), a0 = Math.atan2(hy - P.y, hx - P.x), a1 = a0 + Math.PI / 2;
		drag(h, s2c({ x: hx, y: hy }), s2c({ x: P.x + rad * Math.cos(a1), y: P.y + rad * Math.sin(a1) }));
		r.rotErr = Math.max(...before.map(({ i, x, y }) =>
			Math.hypot(coords[i].x - (P.x - (y - P.y)), coords[i].y - (P.y + (x - P.x)))));
		r.freeErr = Math.max(...freeBefore.map(({ i, x, y }) => Math.hypot(coords[i].x - x, coords[i].y - y)));
		r.rotCleared = v._selRot === null;

		// The drag cross in the corner moves the selection, like dragging a selected base does
		{
			const i0 = [...v._sel][0], was = coords[i0].x;
			const mv = svg.querySelector('.rv-sel-move');
			r.moveCross = !!mv;
			const p = s2c({ x: +mv.getAttribute('cx'), y: +mv.getAttribute('cy') });
			drag(mv, p, { x: p.x + 40, y: p.y });
			r.crossDx = +(coords[i0].x - was).toFixed(2);
			r.crossKeptSel = v._sel.has(i0);
		}

		// Alt+click on a link puts a rotation point between the two nucleotides
		const cut = 21;
		const midPt = { x: (coords[cut].x + coords[cut + 1].x) / 2, y: (coords[cut].y + coords[cut + 1].y) / 2 };
		const mid = s2c(midPt);
		drag(svg, mid, mid, { altKey: true });
		r.cut = !!v._rna.hinges?.has(cut);
		r.cutDrawn = svg.querySelectorAll('.rv-hinge').length;
		r.cutSel = [...v._sel].sort((a, b) => a - b);
		r.cutPivot = Math.hypot(v._selPivot.x - midPt.x, v._selPivot.y - midPt.y) < 1e-9;
		// the rotation point can be dragged, and the link bends through it
		const hEl = svg.querySelector('.rv-hinge');
		drag(hEl, mid, { x: mid.x + 30, y: mid.y - 20 });
		const hp = v._rna.hinges.get(cut);
		r.hingeMoved = Math.hypot(hp.x - midPt.x, hp.y - midPt.y) > 5;
		r.hingeBends = [...svg.querySelectorAll('.rv-backbone')].some(l =>
			Math.abs(+l.getAttribute('x2') - hp.x) < 1e-6 && Math.abs(+l.getAttribute('y2') - hp.y) < 1e-6);
		r.expHinge = !(v._saveSVG(true) || '').includes('rv-hinge'); // an editing aid, never exported
		// Ctrl+Z puts it back where it was, Ctrl+Shift+Z moves it again
		const key = (k, mod) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, ctrlKey: true }, mod)));
		key('z');
		r.undone = Math.hypot(v._rna.hinges.get(cut).x - midPt.x, v._rna.hinges.get(cut).y - midPt.y) < 1e-9;
		key('z', { shiftKey: true });
		r.redone = Math.hypot(v._rna.hinges.get(cut).x - hp.x, v._rna.hinges.get(cut).y - hp.y) < 1e-9;
		drag(svg, s2c(v._rna.hinges.get(cut)), s2c(v._rna.hinges.get(cut)), { altKey: true }); // Alt+click removes it
		r.healed = !v._rna.hinges.has(cut) && svg.querySelectorAll('.rv-hinge').length === 0;

		// Straightening: select a helix, click the handle, check the ladder is regular
		v._sel = new Set(); v._selPivot = null; v._selHinge = null; v._pivotUser = false;
		for (let i = 0; i <= 8; i++) v._sel.add(i);
		v._render();
		const st = svg.querySelector('.rv-sel-straight');
		r.straightHandle = !!st;
		const stPt = s2c({ x: +st.getAttribute('cx'), y: +st.getAttribute('cy') });
		drag(st, stPt, stPt);
		{
			const mids = [0, 1, 2].map(k => ({ x: (coords[k].x + coords[8 - k].x) / 2, y: (coords[k].y + coords[8 - k].y) / 2 }));
			const d01 = Math.hypot(mids[1].x - mids[0].x, mids[1].y - mids[0].y);
			const d12 = Math.hypot(mids[2].x - mids[1].x, mids[2].y - mids[1].y);
			const cross = (mids[1].x - mids[0].x) * (mids[2].y - mids[0].y) - (mids[1].y - mids[0].y) * (mids[2].x - mids[0].x);
			r.evenRise = Math.abs(d01 - d12) < 1e-6;
			r.collinear = Math.abs(cross) < 1e-6;
			const widths = [0, 1, 2].map(k => Math.hypot(coords[k].x - coords[8 - k].x, coords[k].y - coords[8 - k].y));
			r.evenWidth = Math.max(...widths) - Math.min(...widths) < 1e-6;
			// and the perpendicular: the pair direction must be square to the axis
			const dot = (coords[0].x - coords[8].x) * (mids[1].x - mids[0].x) + (coords[0].y - coords[8].y) * (mids[1].y - mids[0].y);
			r.square = Math.abs(dot) < 1e-6;
		}
		{
			const m0 = { x: (coords[0].x + coords[8].x) / 2, y: (coords[0].y + coords[8].y) / 2 };
			const m1 = { x: (coords[2].x + coords[6].x) / 2, y: (coords[2].y + coords[6].y) / 2 };
			const deg = Math.atan2(m1.y - m0.y, m1.x - m0.x) * 180 / Math.PI;
			r.snapped = Math.abs(deg / 45 - Math.round(deg / 45)) < 1e-9;
		}
		// Ctrl+Z brings back a selection dropped by clicking somewhere else
		{
			const was = [...v._sel].sort((a, b) => a - b).join(',');
			const far = s2c({ x: coords[0].x + 900, y: coords[0].y + 900 });
			drag(svg, far, far);
			r.clickCleared = v._sel.size === 0;
			key('z');
			r.reselected = [...v._sel].sort((a, b) => a - b).join(',') === was;
		}
		key('z');

		// Domains: colour the backbone links, names and colours stay editable
		v._sel = new Set(); for (let i = 12; i <= 20; i++) v._sel.add(i);
		v._root.querySelector('.rv-btn-settings').click(); // builds the settings panel
		const dom = v.addDomainFromSelection();
		r.domain = dom && { name: dom.name, start: dom.start, end: dom.end, color: dom.color };
		r.domainOn = v._domainColors;
		const rgb = h => 'rgb(' + [1, 3, 5].map(k => parseInt(h.substr(k, 2), 16)).join(', ') + ')';
		r.domainLinks = [...svg.querySelectorAll('.rv-backbone')].filter(l => l.style.stroke === rgb(dom.color)).length;
		const row = v._root.querySelector('.rv-outline-row');
		const nameIn = row.querySelector('.rv-outline-name'), colIn = row.querySelector('input[type=color]');
		nameIn.value = 'P4-P6'; nameIn.dispatchEvent(new Event('input', { bubbles: true }));
		colIn.value = '#123456'; colIn.dispatchEvent(new Event('input', { bubbles: true }));
		v._render();
		r.renamed = v.getOutlineDomains()[0].name === 'P4-P6';
		r.recolored = [...svg.querySelectorAll('.rv-backbone')].filter(l => l.style.stroke === rgb('#123456')).length > 0;
		r.legend = (v._outlineLegend?.textContent || '').includes('P4-P6');
		v.setDomainColors(false);
		r.domainOff = [...svg.querySelectorAll('.rv-backbone')].every(l => !l.style.stroke);

		// The sequence strip: hidden until the status-bar button is clicked, letters coloured
		// by domain, and click / drag / Ctrl / Alt / Shift edit the same selection
		r.seqHidden = !v._seqView.classList.contains('rv-visible');
		v._root.querySelector('.rv-sb-seqview').click();
		r.seqShown = v._seqView.classList.contains('rv-visible');
		const chars = () => [...v._seqView.querySelectorAll('.rv-seq-ch')];
		r.seqLen = chars().length;
		r.seqRuler = v._seqView.querySelector('.rv-seq-ruler').textContent;
		r.seqColored = chars().filter(c => c.style.color).length;
		{
			const md = (el, mod) => el.dispatchEvent(new MouseEvent('mousedown', Object.assign({ bubbles: true, cancelable: true, button: 0 }, mod)));
			const over = el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			const up = () => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			md(chars()[5]); over(chars()[9]); up(); v._render();
			r.seqDragSel = [...v._sel].sort((a, b) => a - b).join(',');
			md(chars()[20], { ctrlKey: true }); up(); v._render();
			r.seqCtrlAdd = v._sel.has(20) && v._sel.has(5);
			md(chars()[7], { altKey: true }); up(); v._render();
			r.seqAltSub = !v._sel.has(7) && v._sel.has(8);
			const was = [...v._sel].sort((a, b) => a - b).join(',');
			md(chars()[30], { shiftKey: true }); up(); v._render();
			r.seqShift = v._sel.has(7) && v._sel.has(25) && v._sel.has(30);
			r.seqMarks = svg.querySelectorAll('.rv-selected').length === v._sel.size;
			r.seqHighlit = chars().filter(c => c.classList.contains('rv-seq-sel')).length === v._sel.size;
			key('z'); v._render();
			r.seqUndo = [...v._sel].sort((a, b) => a - b).join(',') === was;
		}
		v._root.querySelector('.rv-sb-seqview').click();
		r.seqHiddenAgain = !v._seqView.classList.contains('rv-visible');

		// Outline mode: the strip keeps its colours there, and the domains are editable
		v.setOutlineMode(true); v._render();
		r.outlineOn = v._outlineMode;
		v._root.querySelector('.rv-sb-seqview').click();
		r.outlineSeqColored = [...v._seqView.querySelectorAll('.rv-seq-ch')].filter(c => c.style.color).length;
		const handles = () => [...svg.querySelectorAll('.rv-outline-handle')];
		r.handles = handles().length;
		{
			const h = handles()[1]; // the far end of the first domain
			h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 0, clientY: 0 }));
			const to = s2c(coords[30]);
			ev(window, 'mousemove', to);
			ev(window, 'mouseup', to);
			const d0 = v.getOutlineDomains()[0];
			r.dragged = [d0.start, d0.end];
		}
		{
			const before = v.getOutlineDomains().length;
			v._sel = new Set(); for (let i = 40; i <= 45; i++) v._sel.add(i);
			v._root.querySelector('.rv-outline-from-sel').click();
			const doms = v.getOutlineDomains();
			r.outlineAdded = doms.length === before + 1 && doms[doms.length - 1].start === 41 && doms[doms.length - 1].end === 46;
			r.outlineNoSideEffect = !v._domainColors;
		}
		v._root.querySelector('.rv-outline-edit').click();
		r.editOpens = v._settingsPanel.classList.contains('rv-visible') &&
			!!v._settingsPanel.querySelector('.rv-settings-pane[data-pane="outline"].rv--active') &&
			v._settingsPanel.querySelectorAll('.rv-outline-row').length === v.getOutlineDomains().length;
		v._settingsPanel.classList.remove('rv-visible');
		v.setOutlineMode(false); v._sel.clear(); v._render();
		v._root.querySelector('.rv-sb-seqview').click();

		// A move must not throw away the pan the user set, but an edit that pushes the
		// structure out of a fitted view still refits
		v._sel.clear(); v._render();
		v.fit();
		{
			const vx = v._vx - 150, vy = v._vy + 110;
			v._vx = vx; v._vy = vy; v._applyTransform();
			r.pannedOutside = v._anyOutsideView();
			const p0 = s2c(coords[5]);
			drag(baseEl(5), p0, { x: p0.x + 25, y: p0.y + 15 }, { shiftKey: true });
			r.panKept = v._vx === vx && v._vy === vy;
		}
		v.fit();
		{
			const vx = v._vx, vy = v._vy;
			r.fittedInside = !v._anyOutsideView();
			const p0 = s2c(coords[5]);
			drag(baseEl(5), p0, { x: p0.x + 2000, y: p0.y + 2000 }, { shiftKey: true });
			r.refitted = v._vx !== vx || v._vy !== vy;
		}
		key('z');

		// Escape drops the selection and its overlay
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		r.cleared = v._sel.size === 0 && v._selPivot === null && svg.querySelector('.rv-sel-ui').childElementCount === 0;
		// Overlapping bases: counted, marked, pushed apart. On a freshly loaded copy, so that
		// what is measured is the solver and not the pile of edits the tests above made.
		v.load({ fileText: '>t\\n${SEQ}\\n${DB}\\n' });
		{
			const c = v._rna.coords;
			const lens = ps => ps.map(([a, b]) => Math.hypot(c[a].x - c[b].x, c[a].y - c[b].y));
			const bonds = [], prs = [], stiff = [];
			for (let i = 0; i < 48; i++) {
				bonds.push([i, i + 1]);
				if (v._rna.pairs[i] >= 0 && v._rna.pairs[i + 1] >= 0) stiff.push([i, i + 1]);
			}
			for (let i = 0; i < 49; i++) if (v._rna.pairs[i] > i) prs.push([i, v._rna.pairs[i]]);
			r.clashClean = v._clashPairs().length; // a layout straight off the engine has none
			const dx = c[0].x - c[37].x, dy = c[0].y - c[37].y;
			for (let i = 37; i <= 45; i++) { c[i].x += dx; c[i].y += dy; } // drop the last hairpin on the first
			v._render();
			r.clashBefore = v._lastClashes;
			r.clashMarks = svg.querySelectorAll('.rv-clash').length;
			r.clashShown = v._root.querySelector('.rv-sb-overlap').style.display !== 'none' &&
				v._root.querySelector('.rv-sb-clash').textContent;
			const extent = () => {
				const xs = c.map(q => q.x), ys = c.map(q => q.y);
				return (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
			};
			const e0 = extent();
			const b0 = lens(bonds), p0 = lens(prs), s0 = lens(stiff);
			v._root.querySelector('.rv-sb-relax').click();
			r.clashAfter = v._lastClashes;
			r.clashHidden = v._root.querySelector('.rv-sb-overlap').style.display === 'none';
			const b1 = lens(bonds), p1 = lens(prs), s1 = lens(stiff);
			r.stiffDrift = +Math.max(...s1.map((x, k) => Math.abs(x - s0[k]) / s0[k])).toFixed(4);
			r.loopGrowth = +Math.max(...b1.map((x, k) => x / b0[k])).toFixed(3);
			const drift = b1.map((x, k) => Math.abs(x - b0[k]) / b0[k]);
			r.bondDrift = +Math.max(...drift).toFixed(4);
			r.bboxGrowth = +(extent() / e0).toFixed(3);
			r.pairDrift = +Math.max(...p1.map((x, k) => Math.abs(x - p0[k]) / p0[k])).toFixed(4);
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, ctrlKey: true }));
			r.relaxUndone = v._clashPairs().length === r.clashBefore;
		}
		// An overlap between two loop bases is resolved without touching the structure at all
		v.load({ fileText: '>t\\n${SEQ}\\n${DB}\\n' });
		{
			const c = v._rna.coords, pr = v._rna.pairs;
			const paired = [...Array(49).keys()].filter(i => pr[i] >= 0);
			c[10].x = c[22].x; c[10].y = c[22].y;              // two linker bases on top of each other
			v._render();
			r.loopClash = v._lastClashes;
			const was = paired.map(i => ({ x: c[i].x, y: c[i].y }));
			v.relaxLayout();
			r.loopFixed = v._clashPairs().length;
			r.structureUntouched = +Math.max(...paired.map((i, k) =>
				Math.hypot(c[i].x - was[k].x, c[i].y - was[k].y))).toFixed(6);
		}
		// The rotation pointer is set on the bases themselves, not only on their group
		r.rotCursor = (() => {
			const el = svg.querySelector('[data-idx="1"] circle.rv-base-circle');
			return el ? getComputedStyle(el).cursor.slice(0, 24) : '';
		})();
		// Layout files: save what was done by hand, put it back, and move it to another structure
		v.load({ fileText: '>t\\n${SEQ}\\n${DB}\\n' });
		{
			const c = v._rna.coords;
			c[20].x += 60; c[20].y -= 40;                       // a hand-placed base
			v._toggleHinge(10);                                 // a rotation point
			v._sel = new Set([24, 25, 26, 27, 28, 29, 30, 31, 32]);
			v._root.querySelector('.rv-btn-settings').click();
			const dom = v.addDomainFromSelection();
			dom.name = 'P3'; dom.locked = true;
			v._sel.clear(); v._render();
			const saved = JSON.parse(JSON.stringify(v.exportLayout()));
			r.savedKeys = Object.keys(saved).sort().join(',');
			r.savedLooks = RFviewJS.looksLikeLayout(JSON.stringify(saved));
			const moved = { x: c[20].x, y: c[20].y };
			// wipe it: a fresh load of the same structure
			v.load({ fileText: '>t\\n${SEQ}\\n${DB}\\n' });
			r.wiped = Math.hypot(v._rna.coords[20].x - moved.x, v._rna.coords[20].y - moved.y) > 10 &&
				!v._rna.hinges?.size && v.getOutlineDomains().length === 0;
			r.loadMsg = v.loadLayout(JSON.stringify(saved));
			const c2 = v._rna.coords;
			r.restored = Math.hypot(c2[20].x - moved.x, c2[20].y - moved.y) < 0.02 &&
				!!v._rna.hinges?.has(10) &&
				v.getOutlineDomains()[0]?.name === 'P3' && v.getOutlineDomains()[0]?.locked === true;
			// the same layout on a different folding of the same sequence
			const DB2 = '${DB2}';
			v.load({ fileText: '>t2\\n${SEQ}\\n' + DB2 + '\\n' });
			r.transfer = v.loadLayout(JSON.stringify(saved));
			r.transferKept = Math.hypot(v._rna.coords[20].x - moved.x, v._rna.coords[20].y - moved.y) < 0.02;
			r.transferRedrew = v._rna.coords.length === 49 && v._clashPairs().length === 0;
			r.transferDomains = v.getOutlineDomains().length;
		}

		// A locked domain moves as one block
		v.load({ fileText: '>t\\n${SEQ}\\n${DB}\\n' });
		{
			const c = v._rna.coords;
			v._sel = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
			const dom = v.addDomainFromSelection();
			dom.locked = true;
			v._sel.clear(); v._render();
			const was = [0, 4, 8].map(i => ({ x: c[i].x, y: c[i].y }));
			const p0 = s2c(c[4]);
			drag(baseEl(4), p0, { x: p0.x + 40, y: p0.y }, { shiftKey: true });
			const d = [0, 4, 8].map((i, k) => +(c[i].x - was[k].x).toFixed(3));
			r.lockedBlock = d[0] === d[1] && d[1] === d[2] && d[0] > 20;
			r.lockedRigid = v._lockedBlocks().length === 1 && v._lockedBlocks()[0].length === 9;
		}

		// Leontis-Westhof: legend while the symbols are on, and the pair type in the tooltip
		v.loadPairTypes('nt1,nt2,type,classification-1,classification-2\\n' +
			'A.G1,A.U49,base pair,tSW,n/a\\nA.A4,A.A17,base pair,cHS,n/a\\n');
		r.lwLegend = v._lwLegend.classList.contains('rv-visible') &&
			v._lwLegend.querySelectorAll('svg').length;
		v._showTooltip ? 0 : 0;
		{
			const el = baseEl(0);
			el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 10, clientY: 10 }));
			el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }));
			r.tooltip = v._tooltip.innerHTML;
		}
		v._showPairTypes = false; v._render();
		r.lwLegendOff = !v._lwLegend.classList.contains('rv-visible');

		// PNG export
		{
			const blob = await v.toPNG(1);
			r.pngSize = blob ? blob.size : 0;
			r.pngMagic = blob ? [...new Uint8Array(await blob.slice(0, 4).arrayBuffer())].join(',') : '';
		}

		// The strip scrolls to a selection made in the drawing
		v._seqViewOn = true;
		v._seqView.style.width = '120px';
		v._sel = new Set([44, 45, 46]);
		v._seqScrollKey = null;
		v._render();
		r.seqScrolled = v._seqView.scrollLeft > 0;

		return r;
	})()`).catch(err => {
		console.error('page error: ' + err.message);
		app.exit(1);
	});

	try {

		assert.deepStrictEqual(out.boxed, [12, 13, 14, 15, 16, 17, 18, 19, 20], 'box selection');
		assert.ok(out.overlay, 'selection box, rotation handle and pivot are drawn');
		assert.ok(out.pivotIsHinge, 'pivot defaults to the hinge of the selection');
		assert.ok(out.added, 'Ctrl+click adds a base to the selection');
		assert.ok(out.removed, 'Ctrl+click removes a selected base');
		assert.ok(out.subtracted, 'Ctrl+Alt+drag subtracts from the selection');
		assert.ok(out.pivotMoved, 'the pivot can be dragged');
		assert.ok(out.rotErr < 2, `selection rotates about the pivot (max error ${out.rotErr})`);
		assert.ok(out.freeErr < 1e-9, 'unselected bases stay where they are');
		assert.ok(out.rotCleared, 'rotation state is released on mouseup');
		assert.ok(out.cut, 'Alt+click puts a rotation point on the link');
		assert.strictEqual(out.cutDrawn, 1, 'the rotation point is drawn');
		assert.deepStrictEqual(out.cutSel, [...Array(49).keys()].slice(22), 'the chunk after it is selected');
		assert.ok(out.cutPivot, 'it is the rotation point of that chunk');
		assert.ok(out.hingeMoved, 'the rotation point can be dragged');
		assert.ok(out.hingeBends, 'the link bends through the rotation point');
		assert.ok(out.undone, 'Ctrl+Z undoes the drag');
		assert.ok(out.redone, 'Ctrl+Shift+Z redoes it');
		assert.ok(out.healed, 'Alt+click removes the rotation point');
		assert.ok(out.moveCross, 'the selection box has a drag cross');
		assert.ok(out.crossDx > 20 && out.crossKeptSel, `the drag cross moves the selection (${out.crossDx})`);
		assert.ok(out.straightHandle, 'a selected helix gets a straighten handle');
		assert.ok(out.snapped, 'straighten squares the helix axis to a multiple of 45 degrees');
		assert.ok(out.clickCleared && out.reselected, 'Ctrl+Z brings back a selection cleared by a click');
		assert.ok(out.evenRise, 'straighten: even rise between pairs');
		assert.ok(out.collinear, 'straighten: pair midpoints on one axis');
		assert.ok(out.evenWidth, 'straighten: even pair width');
		assert.ok(out.square, 'straighten: pairs square to the axis');
		assert.ok(out.domain && out.domain.start === 13 && out.domain.end === 21, `domain from the selection: ${JSON.stringify(out.domain)}`);
		assert.ok(out.domainOn, 'adding a domain turns the colouring on');
		assert.ok(out.domainLinks >= 8, `the domain colours its links (${out.domainLinks})`);
		assert.ok(out.renamed, 'a domain can be renamed');
		assert.ok(out.recolored, 'a domain can be recoloured');
		assert.ok(out.legend, 'the domain name shows in the legend');
		assert.ok(out.domainOff, 'turning the option off drops the colours');
		assert.ok(out.expHinge, 'rotation points are left out of the SVG export');
		assert.ok(out.pannedOutside && out.panKept, 'a move keeps the pan the user set');
		assert.ok(out.fittedInside && out.refitted, 'a move out of a fitted view still refits');
		assert.ok(out.seqHidden && out.seqShown && out.seqHiddenAgain, 'the Sequence button shows and hides the strip');
		assert.strictEqual(out.seqLen, 49, 'one cell per base');
		assert.ok(/(^|\s)10(\s|$)/.test(out.seqRuler) && out.seqRuler.includes('40'), `the ruler numbers every ten bases: "${out.seqRuler}"`);
		assert.ok(out.seqColored >= 9, `the letters of a domain take its colour (${out.seqColored})`);
		assert.strictEqual(out.seqDragSel, '5,6,7,8,9', 'dragging over the letters selects that range');
		assert.ok(out.seqCtrlAdd, 'Ctrl+click adds a base');
		assert.ok(out.seqAltSub, 'Alt+click removes one');
		assert.ok(out.seqShift, 'Shift+click extends from the last one clicked');
		assert.ok(out.seqMarks && out.seqHighlit, 'the strip and the drawing show the same selection');
		assert.ok(out.seqUndo, 'Ctrl+Z undoes a selection made in the strip');
		assert.strictEqual(out.clashClean, 0, 'a fresh layout has no overlapping bases');
		assert.ok(out.clashBefore >= 8, `overlapping bases are counted (${out.clashBefore})`);
		assert.ok(out.clashMarks > 0 && out.clashShown, `they are marked and shown in the status bar (${out.clashShown})`);
		assert.strictEqual(out.clashAfter, 0, 'the relax step clears them');
		assert.ok(out.clashHidden, 'the status bar drops the warning');
		assert.ok(out.stiffDrift < 0.02, `the bonds inside the helices keep their length (${out.stiffDrift})`);
		assert.ok(out.loopGrowth > 1.05 && out.loopGrowth <= 1.85, // the 1.7 cap is on the target length; the solver may sit a few % over it
			`a crowded loop is allowed to stretch, up to a point, and no bond past it (x${out.loopGrowth})`);
		assert.ok(out.pairDrift < 0.02, `the pairs keep theirs (${out.pairDrift})`);
		assert.ok(out.relaxUndone, 'Ctrl+Z undoes the relax step');
		assert.ok(out.loopClash > 0 && out.loopFixed === 0, 'an overlap between two loop bases is resolved');
		assert.strictEqual(out.structureUntouched, 0, 'and the paired bases are not moved at all');
		assert.match(out.rotCursor, /^url\(/, `the rotation pointer reaches the base circle ("${out.rotCursor}")`);
		assert.ok(out.outlineOn, 'outline mode is on');
		assert.ok(out.outlineSeqColored >= 9, `the strip keeps the domain colours in outline mode (${out.outlineSeqColored})`);
		assert.strictEqual(out.handles, 2, 'each domain has a handle at both ends');
		assert.deepStrictEqual(out.dragged, [13, 31], `dragging an end moves that bound: ${JSON.stringify(out.dragged)}`);
		assert.ok(out.outlineAdded, 'From selection adds a domain in outline mode');
		assert.ok(out.outlineNoSideEffect, 'and does not switch the backbone colouring on there');
		assert.ok(out.editOpens, 'Edit domains opens the domain list');
		assert.ok(out.cleared, 'Escape clears the selection and the overlay');
		assert.ok(out.savedLooks && out.savedKeys.includes('coords') && out.savedKeys.includes('hinges'),
			`the layout file holds the drawing (${out.savedKeys})`);
		assert.ok(out.wiped, 'reloading the structure drops the hand-made layout');
		assert.strictEqual(out.loadMsg, '', 'putting it back on the same structure is silent');
		assert.ok(out.restored, 'positions, rotation points and domains all come back');
		assert.match(out.transfer, /47 of 49/, `transferring says what was kept: "${out.transfer}"`);
		assert.ok(out.transferKept, 'the positions that still pair the same keep their place');
		assert.ok(out.transferRedrew, 'the rest is laid out again, without overlaps');
		assert.strictEqual(out.transferDomains, 1, 'the domains come along');
		assert.ok(out.lockedBlock, 'dragging one base of a locked domain moves the whole domain');
		assert.ok(out.lockedRigid, 'the locked domain is one rigid block');
		assert.ok(out.lwLegend >= 6, `the Leontis-Westhof legend shows while the symbols do (${out.lwLegend})`);
		assert.match(out.tooltip, /tSW with U49/, `the tooltip names the pair type: "${out.tooltip}"`);
		assert.ok(out.lwLegendOff, 'and goes away with them');
		assert.ok(out.pngSize > 1000 && out.pngMagic === '137,80,78,71', `the PNG export writes a PNG (${out.pngSize} bytes)`);
		assert.ok(out.seqScrolled, 'the strip scrolls to a selection made in the drawing');
		console.log('selection / pivot / rotation: all checks passed');
		app.exit(0);

	} 
	catch (err) {

		console.error(err.message);
		app.exit(1);

	}

});
