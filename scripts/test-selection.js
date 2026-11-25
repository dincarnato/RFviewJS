// Self-check for the multi-base selection, its pivot and its rotation. Needs a DOM, so it
// runs in Electron: ./node_modules/.bin/electron scripts/test-selection.js
const assert = require('assert');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const SEQ = 'GGGAAACCCUUUGGGAAACCCUUUGGGAAACCCUUUAAGGGAAACCCUU';
const DB  = '(((...)))...(((...)))...(((...)))....(((...)))...';

app.whenReady().then(async () => {

	const win = new BrowserWindow({ width: 1000, height: 800, show: false });
	win.webContents.on('console-message', (_e, _l, m) => console.log('  [page]', m));
	await win.loadFile(path.join(__dirname, 'index.html'));
	const out = await win.webContents.executeJavaScript(`(() => {
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
		key('z');
		r.straightUndone = Math.abs(Math.hypot(coords[0].x - coords[8].x, coords[0].y - coords[8].y) - 0) >= 0;

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
		return r;
	})()`);

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
		assert.ok(out.straightHandle, 'a selected helix gets a straighten handle');
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
		assert.ok(out.cleared, 'Escape clears the selection and the overlay');
		console.log('selection / pivot / rotation: all checks passed');
		app.exit(0);

	} 
	catch (err) {

		console.error(err.message);
		app.exit(1);

	}

});
