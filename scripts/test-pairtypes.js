// Self-check for the Leontis-Westhof pair-type parser: node scripts/test-pairtypes.js
const assert = require('assert');
const { parseLwFile, looksLikeLw } = require('./RFview.js');
const key = ps => ps.map(p => `${p.i},${p.j},${p.lw}`).sort().join(' ');

// RNApolis annotator CSV (comma-separated, residue ids "A.G1", stackings ignored)
assert.strictEqual(key(parseLwFile(
	'nt1,nt2,type,classification-1,classification-2\n' +
	'A.G1,A.C72,base pair,cWW,XIX\n' +
	'A.U8,A.A14,base pair,tWH,XXIV\n' +
	'A.G1,A.G2,stacking,upward,\n')),
	key([{ i: 0, j: 71, lw: 'cWW' }, { i: 7, j: 13, lw: 'tWH' }]));

// DSSR base-pair list: the leading row index must not be taken for a residue
assert.strictEqual(key(parseLwFile(
	'     nt1            nt2           bp  name        Saenger   LW   DSSR\n' +
	'   1 A.G1           A.C72          G-C WC          19-XIX    cWW  cW-W\n' +
	'   2 A.1MA58        A.U54          A-U --          n/a       tWH  tW-H\n')),
	key([{ i: 0, j: 71, lw: 'cWW' }, { i: 57, j: 53, lw: 'tWH' }]));

// DSSR --json and RNApolis --json (residue as string, or as a Residue object)
assert.strictEqual(key(parseLwFile('{"pairs":[{"nt1":"A.G1","nt2":"A.C72","LW":"cWW"}]}')),
	key([{ i: 0, j: 71, lw: 'cWW' }]));
assert.strictEqual(key(parseLwFile(
	'{"baseInteractions":{"basePairs":[{"nt1":{"auth":{"chain":"A","number":9,"name":"U"}},' +
	'"nt2":{"auth":{"chain":"A","number":23,"name":"A"}},"lw":"tHS","saenger":null}]}}')),
	key([{ i: 8, j: 22, lw: 'tHS' }]));

// RNApolis extended dot-bracket, one row per LW class
assert.strictEqual(key(parseLwFile(
	'    >strand_A\nseq GGGCAAAGCCC\ncWW (((.....)))\ncWH ...(...)...\n')),
	key([{ i: 0, j: 10, lw: 'cWW' }, { i: 1, j: 9, lw: 'cWW' }, { i: 2, j: 8, lw: 'cWW' },
		{ i: 3, j: 7, lw: 'cWH' }]));

// Minimal hand-written form, and "last annotation wins" for a repeated pair
assert.strictEqual(key(parseLwFile('# comment\n5\t72\tcWW\n13 22 tHS\n5 72 tWW\n')),
	key([{ i: 4, j: 71, lw: 'tWW' }, { i: 12, j: 21, lw: 'tHS' }]));

// Rejections and the content sniff
assert.throws(() => parseLwFile('GGGCAAAGCCC\n(((.....)))\n'), /No Leontis-Westhof/);
assert.throws(() => parseLwFile('{"pairs":['), /invalid JSON/);
assert.ok(looksLikeLw('A.G1,A.C72,base pair,cWW,XIX'));
assert.ok(looksLikeLw('{"nt1":"A.G1","lw":"cWW"}'));
assert.ok(!looksLikeLw('>seq1\nGGGCAAAGCCC\n(((.....)))\n'));

console.log('pair-type parser: all checks passed');
