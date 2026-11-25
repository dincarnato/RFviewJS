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
		assert.ok(out.cleared, 'Escape clears the selection and the overlay');
		console.log('selection / pivot / rotation: all checks passed');
		app.exit(0);

	} 
	catch (err) {

		console.error(err.message);
		app.exit(1);

	}

});
