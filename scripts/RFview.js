/*!
   RFview.js - RNA Framework Structure Viewer
   
   Author: Danny Incarnato [dincarnato@rnaframework.com]
   Note:   The main plotting functions for the Radiate layout were ported from 
           Yann Ponty's VARNA (https://github.com/yannponty/VARNA).
           The NAView layout was ported from Ivo Hofacker's adaptation of 
           Bruccoleri & Heinrich original algorithm
           (https://github.com/ViennaRNA/RNAcode/blob/master/librna/naview.c)
           and adapted to enable helix rotation in a Radiate-like fashion.
           Code auditing and bug fixing, as well as bundling of the JS into an 
           Electron app was done with the crucial aid of ClaudeAI
  
   Usage:  const viewer = new RFviewJS(containerElement, config);
 */
(function(global) {
	'use strict';
	// Constants (ported from VARNA Java source)
	const LOOP_DISTANCE = 40.0;
	const BASE_PAIR_DISTANCE = 65.0;
	const MULTILOOP_DISTANCE = 35.0;
	const BASE_RADIUS = 10.0;
	const BASE_R = 12;
	const MIN_SCALE = 0.02; // 2%
	const MAX_SCALE = 10; // 1000%
	const HYSTERESIS_EPSILON = 0.15;
	const HYSTERESIS_ATTRACTORS = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4,
		Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4
	];
	const NS = 'http://www.w3.org/2000/svg';
	// Scoped CSS (injected once)
	const STYLE_ID = 'rfviewjs-css';
	// Structural CSS — all  colors use var(--rv-*, fallback).
	// Fallback values match rfviewjs.css exactly, so appearance is identical
	// whether or not the external stylesheet is loaded.
	const CSS = `
a, a:visited, a:hover, a:active, a:focus {color: #656d76}
body {-webkit-touch-callout: none; -webkit-user-select: none; -khtml-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none}
.rv{display:grid;grid-template-rows:auto 1fr auto;grid-template-columns:1fr;width:100%;height:100%;overflow:hidden;position:relative;box-sizing:border-box;background:var(--rv-bg,#ffffff);color:var(--rv-text,#1f2328);--rv-bg:#ffffff;--rv-surface:#f6f8fa;--rv-border:#d0d7de;--rv-text:#1f2328;--rv-muted:#656d76;--rv-accent:#0969da;--rv-accent2:#2da44e;--rv-accent3:#8250df;--rv-error:#cf222e;--rv-backbone:#1f2328;--rv-backbone-width:2;--rv-basepair:#1f2328;--rv-basepair-width:2.2;--rv-pseudopair:#1f2328;--rv-pseudopair-width:2;--rv-noncanon-dot-r:4.5;--rv-pair-break:#ef4444;--rv-pair-form:#22c55e;--rv-base-fill:#eaeef2;--rv-base-stroke:#1f2328;--rv-base-stroke-width:2;--rv-base-hover:#bbd4f0;--rv-base-label-color:#1f2328;--rv-base-label-font:monospace;--rv-base-label-font-size:13;--rv-base-index-color:#656d76;--rv-base-index-font:monospace;--rv-base-index-font-size:12;--rv-base-radius:11;--rv-base-index-offset:26;--rv-rot-line:#0969da80;--rv-rot-ring:#0969da20;--rv-pair-annot-opacity:0.5;--rv-pair-annot-stroke-width:1.5;--rv-pair-annot-padding:16;--rv-helix-annot-padding:25;--rv-helix-annot-opacity:0.5;--rv-helix-annot-color:#aff0a8;--rv-inset-hover-glow:8px}
.rv *{box-sizing:border-box}
.rv-toolbar{display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--rv-border,#d0d7de);background:var(--rv-bg,#ffffff);flex-wrap:wrap}
.rv-btn-label{display:none}
.rv-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:6px 8px;border-radius:6px;border:1px solid var(--rv-border,#d0d7de);background:var(--rv-surface,#f6f8fa);color:var(--rv-text,#1f2328);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;cursor:pointer;transition:background .15s,border-color .15s;user-select:none;position:relative}
.rv-btn:hover{background:var(--rv-base-hover,#bbd4f0);border-color:var(--rv-accent,#0969da)}
.rv-btn:active{background:var(--rv-border,#d0d7de)}
.rv-btn-primary{background:color-mix(in srgb,var(--rv-accent3,#7c3aed) 12%,transparent);border-color:color-mix(in srgb,var(--rv-accent3,#7c3aed) 40%,transparent);color:var(--rv-accent3,#a78bfa)}
.rv-btn-primary:hover{background:color-mix(in srgb,var(--rv-accent3,#7c3aed) 22%,transparent);border-color:var(--rv-accent3,#a78bfa)}
.rv-tsep{width:1px;height:24px;background:var(--rv-border,#d0d7de);margin:0 4px;flex-shrink:0}
.rv-zoom-lbl{font-family:monospace;font-size:13px;color:var(--rv-muted,#656d76);min-width:46px;text-align:center}
.rv-canvas{overflow:hidden;position:relative;cursor:grab;background:var(--rv-bg,#ffffff);min-height:0}
.rv-canvas.rv--drop-hover{outline:2px dashed var(--rv-accent,#0969da);outline-offset:-2px}
.rv-canvas.grabbing{cursor:grabbing}
.rv-canvas.rotating{cursor:crosshair}
.rv-svg{width:100%;height:100%;display:block}
.rv-backbone{stroke:var(--rv-backbone,#000);stroke-width:var(--rv-backbone-width,2);fill:none;stroke-linecap:round}
.rv-basepair{stroke:var(--rv-basepair,#000);stroke-width:var(--rv-basepair-width,2.2);fill:none;stroke-linecap:round}
.rv-bp-dot{fill:var(--rv-basepair,#000);stroke:none}
.rv-bp-noncanon{fill:var(--rv-noncanon-dot,var(--rv-basepair,#000));stroke:none}
.rv-pseudopair{stroke:var(--rv-pseudopair,#1f2328);stroke-width:var(--rv-pseudopair-width,2);fill:none;stroke-linecap:round;stroke-dasharray:5 3}
.rv-aln-legend{display:none;position:absolute;bottom:16px;right:16px;background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:8px;padding:8px 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:var(--rv-text,#1f2328);pointer-events:none;z-index:5;white-space:nowrap}
.rv-aln-legend *{pointer-events:none}
.rv-aln-legend.rv-visible{display:block}
.rv-aln-legend-cols{display:flex;gap:16px}
.rv-aln-legend-col{display:flex;flex-direction:column;gap:3px}
.rv-aln-legend-hdr{font-size:12px;font-weight:700;color:var(--rv-muted,#656d76);margin-bottom:2px;text-transform:uppercase;letter-spacing:.05em}
.rv-aln-legend-row{display:flex;align-items:center;gap:5px}
.rv-base-circle{stroke:var(--rv-base-stroke,#000);stroke-width:var(--rv-base-stroke-width,2);fill:var(--rv-base-fill,#eee);cursor:pointer;transition:fill .1s}
.rv-base-circle:hover{fill:var(--rv-base-hover,#ccc)}
.rv-base-label{font-family:var(--rv-base-label-font,monospace);font-size:var(--rv-base-label-font-size,16px);fill:var(--rv-base-label-color,#1f2328);text-anchor:middle;dominant-baseline:central;pointer-events:none;user-select:none}
.rv-base-index{font-family:var(--rv-base-index-font,monospace);font-size:var(--rv-base-index-font-size,16px);fill:var(--rv-base-index-color,#656d76);text-anchor:middle;dominant-baseline:central;pointer-events:none;user-select:none}
/* Configurable base geometry */
/* --rv-base-radius: visual radius of the nucleotide circles (default 11, unitless SVG) */
/* --rv-base-index-offset: extra clearance beyond the circle edge for index labels (default 26) */
/* Pair annotation boxes */
/* --rv-noncanon-dot-r:4.5 — non-canonical base-pair dot radius */
/* --rv-pair-annot-opacity — annotation box fill opacity (declared in .rv{}) */
/* --rv-pair-annot-stroke-width — annotation box border width (declared in .rv{}) */
/* --rv-pair-annot-padding — annotation box padding in scene units (declared in .rv{}) */
.rv-pk-panels{position:absolute;top:52px;left:16px;display:flex;flex-direction:column;gap:8px;pointer-events:none;z-index:10}
.rv-pk-panel{width:var(--rv-inset-max-width,120px);min-width:var(--rv-inset-min-width,80px);background:var(--rv-bg,#ffffff);border:1px solid var(--rv-border,#d0d7de);border-radius:8px;padding:8px 10px;pointer-events:all;cursor:default;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
.rv-pk-panel svg{display:block;width:100%;height:auto}
.rv-pk-panel h4{font-size:12px;color:var(--rv-muted,#656d76);margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.rv-pal-legend{position:absolute;top:52px;right:16px;background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:8px;padding:10px 14px;font-size:13px;display:none;color:var(--rv-text,#1f2328);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;min-width:120px;z-index:10}
.rv-pal-legend h4{font-size:12px;color:var(--rv-muted,#656d76);margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em}
.rv-pal-entry{display:flex;align-items:center;gap:7px;margin:2px 0}
.rv-pal-swatch{width:20px;height:11px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.15);opacity:var(--rv-pair-annot-opacity,0.5)}
.rv-pal-key{font-size:13px}
.rv-tooltip{position:absolute;background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:6px;padding:6px 10px;font-family:monospace;font-size:13px;color:var(--rv-text,#1f2328);pointer-events:none;display:none;z-index:100;max-width:200px;line-height:1.6}
.rv-legend{position:absolute;bottom:16px;right:16px;background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:8px;padding:10px 14px;font-size:13px;display:none;min-width:160px;color:var(--rv-text,#1f2328);font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;}
.rv-legend h4{font-size:12px;color:var(--rv-muted,#656d76);margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em}
.rv-legend-gradient{height:10px;border-radius:4px;margin-bottom:4px}
.rv-legend-labels{position:relative;height:16px;margin-top:3px;color:var(--rv-muted,#656d76);font-size:11px;font-family:monospace;overflow:visible}
.rv-legend-nan{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;font-family:monospace;color:var(--rv-muted,#656d76)}
.rv-legend-nan-swatch{width:18px;height:9px;border-radius:2px;flex-shrink:0}
.rv-statusbar{padding:4px 18px;border-top:1px solid var(--rv-border,#d0d7de);background:var(--rv-surface,#f6f8fa);font-family:monospace;font-size:12px;color:var(--rv-muted,#656d76);display:flex;gap:18px}
.rv-statusbar span{display:inline-flex;align-items:center;gap:4px}
.rv-dot{width:6px;height:6px;border-radius:50%;background:var(--rv-accent2,#1a7f37);flex-shrink:0}
.rv-btn-toggle.rv--active{background:color-mix(in srgb,var(--rv-accent,#0969da) 10%,transparent);border-color:var(--rv-accent,#0969da);color:var(--rv-accent,#0969da)}
.rv-btn-layout{font-family:monospace;font-weight:700;letter-spacing:0}
.rv-rot-ring{pointer-events:none;display:none}
.rv-rot-ring circle{fill:none;stroke:var(--rv-rot-ring,#0969da30);stroke-width:1;stroke-dasharray:4 3}
.rv-rot-ring line{stroke:var(--rv-rot-line,#0969da80);stroke-width:1}
.rv-error{display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-error-border,#cf222e60);border-radius:8px;padding:14px 20px;color:var(--rv-error,#cf222e);font-family:monospace;font-size:19px;text-align:center;max-width:70%;pointer-events:none;line-height:1.6}.rv-error-dialog{display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:10px;padding:0;z-index:300;min-width:280px;max-width:min(420px,80%);max-height:80%;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
.rv-error-dialog.rv-visible{display:flex;flex-direction:column}
.rv-error-dialog-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid var(--rv-border,#d0d7de)}
.rv-error-dialog-hdr h3{margin:0;font-weight:600;color:var(--rv-error,#cf222e)}
.rv-error-dialog-body{padding:14px 16px;font-size:13px;color:var(--rv-text,#1f2328);line-height:1.5;white-space:pre-wrap;overflow-y:auto;flex:1}
.rv-error-dialog-foot{padding:0 16px 14px;display:flex;justify-content:flex-end}
/* Toolbar position: bottom */
.rv--toolbar-bottom{grid-template-rows:1fr auto auto}
.rv--toolbar-bottom .rv-toolbar{border-bottom:none;border-top:1px solid var(--rv-border,#d0d7de);grid-row:2}
.rv--toolbar-bottom .rv-canvas{grid-row:1}
.rv--toolbar-bottom .rv-statusbar{grid-row:3}
/* Toolbar position: left */
.rv--toolbar-left{grid-template-rows:1fr auto;grid-template-columns:auto 1fr}
.rv--toolbar-left .rv-toolbar{grid-row:1/3;grid-column:1;flex-direction:column;align-items:center;justify-content:center;border-bottom:none;border-right:1px solid var(--rv-border,#d0d7de);padding:8px 6px}
.rv--toolbar-left .rv-canvas{grid-row:1;grid-column:2}
.rv--toolbar-left .rv-statusbar{grid-row:2;grid-column:2}
/* Toolbar position: right */
.rv--toolbar-right{grid-template-rows:1fr auto;grid-template-columns:1fr auto}
.rv--toolbar-right .rv-toolbar{grid-row:1/3;grid-column:2;flex-direction:column;align-items:center;justify-content:center;border-bottom:none;border-left:1px solid var(--rv-border,#d0d7de);padding:8px 6px}
.rv--toolbar-right .rv-canvas{grid-row:1;grid-column:1}
.rv--toolbar-right .rv-statusbar{grid-row:2;grid-column:1}
/* Vertical toolbar adjustments */
.rv--toolbar-left .rv-tsep,.rv--toolbar-right .rv-tsep{width:auto;height:1px;margin:4px 0;align-self:stretch}
.rv--toolbar-left .rv-zoom-lbl,.rv--toolbar-right .rv-zoom-lbl{width:44px;min-width:44px;text-align:center;padding:2px 0;font-size:11px}
.rv--toolbar-left .rv-toolbar,.rv--toolbar-right .rv-toolbar{min-width:56px}
.rv--toolbar-left .rv-btn,.rv--toolbar-right .rv-btn{padding:7px}
/* Tooltips for vertical toolbars */
.rv-toolbar .rv-btn::after{content:attr(title);position:absolute;top:50%;transform:translateY(-50%);background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);color:var(--rv-text,#1f2328);border-radius:5px;padding:4px 9px;font-size:13px;font-weight:normal;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;z-index:200;box-shadow:0 2px 8px rgba(0,0,0,.4);left:50%;transform:translateX(-50%);top:calc(100% + 7px)}
.rv--toolbar-bottom .rv-btn::after{top:auto;bottom:calc(100% + 7px)}
.rv-toolbar .rv-btn:hover::after{opacity:1}
.rv--toolbar-left .rv-btn::after{content:attr(title);position:absolute;top:50%;transform:translateY(-50%);background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);color:var(--rv-text,#1f2328);border-radius:5px;padding:4px 9px;font-size:13px;font-weight:normal;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;z-index:200;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.rv--toolbar-left  .rv-btn:hover::after{left:calc(100% + 10px);opacity:1}
.rv--toolbar-right .rv-btn:hover::after{right:calc(100% + 10px);opacity:1}
/* Structure switcher */
.rv-struct-wrap{display:none;position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:20;align-items:center;gap:4px;max-width:calc(100% - 32px);overflow:hidden}
.rv-struct-wrap.rv-visible{display:flex}
.rv-struct-bar{display:flex;flex:1;min-width:0;background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:999px;padding:3px;gap:2px;overflow-x:auto;box-shadow:0 4px 16px rgba(0,0,0,.4);flex-shrink:1;scrollbar-width:none}
.rv-struct-bar::-webkit-scrollbar{display:none}
.rv-struct-arrow{border:none;background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--rv-text,#1f2328);flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.25);padding:0;transition:opacity .15s}
.rv-struct-arrow:hover{background:var(--rv-base-hover,#bbd4f0)}
.rv-struct-arrow:disabled{opacity:.3;cursor:default}
.rv-struct-pill{border:none;background:transparent;color:var(--rv-muted,#656d76);padding:5px 16px;border-radius:999px;font-size:13px;font-family:monospace;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s;flex-shrink:0}
.rv-struct-pill:hover:not(.rv--active){background:var(--rv-base-hover,#bbd4f0);color:var(--rv-text,#1f2328)}
.rv-struct-bar.rv--animating{opacity:.5;pointer-events:none}
.rv-struct-pill.rv--active{background:var(--rv-accent,#0969da);color:#fff;font-weight:600}
/* Upload panel */
.rv-upload-panel,.rv-manual-panel,.rv-rfam-panel{display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:12px;padding:20px;z-index:200;min-width:340px;max-width:min(460px,80%);max-height:80%;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.15);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
.rv-upload-panel.rv-visible,.rv-manual-panel.rv-visible,.rv-rfam-panel.rv-visible{display:block}
.rv-rfam-input{width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;padding:6px 8px;border:1px solid var(--rv-border,#d0d7de);border-radius:6px;background:var(--rv-bg,#fff);color:var(--rv-text,#1f2328);outline:none;display:block;margin-top:4px}
.rv-rfam-spinner{display:none;text-align:center;padding:8px 0;font-size:12px;color:var(--rv-muted,#656d76)}
.rv-rfam-spinner.rv--active{display:block}
.rv-upload-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.rv-upload-hdr h3{margin:0;font-size:16px;font-weight:600;color:var(--rv-text,#1f2328)}
.rv-upload-x{background:none;border:none;color:var(--rv-muted,#656d76);cursor:pointer;font-size:22px;line-height:1;padding:0 4px}
.rv-upload-x:hover{color:var(--rv-text,#1f2328)}
.rv-upload-section{margin-bottom:12px}
.rv-upload-lbl{font-size:13px;font-weight:600;color:var(--rv-text,#1f2328);margin-bottom:5px;display:flex;align-items:center;gap:8px}
.rv-upload-lbl span{font-weight:normal;color:var(--rv-muted,#656d76);font-family:monospace;font-size:12px}
.rv-upload-drop{border:1.5px dashed var(--rv-border,#d0d7de);border-radius:8px;padding:10px 14px;cursor:pointer;transition:border-color .15s,background .15s;position:relative;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--rv-muted,#656d76)}
.rv-upload-drop:hover,.rv-upload-drop.rv--drag{border-color:var(--rv-accent,#0969da);background:color-mix(in srgb,var(--rv-accent,#0969da) 6%,transparent);color:var(--rv-text,#1f2328)}
.rv-upload-drop input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.rv-upload-status{min-height:14px;font-size:13px;font-family:monospace;margin:8px 0 2px;color:var(--rv-muted,#656d76);line-height:1.5}
.rv-upload-status.rv--err{color:var(--rv-error,#cf222e)}
.rv-upload-status.rv--ok{color:var(--rv-accent2,#1a7f37)}
.rv-upload-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.rv-upload-btn{padding:5px 16px;border-radius:6px;border:1px solid;font-size:14px;cursor:pointer;font-family:inherit;transition:background .15s}
.rv-upload-btn-cancel{background:transparent;border-color:var(--rv-border,#d0d7de);color:var(--rv-muted,#656d76)}
.rv-upload-btn-cancel:hover{border-color:var(--rv-text,#1f2328);color:var(--rv-text,#1f2328)}
.rv-upload-btn-load{background:var(--rv-accent,#0969da);border-color:var(--rv-accent,#0969da);color:#fff}
.rv-upload-btn-load:hover{filter:brightness(1.1)}
.rv-upload-btn-load:disabled{opacity:.45;cursor:not-allowed;filter:none}
/* About / Settings shared panel base */
.rv-about-panel,.rv-settings-panel{display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--rv-surface,#f6f8fa);border:1px solid var(--rv-border,#d0d7de);border-radius:12px;padding:20px;z-index:200;max-width:80%;box-shadow:0 8px 32px rgba(0,0,0,.15);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:var(--rv-text,#1f2328)}
.rv-about-panel.rv-visible,.rv-settings-panel.rv-visible{display:block}
/* About panel */
.rv-about-panel{min-width:280px;max-width:380px;text-align:center}
.rv-about-logo{font-size:29px;margin:8px 0 4px}
.rv-about-logo img{filter:var(--rv-logo-filter,none)}
.rv-about-name{font-size:19px;font-weight:700;margin:0 0 2px}
.rv-about-ver{font-size:13px;color:var(--rv-muted,#656d76);font-family:monospace;margin:0 0 10px}
.rv-about-desc{font-size:14px;color:var(--rv-muted,#656d76);margin:0 0 14px;line-height:1.5}
.rv-about-links{display:flex;justify-content:center;gap:12px}
.rv-about-link{font-size:13px;color:var(--rv-accent,#0969da);text-decoration:none;display:flex;align-items:center;gap:4px}
.rv-about-link:hover{text-decoration:none;opacity:.8}
.rv-about-link:visited{color:var(--rv-accent,#0969da)}
/* Settings panel */
.rv-settings-panel{min-width:320px;max-width:min(400px,80%)}
.rv-settings-tabs{display:flex;gap:0;border-bottom:1px solid var(--rv-border,#d0d7de);margin:10px 0 0}
.rv-settings-tab{flex:1;padding:7px 6px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;font-size:13px;color:var(--rv-muted,#656d76);font-family:inherit;transition:color .15s,border-color .15s}
.rv-settings-tab:hover{color:var(--rv-text,#1f2328)}
.rv-settings-tab.rv--active{color:var(--rv-accent,#0969da);border-bottom-color:var(--rv-accent,#0969da);font-weight:600}
.rv-settings-body{margin-top:10px;scrollbar-width:thin;overflow-y:auto;max-height:calc(80vh - 120px)}
.rv-settings-pane{display:none}
.rv-settings-pane.rv--active{display:block}
.rv-drag-handle{cursor:grab;user-select:none}
.rv-drag-handle:active{cursor:grabbing}
.rv-drag-handle>:not(button){pointer-events:none;user-select:none;-webkit-user-select:none;cursor:grab}
.rv-setting-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:14px}
.rv-setting-label{flex:1;white-space:nowrap}
.rv-setting-val{font-family:monospace;font-size:13px;color:var(--rv-muted,#656d76);min-width:24px;text-align:right}
.rv-setting-row input[type=color]{width:44px;height:24px;border:1px solid var(--rv-border,#d0d7de);border-radius:4px;cursor:pointer;padding:1px 2px;background:none}
.rv-setting-row input[type=range]{width:120px;cursor:pointer;accent-color:var(--rv-accent,#0969da)}
.rv-cm-type{display:flex;gap:6px;margin-bottom:10px}
.rv-cm-type-btn{flex:1;padding:4px;border:1px solid var(--rv-border,#d0d7de);border-radius:5px;background:transparent;font-size:13px;cursor:pointer;color:var(--rv-text,#1f2328);transition:all .15s}
.rv-cm-type-btn.rv--active{background:var(--rv-accent,#0969da);border-color:var(--rv-accent,#0969da);color:#fff}
.rv-stop-row{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.rv-stop-val{width:52px;padding:3px 5px;border:1px solid var(--rv-border,#d0d7de);border-radius:4px;font-size:13px;font-family:monospace;background:var(--rv-bg,#fff);color:var(--rv-text,#1f2328)}
.rv-stop-del{border:none;background:none;cursor:pointer;color:var(--rv-muted,#656d76);font-size:16px;padding:0 3px;line-height:1}
.rv-stop-del:hover{color:var(--rv-error,#cf222e)}
.rv-stop-add{font-size:13px;color:var(--rv-accent,#0969da);background:none;border:1px dashed var(--rv-border,#d0d7de);border-radius:5px;padding:3px 10px;cursor:pointer;width:100%;margin-top:4px}
.rv-stop-add:hover{border-color:var(--rv-accent,#0969da)}
.rv-struct-order{margin-top:10px;display:none}
.rv-struct-order-list{display:flex;flex-direction:column;gap:3px;margin-top:5px;max-height:150px;overflow-y:auto}
.rv-struct-order-row{display:flex;align-items:center;gap:7px;padding:4px 8px;border:1px solid var(--rv-border,#d0d7de);border-radius:5px;font-size:13px;font-family:monospace;background:var(--rv-bg,#fff)}
.rv-struct-order-idx{color:var(--rv-muted,#656d76);min-width:14px;text-align:right;flex-shrink:0}
.rv-struct-order-lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rv-text,#1f2328)}
.rv-struct-order-src{color:var(--rv-muted,#656d76);font-size:12px;flex-shrink:0}
.rv-struct-order-btns{display:flex;flex-direction:column;gap:1px;flex-shrink:0}
.rv-struct-order-btn{border:none;background:none;cursor:pointer;color:var(--rv-muted,#656d76);padding:0 3px;line-height:1.2;font-size:11px}
.rv-struct-order-btn:hover{color:var(--rv-text,#1f2328)}
.rv-xml-target{margin-bottom:10px}
.rv-xml-target-list{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.rv-xml-target-row{display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid var(--rv-border,#d0d7de);border-radius:5px;font-size:13px;font-family:monospace;background:var(--rv-bg,#fff);cursor:pointer;user-select:none}
.rv-xml-target-row input[type=checkbox]{accent-color:var(--rv-accent,#0969da);width:13px;height:13px;cursor:pointer;flex-shrink:0}
.rv-xml-target-row:hover{border-color:var(--rv-accent,#0969da)}
.rv-xml-target-idx{color:var(--rv-muted,#656d76);min-width:14px;text-align:right;flex-shrink:0}
.rv-xml-target-lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rv-text,#1f2328)}
.rv-annot-target{margin-bottom:10px}
.rv-annot-target-list{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.rv-annot-target-row{display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid var(--rv-border,#d0d7de);border-radius:5px;font-size:13px;font-family:monospace;background:var(--rv-bg,#fff);cursor:pointer;user-select:none}
.rv-annot-target-row input[type=radio]{accent-color:var(--rv-accent,#0969da);width:13px;height:13px;cursor:pointer;flex-shrink:0}
.rv-annot-target-row:hover{border-color:var(--rv-accent,#0969da)}
.rv-annot-target-lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rv-text,#1f2328)}
.rv-struct-order-btn:disabled{opacity:.25;cursor:default}
/* Alignment view */
.rv-aln-view{display:none;position:absolute;inset:0;flex-direction:column;overflow:hidden;box-sizing:border-box;font-family:monospace;font-size:13px}
.rv-aln-view.rv--active{display:flex}
.rv-aln-scroll{flex:1;overflow:auto;min-height:0;background:var(--rv-bg,#fff);overflow-anchor:none}
.rv-aln-table{border-collapse:collapse;white-space:nowrap;table-layout:fixed}
.rv-aln-table th,.rv-aln-table td{padding:1px 0;line-height:1.45;overflow:hidden}
.rv-aln-thead th{position:sticky;top:0;z-index:3;background:var(--rv-surface,#f6f8fa);border-bottom:1px solid var(--rv-border,#d0d7de);font-weight:normal}
.rv-aln-tfoot td{position:sticky;bottom:0;z-index:3;background:var(--rv-surface,#f6f8fa);border-top:1px solid var(--rv-border,#d0d7de);font-weight:bold}
.rv--aln-mode .rv-canvas{display:flex;flex-direction:column}
.rv--aln-mode .rv-aln-view{flex:1;min-height:0;height:auto}
.rv-aln-name{position:sticky;left:0;z-index:2;background:var(--rv-bg,#fff);padding-right:8px;width:14ch;min-width:14ch;max-width:14ch;text-overflow:ellipsis;white-space:nowrap;color:var(--rv-muted,#656d76);font-size:12px;box-sizing:content-box}
.rv-aln-thead .rv-aln-name,.rv-aln-tfoot .rv-aln-name{z-index:4;background:var(--rv-surface,#f6f8fa);color:var(--rv-text,#1f2328);font-weight:bold}
.rv-aln-c{width:1ch;min-width:1ch;max-width:1ch;text-align:center}
`;
	/* File parsers
	   Parse one or more dot-bracket structure records from a .db file.
	   Format per record:
	     >NAME
	     SEQUENCE
	     DOT-BRACKET [optional free-energy e.g. (-88.93)]
	  
	   Returns [{label, sequence, structure}, ...]

	   or

	   Parse a CT (connectivity table) file.
	   Header line: <nBases> [ENERGY = <e>] [label]
	   Data lines: n Base n-1 n+1 pairedWith naturalIndex
	   Multiple structures allowed (one header block each)
	   Pseudoknots are detected and encoded with [], {}, <> brackets
	 */
	function parseCTFile(text) {
		const VALID_SEQ_RE = /^[ACGUTRYSWKMBDHVNacgutryswkmbdhvn]+$/;
		const records = [];
		const rawLines = text.replace(/\r/g, '').split('\n');
		// Split into blocks, each block starts with a header line
		// Header: optional whitespace, then digits, then whitespace/end
		const blocks = [];
		let cur = null;
		for (const raw of rawLines) {
			const line = raw.trim();
			if (!line) continue;
			if (/^\d+\s/.test(line) || /^\d+$/.test(line)) {
				// Could be header or data, we disambiguate by checking if 2nd field is a single letter
				const parts = line.split(/\s+/);
				const isData = parts.length >= 5 && /^[ACGUTXacgutx]$/i.test(parts[1]);
				if (!isData) {
					// New block header
					cur = {
						header: line,
						lines: []
					};
					blocks.push(cur);
					continue;
				}
			}
			if (cur) cur.lines.push(line);
		}
		if (!blocks.length) throw new Error('No CT records found');
		for (const {
				header,
				lines
			}
			of blocks) {
			const hParts = header.trim().split(/\s+/);
			const n = parseInt(hParts[0]);
			if (isNaN(n) || n <= 0) throw new Error(`Invalid CT header: "${header.slice(0, 40)}"`);
			// Optional label to skip, ENERGY = value tokens, take remainder
			let label = header.replace(/^\s*\d+\s*/, '').replace(/ENERGY\s*=\s*[-\d.]+\s*/i, '').trim() || `structure_${records.length + 1}`;
			// Parse data lines
			const seq = new Array(n + 1).fill('');
			const paired = new Array(n + 1).fill(0); // 1-based
			for (const line of lines) {
				const p = line.split(/\s+/);
				if (p.length < 5) continue;
				const idx = parseInt(p[0]);
				if (isNaN(idx) || idx < 1 || idx > n) continue;
				seq[idx] = p[1].toUpperCase().replace('T', 'U');
				paired[idx] = parseInt(p[4]) || 0;
			}
			const sequence = seq.slice(1).join('');
			if (sequence.length !== n) throw new Error(`"${label}": expected ${n} bases, got ${sequence.length}`);
			// Convert pairs to dot-bracket with pseudoknot detection
			const structure = ctPairsToDotBracket(paired, n);
			records.push({
				label,
				sequence,
				structure
			});
		}
		if (!records.length) throw new Error('No valid CT records found');
		return records;
	}
	// Convert a 1-based pairs array to dot-bracket string, using [], {}, <> for pseudoknots
	function ctPairsToDotBracket(paired, n) {
		const BRACKETS = [
			['(', ')'],
			['[', ']'],
			['{', '}'],
			['<', '>'], ...Array.from({
				length: 26
			}, (_, i) => [
				String.fromCharCode(65 + i),
				String.fromCharCode(97 + i)
			]),
		];
		const db = new Array(n + 1).fill('.');
		// Collect canonical pairs (i < j)
		const pairs = [];
		for (let i = 1; i <= n; i++) {
			if (paired[i] > i) pairs.push([i, paired[i]]);
		}
		// Assign each pair a bracket level (0 = no crossing with same level)
		const levels = new Array(pairs.length).fill(0);
		for (let idx = 0; idx < pairs.length; idx++) {
			const [a, b] = pairs[idx];
			for (let lvl = 0; lvl < BRACKETS.length; lvl++) {
				let ok = true;
				for (let prev = 0; prev < idx; prev++) {
					if (levels[prev] !== lvl) continue;
					const [c, d] = pairs[prev];
					// Interleaving = pseudoknot: c < a < d < b  or  a < c < b < d
					if ((c < a && a < d && d < b) || (a < c && c < b && b < d)) {
						ok = false;
						break;
					}
				}
				if (ok) {
					levels[idx] = lvl;
					break;
				}
				if (lvl === BRACKETS.length - 1) levels[idx] = lvl;
			}
		}
		for (let idx = 0; idx < pairs.length; idx++) {
			const [a, b] = pairs[idx], bk = BRACKETS[levels[idx]];
			db[a] = bk[0];
			db[b] = bk[1];
		}
		return db.slice(1).join('');
	}
	/*
	  Parses a Stockholm 1.0 multiple sequence alignment file.
	  Requires #=GC SS_cons line for the consensus structure.
	  Name taken from #=GF ID or #=GF AC, or falls back to filename hint.
	  Returns [{label, sequence, structure, baseDisplay}], one record per alignment block.
	 */
	function parseStockholmFile(text, filenameFallback) {
		const BRACKET_RE = /[()[\]{}<>A-Za-z]/;
		const NUC_SET = new Set(['A', 'C', 'G', 'U']);
		// Conservation thresholds to  colors
		const RED = '#cc0000';
		const BLACK = '#111111';
		const GREY = '#888888';
		const WHITE = '#ffffff';
		const records = [];
		let id = null,
			ac = null;
		const seqMap = new Map(); // seqId to concatenated gapped sequence
		const ssConsParts = [];
		const ssConsFeatureParts = {};

		function buildRecord() {
			if (!ssConsParts.length || !seqMap.size) return;
			const ssCons = ssConsParts.join('');
			const seqs = [...seqMap.values()];
			const N = seqs.length;
			const alnLen = ssCons.length;
			if (!seqs.every(s => s.length === alnLen)) throw new Error('Stockholm: SS_cons length does not match alignment columns');
			// normalize SS_cons, keeps bracket chars and everything else is a dot
			const structFull = Array.from(ssCons).map(c => BRACKET_RE.test(c) ? c : '.').join('');
			// Per-column conservation stats
			const allBD = []; // display descriptor per column
			const allSeq = []; // most common nucleotide per column
			for (let col = 0; col < alnLen; col++) {
				const chars = seqs.map(s => {
					const c = s[col].toUpperCase();
					return c === 'T' ? 'U' : c;
				});
				const nucCount = {};
				let numNuc = 0;
				for (const c of chars) {
					if (NUC_SET.has(c)) {
						nucCount[c] = (nucCount[c] || 0) + 1;
						numNuc++;
					}
				}
				let maxNuc = 'N',
					maxCnt = 0;
				for (const [n, cnt] of Object.entries(nucCount))
					if (cnt > maxCnt) {
						maxCnt = cnt;
						maxNuc = n;
					}
				allSeq.push(maxNuc);
				const maxFreq = maxCnt / N;
				const nucFreq = numNuc / N;
				// Column frequency stats for the hover tooltip
				const colStats = {
					A: +((nucCount.A || 0) / N * 100).toFixed(1),
					C: +((nucCount.C || 0) / N * 100).toFixed(1),
					G: +((nucCount.G || 0) / N * 100).toFixed(1),
					U: +((nucCount.U || 0) / N * 100).toFixed(1),
					gap: +((1 - nucFreq) * 100).toFixed(1),
				};
				if (maxFreq >= 0.97) {
					allBD.push({
						letter: maxNuc,
						textColor: RED,
						fillColor: null,
						colStats
					});
				} else if (maxFreq >= 0.90) {
					allBD.push({
						letter: maxNuc,
						textColor: BLACK,
						fillColor: null,
						colStats
					});
				} else if (maxFreq >= 0.75) {
					allBD.push({
						letter: maxNuc,
						textColor: GREY,
						fillColor: null,
						colStats
					});
				} else {
					// IUPAC degenerate check
					// Try 2 nt then 3 nt combos. Each component must be ≥30%;
					// combined total must reach 75%. Same  color thresholds as single bases.
					// This is better than the original R2R implementation that could have
					// never returned 3 nt degenerations
					const IUPAC2 = {
						AC: 'M',
						AG: 'R',
						AU: 'W',
						CG: 'S',
						CU: 'Y',
						GU: 'K'
					};
					const IUPAC3 = {
						ACG: 'V',
						ACU: 'H',
						AGU: 'D',
						CGU: 'B'
					};
					const NUCS = ['A', 'C', 'G', 'U'];
					const MIN_C = 0.30;
					const f = n => (nucCount[n] || 0) / N;
					let iupac = null,
						iupacFreq = 0;
					// 2 nt
					outer2: for (let i = 0; i < NUCS.length; i++) {
						for (let j = i + 1; j < NUCS.length; j++) {
							const fi = f(NUCS[i]),
								fj = f(NUCS[j]);
							if (fi >= MIN_C && fj >= MIN_C && fi + fj >= 0.75) {
								iupac = IUPAC2[NUCS[i] + NUCS[j]];
								iupacFreq = fi + fj;
								break outer2;
							}
						}
					}
					// 3 nt (only if no 2 nt match)
					if (!iupac) {
						outer3: for (let i = 0; i < NUCS.length; i++) {
							for (let j = i + 1; j < NUCS.length; j++) {
								for (let k = j + 1; k < NUCS.length; k++) {
									const fi = f(NUCS[i]),
										fj = f(NUCS[j]),
										fk = f(NUCS[k]);
									if (fi >= MIN_C && fj >= MIN_C && fk >= MIN_C && fi + fj + fk >= 0.75) {
										iupac = IUPAC3[NUCS[i] + NUCS[j] + NUCS[k]];
										iupacFreq = fi + fj + fk;
										break outer3;
									}
								}
							}
						}
					}
					if (iupac) {
						const iupacColor = iupacFreq >= 0.97 ? RED : iupacFreq >= 0.90 ? BLACK : GREY;
						allBD.push({
							letter: iupac,
							textColor: iupacColor,
							fillColor: null
						});
					} else {
						const fill = nucFreq >= 0.97 ? RED : nucFreq >= 0.90 ? BLACK : nucFreq >= 0.75 ? GREY : nucFreq >= 0.50 ? WHITE : null;
						allBD.push(fill !== null ? {
							letter: null,
							textColor: null,
							fillColor: fill
						} : {
							skip: true
						});
					}
					// Attach column stats to the last pushed entry for the tooltip
					allBD[allBD.length - 1].colStats = colStats;
				}
			}
			// To preserve pair consistency, if one partner is skipped, skip both
			// Parse the full-length structure to find all pairs
			const {
				pairs: pairsFull,
				pseudoPairs: pseudoFull
			} = parseDotBracket(structFull);
			for (let i = 0; i < alnLen; i++) {
				const j = pairsFull[i];
				if (j > i && (allBD[i].skip || allBD[j].skip)) {
					allBD[i] = {
						skip: true
					};
					allBD[j] = {
						skip: true
					};
				}
			}
			for (const {
					i,
					j
				}
				of pseudoFull) {
				if (allBD[i].skip || allBD[j].skip) {
					allBD[i] = {
						skip: true
					};
					allBD[j] = {
						skip: true
					};
				}
			}
			// Filter to remove skipped positions entirely
			const baseDisplay = [];
			const filteredSeq = [];
			const filteredStruct = [];
			const positionLabels = []; // 1-based original alignment index per kept position
			for (let col = 0; col < alnLen; col++) {
				if (allBD[col].skip) continue;
				filteredSeq.push(allSeq[col]);
				filteredStruct.push(structFull[col]);
				baseDisplay.push(allBD[col]);
				positionLabels.push(col + 1);
			}
			// filenameFallback (caller-provided label) takes priority over #=GF ID / AC
			const label = ac || id || (filenameFallback ? filenameFallback.replace(/\.[^.]+$/, '') : null) || 'alignment';
			// Trims terminal unstructured positions (leading/trailing dots only).
			// Saves the untrimmed data in ssEnds so it can be restored by the toggle.
			let trimS = 0,
				trimE = filteredStruct.length - 1;
			while (trimS <= trimE && filteredStruct[trimS] === '.') trimS++;
			while (trimE >= trimS && filteredStruct[trimE] === '.') trimE--;
			let ssEnds = null;
			if (trimS > 0 || trimE < filteredStruct.length - 1) {
				ssEnds = {
					trimS,
					trimE,
					fullSeq: filteredSeq.slice(),
					fullStruct: filteredStruct.slice(),
					fullBaseDisplay: baseDisplay.slice(),
					fullPositionLabels: positionLabels.slice(),
				};
				filteredSeq.splice(trimE + 1);
				filteredStruct.splice(trimE + 1);
				baseDisplay.splice(trimE + 1);
				positionLabels.splice(trimE + 1);
				filteredSeq.splice(0, trimS);
				filteredStruct.splice(0, trimS);
				baseDisplay.splice(0, trimS);
				positionLabels.splice(0, trimS);
			}
			const _colToRi = new Map();
			positionLabels.forEach((col1, ri) => _colToRi.set(col1 - 1, ri));
			const ssConsFeatures = {};
			// Extra pairs from SS_cons_* features to inject into the structure
			// (bracket chars in these lines represent additional base pairs).
			// We collect all such pairs first, then add them to filteredStruct.
			const ssConsPkPairs = {}; // featureName → [{i,j}] — bracket pairs from SS_cons_* features, rendered as insets only
			for (const [fn, parts] of Object.entries(ssConsFeatureParts)) {
				const str = parts.join('');
				if (str.length !== alnLen) continue;
				const pos = [];
				const featureStacks = {};
				const featPairs = [];
				for (let col = 0; col < alnLen; col++) {
					const c = str[col];
					const ri = _colToRi.get(col);
					if (c === '.' || c === ':' || c === '-' || c === '_') continue;
					if ('([{<'.includes(c) || (c >= 'A' && c <= 'Z')) {
						if (!featureStacks[c]) featureStacks[c] = [];
						featureStacks[c].push(col);
					} else if (')]}>'.includes(c)) {
						const openCh = {
							'(': '(',
							')': '(',
							']': '[',
							'[': '[',
							'}': '{',
							'{': '{',
							'>': '<',
							'<': '<'
						} [c] || null;
						if (openCh && featureStacks[openCh]?.length) {
							const openCol = featureStacks[openCh].pop();
							const riOpen = _colToRi.get(openCol);
							const riClose = ri;
							if (riOpen !== undefined && riClose !== undefined)
								featPairs.push({
									i: Math.min(riOpen, riClose),
									j: Math.max(riOpen, riClose)
								});
						}
					} else if (c >= 'a' && c <= 'z') {
						const open = c.toUpperCase();
						if (featureStacks[open]?.length) {
							const openCol = featureStacks[open].pop();
							const riOpen = _colToRi.get(openCol);
							if (riOpen !== undefined && ri !== undefined)
								featPairs.push({
									i: Math.min(riOpen, ri),
									j: Math.max(riOpen, ri)
								});
						}
					}
					if (ri !== undefined) pos.push(ri);
				}
				if (pos.length) ssConsFeatures[fn] = pos.sort((a, b) => a - b);
				if (featPairs.length) ssConsPkPairs[fn] = featPairs;
			}
			// Note: SS_cons_* bracket pairs are NOT injected into filteredStruct.
			// They are rendered only as inset panels via _renderPkStockholm(ssConsPkPairs).
			// This handles both pseudoknots and alternative/crossing pairs that conflict
			// with the main structure.
			records.push({
				label,
				sequence: filteredSeq.join(''),
				structure: filteredStruct.join(''),
				baseDisplay,
				positionLabels,
				alnSeqs: [...seqMap.entries()].map(([name, seq]) => ({
					name,
					seq
				})),
				alnStruct: structFull,
				alnLen: alnLen,
				ssConsFeatures,
				ssConsPkPairs,
				ssEnds, // null if no terminal unpaired bases were trimmed
			});
		}
		for (const raw of text.replace(/\r/g, '').split('\n')) {
			if (raw.startsWith('# STOCKHOLM') || raw.startsWith('#=GS') || raw.startsWith('#=GR')) continue;
			if (raw === '//') {
				buildRecord();
				id = null;
				ac = null;
				seqMap.clear();
				ssConsParts.length = 0;
				for (const k of Object.keys(ssConsFeatureParts)) delete ssConsFeatureParts[k];
				continue;
			}
			if (raw.startsWith('#=GF ID ')) {
				id = raw.slice(8).trim();
				continue;
			}
			if (raw.startsWith('#=GF AC ')) {
				ac = raw.slice(8).trim();
				continue;
			}
			if (raw.startsWith('#=GF')) continue;
			if (raw.startsWith('#=GC')) {
				const fields = raw.split(/\s+/);
				if (fields[1] === 'SS_cons' && fields[2]) ssConsParts.push(fields[2]);
				else if (fields[1]?.startsWith('SS_cons_') && fields[2]) {
					const fn = fields[1].slice(8);
					if (!ssConsFeatureParts[fn]) ssConsFeatureParts[fn] = [];
					ssConsFeatureParts[fn].push(fields[2]);
				}
				continue;
			}
			if (raw.startsWith('#')) continue;
			const trim = raw.trim();
			if (!trim) continue;
			const fields = trim.split(/\s+/);
			if (fields.length >= 2) {
				const sid = fields[0],
					seq = fields[fields.length - 1];
				seqMap.set(sid, (seqMap.get(sid) || '') + seq);
			}
		}
		buildRecord(); // If file lacks end of record marker //
		if (!records.length) throw new Error('No valid Stockholm alignment found');
		return records;
	}

	function parseDbFile(text, filenameFallback) {
		// Auto-detect Stockholm format
		const firstLine = text.replace(/\r/g, '').split('\n').find(l => l.trim());
		if (firstLine?.startsWith('# STOCKHOLM')) return parseStockholmFile(text, filenameFallback);
		// Auto-detect CT format: first non-empty line starts with digits
		const p = firstLine?.trim().split(/\s+/) || [];
		if (/^\d+$/.test(p[0]) && (p.length === 1 || !/^[ACGUTacgut]$/i.test(p[1]))) return parseCTFile(text);
		// Valid characters for each line type
		const SEQ_RE = /^[A-Za-z\-]+$/;
		const STRUCT_RE = /^[().\[\]{}<>A-Za-z-]+$/; // dot-bracket + pseudoknot letters
		// Strip trailing free-energy annotation like " (-88.93)"
		const stripFE = s => s.replace(/\s+\(\s*[-−]?\d+\.?\d*\s*\)\s*$/, '').trim();
		const records = [];
		const rawLines = text.replace(/\r/g, '').split('\n');
		let i = 0;
		while (i < rawLines.length) {
			const line = rawLines[i].trim();
			if (!line) {
				i++;
				continue;
			} // blank — skip
			if (line.startsWith('>')) {
				// Named record: >label / sequence / structure
				const label = line.slice(1).trim() || `structure_${records.length + 1}`;
				const seqRaw = (rawLines[i + 1] || '').trim();
				const strRaw = stripFE((rawLines[i + 2] || '').trim()).split(/\s/)[0];
				if (!seqRaw) throw new Error(`"${label}": missing sequence line`);
				if (!strRaw || !STRUCT_RE.test(strRaw)) throw new Error(`"${label}": expected dot-bracket structure on line ${i + 3}` + (strRaw ? ` (got "${strRaw.slice(0, 20)}")` : ' (line is empty)'));
				if (strRaw.length !== seqRaw.length) throw new Error(`"${label}": structure length (${strRaw.length}) ≠ sequence length (${seqRaw.length})`);
				records.push({
					label,
					sequence: normalizeSeq(seqRaw),
					structure: strRaw,
				});
				i += 3;
			} else if (SEQ_RE.test(line)) {
				// Header-less record: sequence / structure [/ optional extras]
				const seqRaw = line;
				const label = `structure_${records.length + 1}`;
				const strRaw = stripFE((rawLines[i + 1] || '').trim()).split(/\s/)[0];
				if (!strRaw || !STRUCT_RE.test(strRaw)) throw new Error(`Structure ${records.length + 1}: expected dot-bracket on line ${i + 2}` + (strRaw ? ` (got "${strRaw.slice(0, 20)}")` : ' (line is empty)'));
				if (strRaw.length !== seqRaw.length) throw new Error(`Structure ${records.length + 1}: structure length (${strRaw.length}) ≠ sequence length (${seqRaw.length})`);
				records.push({
					label,
					sequence: normalizeSeq(seqRaw),
					structure: strRaw,
				});
				i += 2;
			} else {
				// Mutation markers, comments, blank-ish lines, must be skipped
				i++;
			}
		}
		if (!records.length) throw new Error('No valid records found');
		return records;
	}
	/*
	  Parse an RNA Framework's reactivity XML file produced by rf-norm.
	  Extracts <sequence> and <reactivity> from each <transcript>.
	  Returns [{id, sequence, values: number[]}, ...]
	  NaN and missing entries are stored as null.
	 */
	function parseXmlReactivity(text) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, 'application/xml');
		if (doc.querySelector('parsererror')) throw new Error('XML parse error: ' + doc.querySelector('parsererror').textContent.slice(0, 120));
		return Array.from(doc.querySelectorAll('transcript')).map(t => {
			const id = t.getAttribute('id') || '';
			const sequence = normalizeSeq((t.querySelector('sequence')?.textContent || '').replace(/\s/g, ''));
			const reactRaw = (t.querySelector('reactivity')?.textContent || '').replace(/\s/g, '');
			const values = reactRaw.split(',').map(v => {
				if (!v || v.toLowerCase() === 'nan') return null;
				const n = parseFloat(v);
				return isNaN(n) ? null : n;
			});
			return {
				id,
				sequence,
				values
			};
		});
	}
	/*
	  Parses a custom format tab-separated pair-annotation file.
	  Format: i<TAB>j[<TAB>category] (i and j are 0-based)
	  Lines starting with # are comments.
	  Returns [{i, j, category}], with category = null when not provided.
	 */
	function parsePairAnnotFile(text) {
		const lines = text.replace(/\r/g, '').split('\n');
		const pairs = [];
		for (const raw of lines) {
			const line = raw.trim();
			if (!line || line.startsWith('#')) continue;
			const parts = line.split('\t');
			if (parts.length < 2) throw new Error(`expected at least two tab-separated columns: "${line.slice(0, 40)}"`);
			const i = parseInt(parts[0]);
			const j = parseInt(parts[1]);
			if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0) throw new Error(`Invalid indices at line "${line.slice(0, 40)}"`);
			const category = parts[2]?.trim() || null;
			pairs.push({
				i,
				j,
				category
			});
		}
		if (!pairs.length) throw new Error('no valid pairs found');
		return pairs;
	}
	/*
	  Parses an R-scape covariation .cov file.
	  Data lines start with '*' followed by whitespace-separated columns:
	    * <left_pos (1-based)> <right_pos (1-based)> <score> <E-value> <pvalue> <substitutions> <power>
	  Positions are converted to 0-based.  Category is derived from E-value:
	    E < 0.05 is "E < 0.05" (green)
	    E < 0.1 is "E < 0.1" (blue)
	    E < 0.2 is "E < 0.2" (purple)
	    E ≥ 0.2 is "E ≥ 0.2" (grey)
	 */
	function parseCovFile(text) {
		const COV_COLORS = [{
			limit: 0.05,
			label: 'E < 0.05',
			color: '#31a354'
		}, {
			limit: 0.10,
			label: 'E < 0.1',
			color: '#0969da'
		}, {
			limit: 0.20,
			label: 'E < 0.2',
			color: '#7c3aed'
		}, {
			limit: Infinity,
			label: 'E ≥ 0.2',
			color: '#8b949e'
		}, ];
		// Detect format: CaCoFold R-scape has TWO leading * columns on data lines.
		// Some files have 'in_given' in the header but still use single-* format.
		const dataLines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().startsWith('*'));
		const isCaCoFold = dataLines.length > 0 && dataLines[0].trim().split(/\s+/)[1] === '*';
		const off = isCaCoFold ? 1 : 0; // extra column offset for CaCoFold format
		const pairs = [];
		for (const raw of text.replace(/\r/g, '').split('\n')) {
			const line = raw.trim();
			if (!line.startsWith('*')) continue;
			// cols[0]='*', [1+off]=left_pos, [2+off]=right_pos, [3+off]=score, [4+off]=E-value
			const cols = line.split(/\s+/);
			if (cols.length < 5 + off) continue;
			const left = parseInt(cols[1 + off]);
			const right = parseInt(cols[2 + off]);
			const evalue = parseFloat(cols[4 + off]);
			if (!Number.isInteger(left) || !Number.isInteger(right) || left < 1 || right < 1) continue;
			if (isNaN(evalue)) continue;
			const bucket = COV_COLORS.find(b => evalue < b.limit) ?? COV_COLORS[COV_COLORS.length - 1];
			pairs.push({
				i: left - 1,
				j: right - 1,
				category: bucket.label,
				_color: bucket.color
			});
		}
		if (!pairs.length) throw new Error('No significantly covarying pairs found');
		return pairs;
	}
	// Parse R-scape .helixcov file.
	// Returns all RM_HELIX records.  significant=true when starred (LANCASTER) or nbpCov>0 (NONE).
	// Positions returned are 0-based alignment columns.
	function parseHelixCovFile(text) {
		const helices = [];
		let cur = null;
		for (const raw of text.replace(/\r/g, '').split('\n')) {
			const line = raw.trim();
			// RM_HELIX header: # RM_HELIX NESTED 14-20 65-70, nbp = 5 nbp_cov = 5
			const hm = line.match(/^#\s+RM_HELIX\s+(\S+)\s+(\d+)-(\d+)\s+(\d+)-(\d+)(?:,\s*nbp\s*=\s*(\d+))?(?:\s+nbp_cov\s*=\s*(\d+))?/);
			if (hm) {
				const helixType = hm[1];
				const [a, b, c, d] = [2, 3, 4, 5].map(i => parseInt(hm[i]));
				cur = {
					helixType,
					start5p: a - 1,
					end5p: b - 1,
					start3p: Math.min(c, d) - 1,
					end3p: Math.max(c, d) - 1,
					reversed3p: c > d,
					nbp: hm[6] ? +hm[6] : 0,
					nbpCov: hm[7] ? +hm[7] : 0,
					evalue: null,
					pvalue: null,
					significant: false
				};
				helices.push(cur);
				continue;
			}
			if (cur && line.includes('aggregated')) {
				if (line.includes('E-value')) {
					const em = line.match(/E-value:\s*([\d.e+\-]+)\s+P-value:\s*([\d.e+\-]+)/i);
					if (em) {
						cur.evalue = parseFloat(em[1]);
						cur.pvalue = parseFloat(em[2]);
					}
					cur.significant = /\*\s*$/.test(line);
				} else if (line.includes('NONE')) {
					cur.significant = false;
				}
			}
		}
		if (!helices.length) throw new Error('No RM_HELIX records found in .helixcov file');
		return helices;
	}
	// Extracts all base-pair positions from a dot-bracket string as a Set of "i,j" strings (i<j)
	function buildPairsArray(structure) {
		const n = structure.length;
		const p = new Int32Array(n).fill(-1);
		const st = {};
		const cl = {
			')': '(',
			']': '[',
			'}': '{',
			'>': '<'
		};
		for (let i = 0; i < n; i++) {
			const c = structure[i];
			if ('([{<'.includes(c) || (c >= 'A' && c <= 'Z')) {
				if (!st[c]) st[c] = [];
				st[c].push(i);
			} else if (cl[c]) {
				const j = st[cl[c]]?.pop();
				if (j != null) {
					p[i] = j;
					p[j] = i;
				}
			} else if (c >= 'a' && c <= 'z') {
				const j = st[c.toUpperCase()]?.pop();
				if (j != null) {
					p[i] = j;
					p[j] = i;
				}
			}
		}
		return p;
	}

	function getStructurePairSet(structure) {
		const pairs = new Set();
		const stacks = {
			'(': [],
			'[': [],
			'{': [],
			'<': []
		};
		const close = {
			')': '(',
			']': '[',
			'}': '{',
			'>': '<'
		};
		for (let k = 0; k < structure.length; k++) {
			const c = structure[k];
			if (stacks[c] !== undefined) {
				stacks[c].push(k);
			} else if (close[c]) {
				const l = stacks[close[c]]?.pop();
				if (l !== undefined) pairs.add(`${Math.min(l,k)},${Math.max(l,k)}`);
			} else if (c >= 'A' && c <= 'Z') {
				if (!stacks[c]) stacks[c] = [];
				stacks[c].push(k);
			} else if (c >= 'a' && c <= 'z') {
				const open = c.toUpperCase();
				const l = stacks[open]?.pop();
				if (l !== undefined) pairs.add(`${Math.min(l,k)},${Math.max(l,k)}`);
			}
		}
		return pairs;
	}

	function normalizeSeq(s) {
		return (s || '').toUpperCase().replace(/T/g, 'U');
	}

	function pairKey(i, j) {
		return `${Math.min(i, j)},${Math.max(i, j)}`;
	}
	// Returns error string or null if valid. Pass allowInvalidChars=false to also flag non-dot/non-bracket chars.
	function checkBracketBalance(str, allowInvalidChars = true) {
		const stk = {};
		const mat = {
			')': '(',
			']': '[',
			'}': '{',
			'>': '<',
			...Object.fromEntries(Array.from({
				length: 26
			}, (_, i) => [
				String.fromCharCode(97 + i),
				String.fromCharCode(65 + i)
			])),
		};
		for (let i = 0; i < str.length; i++) {
			const c = str[i];
			if ('([{<'.includes(c) || (c >= 'A' && c <= 'Z')) {
				stk[c] = (stk[c] || 0) + 1;
			} else if (mat[c]) {
				const o = mat[c];
				if (!stk[o]) return `Unmatched '${c}' at position ${i + 1}.`;
				stk[o]--;
			} else if (c !== '.' && !allowInvalidChars) {
				return `Invalid character '${c}' at position ${i + 1}.`;
			}
		}
		for (const [o, n] of Object.entries(stk))
			if (n > 0) return `${n} unclosed '${o}' bracket${n > 1 ? 's' : ''}.`;
		return null;
	}

	function remapAnnotPairs(pairs, positionLabels) {
		if (!positionLabels?.length) return pairs;
		const origToRendered = new Map();
		positionLabels.forEach((origCol1, renderedIdx) => {
			origToRendered.set(origCol1 - 1, renderedIdx);
		});
		if (!pairs.some(p => origToRendered.has(p.i) || origToRendered.has(p.j))) return pairs;
		return pairs.map(p => ({
			...p,
			i: origToRendered.has(p.i) ? origToRendered.get(p.i) : p.i,
			j: origToRendered.has(p.j) ? origToRendered.get(p.j) : p.j,
		}));
	}
	// Returns { annotArr, pairAnnotColorMap, invalid } or throws if no valid pairs.
	function buildAnnotationArrays(remappedPairs, structPairs, filename, label) {
		const invalid = remappedPairs.filter(({
			i,
			j
		}) => !structPairs.has(pairKey(i, j)));
		const validPairs = remappedPairs.filter(({
			i,
			j
		}) => structPairs.has(pairKey(i, j)));
		if (!validPairs.length) {
			const ex = invalid.slice(0, 3).map(p => `(${p.i},${p.j})`).join(', ');
			throw new Error(`"${filename}": no valid pairs found in structure "${label || 'selected'}"` + (ex ? ` — e.g. ${ex}` : ''));
		}
		const colorMap = buildAnnotColorMapAuto(validPairs);
		const annotArr = validPairs.map(({
			i,
			j,
			category
		}) => ({
			i,
			j,
			key: category ?? ANNOT_MISSING_KEY,
			color: colorMap ? (colorMap[category ?? ANNOT_MISSING_KEY] ?? ANNOT_DEFAULT_COLOR) : ANNOT_DEFAULT_COLOR,
		}));
		const pairAnnotColorMap = colorMap ? Object.entries(colorMap).map(([key, color]) => ({
			key,
			color
		})) : null;
		return {
			validPairs,
			invalid,
			annotArr,
			pairAnnotColorMap
		};
	}
	// Assigns  colors to annotation categories
	const ANNOT_PALETTE = ['#0969da', '#1a7f37', '#d1242f', '#bf8700', '#8250df', '#0550ae', '#116329', '#a40e26', '#7d4e00', '#6639ba', '#086f75', '#5c6c00', '#c84801', '#1d6a96', '#5c3d8f', ];
	const ANNOT_MISSING_KEY = '(undefined)';
	const ANNOT_MISSING_COLOR = '#999999';
	const ANNOT_DEFAULT_COLOR = '#0969da';

	function buildAnnotColorMap(pairs) {
		const hasAny = pairs.some(p => p.category !== null);
		if (!hasAny) return null; // if no categories, then single  color used
		const cats = [...new Set(pairs.map(p => p.category).filter(Boolean))];
		const map = {};
		cats.forEach((c, i) => {
			map[c] = ANNOT_PALETTE[i % ANNOT_PALETTE.length];
		});
		// Include a visible entry for pairs that have no category
		if (pairs.some(p => p.category === null)) map[ANNOT_MISSING_KEY] = ANNOT_MISSING_COLOR;
		return map;
	}
	/*
	  Build a colormap from pairs.  If pairs carry inline `_color` properties
	  (produced by parseCovFile), use those directly per category.
	  Otherwise delegate to buildAnnotColorMap with the auto-palette.
	 */
	function buildAnnotColorMapAuto(pairs) {
		if (pairs.some(p => p._color)) {
			// .cov mode: each category has a fixed  color embedded in the pair
			const map = {};
			for (const p of pairs) {
				const key = p.category ?? ANNOT_MISSING_KEY;
				if (!(key in map)) map[key] = p._color || ANNOT_MISSING_COLOR;
			}
			return map;
		}
		return buildAnnotColorMap(pairs);
	}

	function injectStyles() {
		if (!document.getElementById(STYLE_ID)) {
			const el = document.createElement('style');
			el.id = STYLE_ID;
			el.textContent = CSS;
			// Insert at the BEGINNING of <head> so any external stylesheet
			// (which appears later in the document) overrides our defaults
			// at equal specificity without needing !important.
			const first = document.head.firstChild;
			if (first) document.head.insertBefore(el, first);
			else document.head.appendChild(el);
		}
	}
	// Math helpers
	function normalizeAngle(angle, fromVal = 0) {
		const toVal = fromVal + 2 * Math.PI;
		let r = angle;
		while (r < fromVal) r += 2 * Math.PI;
		while (r >= toVal) r -= 2 * Math.PI;
		return r;
	}

	function correctHysteresis(angle) {
		let r = normalizeAngle(angle);
		for (const att of HYSTERESIS_ATTRACTORS) {
			if (Math.abs(normalizeAngle(att - r, -Math.PI)) < HYSTERESIS_EPSILON) r = att;
		}
		return r;
	}
	// Same as VARNA's RNA.computeAngle (asin + quadrant correction)
	function computeAngle(cx, cy, px, py) {
		const dist = Math.hypot(px - cx, py - cy);
		if (dist === 0) return 0;
		let angle = Math.asin((py - cy) / dist);
		if (px - cx < 0) angle = Math.PI - angle;
		return angle;
	}

	function rotatePoint(cx, cy, px, py, angle) {
		const oldAngle = computeAngle(cx, cy, px, py);
		const dist = Math.hypot(px - cx, py - cy);
		return {
			x: cx + dist * Math.cos(oldAngle + angle),
			y: cy + dist * Math.sin(oldAngle + angle)
		};
	}

	function objFun(n1, n2, r, bpdist, multidist) {
		return n1 * 2 * Math.asin(bpdist / (2 * r)) + n2 * 2 * Math.asin(multidist / (2 * r)) - 2 * Math.PI;
	}

	function determineRadius(nbHel, nbUnpaired, startRadius, bpdist = BASE_PAIR_DISTANCE, multidist = MULTILOOP_DISTANCE) {
		let xmin = bpdist / 2,
			xmax = 3 * multidist + 1;
		let x = (xmin + xmax) / 2,
			y = 10000,
			numIt = 0;
		while (Math.abs(y) > 1e-5 && numIt < 10000) {
			x = (xmin + xmax) / 2;
			y = objFun(nbHel, nbUnpaired, x, bpdist, multidist);
			const ymin = objFun(nbHel, nbUnpaired, xmax, bpdist, multidist);
			const ymax2 = objFun(nbHel, nbUnpaired, xmin, bpdist, multidist);
			if (ymin > 0) xmax = xmax + (xmax - xmin);
			else if (y <= 0 && ymax2 > 0) xmax = x;
			else if (y >= 0 && ymin < 0) xmin = x;
			else if (ymax2 < 0) {
				xmin = Math.max(xmin - (x - xmin), Math.max(bpdist / 2, multidist / 2));
				xmax = x;
			}
			numIt++;
		}
		return x;
	}
	/* 
     Dot-bracket parser
	 Returns:
	 - pairs       [Int32Array] Nested pairs (used for layout + helix tree)
	 - pseudoPairs [Array]      Pseudoknot pairs rendered as dashed lines
	
	 ALL bracket types are treated equally: (), [], {}, <>, Aa ... Zz.
	 Nestedness is determined by crossing analysis, not by bracket choice
    */
	function parseDotBracket(structure) {
		const n = structure.length;
		const pairs = new Int32Array(n).fill(-1);
		const pseudoPairs = [];
		// Parse every bracket type into a flat pair list
		const stacks = {
			'(': [],
			'[': [],
			'{': [],
			'<': []
		};
		const matchSt = {
			')': '(',
			']': '[',
			'}': '{',
			'>': '<'
		};
		const allPairs = []; // {i, j, bracket} with i < j
		for (let k = 0; k < n; k++) {
			const c = structure[k];
			if (stacks[c] !== undefined) {
				stacks[c].push(k);
			} else if (matchSt[c]) {
				const st = stacks[matchSt[c]];
				if (st.length) allPairs.push({
					i: st.pop(),
					j: k,
					bracket: matchSt[c]
				});
			} else if (c >= 'A' && c <= 'Z') {
				if (!stacks[c]) stacks[c] = [];
				stacks[c].push(k);
			} else if (c >= 'a' && c <= 'z') {
				const open = c.toUpperCase();
				if (stacks[open]?.length) allPairs.push({
					i: stacks[open].pop(),
					j: k,
					bracket: open
				});
			}
		}
		/* 
		 Assign pairs to levels via crossing analysis.
		 Two pairs (a,b) and (c,d) cross (pseudoknot) when a<c<b<d or c<a<d<b.
		 Level 0 = nested (no crossings within level 0), layout uses these.
		 Levels 1+, pseudopairs rendered as dashed lines.

		 Strategy: sort so that '(' bracket pairs come first within the same
		 start position, ensuring the dominant nested structure (conventionally
		 written with round brackets) is preferred for level 0 over pseudoknot
		 annotations written with [], {}, <> or letter pairs.
		*/
		// Sort: primary by bracket priority ('(' first), secondary by i position.
		// This ensures round-bracket pairs (the conventional nested structure) are
		// always processed first and claim level 0, regardless of their position in the sequence.
		// Greedy non-crossing set: try each bracket type as primary sort key,
		// plus a pure-position run. Pick whichever yields the largest level-0 set.
		function buildLevel0(sorted) {
			const inSet = new Set();
			const chosen = [];
			for (const p of sorted) {
				const {
					i: a,
					j: b
				} = p;
				let crosses = false;
				for (const op of chosen) {
					if ((op.i < a && a < op.j && op.j < b) ||
						(a < op.i && op.i < b && b < op.j)) {
						crosses = true;
						break;
					}
				}
				if (!crosses) {
					inSet.add(p);
					chosen.push({
						i: a,
						j: b
					});
				}
			}
			return inSet;
		}
		const bracketTypes = [...new Set(allPairs.map(p => p.bracket))];
		let best = buildLevel0(allPairs.slice().sort((a, b) => a.i - b.i));
		for (const bt of bracketTypes) {
			const candidate = buildLevel0(allPairs.slice().sort((a, b) => {
				const pa = a.bracket === bt ? 0 : 1;
				const pb = b.bracket === bt ? 0 : 1;
				return pa !== pb ? pa - pb : a.i - b.i;
			}));
			if (candidate.size > best.size) best = candidate;
		}
		const inLevel0 = new Set(allPairs.map((p, i) => best.has(p) ? i : -1).filter(i => i >= 0));
		const levels = new Array(allPairs.length).fill(0);
		for (let idx = 0; idx < allPairs.length; idx++) {
			if (inLevel0.has(idx)) {
				levels[idx] = 0;
				continue;
			}
			const {
				i: a,
				j: b
			} = allPairs[idx];
			for (let lvl = 1;; lvl++) {
				let ok = true;
				for (let prev = 0; prev < idx; prev++) {
					if (levels[prev] !== lvl) continue;
					const {
						i: c,
						j: d
					} = allPairs[prev];
					if ((c < a && a < d && d < b) || (a < c && c < b && b < d)) {
						ok = false;
						break;
					}
				}
				if (ok) {
					levels[idx] = lvl;
					break;
				}
			}
		}
		// Level 0, nested pairs, others are pseudoPairs
		for (let idx = 0; idx < allPairs.length; idx++) {
			const {
				i,
				j,
				bracket
			} = allPairs[idx];
			if (levels[idx] === 0) {
				pairs[i] = j;
				pairs[j] = i;
			} else pseudoPairs.push({
				i,
				j,
				bracket
			});
		}
		return {
			pairs,
			pseudoPairs
		};
	}
	// Radiate layout (port of VARNA's RNA.drawRNARadiate / drawLoop)
	function drawRNARadiate(pairs, n, dirAngle = -1.0, flatExteriorLoop = true, straightBulges = true) {
		const coords = Array.from({
			length: n
		}, () => ({
			x: 0,
			y: 0
		}));
		const centers = Array.from({
			length: n
		}, () => ({
			x: 0,
			y: 0
		}));
		const angles = new Float64Array(n);

		function drawLoop(i, j, x, y, dir) {
			if (i > j) return;
			if (pairs[i] === j) {
				const na = Math.PI / 2;
				centers[i] = {
					x,
					y
				};
				centers[j] = {
					x,
					y
				};
				coords[i] = {
					x: x + BASE_PAIR_DISTANCE * Math.cos(dir - na) / 2,
					y: y + BASE_PAIR_DISTANCE * Math.sin(dir - na) / 2
				};
				coords[j] = {
					x: x + BASE_PAIR_DISTANCE * Math.cos(dir + na) / 2,
					y: y + BASE_PAIR_DISTANCE * Math.sin(dir + na) / 2
				};
				drawLoop(i + 1, j - 1, x + LOOP_DISTANCE * Math.cos(dir), y + LOOP_DISTANCE * Math.sin(dir), dir);
				return;
			}
			const basesML = [],
				helices = [];
			let k = i;
			while (k <= j) {
				const l = pairs[k];
				if (l > k) {
					basesML.push(k, l);
					helices.push(k);
					k = l + 1;
				} else {
					basesML.push(k);
					k++;
				}
			}
			const mlSize = basesML.length + 2;
			const numHel = helices.length + 1;
			const totalLen = MULTILOOP_DISTANCE * (mlSize - numHel) + BASE_PAIR_DISTANCE * numHel;
			let mlR, aiBP, aiML;
			if (mlSize > 3) {
				mlR = determineRadius(numHel, mlSize - numHel, totalLen / (2 * Math.PI));
				aiBP = -2 * Math.asin(BASE_PAIR_DISTANCE / (2 * mlR));
				aiML = -2 * Math.asin(MULTILOOP_DISTANCE / (2 * mlR));
			} else {
				mlR = 35;
				aiBP = -2 * Math.asin(BASE_PAIR_DISTANCE / (2 * mlR));
				aiML = (-2 * Math.PI - aiBP) / 2;
			}
			const centerDist = Math.sqrt(Math.max(mlR * mlR - (BASE_PAIR_DISTANCE / 2) ** 2, 0)) - LOOP_DISTANCE;
			const mlCenter = {
				x: x + centerDist * Math.cos(dir),
				y: y + centerDist * Math.sin(dir)
			};
			let baseAngle = dir + Math.PI + 0.5 * aiBP + aiML;
			const currUnpaired = [];
			let currInterval = {
				second: baseAngle - aiML
			};
			const intervals = [];
			for (let ki = basesML.length - 1; ki >= 0; ki--) {
				const l = basesML[ki];
				centers[l] = mlCenter;
				const paired = (pairs[l] !== -1);
				const paired3 = paired && (pairs[l] < l);
				const paired5 = paired && !paired3;
				if (paired3) {
					baseAngle = (numHel === 2 && straightBulges) ? dir - aiBP / 2 : correctHysteresis(baseAngle + aiBP / 2) - aiBP / 2;
					currInterval.first = baseAngle;
					intervals.push({
						unpaired: [...currUnpaired],
						interval: {
							...currInterval
						}
					});
					currInterval = {};
					currUnpaired.length = 0;
				} else if (paired5) {
					currInterval.second = baseAngle;
				} else {
					currUnpaired.push(l);
				}
				angles[l] = baseAngle;
				baseAngle += (paired3 ? aiBP : aiML);
			}
			currInterval.first = dir - Math.PI - 0.5 * aiBP;
			intervals.push({
				unpaired: [...currUnpaired],
				interval: {
					...currInterval
				}
			});
			for (const {
					unpaired,
					interval
				}
				of intervals) {
				const mina = interval.first;
				const maxa = normalizeAngle(interval.second, mina);
				for (let ni = 0; ni < unpaired.length; ni++) {
					const ratio = (1 + ni) / (1 + unpaired.length);
					angles[unpaired[ni]] = mina + (1 - ratio) * (maxa - mina);
				}
			}
			for (let ki = basesML.length - 1; ki >= 0; ki--) {
				const l = basesML[ki];
				coords[l] = {
					x: mlCenter.x + mlR * Math.cos(angles[l]),
					y: mlCenter.y + mlR * Math.sin(angles[l])
				};
			}
			for (const hBase of helices) {
				const hPair = pairs[hBase];
				const newAngle = (angles[hBase] + angles[hPair]) / 2;
				drawLoop(hBase + 1, hPair - 1, LOOP_DISTANCE * Math.cos(newAngle) + (coords[hBase].x + coords[hPair].x) / 2, LOOP_DISTANCE * Math.sin(newAngle) + (coords[hBase].y + coords[hPair].y) / 2, newAngle);
			}
		}
		if (flatExteriorLoop) {
			const da = dirAngle + 1.0 - Math.PI / 2;
			const vx = -Math.sin(da),
				vy = Math.cos(da);
			let px = 0,
				py = 0,
				i = 0;
			while (i < n) {
				coords[i] = {
					x: px,
					y: py
				};
				centers[i] = {
					x: px + BASE_PAIR_DISTANCE * vy,
					y: py - BASE_PAIR_DISTANCE * vx
				};
				const j = pairs[i];
				if (j > i) {
					drawLoop(i, j, px + BASE_PAIR_DISTANCE * vx / 2, py + BASE_PAIR_DISTANCE * vy / 2, da);
					centers[i] = {
						x: coords[i].x + BASE_PAIR_DISTANCE * vy,
						y: py - BASE_PAIR_DISTANCE * vx
					};
					i = j;
					px += BASE_PAIR_DISTANCE * vx;
					py += BASE_PAIR_DISTANCE * vy;
					centers[i] = {
						x: coords[i].x + BASE_PAIR_DISTANCE * vy,
						y: py - BASE_PAIR_DISTANCE * vx
					};
				}
				px += MULTILOOP_DISTANCE * vx;
				py += MULTILOOP_DISTANCE * vy;
				i++;
			}
		} else {
			drawLoop(0, n - 1, 0, 0, dirAngle);
		}
		return {
			coords,
			centers,
			pairs,
			n
		};
	}
	/* 
     NAView hybrid layout
	 Flat exterior loop (VARNA radiate) + size-proportional angle allocation at
	 every internal junction (NAView principle).
	
	 The key insight of NAView: at a multi-loop junction, each outgoing helix
	 receives an angular sector PROPORTIONAL TO ITS SUB-TREE SIZE.  A stem leading
	 to 80 bases gets 8x more arc than one leading to 10 bases.  The loop radius is
	 then the minimum that keeps every chord >= the required distance, so the circle
	 expands as needed instead of forcing elements to overlap.
	
	 Contrast with radiate: every helix gets the same fixed arc regardless of size,
	 so large sub-trees always crash into each other on complex structures.

	 NAView (port of Ivo Hofacker's adaptation of Bruccoleri & Heinrich original algorithm), 
     adapted to enable helix rotation in a Radiate-like fashion

	 Key differences from the radiate layout:
	  - Angles are derived from the SEQUENTIAL position of each region on a
	    conceptual full-circle, not from sub-tree sizes or unpaired-base counts.
	  - The most-connected loop is drawn at the centre, not the exterior loop.
	  - The loop radius is chosen by least-squares to minimise deviation from
	    unit base-separation; crowded segments are "extruded" outside the circle.
	  - Produces near-overlap-free layouts for complex multi-junction structures.
    */
	function drawRNANAView(pairs, n) {
		var PI = Math.PI;
		var ANUM = 9999.0;
		var LENCUT = 0.5;
		var SCALE = BASE_PAIR_DISTANCE; // 1 NAView unit = BASE_PAIR_DISTANCE scene units
		// 1-indexed bases array (index 0 = virtual origin)
		var bases = [];
		for (var bi = 0; bi <= n; bi++) {
			bases.push({
				mate: 0,
				x: ANUM,
				y: ANUM,
				extracted: false,
				region: null,
				loopCenter: null
			});
		}
		var npairs = 0;
		for (var i = 1; i <= n; i++) {
			bases[i].mate = (pairs[i - 1] === -1) ? 0 : pairs[i - 1] + 1;
			if (bases[i].mate > i) npairs++;
		}
		if (npairs === 0) {
			bases[1].mate = n;
			bases[n].mate = 1;
		}
		// find_regions
		// A region is a maximal stack of consecutive base pairs (i,j), (i+1,j-1), etc.
		var regions = [];
		var mark = new Uint8Array(n + 1);
		for (var i = 0; i <= n; i++) {
			var mate = bases[i].mate;
			if (mate && !mark[i]) {
				var reg = {
					start1: i,
					end1: 0,
					start2: 0,
					end2: mate
				};
				mark[i] = mark[mate] = 1;
				bases[i].region = bases[mate].region = reg;
				var ii = i + 1,
					m = mate - 1;
				while (ii < m && bases[ii].mate === m) {
					mark[ii] = mark[m] = 1;
					bases[ii].region = bases[m].region = reg;
					ii++;
					m--;
				}
				reg.end1 = ii - 1;
				reg.start2 = m + 1;
				regions.push(reg);
			}
		}
		// construct_loop
		// Builds a loop-graph recursively starting from ibase.
		var loops = [];

		function constructLoop(ibase) {
			var retloop = {
				nconnection: 0,
				connections: [],
				depth: 0,
				number: loops.length + 1,
				radius: 0,
				x: 0,
				y: 0,
				mark: false
			};
			loops.push(retloop);
			var i = ibase;
			do {
				var mate = bases[i].mate;
				if (mate !== 0) {
					var rp = bases[i].region;
					if (!bases[rp.start1].extracted) {
						var lp;
						if (i === rp.start1) {
							bases[rp.start1].extracted = bases[rp.end1].extracted = bases[rp.start2].extracted = bases[rp.end2].extracted = true;
							lp = constructLoop(rp.end1 < n ? rp.end1 + 1 : 0);
						} else {
							bases[rp.start1].extracted = bases[rp.end1].extracted = bases[rp.start2].extracted = bases[rp.end2].extracted = true;
							lp = constructLoop(rp.end2 < n ? rp.end2 + 1 : 0);
						}
						// Connection from retloop to lp
						var cp1 = {
							loop: lp,
							region: rp,
							start: i === rp.start1 ? rp.start1 : rp.start2,
							end: i === rp.start1 ? rp.end2 : rp.end1,
							xrad: 0,
							yrad: 0,
							angle: 0,
							extruded: false,
							broken: false
						};
						retloop.connections.push(cp1);
						retloop.nconnection++;
						// Connection from lp to retloop
						var cp2 = {
							loop: retloop,
							region: rp,
							start: i === rp.start1 ? rp.start2 : rp.start1,
							end: i === rp.start1 ? rp.end1 : rp.end2,
							xrad: 0,
							yrad: 0,
							angle: 0,
							extruded: false,
							broken: false
						};
						lp.connections.push(cp2);
						lp.nconnection++;
					}
					i = mate;
				}
				if (++i > n) i = 0;
			} while (i !== ibase);
			return retloop;
		}
		constructLoop(0);
		// depth + find_central_loop
		function getDepth(lp) {
			if (lp.nconnection <= 1) return 0;
			if (lp.mark) return -1;
			lp.mark = true;
			var ret = 0,
				count = 0;
			for (var ci = 0; ci < lp.nconnection; ci++) {
				var d = getDepth(lp.connections[ci].loop);
				if (d >= 0) {
					if (++count === 1) ret = d;
					else if (d < ret) ret = d;
				}
			}
			lp.mark = false;
			return ret + 1;
		}
		for (var li = 0; li < loops.length; li++) {
			for (var lj = 0; lj < loops.length; lj++) loops[lj].mark = false;
			loops[li].depth = getDepth(loops[li]);
		}
		var root = loops[0],
			maxconn = 0,
			maxdepth = -1;
		for (var li = 0; li < loops.length; li++) {
			var lp = loops[li];
			if (lp.nconnection > maxconn || (lp.nconnection === maxconn && lp.depth > maxdepth)) {
				maxconn = lp.nconnection;
				maxdepth = lp.depth;
				root = lp;
			}
		}
		// determine_radius
		function determineRadius(lp) {
			var RT2_2 = 0.7071068;
			var radius, mindit, sumn, sumd, imindit, restart;
			do {
				restart = false;
				mindit = 1e10;
				sumn = 0;
				sumd = 0;
				imindit = 0;
				for (var i = 0; i < lp.nconnection; i++) {
					var cp = lp.connections[i];
					var j = (i + 1) % lp.nconnection;
					var cpnext = lp.connections[j];
					var end = cp.end,
						start = cpnext.start;
					if (start <= end) start += n + 1;
					var dt = cpnext.angle - cp.angle;
					if (dt <= 0) dt += 2 * PI;
					var ci = cp.extruded ? (dt <= PI / 2 ? 2.0 : 1.5) : (start - end);
					sumn += dt * (1.0 / ci + 1.0);
					sumd += dt * dt / ci;
					var dit = dt / ci;
					if (dit < mindit && !cp.extruded && ci > 1.0) {
						mindit = dit;
						imindit = i;
					}
				}
				radius = sumn / sumd;
				if (radius < RT2_2) radius = RT2_2;
				if (mindit * radius < LENCUT) {
					lp.connections[imindit].extruded = true;
					restart = true;
				}
			} while (restart);
			if (lp.radius > 0) radius = lp.radius;
			else lp.radius = radius;
		}
		// find_center_for_arc
		function findCenterForArc(nn, b) {
			var hhi = (nn + 1) / PI;
			var hlow = b < 1 ? 0 : -hhi - b / (nn + 1.000001 - b);
			var h, r, disc, theta, phi, e;
			var iter = 0;
			do {
				h = (hhi + hlow) / 2;
				r = Math.sqrt(h * h + b * b / 4);
				disc = 1 - 0.5 / (r * r);
				if (disc > 1) disc = 1;
				if (disc < -1) disc = -1;
				theta = Math.acos(disc);
				phi = Math.acos(Math.min(1, Math.max(-1, h / r)));
				e = theta * (nn + 1) + 2 * phi - 2 * PI;
				if (e > 0) hlow = h;
				else hhi = h;
			} while (Math.abs(e) > 0.0001 && ++iter < 500);
			return {
				h: iter < 500 ? h : 0,
				theta: iter < 500 ? theta : 0
			};
		}
		// construct_circle_segment
		function constructCircleSegment(start, end) {
			var dx = bases[end].x - bases[start].x;
			var dy = bases[end].y - bases[start].y;
			var rr = Math.sqrt(dx * dx + dy * dy);
			var l = end - start;
			if (l < 0) l += n + 1;
			if (rr >= l) {
				dx /= rr;
				dy /= rr;
				for (var j = 1; j < l; j++) {
					var idx = start + j;
					if (idx > n) idx -= n + 1;
					bases[idx].x = bases[start].x + dx * j / l;
					bases[idx].y = bases[start].y + dy * j / l;
				}
			} else {
				var arc = findCenterForArc(l - 1, rr);
				dx /= rr;
				dy /= rr;
				var midx = bases[start].x + dx * rr / 2;
				var midy = bases[start].y + dy * rr / 2;
				var xn = dy,
					yn = -dx;
				var nrx = midx + arc.h * xn,
					nry = midy + arc.h * yn;
				var mx = bases[start].x - nrx,
					my = bases[start].y - nry;
				var arcR = Math.sqrt(mx * mx + my * my);
				var a = Math.atan2(my, mx);
				for (var j = 1; j < l; j++) {
					var idx = start + j;
					if (idx > n) idx -= n + 1;
					bases[idx].x = nrx + arcR * Math.cos(a + j * arc.theta);
					bases[idx].y = nry + arcR * Math.sin(a + j * arc.theta);
				}
			}
		}
		// construct_extruded_segment
		function constructExtrudedSegment(cp, cpnext) {
			var astart = cp.angle;
			var aend1 = cpnext.angle;
			var aend2 = aend1 < astart ? aend1 + 2 * PI : aend1;
			var aave = (astart + aend2) / 2;
			var start = cp.end,
				end = cpnext.start;
			var num = end - start;
			if (num < 0) num += n + 1;
			var da = ((cpnext.angle - cp.angle) + 2 * PI) % (2 * PI);
			if (num === 2) {
				constructCircleSegment(start, end);
				return;
			}
			var dx = bases[end].x - bases[start].x;
			var dy = bases[end].y - bases[start].y;
			var rr = Math.sqrt(dx * dx + dy * dy);
			dx /= rr;
			dy /= rr;
			if (rr >= 1.5 && da <= PI / 2) {
				var ns = start + 1;
				if (ns > n) ns -= n + 1;
				var ne = end - 1;
				if (ne < 0) ne += n + 1;
				bases[ns].x = bases[start].x + 0.5 * dx;
				bases[ns].y = bases[start].y + 0.5 * dy;
				bases[ne].x = bases[end].x - 0.5 * dx;
				bases[ne].y = bases[end].y - 0.5 * dy;
				start = ns;
				end = ne;
			}
			var collision, safetyCount = 0;
			do {
				collision = false;
				constructCircleSegment(start, end);
				var ns2 = start + 1;
				if (ns2 > n) ns2 -= n + 1;
				var ddx = bases[ns2].x - bases[start].x,
					ddy = bases[ns2].y - bases[start].y;
				var a1 = Math.atan2(ddy, ddx);
				if (a1 < 0) a1 += 2 * PI;
				var dac = a1 - astart;
				if (dac < 0) dac += 2 * PI;
				if (dac > PI) collision = true;
				var ne2 = end - 1;
				if (ne2 < 0) ne2 += n + 1;
				ddx = bases[ne2].x - bases[end].x;
				ddy = bases[ne2].y - bases[end].y;
				var a2 = Math.atan2(ddy, ddx);
				if (a2 < 0) a2 += 2 * PI;
				dac = aend1 - a2;
				if (dac < 0) dac += 2 * PI;
				if (dac > PI) collision = true;
				if (collision) {
					var ac1 = Math.min(aave, astart + 0.5);
					bases[ns2].x = bases[start].x + Math.cos(ac1);
					bases[ns2].y = bases[start].y + Math.sin(ac1);
					start = ns2;
					var ac2 = Math.max(aave, aend2 - 0.5);
					bases[ne2].x = bases[end].x + Math.cos(ac2);
					bases[ne2].y = bases[end].y + Math.sin(ac2);
					end = ne2;
					num -= 2;
				}
			} while (collision && num > 1 && ++safetyCount < 50);
		}
		// generate_region
		function generateRegion(cp) {
			var rp = cp.region;
			var start = (cp.start === rp.start1) ? rp.start1 : rp.start2;
			var end = (cp.start === rp.start1) ? rp.end1 : rp.end2;
			for (var i = start + 1; i <= end; i++) {
				var l = i - start;
				bases[i].x = bases[cp.start].x + l * cp.xrad;
				bases[i].y = bases[cp.start].y + l * cp.yrad;
				var mate = bases[i].mate;
				bases[mate].x = bases[cp.end].x + l * cp.xrad;
				bases[mate].y = bases[cp.end].y + l * cp.yrad;
			}
		}
		// connectedConnection
		function connectedConnection(cp, cpnext) {
			return cp.extruded || (cp.end + 1 === cpnext.start);
		}
		// findIcMiddle
		function findIcMiddle(icstart, icend, anchorConn, acp, lp) {
			var count = 0,
				ret = -1,
				ic = icstart,
				done = false;
			while (!done) {
				if (++count > lp.nconnection * 2) break;
				if (anchorConn !== null && lp.connections[ic] === acp) ret = ic;
				done = (ic === icend);
				if (++ic >= lp.nconnection) ic = 0;
			}
			if (ret === -1) {
				ic = icstart;
				for (var i = 1; i < Math.floor((count + 1) / 2); i++) {
					if (++ic >= lp.nconnection) ic = 0;
				}
				ret = ic;
			}
			return ret;
		}
		// traverse_loop
		function traverseLoop(lp, anchorConnection) {
			var angleinc = 2 * PI / (n + 1);
			var acp = null,
				icroot = -1;
			// Compute theoretical angles from sequential position
			for (var ic = 0; ic < lp.nconnection; ic++) {
				var cp = lp.connections[ic];
				var xs = -Math.sin(angleinc * cp.start),
					ys = Math.cos(angleinc * cp.start);
				var xe = -Math.sin(angleinc * cp.end),
					ye = Math.cos(angleinc * cp.end);
				var xn = ye - ys,
					yn = xs - xe;
				var r = Math.sqrt(xn * xn + yn * yn);
				cp.xrad = xn / r;
				cp.yrad = yn / r;
				cp.angle = Math.atan2(yn, xn);
				if (cp.angle < 0) cp.angle += 2 * PI;
				if (anchorConnection !== null && anchorConnection.region === cp.region) {
					acp = cp;
					icroot = ic;
				}
			}
			// Outer loop to handle set_radius restarts (from C's goto)
			var globalRestart;
			do {
				globalRestart = false;
				determineRadius(lp);
				var radius = lp.radius;
				var xc, yc;
				if (anchorConnection === null) {
					xc = 0;
					yc = 0;
				} else {
					var xo = (bases[acp.start].x + bases[acp.end].x) / 2;
					var yo = (bases[acp.start].y + bases[acp.end].y) / 2;
					xc = xo - radius * acp.xrad;
					yc = yo - radius * acp.yrad;
				}
				// Find start of first connected-connector block
				var icstart;
				if (icroot === -1) icstart = 0;
				else icstart = icroot;
				var cp = lp.connections[icstart];
				var count = 0,
					done = false;
				do {
					var j = icstart - 1;
					if (j < 0) j = lp.nconnection - 1;
					var cpprev = lp.connections[j];
					if (!connectedConnection(cpprev, cp)) {
						done = true;
					} else {
						icstart = j;
						cp = cpprev;
					}
					if (++count > lp.nconnection) {
						// All connected: break at max angular gap
						var maxang = -1,
							imaxloop = 0;
						for (var ic2 = 0; ic2 < lp.nconnection; ic2++) {
							var j2 = (ic2 + 1) % lp.nconnection;
							var ac2 = lp.connections[j2].angle - lp.connections[ic2].angle;
							if (ac2 < 0) ac2 += 2 * PI;
							if (ac2 > maxang) {
								maxang = ac2;
								imaxloop = ic2;
							}
						}
						icstart = (imaxloop + 1) % lp.nconnection;
						lp.connections[imaxloop].broken = true;
						done = true;
					}
				} while (!done);
				var done_all = false,
					icstart1 = icstart;
				while (!done_all && !globalRestart) {
					count = 0;
					done = false;
					var icend = icstart,
						rooted = false;
					while (!done) {
						if (icend === icroot) rooted = true;
						var j3 = (icend + 1) % lp.nconnection;
						if (connectedConnection(lp.connections[icend], lp.connections[j3])) {
							if (++count >= lp.nconnection) break;
							icend = j3;
						} else {
							done = true;
						}
					}
					var icmiddle = findIcMiddle(icstart, icend, anchorConnection, acp, lp);
					var icup = icmiddle,
						icdown = icmiddle;
					done = false;
					var direction = 0;
					while (!done) {
						var ic3 = (direction < 0) ? icup : (direction === 0 ? icmiddle : icdown);
						if (ic3 >= 0) {
							var cpX = lp.connections[ic3];
							if (anchorConnection === null || acp !== cpX) {
								if (direction === 0) {
									var ha = Math.asin(Math.min(1, 0.5 / radius));
									bases[cpX.start].x = xc + radius * Math.cos(cpX.angle - ha);
									bases[cpX.start].y = yc + radius * Math.sin(cpX.angle - ha);
									bases[cpX.end].x = xc + radius * Math.cos(cpX.angle + ha);
									bases[cpX.end].y = yc + radius * Math.sin(cpX.angle + ha);
								} else if (direction < 0) {
									var j4 = (ic3 + 1) % lp.nconnection;
									var cpA = lp.connections[ic3],
										cpB = lp.connections[j4];
									var acM = (cpA.angle + cpB.angle) / 2;
									if (cpA.angle > cpB.angle) acM -= PI;
									var lnx = Math.sin(acM),
										lny = -Math.cos(acM);
									var daX = ((cpB.angle - cpA.angle) + 2 * PI) % (2 * PI);
									var rl = cpA.extruded ? (daX <= PI / 2 ? 2 : 1.5) : 1;
									bases[cpA.end].x = bases[cpB.start].x + rl * lnx;
									bases[cpA.end].y = bases[cpB.start].y + rl * lny;
									bases[cpA.start].x = bases[cpA.end].x + cpA.yrad;
									bases[cpA.start].y = bases[cpA.end].y - cpA.xrad;
								} else {
									var j5 = ic3 - 1 < 0 ? lp.nconnection - 1 : ic3 - 1;
									var cpC = lp.connections[j5],
										cpD = lp.connections[ic3];
									var acN = (cpC.angle + cpD.angle) / 2;
									if (cpC.angle > cpD.angle) acN -= PI;
									var lnx2 = -Math.sin(acN),
										lny2 = Math.cos(acN);
									var daY = ((cpD.angle - cpC.angle) + 2 * PI) % (2 * PI);
									var rl2 = cpC.extruded ? (daY <= PI / 2 ? 2 : 1.5) : 1;
									bases[cpD.start].x = bases[cpC.end].x + rl2 * lnx2;
									bases[cpD.start].y = bases[cpC.end].y + rl2 * lny2;
									bases[cpD.end].x = bases[cpD.start].x - cpD.yrad;
									bases[cpD.end].y = bases[cpD.start].y + cpD.xrad;
								}
							}
						}
						if (direction < 0) {
							if (icdown === icend) icdown = -1;
							else if (icdown >= 0) {
								if (++icdown >= lp.nconnection) icdown = 0;
							}
							direction = 1;
						} else {
							if (icup === icstart) icup = -1;
							else if (icup >= 0) {
								if (--icup < 0) icup = lp.nconnection - 1;
							}
							direction = -1;
						}
						done = (icup === -1 && icdown === -1);
					} // end while placing this block
					var icnext = (icend + 1) % lp.nconnection;
					if (icend !== icstart && !(icstart === icstart1 && icnext === icstart1)) {
						var cpSt = lp.connections[icstart],
							cpEn = lp.connections[icend];
						var dx5 = bases[cpEn.end].x - bases[cpSt.start].x;
						var dy5 = bases[cpEn.end].y - bases[cpSt.start].y;
						var midxB = bases[cpSt.start].x + dx5 / 2,
							midyB = bases[cpSt.start].y + dy5 / 2;
						var rrB = Math.sqrt(dx5 * dx5 + dy5 * dy5) || 1e-9;
						var mxB = dx5 / rrB,
							myB = dy5 / rrB;
						var vxB = (xc - midxB) / rrB,
							vyB = (yc - midyB) / rrB;
						var dotmv = vxB * mxB + vyB * myB;
						var nrxB = dotmv * mxB - vxB,
							nryB = dotmv * myB - vyB;
						rrB = Math.sqrt(nrxB * nrxB + nryB * nryB) || 1e-9;
						nrxB /= rrB;
						nryB /= rrB;
						var acS = Math.atan2(bases[cpSt.start].y - yc, bases[cpSt.start].x - xc);
						if (acS < 0) acS += 2 * PI;
						var acE = Math.atan2(bases[cpEn.end].y - yc, bases[cpEn.end].x - xc);
						if (acE < 0) acE += 2 * PI;
						if (acE < acS) acE += 2 * PI;
						var signB = (acE - acS > PI) ? -1 : 1;
						var nmidxB = xc + signB * radius * nrxB;
						var nmidyB = yc + signB * radius * nryB;
						if (rooted) {
							xc -= nmidxB - midxB;
							yc -= nmidyB - midyB;
						} else {
							for (var icM = icstart;;) {
								var cpM = lp.connections[icM];
								bases[cpM.start].x += nmidxB - midxB;
								bases[cpM.start].y += nmidyB - midyB;
								bases[cpM.end].x += nmidxB - midxB;
								bases[cpM.end].y += nmidyB - midyB;
								if (icM === icend) break;
								if (++icM >= lp.nconnection) icM = 0;
							}
						}
					}
					icstart = icnext;
					done_all = (icstart === icstart1);
				} // end while (!done_all)
				if (globalRestart) break;
				// Fill unpaired bases between connections
				for (var ic4 = 0; ic4 < lp.nconnection && !globalRestart; ic4++) {
					var cpF = lp.connections[ic4];
					var j6 = (ic4 + 1) % lp.nconnection;
					var cpNF = lp.connections[j6];
					var dxF = bases[cpF.end].x - xc,
						dyF = bases[cpF.end].y - yc;
					var rcF = Math.sqrt(dxF * dxF + dyF * dyF);
					var acF = Math.atan2(dyF, dxF);
					if (acF < 0) acF += 2 * PI;
					var dxNF = bases[cpNF.start].x - xc,
						dyNF = bases[cpNF.start].y - yc;
					var rcNF = Math.sqrt(dxNF * dxNF + dyNF * dyNF);
					var acNF = Math.atan2(dyNF, dxNF);
					if (acNF < 0) acNF += 2 * PI;
					if (acNF < acF) acNF += 2 * PI;
					var danF = acNF - acF;
					var dcpF = ((cpNF.angle - cpF.angle) + 2 * PI) % (2 * PI);
					if (Math.abs(danF - dcpF) > PI) {
						if (cpF.extruded) {
							/* warning: crossed regions, skip */
						} else if ((cpNF.start - cpF.end) !== 1) {
							cpF.extruded = true;
							globalRestart = true;
							break;
						}
					}
					if (!globalRestart) {
						if (cpF.extruded) {
							constructExtrudedSegment(cpF, cpNF);
						} else {
							var numF = cpNF.start - cpF.end;
							if (numF < 0) numF += n + 1;
							var angStepF = numF > 0 ? danF / numF : 0;
							for (var ji = 1; ji < numF; ji++) {
								var idxF = cpF.end + ji;
								if (idxF > n) idxF -= n + 1;
								var aF = acF + ji * angStepF;
								var rrF = rcF + (rcNF - rcF) * (aF - acF) / danF;
								bases[idxF].x = xc + rrF * Math.cos(aF);
								bases[idxF].y = yc + rrF * Math.sin(aF);
							}
						}
					}
				}
			} while (globalRestart);
			// Compute loop centroid and assign as loopCenter for bases in this loop
			var sx = 0,
				sy = 0,
				nm = 0;
			for (var ic5 = 0; ic5 < lp.nconnection; ic5++) {
				var cpL = lp.connections[ic5];
				var j7 = (ic5 + 1) % lp.nconnection;
				var cpNL = lp.connections[j7];
				nm += 2;
				sx += bases[cpL.start].x + bases[cpL.end].x;
				sy += bases[cpL.start].y + bases[cpL.end].y;
				bases[cpL.start].loopCenter = lp;
				bases[cpL.end].loopCenter = lp;
				if (!cpL.extruded) {
					for (var j8 = cpL.end + 1; j8 !== cpNL.start;) {
						if (j8 > n) j8 -= n + 1;
						nm++;
						sx += bases[j8].x;
						sy += bases[j8].y;
						bases[j8].loopCenter = lp;
						if (++j8 > n) j8 -= n + 1;
						if (j8 === cpNL.start) break;
					}
				}
			}
			lp.x = sx / nm;
			lp.y = sy / nm;
			// Recurse into sub-loops
			for (var ic6 = 0; ic6 < lp.nconnection; ic6++) {
				if (ic6 !== icroot) {
					var cpR = lp.connections[ic6];
					generateRegion(cpR);
					traverseLoop(cpR.loop, cpR);
				}
			}
		} // end traverseLoop
		traverseLoop(root, null);
		// Convert to viewer coordinate format
		var coords = Array.from({
			length: n
		}, function() {
			return {
				x: 0,
				y: 0
			};
		});
		var centers = Array.from({
			length: n
		}, function() {
			return {
				x: 0,
				y: 0
			};
		});
		for (var i = 0; i < n; i++) {
			coords[i] = {
				x: bases[i + 1].x * SCALE,
				y: bases[i + 1].y * SCALE
			};
		}
		// Centers: loop centroid for paired bases (used as rotation pivot)
		for (var i = 0; i < n; i++) {
			var lc = bases[i + 1].loopCenter;
			if (lc) {
				centers[i] = {
					x: lc.x * SCALE,
					y: lc.y * SCALE
				};
			} else if (pairs[i] !== -1) {
				var j = pairs[i];
				centers[i] = {
					x: (coords[i].x + coords[j].x) / 2,
					y: (coords[i].y + coords[j].y) / 2
				};
			} else {
				centers[i] = {
					x: coords[i].x,
					y: coords[i].y
				};
			}
		}
		return {
			coords: coords,
			centers: centers,
			pairs: pairs,
			n: n
		};
	}
	// Helix tree
	function buildHelixTree(pairs, n, centers) {
		const visited = new Uint8Array(n);
		const helices = [];

		function outerHelix(a, b) {
			let i = a,
				j = b;
			while (i > 0 && j < n - 1 && pairs[i - 1] === j + 1) {
				i--;
				j++;
			}
			return {
				i,
				j
			};
		}

		function getMultiLoop(hi, hj) {
			let minH = hi - 1,
				maxH = hj + 1,
				over = false;
			while (!over) {
				if (minH < 0) {
					over = true;
					minH = 0;
				} else if (pairs[minH] === -1) {
					minH--;
				} else if (pairs[minH] < minH) {
					minH = pairs[minH] - 1;
				} else {
					over = true;
				}
			}
			over = false;
			while (!over) {
				if (maxH > n - 1) {
					over = true;
					maxH = n - 1;
				} else if (pairs[maxH] === -1) {
					maxH++;
				} else if (pairs[maxH] > maxH) {
					maxH = pairs[maxH] + 1;
				} else {
					over = true;
				}
			}
			return {
				x: minH,
				y: maxH
			};
		}

		function getPreviousUnpaired(hj) {
			const r = [];
			let i = hj + 1;
			while (i < n && pairs[i] === -1) {
				r.push(i);
				i++;
			}
			return r;
		}

		function getNextUnpaired(hi) {
			const r = [];
			let i = hi - 1;
			while (i >= 0 && pairs[i] === -1) {
				r.push(i);
				i--;
			}
			return r;
		}
		for (let a = 0; a < n; a++) {
			const b = pairs[a];
			if (b > a && !visited[a]) {
				const {
					i,
					j
				} = outerHelix(a, b);
				if (!visited[i]) {
					let ii = i,
						jj = j;
					while (ii <= jj && pairs[ii] === jj) {
						visited[ii] = visited[jj] = 1;
						ii++;
						jj--;
					}
					const sub = [];
					for (let k = i; k <= j; k++) sub.push(k);
					helices.push({
						i,
						j,
						loopCenter: {
							...centers[i]
						},
						sub,
						ml: getMultiLoop(i, j),
						prevUnpaired: getPreviousUnpaired(j),
						nextUnpaired: getNextUnpaired(i),
					});
				}
			}
		}
		return helices;
	}
	// distributeUnpaired / computeNewAngles (port of VARNA's RNA.java)
	function getPoint(angleLine, angleBulge, cx, cy, VNx, VNy, radius, addedRadius, dirBulge) {
		return {
			x: cx + radius * Math.cos(angleLine) + dirBulge * addedRadius * Math.sin(angleBulge) * VNx,
			y: cy + radius * Math.sin(angleLine) + dirBulge * addedRadius * Math.sin(angleBulge) * VNy,
		};
	}

	function computeEllipseRadius(b, pobj) {
		let a = b,
			aL = a,
			aU = Infinity;

		function perim(a) {
			const h = (a - b) * (a - b) / ((a + b) * (a + b));
			return Math.PI * (a + b) * (1 + h / 4 + h * h / 64 + h * h * h / 256 + 25 * h * h * h * h / 16384) / 2;
		}
		let p = perim(a),
			aold = a + 1;
		while (Math.abs(p - pobj) > 1e-3 && aold !== a) {
			aold = a;
			if (p < pobj) {
				aL = a;
				a = aU === Infinity ? a * 2 : (a + aU) / 2;
			} else {
				aU = a;
				a = (a + aL) / 2;
			}
			p = perim(a);
		}
		return a;
	}

	function computeNewAngles(numPoints, cx, cy, VNx, VNy, angle, angleBase, radius, addedRadius) {
		if (numPoints === 0) return [];
		const dirBulge = angle < 0 ? -1 : 1;
		let dtarget = 2 * BASE_RADIUS;
		let prevP = {
			x: cx + radius * Math.cos(angleBase),
			y: cy + radius * Math.sin(angleBase)
		};
		let factors = [],
			fact = 0;
		for (let i = 0; i < numPoints; i++) {
			let lb = fact,
				ub = 1.0;
			let currP = getPoint(angleBase + angle * fact, Math.PI * fact, cx, cy, VNx, VNy, radius, addedRadius, dirBulge);
			let iter = 0;
			while (Math.abs(Math.hypot(currP.x - prevP.x, currP.y - prevP.y) - dtarget) > 0.01 && iter < 100) {
				const d = Math.hypot(currP.x - prevP.x, currP.y - prevP.y);
				if (d > dtarget) {
					ub = fact;
					fact = (fact + lb) / 2;
				} else {
					lb = fact;
					fact = (fact + ub) / 2;
				}
				currP = getPoint(angleBase + angle * fact, Math.PI * fact, cx, cy, VNx, VNy, radius, addedRadius, dirBulge);
				iter++;
			}
			factors.push(fact);
			prevP = currP;
		}
		const rescale = 1.0 / (factors[factors.length - 1] + factors[0]);
		factors = factors.map(f => f * rescale);
		if (addedRadius > 0) {
			prevP = getPoint(angleBase, 0, cx, cy, VNx, VNy, radius, addedRadius, dirBulge);
			let totDist = 0;
			for (const f of factors) {
				const p = getPoint(angleBase + angle * f, Math.PI * f, cx, cy, VNx, VNy, radius, addedRadius, dirBulge);
				totDist += Math.hypot(p.x - prevP.x, p.y - prevP.y);
				prevP = p;
			}
			const pEnd = getPoint(angleBase + angle, Math.PI, cx, cy, VNx, VNy, radius, addedRadius, dirBulge);
			totDist += Math.hypot(pEnd.x - prevP.x, pEnd.y - prevP.y);
			dtarget = totDist / (numPoints + 1);
			fact = 0;
			factors = [];
			prevP = {
				x: cx + radius * Math.cos(angleBase),
				y: cy + radius * Math.sin(angleBase)
			};
			for (let i = 0; i < numPoints; i++) {
				let lb = fact,
					ub = 1.5;
				let currP = getPoint(angleBase + angle * fact, Math.PI * fact, cx, cy, VNx, VNy, radius, addedRadius, dirBulge);
				let iter = 0;
				while (Math.abs(Math.hypot(currP.x - prevP.x, currP.y - prevP.y) - dtarget) > 0.01 && iter < 100) {
					const d = Math.hypot(currP.x - prevP.x, currP.y - prevP.y);
					if (d > dtarget) {
						ub = fact;
						fact = (fact + lb) / 2;
					} else {
						lb = fact;
						fact = (fact + ub) / 2;
					}
					currP = getPoint(angleBase + angle * fact, Math.PI * fact, cx, cy, VNx, VNy, radius, addedRadius, dirBulge);
					iter++;
				}
				factors.push(fact);
				prevP = currP;
			}
			const r2 = 1.0 / (factors[factors.length - 1] + factors[0]);
			factors = factors.map(f => f * r2);
		}
		return factors.map(f => getPoint(angleBase + angle * f, Math.PI * f, cx, cy, VNx, VNy, radius, addedRadius, dirBulge));
	}

	function distributeUnpaired(radius, angle, pHel, base, cx, cy, bases, coords) {
		if (bases.length === 0) return;
		const mydist = Math.abs(radius * angle / (bases.length + 1));
		let addedRadius = 0;
		const PA = {
			x: cx + radius * Math.cos(base + pHel),
			y: cy + radius * Math.sin(base + pHel)
		};
		const PB = {
			x: cx + radius * Math.cos(base + pHel + angle),
			y: cy + radius * Math.sin(base + pHel + angle)
		};
		const dist = Math.hypot(PB.x - PA.x, PB.y - PA.y);
		const VNx = (PB.y - PA.y) / dist,
			VNy = (-PB.x + PA.x) / dist;
		if (mydist < 2 * BASE_RADIUS) {
			addedRadius = Math.min(1.0, (2 * BASE_RADIUS - mydist) / 4) * computeEllipseRadius(mydist, 2.29 * (bases.length + 1) * BASE_RADIUS - mydist);
		}
		const positions = computeNewAngles(bases.length, cx, cy, VNx, VNy, angle, base + pHel, radius, addedRadius);
		for (let i = 0; i < bases.length; i++) {
			coords[bases[i]].x = positions[i].x;
			coords[bases[i]].y = positions[i].y;
		}
	}
	// Helix rotation (port of VARNA's UIRotateHelixAtom + rotateEverything)
	function testDirectionality(mlx, mly, hi, coords) {
		const pi = coords[mlx],
			pj = coords[mly],
			pk = coords[hi];
		return (pj.x - pi.x) * (pk.y - pj.y) - (pj.y - pi.y) * (pk.x - pj.x) < 0;
	}

	function fixUnpairedPositions(isDirect, angleRightPartner, angleLimitLeft, angleLimitRight, angleLeftPartner, radius, base, cx, cy, prevBases, nextBases, coords) {
		if (isDirect) {
			const anglePrev = normalizeAngle(angleLimitLeft - angleRightPartner);
			const angleNext = normalizeAngle(angleLeftPartner - angleLimitRight);
			distributeUnpaired(radius, anglePrev, angleRightPartner, base, cx, cy, prevBases, coords);
			distributeUnpaired(radius, -angleNext, angleLeftPartner, base, cx, cy, nextBases, coords);
		} else {
			const anglePrev = normalizeAngle(angleLeftPartner - angleLimitRight);
			const angleNext = normalizeAngle(angleLimitLeft - angleRightPartner);
			distributeUnpaired(radius, -anglePrev, angleLeftPartner, base, cx, cy, prevBases, coords);
			distributeUnpaired(radius, angleNext, angleRightPartner, base, cx, cy, nextBases, coords);
		}
	}

	function rotateHelixCoords(hi, hj, cx, cy, angle, coords) {
		for (let k = hi; k <= hj; k++) {
			const p = rotatePoint(cx, cy, coords[k].x, coords[k].y, angle);
			coords[k].x = p.x;
			coords[k].y = p.y;
		}
	}

	function applyHelixRotation(helix, dragAngle, startAngle, snapCoords, pairs, n, overrideCx, overrideCy) {
		const coords = snapCoords;
		const {
			i: hi,
			j: hj,
			ml,
			loopCenter: center
		} = helix;
		const cx = overrideCx !== undefined ? overrideCx : center.x,
			cy = overrideCy !== undefined ? overrideCy : center.y;
		let prevIndex = hi,
			nextIndex = hj;
		let k = ml.x;
		while (k <= ml.y) {
			const jj = pairs[k];
			if (jj !== -1 && k < hi) prevIndex = k;
			if (jj !== -1 && k > hj && nextIndex === hj) nextIndex = k;
			if (jj > k && jj < ml.y) k = pairs[k];
			else k++;
		}
		const isDirect = testDirectionality(ml.x, ml.y, hi, coords);
		let limitLoopLeft, limitLoopRight, limitLeft, limitRight, helixStart, helixStop;
		if (isDirect) {
			limitLoopLeft = coords[ml.y];
			limitLoopRight = coords[ml.x];
			limitLeft = coords[prevIndex];
			limitRight = coords[nextIndex];
			helixStart = coords[hi];
			helixStop = coords[hj];
		} else {
			limitLoopLeft = coords[ml.x];
			limitLoopRight = coords[ml.y];
			limitLeft = coords[nextIndex];
			limitRight = coords[prevIndex];
			helixStart = coords[hj];
			helixStop = coords[hi];
		}
		const base = (computeAngle(cx, cy, limitLoopRight.x, limitLoopRight.y) + computeAngle(cx, cy, limitLoopLeft.x, limitLoopLeft.y)) / 2;
		const pLimR = computeAngle(cx, cy, limitLeft.x, limitLeft.y) - base;
		let pHelR = computeAngle(cx, cy, helixStart.x, helixStart.y) - base;
		let pHelL = computeAngle(cx, cy, helixStop.x, helixStop.y) - base;
		const pLimL = computeAngle(cx, cy, limitRight.x, limitRight.y) - base;
		let pNew = dragAngle - base;
		let pOld = startAngle - base;
		// Normalize chain: pLimR < pHelR < pOld,pNew < pHelL < pLimL
		let pLimR2 = pLimR;
		while (pLimR2 < 0) pLimR2 += 2 * Math.PI;
		while (pHelR < pLimR2) pHelR += 2 * Math.PI;
		while (pNew < pHelR) pNew += 2 * Math.PI;
		while (pOld < pHelR) pOld += 2 * Math.PI;
		while (pHelL < pOld) pHelL += 2 * Math.PI;
		let pLimL2 = pLimL;
		while (pLimL2 < pHelL) pLimL2 += 2 * Math.PI;
		// _hasRN / _hasLN used only to guard fixUnpairedPositions below.
		const _hasRN = prevIndex !== hi;
		const _hasLN = nextIndex !== hj;
		// Restore original VARNA [0, 2π) clamping — signed delta breaks the
		// while/if guards and lets helices rotate past neighbours.
		const minDelta = normalizeAngle(pLimR2 - pHelR + 0.25);
		let maxDelta = normalizeAngle(pLimL2 - pHelL - 0.25);
		while (maxDelta < minDelta) maxDelta += 2 * Math.PI;
		let delta = normalizeAngle(pNew - pOld);
		while (delta < minDelta) delta += 2 * Math.PI;
		if (delta > maxDelta) {
			const distMax = delta - maxDelta;
			const distMin = minDelta - (delta - 2 * Math.PI);
			delta = distMin < distMax ? minDelta : maxDelta;
		}
		const corrected = correctHysteresis(delta + base + (pHelR + pHelL) / 2);
		delta = corrected - (base + (pHelR + pHelL) / 2);
		if (delta > Math.PI) delta -= 2 * Math.PI;
		rotateHelixCoords(hi, hj, cx, cy, delta, coords);
		// VARNA's rotateEverything swaps assignment based on isDirect:
		//   isDirect:  pHelR = angle(h.y=hj),  pHelL = angle(h.x=hi)
		//   !isDirect: pHelR = angle(h.x=hi),  pHelL = angle(h.y=hj)
		// radius is always distance to h.x = coords[hi].
		const aHi = computeAngle(cx, cy, coords[hi].x, coords[hi].y) - base;
		const aHj = computeAngle(cx, cy, coords[hj].x, coords[hj].y) - base;
		const pHelRnew = isDirect ? aHj : aHi;
		const pHelLnew = isDirect ? aHi : aHj;
		const radius = Math.hypot(coords[hi].x - cx, coords[hi].y - cy);
		// Skip fixUnpairedPositions when neither side has a real neighbouring
		// helix: the limit angles collapse to the helix endpoints, and
		// distributeUnpaired would place outer-loop bases on a small-radius
		// circle around the inner loop centre — directly over the inner
		// loop content (the entanglement seen with single-pair helices).
		if (_hasRN || _hasLN) {
			fixUnpairedPositions(isDirect, pHelRnew, pLimL, pLimR, pHelLnew, radius, base, cx, cy, helix.prevUnpaired, helix.nextUnpaired, coords);
		}
		return delta;
	}
	// Color map
	// Normalize whatever the user passed into a canonical {type, stops} object.
	// Supports the legacy two-color API and the new colorMap key.
	function normalizeColorMap(config) {
		if (config.colorMap) {
			const cm = config.colorMap;
			return {
				type: cm.type || 'gradient',
				min: cm.min,
				stops: [...cm.stops].sort((a, b) => a.value - b.value),
				nanColor: cm.nanColor ?? config.nanColor ?? config.colorMapNaN ?? '#808080',
				title: cm.title ?? null,
				showTitle: cm.showTitle !== false,
			};
		}
		// Legacy: colorMapMin/Max + MinColor/MaxColor
		if (config.colorMapMinColor || config.colorMapMaxColor || config.colorMapMin != null || config.colorMapMax != null) {
			return {
				type: 'gradient',
				stops: [{
					value: config.colorMapMin ?? 0,
					color: config.colorMapMinColor ?? '#4870c8'
				}, {
					value: config.colorMapMax ?? 1,
					color: config.colorMapMaxColor ?? '#bd0530'
				}],
				nanColor: config.nanColor ?? config.colorMapNaN ?? '#808080',
				title: null,
				showTitle: true,
			};
		}
		// No colorMap specified, callers apply SHAPE default when reactivity is present
		return {
			type: 'discrete',
			min: 0,
			stops: [{
				value: 0.3,
				color: '#1f2328'
			}, {
				value: 0.7,
				color: '#f5c518'
			}, {
				value: 1.0,
				color: '#cc0000'
			}, ],
			nanColor: config.nanColor ?? config.colorMapNaN ?? '#808080',
			title: 'Reactivity',
			showTitle: true,
		};
	}
	// Pair-annotation colormap normalizer
	// Accepts either an object  { key: color, … } or an array  [{ key, color }, …]
	// and always returns an array of { key, color } entries (or null).
	function normalizePairAnnotColorMap(cm) {
		if (!cm) return null;
		if (Array.isArray(cm)) return cm.map(e => ({
			key: String(e.key),
			color: e.color
		}));
		return Object.entries(cm).map(([key, color]) => ({
			key,
			color
		}));
	}

	function valueToColor(v, colorMap) {
		if (!colorMap?.stops?.length) return null; // no valid map, then transparent
		// NaN, null, undefined, or out-of-bounds (undefined), then NaN  color.
		// This also catches values[i] when i >= values.length (returns undefined).
		if (v == null || (typeof v === 'number' && isNaN(v))) {
			return colorMap.nanColor ?? '#8f8f8f';
		}
		const {
			type = 'gradient', stops
		} = colorMap;
		if (!stops || !stops.length) return '#888888';
		if (stops.length === 1) return stops[0].color;
		const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
		const toH = x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
		const lerp = (a, b, t) => '#' + [0, 1, 2].map(i => toH(a[i] + (b[i] - a[i]) * t)).join('');
		if (type === 'discrete') {
			// Each stop's value is the upper bound of its band.
			// Values beyond the last stop get the last stop's color.
			for (const stop of stops) {
				if (v <= stop.value) return stop.color;
			}
			return stops[stops.length - 1].color;
		}
		// gradient: piecewise linear interpolation between stops
		const first = stops[0],
			last = stops[stops.length - 1];
		if (v <= first.value) return first.color;
		if (v >= last.value) return last.color;
		for (let i = 0; i < stops.length - 1; i++) {
			if (v >= stops[i].value && v <= stops[i + 1].value) {
				const t = (v - stops[i].value) / (stops[i + 1].value - stops[i].value);
				return lerp(hex(stops[i].color), hex(stops[i + 1].color), t);
			}
		}
		return last.color;
	}
	// Given a hex fill  color, return a text  color (#dark or #light) that
	// guarantees readable contrast — using the WCAG relative-luminance formula.
	function getContrastTextColor(hex) {
		if (!hex || hex[0] !== '#' || hex.length < 7) return null;
		const r = parseInt(hex.slice(1, 3), 16) / 255;
		const g = parseInt(hex.slice(3, 5), 16) / 255;
		const b = parseInt(hex.slice(5, 7), 16) / 255;
		const lin = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
		// Switch at L ≈ 0.2 — white text below, dark text above
		return L > 0.2 ? '#1a1a2e' : '#f0f6ff';
	}
	// Convert user-friendly helixAnnotations [{i, color, opacity}] to internal
	// [{subHelices:[{pos5p,pos3p}], color, opacity}] format.
	// Entries already in internal format (have .subHelices) are passed through unchanged.
	function resolveHelixAnnotations(annotations, pairs, positionLabels = null) {
		const origToRendered = new Map();
		if (positionLabels?.length) positionLabels.forEach((col1, ri) => origToRendered.set(col1 - 1, ri));
		return annotations.map(ann => {
			if (ann.subHelices) return ann; // already internal
			const i = origToRendered.size ? (origToRendered.get(ann.i) ?? ann.i) : ann.i;
			const j = pairs[i];
			if (j === undefined || j < 0) throw new Error(`helixAnnotations: position ${i} is not paired`);
			// Walk outward to find the outermost pair of this helix
			let a = i,
				b = j;
			while (a > 0 && pairs[a - 1] === b + 1) {
				a--;
				b++;
			}
			// Walk inward collecting all consecutive stacked pairs
			const pos5p = [],
				pos3p = [];
			let ca = a,
				cb = b;
			while (ca <= cb && pairs[ca] === cb) {
				pos5p.push(ca);
				pos3p.push(cb);
				ca++;
				cb--;
			}
			return {
				subHelices: [{
					pos5p,
					pos3p
				}],
				color: ann.color ?? null,
				opacity: ann.opacity ?? null,
			};
		});
	}
	// RFviewJS class
	class RFviewJS {
		constructor(container, config = {}) {
			injectStyles();
			// Apply explicit dimensions to container if requested
			if (config.width) container.style.width = typeof config.width === 'number' ? config.width + 'px' : config.width;
			if (config.height) container.style.height = typeof config.height === 'number' ? config.height + 'px' : config.height;
			this._container = container;
			this._lastConfig = null;
			this._constructorConfig = config; // preserved for defaults like showIndices
			// UI layout config (fixed at construction time)
			const validPos = ['top', 'bottom', 'left', 'right'];
			this._toolbarPos = validPos.includes(config.toolbarPosition) ? config.toolbarPosition : 'left';
			this._showStatusBar = config.statusBar !== false;
			this._canvasDrop = config.canvasDrop !== false;
			// Layout algorithm: 'radiate' (default) | 'naview'
			this._layoutAlgo = (config.layout === 'naview' || config.layout === 'radiate') ? config.layout : 'auto';
			// normalize buttons config: true/omitted, then all on; false, then all off,
			// object: merge with all-on defaults.
			const ALL_ON = {
				zoomIn: true,
				zoomOut: true,
				fit: true,
				reset: true,
				save: true,
				indices: true,
				colorMap: true,
				layout: true,
				pseudoknots: true,
				pairAnnotations: true,
				upload: true,
				rfam: true,
				cleanOne: true,
				cleanAll: true,
				manualInput: true,
				toolbarPos: true,
				r3d: true,
				ssEnds: true,
			};
			const b = config.buttons;
			this._btns = b === false ? {
				zoomIn: false,
				zoomOut: false,
				fit: false,
				reset: false,
				save: false,
				indices: false,
				colorMap: false,
				layout: false,
				pairAnnotations: false,
				upload: false,
				rfam: false,
				cleanOne: false,
				cleanAll: false,
				manualInput: false,
				toolbarPos: false,
				r3d: false,
				ssEnds: false,
			} : (b && typeof b === 'object' ? {
				...ALL_ON,
				...b
			} : {
				...ALL_ON
			});
			// Viewer state
			this._vx = 0;
			this._vy = 0;
			this._vscale = 1;
			this._panStart = null;
			this._rotState = null;
			this._flipState = null;
			this._showIndices = config.showIndices !== false; // default true
			this._showColors = config.showColors !== false; // default true
			this._relaxedSequence = config.relaxedSequence !== false;
			this._showPairAnnotations = config.showPairAnnotations !== false;
			this._autoTolerance = config.autoLayoutTolerance ?? 0;
			this._id = config.id || null; // used as SVG export filename
			if (config.theme) this._root.classList.add(`rv-theme-${config.theme}`);
			this._lastPickedAlgo = null;
			this._rna = null;
			// Multi-structure state
			this._structures = []; // raw structure configs [{label, structure, ...}]
			this._structLayouts = []; // computed rna objects, one per structure
			this._currentStructIdx = -1;
			this._isAnimating = false;
			this._animFrame = null;
			this._transitionDuration = config.transitionDuration ?? 600;
			this._buildDOM();
			this._bindEvents();
			// Apply default toggle states to buttons if they were built
			if (this._showIndices && this._chkIndices) this._chkIndices.classList.add('rv--active');
			if (this._showColors && this._chkColors) this._chkColors.classList.add('rv--active');
			if (this._showPairAnnotations && this._chkPAnnot) this._chkPAnnot.classList.add('rv--active');
			// Initial button label — for 'auto' shows 'Auto' until _pickLayout runs
			if (this._layoutBtn) {
				const lbl = this._layoutBtn.querySelector('.rv-layout-lbl');
				if (lbl) lbl.textContent = this._layoutAlgo === 'naview' ? 'NAView' : this._layoutAlgo === 'auto' ? 'Auto' : 'Radiate';
				if (this._layoutAlgo === 'naview') this._layoutBtn.classList.add('rv--naview');
				if (this._layoutAlgo === 'auto') this._layoutBtn.classList.add('rv--auto');
			}
			this.load(config);
		}
		// DOM construction
		_buildDOM() {
			const b = this._btns;
			const pos = this._toolbarPos;
			// Build toolbar content: separators only appear between non-empty groups
			const btnHTML = (cls, extraCls, icon, label) => `<button class="rv-btn${extraCls ? ' '+extraCls : ''} ${cls}" title="${label}">${icon}<span class="rv-btn-label">${label}</span></button>`;
			const ICONS = {
				zoomIn: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6.5" cy="6.5" r="5"/><path d="M11 11l3 3M4.5 6.5h4M6.5 4.5v4"/></svg>`,
				zoomOut: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6.5" cy="6.5" r="5"/><path d="M11 11l3 3M4.5 6.5h4"/></svg>`,
				fit: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 2v3H2M11 2v3h3M5 14v-3H2M11 14v-3h3"/></svg>`,
				reset: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 8a6 6 0 1 1 1.4 3.8"/><path d="M2 14V9h5"/></svg>`,
				save: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="1" width="12" height="14" rx="1.5"/><path d="M5 1v5h6V1M8 10v4M6 12l2 2 2-2"/></svg>`,
			};
			const chk = `style="accent-color:var(--rv-accent,#58a6ff);margin-right:2px"`;
			const ICON_INDICES = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 2l-2 12M12 2l-2 12M3 6h11M3 10h11"/></svg>`;
			const ICON_COLORMAP = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="5" width="3.2" height="6" rx="1" opacity=".28"/><rect x="6.4" y="5" width="3.2" height="6" rx="1" opacity=".6"/><rect x="10.8" y="5" width="3.2" height="6" rx="1" opacity=".92"/></svg>`;
			// NAView icon: two concentric arcs with spokes, suggests a radial layout
			const ICON_PK = '<span style="font-family:monospace;font-weight:700;font-size:13px;letter-spacing:-0.5px;line-height:1">PK</span>';
			const ICON_PAIR_ANNOT = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="1.5" y="4.5" width="13" height="7" rx="2.5"/><circle cx="5" cy="8" r="1.6" fill="currentColor" stroke="none"/><circle cx="11" cy="8" r="1.6" fill="currentColor" stroke="none"/><line x1="6.8" y1="8" x2="9.2" y2="8"/></svg>`;
			const ICON_MANUAL = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="12" height="9" rx="1.5"/><line x1="5" y1="8" x2="5" y2="8.01"/><line x1="8" y1="8" x2="8" y2="8.01"/><line x1="11" y1="8" x2="11" y2="8.01"/><line x1="5" y1="11" x2="5" y2="11.01"/><line x1="8" y1="11" x2="11" y2="11.01"/><path d="M6 4V3a2 2 0 014 0v1"/></svg>`;
			const ICON_UPLOAD = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,9 8,4 12,9"/><line x1="8" y1="4" x2="8" y2="13"/><line x1="2" y1="14" x2="14" y2="14"/></svg>`;
			const ICON_CLEAN_ONE = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>`;
			const ICON_CLEAN_ALL = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,4 13,4"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M6 7v5M10 7v5"/><path d="M4 4l.8 8.5a1 1 0 001 .9h4.4a1 1 0 001-.9L12 4"/></svg>`;
			const ICON_SETTINGS = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.4"/><path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.6 3.6l.85.85M11.55 11.55l.85.85M12.4 3.6l-.85.85M4.45 11.55l-.85.85"/></svg>`;
			const ICON_ABOUT = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="7.5" x2="8" y2="11.5"/><circle cx="8" cy="4.8" r="0.6" fill="currentColor" stroke="none"/></svg>`;
			// Two-state icon: horizontal bar (top) and vertical bar (left)
			const ICON_TOOLBAR_POS = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" stroke="none"><rect x="2" y="2" width="12" height="3" rx="1"/><rect x="2" y="7" width="3" height="7" rx="1"/><rect x="7" y="7" width="7" height="7" rx="1" opacity=".35"/></svg>`;
			const groups = [
				[b.upload || b.rfam || b.cleanOne || b.cleanAll || b.manualInput, [
					b.manualInput ? btnHTML('rv-btn-manual', '', ICON_MANUAL, 'Manually enter sequence & structure') : '',
					b.upload ? btnHTML('rv-btn-upload', '', ICON_UPLOAD, 'Load structure/reactivity/annotation') : '',
					b.rfam ? btnHTML('rv-btn-rfam', '', '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,7 8,12 12,7"/><line x1="8" y1="12" x2="8" y2="3"/><line x1="2" y1="14" x2="14" y2="14"/></svg>', 'Fetch alignment from Rfam') : '',
					b.cleanOne ? btnHTML('rv-btn-clean-one', '', ICON_CLEAN_ONE, 'Clear this structure') : '',
					b.cleanAll ? btnHTML('rv-btn-clean', '', ICON_CLEAN_ALL, 'Clear all structures') : '',
				].join('')],
				[b.zoomIn || b.zoomOut, [
					b.zoomIn ? btnHTML('rv-zoom-in', '', ICONS.zoomIn, 'Zoom In') : '',
					b.zoomOut ? btnHTML('rv-zoom-out', '', ICONS.zoomOut, 'Zoom Out') : '',
					(b.zoomIn || b.zoomOut) ? `<span class="rv-zoom-lbl">100%</span>` : '',
				].join('')],
				[b.fit || b.reset, [
					b.fit ? btnHTML('rv-fit', '', ICONS.fit, 'Fit to canvas') : '',
					b.reset ? btnHTML('rv-reset', '', ICONS.reset, 'Reset layout') : '',
				].join('')],
				[b.save, b.save ? btnHTML('rv-save', 'rv-btn-primary', ICONS.save, 'Save SVG') : ''],
				[b.indices || b.colorMap || b.pairAnnotations || b.pseudoknots || b.insets !== false || b.labels !== false || b.r3d !== false || b.ssEnds !== false, [
					b.indices ? `<button class="rv-btn rv-btn-toggle rv-chk-indices" title="Indices">${ICON_INDICES}<span class="rv-btn-label">Indices</span></button>` : '',
					b.colorMap !== false ? `<button class="rv-btn rv-btn-toggle rv-chk-colors" title="Reactivity" style="display:none"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="7" width="3" height="6" rx="0.5"/><rect x="5.5" y="4" width="3" height="9" rx="0.5"/><rect x="10" y="1" width="3" height="12" rx="0.5"/></svg><span class="rv-btn-label">Reactivity</span></button>` : '',
					b.pairAnnotations !== false ? `<button class="rv-btn rv-btn-toggle rv-chk-pannot" title="Base-pair/helix annotations" style="display:none"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="1" x2="3" y2="13"/><line x1="11" y1="1" x2="11" y2="13"/><line x1="3" y1="3.5" x2="11" y2="3.5"/><line x1="3" y1="7" x2="11" y2="7"/><line x1="3" y1="10.5" x2="11" y2="10.5"/></svg><span class="rv-btn-label">Base-pair/helix annotations</span></button>` : '',
					b.pseudoknots ? `<button class="rv-btn rv-btn-toggle rv-chk-pk" title="Pseudoknots" style="display:none">${ICON_PK}<span class="rv-btn-label">Pseudoknots</span></button>` : '',
					b.insets !== false && b.r3d !== false ? `<button class="rv-btn rv-btn-toggle rv-chk-r3d-insets" title="Inset panels" style="display:none"><span style="font-family:monospace;font-weight:700;font-size:14px;width:14px;display:inline-block;text-align:center;line-height:1">I</span><span class="rv-btn-label">Insets</span></button>` : '',
					b.labels !== false && b.r3d !== false ? `<button class="rv-btn rv-btn-toggle rv-chk-r3d-labels" title="Annotation labels" style="display:none"><span style="font-family:monospace;font-weight:700;font-size:14px;width:14px;display:inline-block;text-align:center;line-height:1">L</span><span class="rv-btn-label">Labels</span></button>` : '',
					b.ssEnds !== false ? `<button class="rv-btn rv-btn-toggle rv-chk-ssends" title="Show/hide single-stranded 5&prime;/3&prime; ends" style="display:none"><span style="font-family:monospace;font-weight:700;font-size:13px;letter-spacing:-0.5px;line-height:1">SS</span><span class="rv-btn-label">SS ends</span></button>` : '',
				].join('')],
				// Layout algorithm toggle: letter shows the TARGET layout (N = go to NAView, R = go to Radiate)
				[b.layout, [b.layout ? `<button class="rv-btn rv-btn-toggle rv-btn-layout" title="${this._layoutAlgo === 'naview' ? 'Switch to Radiate layout' : 'Switch to NAView layout'}"><span class="rv-layout-letter" style="font-family:monospace;font-weight:700;font-size:14px;width:14px;display:inline-block;text-align:center;line-height:1">${this._layoutAlgo === 'naview' ? 'R' : 'N'}</span><span class="rv-btn-label rv-layout-lbl">${this._layoutAlgo === 'naview' ? 'Radiate' : 'NAView'}</span></button>` : '', `<button class="rv-btn rv-btn-toggle rv-btn-aln" title="Alignment view" style="display:none"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg><span class="rv-btn-label">Alignment view</span></button>`, ].join('')],
				[b.toolbarPos, b.toolbarPos ? btnHTML('rv-btn-toolbar-pos', '', ICON_TOOLBAR_POS, this._toolbarPos === 'left' ? 'Move toolbar to top' : 'Move toolbar to left') : ''],
			];
			const sep = '<span class="rv-tsep"></span>';
			const toolbarContent = groups.filter(([visible]) => visible).map(([, html]) => html).join(sep);
			// Settings and About are always present regardless of buttons config
			const alwaysButtons = sep + btnHTML('rv-btn-settings', '', ICON_SETTINGS, 'Settings') + btnHTML('rv-btn-about', '', ICON_ABOUT, 'About');
			const root = document.createElement('div');
			root.className = 'rv' + (pos !== 'top' ? ` rv--toolbar-${pos}` : '');
			root.innerHTML = `
        <div class="rv-toolbar">
          ${toolbarContent}${alwaysButtons}
        </div>
        <div class="rv-canvas">
          <div class="rv-aln-view"></div>
          <svg class="rv-svg" xmlns="http://www.w3.org/2000/svg">
            <g class="rv-rot-ring">
              <circle class="rv-rot-circ" cx="0" cy="0" r="50"/>
              <line   class="rv-rot-line" x1="0" y1="0" x2="50" y2="0"/>
            </g>
            <g class="rv-scene"></g>
          </svg>
          <div class="rv-error"></div>
          <div class="rv-error-dialog">
            <div class="rv-error-dialog-hdr rv-drag-handle">
              <h3><span style="color:var(--rv-error,#cf222e);margin-right:6px">&#x2715;</span>Error</h3>
              <button class="rv-error-dialog-x rv-upload-x" title="Close">&#x2715;</button>
            </div>
            <div class="rv-error-dialog-body"></div>
            <div class="rv-error-dialog-foot">
              <button class="rv-upload-btn rv-upload-btn-load rv-error-dialog-ok">OK</button>
            </div>
          </div>
          <div class="rv-struct-wrap"><button class="rv-struct-arrow rv-struct-arrow-l" aria-label="Previous">&#8249;</button><div class="rv-struct-bar"></div><button class="rv-struct-arrow rv-struct-arrow-r" aria-label="Next">&#8250;</button></div>
          <div class="rv-tooltip"></div>
          <div class="rv-manual-panel">
            <div class="rv-upload-hdr rv-drag-handle">
              <h3>Manually enter sequence &amp; structure</h3>
              <button class="rv-manual-x rv-upload-x" title="Close">&#x2715;</button>
            </div>
            <div class="rv-upload-section">
              <div class="rv-upload-lbl">Sequence <span>(optional)</span></div>
              <textarea class="rv-manual-seq" spellcheck="false" rows="3"
                style="width:100%;box-sizing:border-box;resize:vertical;font-family:monospace;font-size:12px;padding:6px 8px;border:1px solid var(--rv-border,#d0d7de);border-radius:6px;background:var(--rv-bg,#fff);color:var(--rv-text,#1f2328);outline:none;margin-top:4px;display:block"></textarea>
            </div>
            <div class="rv-upload-section">
              <div class="rv-upload-lbl">Structure <span>[dot-bracket] (mandatory)</span></div>
              <textarea class="rv-manual-struct" spellcheck="false" rows="3"
                style="width:100%;box-sizing:border-box;resize:vertical;font-family:monospace;font-size:12px;padding:6px 8px;border:1px solid var(--rv-border,#d0d7de);border-radius:6px;background:var(--rv-bg,#fff);color:var(--rv-text,#1f2328);outline:none;margin-top:4px;display:block"></textarea>
            </div>
            <div class="rv-upload-section">
              <div class="rv-upload-lbl">Name <span>(optional)</span></div>
              <input class="rv-manual-name" type="text" placeholder="Structure name"
                style="width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--rv-border,#d0d7de);border-radius:6px;background:var(--rv-bg,#fff);color:var(--rv-text,#1f2328);outline:none;display:block;margin-top:4px">
            </div>
            <div class="rv-manual-status rv-upload-status"></div>
            <div class="rv-upload-actions">
              <button class="rv-upload-btn rv-upload-btn-cancel rv-manual-cancel">Cancel</button>
              <button class="rv-upload-btn rv-upload-btn-load rv-manual-load">Load</button>
            </div>
          </div>
          <div class="rv-rfam-panel">
            <div class="rv-upload-hdr rv-drag-handle">
              <h3>Load Rfam alignment</h3>
              <button class="rv-rfam-x rv-upload-x" title="Close">&#x2715;</button>
            </div>
            <div class="rv-upload-section">
              <div class="rv-upload-lbl">Rfam family ID <span>(e.g. RF00162)</span></div>
              <input class="rv-rfam-input" type="text" placeholder="RF00162" spellcheck="false">
            </div>
            <div class="rv-rfam-spinner">Loading alignment&#8230;</div>
            <div class="rv-rfam-status rv-upload-status"></div>
            <div class="rv-upload-actions">
              <button class="rv-upload-btn rv-upload-btn-cancel rv-rfam-cancel">Cancel</button>
              <button class="rv-upload-btn rv-upload-btn-load rv-rfam-load">Load</button>
            </div>
          </div>
          <div class="rv-aln-legend"><div class="rv-aln-legend-cols"><div class="rv-aln-legend-col"><div class="rv-aln-legend-hdr">nucleotide present</div><div class="rv-aln-legend-row"><svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="4.5" fill="#cc0000" stroke="#111" stroke-width="1"/></svg><span>97%</span></div><div class="rv-aln-legend-row"><svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="4.5" fill="#111111" stroke="#111" stroke-width="1"/></svg><span>90%</span></div><div class="rv-aln-legend-row"><svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="4.5" fill="#888888" stroke="#111" stroke-width="1"/></svg><span>75%</span></div><div class="rv-aln-legend-row"><svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="4.5" fill="#fff" stroke="#111" stroke-width="1.5"/></svg><span>50%</span></div></div><div class="rv-aln-legend-col"><div class="rv-aln-legend-hdr">nucleotide identity</div><div class="rv-aln-legend-row"><b style="color:#cc0000;font-size:14px">N</b><span>97%</span></div><div class="rv-aln-legend-row"><b style="color:#111111;font-size:14px">N</b><span>90%</span></div><div class="rv-aln-legend-row"><b style="color:#888888;font-size:14px">N</b><span>75%</span></div></div></div></div>
          <div class="rv-legend">
            <h4>Value</h4>
            <div class="rv-legend-gradient"></div>
            <div class="rv-legend-labels"></div>
            <div class="rv-legend-nan" style="display:none"></div>
          </div>
          <div class="rv-pal-legend"></div>
          <div class="rv-pk-panels"></div>
          <div class="rv-about-panel">
            <div class="rv-upload-hdr rv-drag-handle">
              <h3 style="margin:0;font-weight:600">About</h3>
              <button class="rv-upload-x rv-about-x" title="Close">&#x2715;</button>
            </div>
            <div class="rv-about-logo"><img src="data:image/png;base64,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" style="width:90px;height:90px;object-fit:contain;display:block;margin:0 auto"><br/></div>
            <p class="rv-about-name">RFview</p>
            <p class="rv-about-ver">v1.1.0</p>
			<p class="rv-about-desc">RNA Framework Structure Viewer</p>
            <p style="font-size:11px;color:var(--rv-muted,#656d76);margin:0 0 10px">Author: Danny Incarnato<br>(dincarnato[at]rnaframework.com)</p>
			<p style="font-size:11px;color:var(--rv-muted,#656d76);margin:0 0 10px"><b>Note: </b>The Radiate layout was ported from Yann Ponty's <a href="https://github.com/yannponty/VARNA" target="_blank">VARNA</a>,<br>while the NAView layout was ported from <a href="https://github.com/ViennaRNA/RNAcode/blob/master/librna/naview.c" target="_blank">Ivo Hofacker's adaptation</a> of Bruccoleri & Heinrich original algorithm.</p>
			<p>&nbsp;<p/>
            <div class="rv-about-links">
			  <p><a class="rv-about-link" href="https://github.com/dincarnato/RFview" target="_blank"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;margin-right:3px"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>GitHub</a></p>
              <p><a class="rv-about-link" href="https://rfviewjs-docs.readthedocs.io" target="_blank"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;margin-left:20px;"><path d="M2 3h5a2 2 0 0 1 2 2v8a1.5 1.5 0 0 0-1.5-1.5H2z"/><path d="M14 3H9a2 2 0 0 0-2 2v8a1.5 1.5 0 0 1 1.5-1.5H14z"/></svg>Docs</a></p>
            </div>
          </div>
          <div class="rv-settings-panel">
            <div class="rv-upload-hdr rv-drag-handle">
              <h3>Settings</h3>
              <button class="rv-upload-x rv-settings-x" title="Close">&#x2715;</button>
            </div>
            <div class="rv-settings-tabs">
              <button class="rv-settings-tab rv--active" data-tab="appearance">Appearance</button>
              <button class="rv-settings-tab" data-tab="colormap">Reactivity</button>
              <button class="rv-settings-tab rv-tab-pannot" data-tab="pannot" style="display:none">Annotations</button>
              <button class="rv-settings-tab" data-tab="general">General</button>
            </div>
            <div class="rv-settings-body">
              <div class="rv-settings-pane rv--active" data-pane="appearance">
                <div class="rv-setting-row"><span class="rv-setting-label">Backbone color</span>
                  <input type="color" class="rv-set-backbone" value="#8c959f"></div>
                <div class="rv-setting-row"><span class="rv-setting-label">Bond color</span>
                  <input type="color" class="rv-set-basepair" value="#111111"></div>
                <div class="rv-setting-row rv-row-radius"><span class="rv-setting-label">Circle size  <span class="rv-setting-val rv-val-radius">12</span></span>
                  <input type="range" class="rv-set-radius" min="1" max="30" step="1" value="12"></div>
                <div class="rv-setting-row rv-row-lbl-font"><span class="rv-setting-label">Base font  <span class="rv-setting-val rv-val-lbl-font">16</span></span>
                  <input type="range" class="rv-set-lbl-font" min="1" max="30" step="1" value="16"></div>
                <div class="rv-setting-row"><span class="rv-setting-label">Index font  <span class="rv-setting-val rv-val-idx-font">16</span></span>
                  <input type="range" class="rv-set-idx-font" min="1" max="30" step="1" value="16"></div>
              </div>
              <div class="rv-settings-pane" data-pane="colormap">
                <div class="rv-setting-row"><span class="rv-setting-label">NaN / missing</span>
                  <input type="color" class="rv-set-nan" value="#999999"></div>
                <div class="rv-cm-type">
                  <button class="rv-cm-type-btn rv--active" data-type="gradient">Gradient</button>
                  <button class="rv-cm-type-btn" data-type="discrete">Discrete</button>
                </div>
                <div class="rv-stops-list"></div>
                <button class="rv-stop-add">+ Add stop</button>
              </div>
              <div class="rv-settings-pane rv-set-pannot-pane" data-pane="pannot">
                <div class="rv-setting-row"><span class="rv-setting-label">Opacity <span class="rv-setting-val rv-val-pa-opac">0.3</span></span>
                  <input type="range" class="rv-set-pa-opac" min="0.05" max="1" step="0.05" value="0.3"></div>
                <div class="rv-setting-row"><span class="rv-setting-label">Line width <span class="rv-setting-val rv-val-pa-stroke">1.5</span></span>
                  <input type="range" class="rv-set-pa-stroke" min="0.5" max="6" step="0.5" value="1.5"></div>
                <div class="rv-setting-row"><span class="rv-setting-label">Pair box padding <span class="rv-setting-val rv-val-pa-pad">16</span></span>
                  <input type="range" class="rv-set-pa-pad" min="4" max="40" step="1" value="16"></div>
                <div class="rv-pa-colors"></div>
                <div class="rv-ha-settings" style="display:none">
                  <hr style="margin:8px 0;border:none;border-top:1px solid var(--rv-border,#d0d7de)">
                  <div class="rv-setting-row"><span class="rv-setting-label">Helix box opacity <span class="rv-setting-val rv-val-ha-opac">0.5</span></span>
                    <input type="range" class="rv-set-ha-opac" min="0.02" max="1" step="0.01" value="0.5"></div>
                  <div class="rv-setting-row"><span class="rv-setting-label">Helix box padding <span class="rv-setting-val rv-val-ha-pad">25</span></span>
                    <input type="range" class="rv-set-ha-pad" min="4" max="48" step="1" value="25"></div>
                  <div class="rv-setting-row"><span class="rv-setting-label">Helix box color</span>
                    <input type="color" class="rv-set-ha-color" value="#ef4444" style="width:44px;height:24px;border:1px solid var(--rv-border,#d0d7de);border-radius:4px;cursor:pointer;padding:1px 2px"></div>
                </div>
              </div>
              <div class="rv-settings-pane" data-pane="general">
                <div class="rv-setting-row" style="align-items:center;gap:8px">
                  <input type="checkbox" class="rv-set-relaxed-seq" id="rv-set-relaxed-seq" checked style="width:15px;height:15px;cursor:pointer;accent-color:var(--rv-accent,#0969da)">
                  <label for="rv-set-relaxed-seq" style="cursor:pointer;font-size:13px;user-select:none">Allow non-standard characters in sequence</label>
                </div>
              </div>
            </div>
            <div class="rv-upload-actions">
              <button class="rv-upload-btn rv-upload-btn-load rv-settings-reset">Reset defaults</button>
            </div>
          </div>
          <div class="rv-upload-panel">
            <div class="rv-upload-hdr rv-drag-handle">
              <h3>Load data</h3>
              <button class="rv-upload-x" title="Close">&#x2715;</button>
            </div>
            <div class="rv-upload-section">
              <div class="rv-upload-lbl">Structure files <span>(dot-bracket, CT, or Stockholm)</span></div>
              <div class="rv-upload-drop rv-upload-drop-db">
                <input type="file" class="rv-file-db" accept=".db,.dot,.fa,.fasta,.ct,.stk,.sto,.stockholm,.txt" multiple>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><polyline points="9,2 9,6 13,6"/></svg>
                Drop structure files here or click to browse
              </div>
              <div class="rv-struct-order">
                <div class="rv-upload-lbl">Structure order <span>drag ↑↓ to rearrange</span></div>
                <div class="rv-struct-order-list"></div>
              </div>
            </div>
            <div class="rv-loaded-struct-wrap rv-struct-order" style="display:none">
              <div class="rv-upload-lbl">Structures in viewer <span>↑↓ to match with files below</span></div>
              <div class="rv-loaded-struct-list rv-struct-order-list"></div>
            </div>
            <div class="rv-upload-section">
              <div class="rv-upload-lbl">Reactivity files <span>(RNA Framework's XML file)</span></div>
              <div class="rv-upload-drop rv-upload-drop-xml">
                <input type="file" class="rv-file-xml" accept=".xml" multiple>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><polyline points="9,2 9,6 13,6"/><line x1="5" y1="9" x2="11" y2="9"/><line x1="5" y1="11.5" x2="9" y2="11.5"/></svg>
                Drop .xml files here or click to browse
              </div>
              <div class="rv-xml-order rv-struct-order">
                <div class="rv-upload-lbl">Reactivity order <span>↑↓ to rearrange · matched positionally to structures</span></div>
                <div class="rv-xml-order-list rv-struct-order-list"></div>
              </div>
            </div>
            <div class="rv-xml-target" style="display:none">
              <div class="rv-upload-lbl">Apply reactivity to <span>select one or more</span></div>
              <div class="rv-xml-target-list"></div>
            </div>
            <div class="rv-upload-section" style="margin-top:12px">
              <div class="rv-upload-lbl">Pair annotations <span>(TSV, or R-scape's .cov/.helixcov file)</span></div>
              <div class="rv-upload-drop rv-upload-drop-annot">
                <input type="file" class="rv-file-annot" accept=".tsv,.txt,.cov,.helixcov" multiple>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><polyline points="9,2 9,6 13,6"/><line x1="5" y1="9" x2="7" y2="9"/><line x1="9" y1="9" x2="11" y2="9"/><line x1="5" y1="11.5" x2="7" y2="11.5"/><line x1="9" y1="11.5" x2="11" y2="11.5"/></svg>
                Drop tab-separated annotation files here or click to browse
              </div>
            </div>
            <div class="rv-annot-target" style="display:none">
              <div class="rv-upload-lbl">Apply annotation to <span>select one structure</span></div>
              <div class="rv-annot-target-list"></div>
            </div>
            <div class="rv-upload-status"></div>
            <div class="rv-upload-actions">
              <button class="rv-upload-btn rv-upload-btn-cancel">Cancel</button>
              <button class="rv-upload-btn rv-upload-btn-load" disabled>Load</button>
            </div>
          </div>
        </div>
        <div class="rv-statusbar"${this._showStatusBar ? '' : ' style="display:none"'}>
          <span><span class="rv-dot"></span><span class="rv-sb-seq">—</span></span>
          <span class="rv-sb-pairs">— pairs</span>
          <span>&nbsp;</span>
        </div>`;
			this._container.appendChild(root);
			this._root = root;
			// Cache DOM references
			const q = s => root.querySelector(s);
			this._zoomLbl = q('.rv-zoom-lbl');
			this._canvas = q('.rv-canvas');
			this._svgEl = q('.rv-svg');
			this._scene = q('.rv-scene');
			this._errEl = q('.rv-error');
			this._errDialog = q('.rv-error-dialog');
			this._errDialogBody = q('.rv-error-dialog-body');
			this._relaxedSequence = this._constructorConfig?.relaxedSequence !== false;
			this._structWrap = q('.rv-struct-wrap');
			this._alnViewEl = q('.rv-aln-view');
			this._alnBtn = q('.rv-btn-aln');
			if (this._alnBtn) this._alnBtn.addEventListener('click', () => this._toggleAlnView());
			this._structBar = q('.rv-struct-bar');
			this._structArrowL = q('.rv-struct-arrow-l');
			this._structArrowR = q('.rv-struct-arrow-r');
			this._tooltip = q('.rv-tooltip');
			this._legend = q('.rv-legend');
			this._legendGrad = q('.rv-legend-gradient');
			this._legendLabels = q('.rv-legend-labels');
			this._legendNaN = q('.rv-legend-nan');
			this._palLegend = q('.rv-pal-legend');
			this._pkPanelsEl = q('.rv-pk-panels');
			this._rotRing = q('.rv-rot-ring');
			this._rotCirc = q('.rv-rot-circ');
			this._rotLine = q('.rv-rot-line');
			this._sbSeq = q('.rv-sb-seq');
			this._sbPairs = q('.rv-sb-pairs');
			this._chkIndices = q('.rv-chk-indices');
			this._chkColors = q('.rv-chk-colors');
			this._chkPAnnot = q('.rv-chk-pannot');
			this._chkPk = q('.rv-chk-pk');
			this._chkR3dInsets = q('.rv-chk-r3d-insets');
			this._chkR3dLabels = q('.rv-chk-r3d-labels');
			this._chkSsEnds = q('.rv-chk-ssends');
			this._alnLegend = q('.rv-aln-legend');
			this._showPseudoknots = this._config?.showPseudoknots !== false;
			if (this._chkPk) this._chkPk.classList.toggle('rv--active', this._showPseudoknots);
			this._showR3dInsets = this._constructorConfig?.showInsets !== false;
			this._showR3dLabels = this._constructorConfig?.showLabels !== false;
			if (this._chkR3dInsets) this._chkR3dInsets.classList.toggle('rv--active', this._showR3dInsets);
			if (this._chkR3dLabels) this._chkR3dLabels.classList.toggle('rv--active', this._showR3dLabels);
			this._showSsEnds = this._constructorConfig?.showSsEnds === true;
			if (this._chkSsEnds) this._chkSsEnds.classList.toggle('rv--active', this._showSsEnds);
			this._layoutBtn = q('.rv-btn-layout');
			this._uploadBtn = q('.rv-btn-upload');
			this._cleanBtn = q('.rv-btn-clean');
			this._manualBtn = q('.rv-btn-manual');
			this._cleanOneBtn = q('.rv-btn-clean-one');
			this._settingsBtn = q('.rv-btn-settings');
			this._aboutBtn = q('.rv-btn-about');
			this._toolbarPosBtn = q('.rv-btn-toolbar-pos');
			this._aboutPanel = q('.rv-about-panel');
			this._settingsPanel = q('.rv-settings-panel');
			this._manualPanel = q('.rv-manual-panel');
			this._uploadPanel = q('.rv-upload-panel');
			this._rfamBtn = q('.rv-btn-rfam');
			this._rfamPanel = q('.rv-rfam-panel');
			this._upFileDb = q('.rv-file-db');
			this._upFileXml = q('.rv-file-xml');
			this._upDbNames = q('.rv-db-names');
			this._upXmlNames = q('.rv-xml-names');
			this._upStatus = this._uploadPanel ? this._uploadPanel.querySelector('.rv-upload-status') : null;
			this._upLoadBtn = this._uploadPanel ? this._uploadPanel.querySelector('.rv-upload-btn-load') : null;
			this._upStructOrder = q('.rv-struct-order');
			this._upStructOrderList = q('.rv-struct-order-list');
			this._upXmlOrder = q('.rv-xml-order');
			this._upXmlOrderList = q('.rv-xml-order-list');
			this._upXmlTargetSection = q('.rv-xml-target');
			this._upXmlTargetList = q('.rv-xml-target-list');
			this._upLoadedStructWrap = q('.rv-loaded-struct-wrap');
			this._upLoadedStructList = q('.rv-loaded-struct-list');
			this._loadedStructsOrder = [];
			this._upAnnotDrop = q('.rv-upload-drop-annot');
			this._upFileAnnot = q('.rv-file-annot');
			this._upAnnotNames = q('.rv-annot-names');
			this._upAnnotTargetSection = q('.rv-annot-target');
			this._upAnnotTargetList = q('.rv-annot-target-list');
			this._accumulatedAnnotFiles = [];
			this._pendingAnnotData = []; // [{filename, pairs:[{i,j,category}]}]
			this._pendingStructures = [];
			this._pendingXmlData = []; // pre-parsed xml records, user-ordered
		}
		// Event wiring
		_bindEvents() {
			const on = (sel, evt, fn) => {
				const el = this._root.querySelector(sel);
				if (el) el.addEventListener(evt, fn);
			};
			on('.rv-zoom-in', 'click', () => this._zoomBy(1.2));
			on('.rv-zoom-out', 'click', () => this._zoomBy(1 / 1.2));
			on('.rv-fit', 'click', () => this.fit());
			on('.rv-reset', 'click', () => this.reset());
			on('.rv-save', 'click', () => this._saveSVG());
			if (this._layoutBtn) {
				this._layoutBtn.addEventListener('click', () => this.toggleLayout());
			}
			if (this._chkIndices) {
				this._chkIndices.addEventListener('click', () => {
					this._showIndices = !this._showIndices;
					this._chkIndices.classList.toggle('rv--active', this._showIndices);
					if (!this._alnActive) this._render();
				});
			}
			if (this._chkColors) {
				this._chkColors.addEventListener('click', () => {
					this._showColors = !this._showColors;
					this._chkColors.classList.toggle('rv--active', this._showColors);
					this._updateLegendVisibility();
					if (!this._alnActive) this._render();
				});
			}
			if (this._chkPk) {
				this._chkPk.addEventListener('click', () => {
					this._showPseudoknots = !this._showPseudoknots;
					this._chkPk.classList.toggle('rv--active', this._showPseudoknots);
					if (!this._alnActive) this._render();
				});
			}
			if (this._chkR3dInsets) {
				this._chkR3dInsets.addEventListener('click', () => {
					this._showR3dInsets = !this._showR3dInsets;
					this._chkR3dInsets.classList.toggle('rv--active', this._showR3dInsets);
					if (!this._alnActive) this._render();
				});
			}
			if (this._chkR3dLabels) {
				this._chkR3dLabels.addEventListener('click', () => {
					this._showR3dLabels = !this._showR3dLabels;
					this._chkR3dLabels.classList.toggle('rv--active', this._showR3dLabels);
					if (!this._alnActive) this._render();
				});
			}
			if (this._chkSsEnds) {
				this._chkSsEnds.addEventListener('click', () => {
					this._showSsEnds = !this._showSsEnds;
					this._chkSsEnds.classList.toggle('rv--active', this._showSsEnds);
					if (!this._alnActive) this._rebuildCurrentLayout();
				});
			}
			if (this._chkPAnnot) {
				this._chkPAnnot.addEventListener('click', () => {
					if (!this._alnActive) this.setShowPairAnnotations(!this._showPairAnnotations);
					else {
						this._showPairAnnotations = !this._showPairAnnotations;
						this._chkPAnnot.classList.toggle('rv--active', this._showPairAnnotations);
					}
				});
			}
			// Upload panel
			if (this._uploadBtn) {
				this._uploadBtn.addEventListener('click', () => this._showUploadPanel());
			}
			if (this._cleanBtn) {
				this._cleanBtn.addEventListener('click', () => this.clear());
			}
			if (this._manualBtn) {
				this._manualBtn.addEventListener('click', () => this._openManualDialog());
			}
			if (this._manualPanel) {
				this._makeDraggable(this._manualPanel);
			}
			if (this._cleanOneBtn) {
				this._cleanOneBtn.addEventListener('click', () => this.clearCurrent());
			}
			if (this._aboutBtn) {
				this._aboutBtn.addEventListener('click', () => this._openAbout());
			}
			if (this._rfamBtn) {
				this._rfamBtn.addEventListener('click', () => this._openRfam());
			}
			if (this._toolbarPosBtn) {
				this._toolbarPosBtn.addEventListener('click', () => this._toggleToolbarPos());
			}
			if (this._settingsBtn) {
				this._settingsBtn.addEventListener('click', () => this._openSettings());
			}
			if (this._settingsPanel) {
				this._settingsPanel.querySelector('.rv-settings-x').addEventListener('click', () => this._settingsPanel.classList.remove('rv-visible'));
				this._bindSettingsEvents();
				this._makeDraggable(this._settingsPanel);
			}
			if (this._errDialog) {
				const closeErrDialog = () => this._errDialog.classList.remove('rv-visible');
				this._errDialog.querySelector('.rv-error-dialog-x').addEventListener('click', closeErrDialog);
				this._errDialog.querySelector('.rv-error-dialog-ok').addEventListener('click', closeErrDialog);
				this._makeDraggable(this._errDialog);
			}
			if (this._aboutPanel) {
				this._aboutPanel.querySelector('.rv-about-x').addEventListener('click', () => this._aboutPanel.classList.remove('rv-visible'));
				this._makeDraggable(this._aboutPanel);
			}
			if (this._uploadPanel) {
				const hidePanel = () => this._hideUploadPanel();
				this._uploadPanel.querySelector('.rv-upload-x').addEventListener('click', hidePanel);
				this._uploadPanel.querySelector('.rv-upload-btn-cancel').addEventListener('click', hidePanel);
				this._makeDraggable(this._uploadPanel);
				// Drag-over highlight, stopPropagation prevents canvas drop handler from also firing
				for (const drop of this._uploadPanel.querySelectorAll('.rv-upload-drop')) {
					drop.addEventListener('dragover', e => {
						e.preventDefault();
						e.stopPropagation();
						drop.classList.add('rv--drag');
					});
					drop.addEventListener('dragleave', e => {
						e.stopPropagation();
						drop.classList.remove('rv--drag');
					});
					drop.addEventListener('drop', e => {
						e.preventDefault();
						e.stopPropagation();
						drop.classList.remove('rv--drag');
						this._canvas.classList.remove('rv--drop-hover');
						const input = drop.querySelector('input[type=file]');
						if (input) {
							input.files = e.dataTransfer.files;
							input.dispatchEvent(new Event('change'));
						}
					});
				}
				this._upFileDb.addEventListener('change', () => this._updateUploadNames());
				this._upFileXml.addEventListener('change', () => this._updateUploadNames());
				if (this._upLoadBtn) this._upLoadBtn.addEventListener('click', () => this._loadFromFiles());
				if (this._upFileAnnot) {
					this._upFileAnnot.addEventListener('change', () => this._updateUploadNames());
					const ad = this._upAnnotDrop;
					if (ad) {
						ad.addEventListener('dragover', e => {
							e.preventDefault();
							e.stopPropagation();
							ad.classList.add('rv--drag');
						});
						ad.addEventListener('dragleave', e => {
							e.stopPropagation();
							ad.classList.remove('rv--drag');
						});
						ad.addEventListener('drop', e => {
							e.preventDefault();
							e.stopPropagation();
							ad.classList.remove('rv--drag');
							const dt = e.dataTransfer;
							if (dt?.files?.length) {
								for (const f of dt.files)
									if (!this._accumulatedAnnotFiles.some(x => x.name === f.name)) this._accumulatedAnnotFiles.push(f);
								if (this._upAnnotNames) this._upAnnotNames.textContent = this._accumulatedAnnotFiles.map(f => f.name).join(', ');
								this._previewAnnotFiles();
							}
						});
					}
				}
			}
			if (this._rfamPanel) {
				const rfamClose = () => {
					this._rfamPanel.classList.remove('rv-visible');
					this._rfamPanel.querySelector('.rv-rfam-input').value = '';
					this._rfamPanel.querySelector('.rv-rfam-status').textContent = '';
					this._rfamPanel.querySelector('.rv-rfam-spinner').classList.remove('rv--active');
				};
				this._rfamPanel.querySelector('.rv-rfam-x').addEventListener('click', rfamClose);
				this._rfamPanel.querySelector('.rv-rfam-cancel').addEventListener('click', rfamClose);
				this._makeDraggable(this._rfamPanel);
				this._rfamPanel.querySelector('.rv-rfam-load').addEventListener('click', () => {
					const id = this._rfamPanel.querySelector('.rv-rfam-input').value.trim();
					const status = this._rfamPanel.querySelector('.rv-rfam-status');
					const spinner = this._rfamPanel.querySelector('.rv-rfam-spinner');
					if (!/^RF\d+$/i.test(id)) {
						status.textContent = 'Invalid ID — must be RF followed by digits (e.g. RF00162)';
						status.classList.add('rv--err');
						return;
					}
					status.textContent = '';
					status.classList.remove('rv--err');
					spinner.classList.add('rv--active');
					this.fetchRfam(id.toUpperCase()).then(() => {
						rfamClose();
					}).catch(err => {
						spinner.classList.remove('rv--active');
						status.textContent = `Failed to load ${id}: ${err.message}`;
						status.classList.add('rv--err');
					});
				});
			}
			this._svgEl.addEventListener('wheel', e => {
				e.preventDefault();
				const rect = this._svgEl.getBoundingClientRect();
				const mx = e.clientX - rect.left,
					my = e.clientY - rect.top;
				const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
				const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._vscale * f));
				const actualF = newScale / this._vscale;
				this._vscale = newScale;
				this._vx = mx - actualF * (mx - this._vx);
				this._vy = my - actualF * (my - this._vy);
				this._applyTransform();
			}, {
				passive: false
			});
			this._svgEl.addEventListener('mousedown', e => this._onMouseDown(e));
			// Global move / up, keep as bound refs so destroy() can remove them
			this._boundMove = e => this._onMouseMove(e);
			this._boundUp = e => this._onMouseUp(e);
			window.addEventListener('mousemove', this._boundMove);
			window.addEventListener('mouseup', this._boundUp);
			// Cmd-S (macOS) / Ctrl-S (other) shortcut to save current structure as SVG
			this._boundKeyDown = e => {
				if ((e.metaKey || e.ctrlKey) && e.key === 's') {
					const tag = document.activeElement?.tagName?.toLowerCase();
					if (tag !== 'input' && tag !== 'textarea') {
						e.preventDefault();
						this._saveSVG();
					}
				}
			};
			window.addEventListener('keydown', this._boundKeyDown);
			// Drag-and-drop structure files directly onto the canvas
			const DB_EXTS = /\.(db|dbn|ct|sto|stk|stockholm|txt)$/i;
			this._canvas.addEventListener('dragover', e => {
				if (!this._canvasDrop) return;
				const items = Array.from(e.dataTransfer?.items || []);
				if (items.some(it => it.kind === 'file')) {
					e.preventDefault();
					e.dataTransfer.dropEffect = 'copy';
					// Only highlight canvas when NOT hovering over a panel
					if (!e.target.closest('.rv-upload-panel, .rv-manual-panel')) this._canvas.classList.add('rv--drop-hover');
				}
			});
			this._canvas.addEventListener('dragleave', e => {
				if (!this._canvasDrop) return;
				if (!this._canvas.contains(e.relatedTarget)) this._canvas.classList.remove('rv--drop-hover');
			});
			this._canvas.addEventListener('drop', async e => {
				e.preventDefault();
				this._canvas.classList.remove('rv--drop-hover');
				if (!this._canvasDrop) return;
				const allFiles = Array.from(e.dataTransfer.files);
				const dbFiles = allFiles.filter(f => DB_EXTS.test(f.name));
				const xmlFiles = allFiles.filter(f => /\.xml$/i.test(f.name));
				// Silently ignore XML files for Stockholm structures
				const effectiveXmlFiles = this._rna?.baseDisplay ? [] : xmlFiles;
				const covFiles = allFiles.filter(f => /\.(cov|helixcov)$/i.test(f.name));
				if (!dbFiles.length && !effectiveXmlFiles.length && !covFiles.length) return;
				if (this._alnActive) this._exitAlnView();
				// XML-only drop: open panel showing both the XML ordering list and
				// a reorderable list of all structures that match the XML sequences.
				if (!dbFiles.length && !covFiles.length && effectiveXmlFiles.length && this._rna) {
					this._showUploadPanel();
					this._accumulatedXmlFiles = [...effectiveXmlFiles];
					await this._previewXmlFiles();
					if (!this._pendingXmlData.length) {
						this._hideUploadPanel();
						return;
					}
					const xmlSeqs = new Set(this._pendingXmlData.map(r => normalizeSeq(r.sequence)));
					this._loadedStructsOrder = (this._structures?.length ? this._structures : []).filter(s => xmlSeqs.has(normalizeSeq(s.sequence || '')));
					if (!this._loadedStructsOrder.length) {
						this._hideUploadPanel();
						return;
					}
					this._renderLoadedStructOrder();
					// Positional list replaces the checkbox target section
					if (this._upXmlTargetSection) this._upXmlTargetSection.style.display = 'none';
					return;
				}
				// .cov-only drop: open panel only when a Stockholm structure is loaded
				if (!dbFiles.length && !effectiveXmlFiles.length && covFiles.length && this._rna) {
					const stockholmStructs = (this._structures?.length ? this._structures : []).filter(s => !!s.baseDisplay);
					if (!stockholmStructs.length) return;
					this._showUploadPanel();
					this._accumulatedAnnotFiles = [...covFiles];
					await this._previewAnnotFiles();
					if (!this._pendingAnnotData.length) {
						this._hideUploadPanel();
						return;
					}
					this._loadedStructsOrder = stockholmStructs;
					this._renderLoadedStructOrder();
					// Positional list replaces the radio target section
					if (this._upAnnotTargetSection) this._upAnnotTargetSection.style.display = 'none';
					return;
				}
				// Normal structure file drop — start fresh
				this._accumulatedDbFiles = [...dbFiles];
				const dropErrors = await this._previewDbFiles();
				if (this._pendingStructures.length === 0) {
					if (dropErrors.length) this._showErrorDialog(dropErrors.join('\n'));
					return;
				}
				await this._loadFromFiles();
			});
		}
		// Public API
		// Load (or reload) an RNA structure, accepts the same config object as the constructor
		load(config) {
			if (config.rfamId) {
				this.fetchRfam(config.rfamId).catch(err => {
					if (this._rna) this._showErrorDialog(err.message);
					else this._showError(err.message);
				});
				return;
			}
			// Raw text shortcut, auto-detects Stockholm / DB / CT format
			if (config.fileText || config.stockholmText) {
				const raw = config.fileText || config.stockholmText;
				const parsed = parseDbFile(raw, config.label || config.filename || '');
				if (!parsed?.length) {
					this._showError('No structure records found in provided config');
					return;
				}
				// If caller explicitly provided a label, use it — overrides whatever
				// the file itself contains (e.g. #=GF ID in Stockholm).
				if (config.label) {
					if (parsed.length === 1) {
						parsed[0].label = config.label;
					} else {
						parsed.forEach((s, i) => {
							s.label = `${config.label} (${i + 1})`;
						});
					}
				}
				this._initStructures({
					...config,
					structures: parsed
				});
				return;
			}
			// Multiple structures shortcut
			if (config.structures && config.structures.length > 0) {
				this._initStructures(config);
				return;
			}
			const {
				structure,
				values
			} = config;
			// Convert DNA T to RNA U automatically
			const sequence = config.sequence ?
				(this._relaxedSequence ? config.sequence : normalizeSeq(config.sequence)) :
				config.sequence;
			// Clear any previous error and reset state
			this._errEl.style.display = 'none';
			this._legend.style.display = 'none';
			// Validate inputs
			// No sequence AND no structure, then empty/clean start, nothing to render.
			if (!sequence && !structure) return;
			// One provided without the other, that's a config mistake, report it.
			if (!sequence) {
				this._showError('Structure provided without a sequence');
				return;
			}
			if (!structure) {
				this._showError('Sequence provided without a structure');
				return;
			}
			if (sequence.length !== structure.length) {
				this._showError(`Sequence and structure have different length (${sequence.length} nt != ${structure.length} nt)`);
				return;
			}
			// Check all bracket types are balanced
			const _balErr = checkBracketBalance(structure);
			if (_balErr) {
				this._showError(_balErr);
				return;
			}
			this._lastConfig = config;
			this._lastCovTexts = []; // annotations must be re-applied explicitly for this new structure
			const {
				pairs,
				pseudoPairs
			} = parseDotBracket(structure);
			const result = this._layoutAlgo === 'naview' ? this._autoRotateLayout(drawRNANAView(pairs, sequence.length)) : this._layoutAlgo === 'radiate' ? drawRNARadiate(pairs, sequence.length) : this._pickLayout(pairs, sequence.length);
			const _loadedAlgo = this._layoutAlgo === 'auto' ? this._lastPickedAlgo : this._layoutAlgo;
			this._rna = {
				sequence,
				structure: config.structure, // keep original dot-bracket for APPEND
				coords: result.coords,
				centers: result.centers,
				pairs,
				pseudoPairs,
				n: sequence.length,
				values: values || null,
				colorMap: normalizeColorMap(config),
				helices: null,
				pairAnnotations: config.pairAnnotations || null,
				pairAnnotColorMap: normalizePairAnnotColorMap(config.pairAnnotColorMap),
				helixAnnotations: config.helixAnnotations?.length ? resolveHelixAnnotations(config.helixAnnotations, pairs, config.positionLabels) : null,
				isCovAnnot: !!(config.pairAnnotations?.length || config.helixAnnotations?.length),
				_algo: _loadedAlgo,
			};
			// Remember any explicitly-provided colorMap so file-loader reuses it after clear()
			this._rna.helices = buildHelixTree(pairs, sequence.length, result.centers);
			// Validate pair annotations before rendering
			if (this._rna.pairAnnotations) {
				const err = this._validatePairAnnotationsWithMap(this._rna.pairAnnotations, pairs, sequence.length, this._rna.pairAnnotColorMap);
				if (err) {
					this._showError(err);
					return;
				}
			}
			this._buildPairAnnotLegend(this._rna.pairAnnotColorMap, this._rna?.isCovAnnot);
			const np = pairs.reduce((s, p, i) => s + (p > i ? 1 : 0), 0) + pseudoPairs.length;
			if (this._sbSeq) this._sbSeq.textContent = `${sequence.length} bases`;
			if (this._sbPairs) this._sbPairs.textContent = `${np} pairs`;
			if (values) {
				this._updateLegend(this._rna.colorMap);
				// Show legend if  color-map is already active (e.g. showColors:true in config)
			}
			this._updateLegendVisibility();
			// Restore or hide indices based on this structure type.
			this._applyStructIndices(this._rna, config);
			this._render();
			this.fit();
		}
		// Load covariation data from .cov or .helixcov text onto the current structure.
		// Auto-detects the format: if the text contains RM_HELIX records it is treated
		// as a .helixcov file and routed to loadHelixCov(); otherwise it is parsed as a
		// standard .cov pair-annotation file.
		loadCov(covText) {
			if (!this._rna) throw new Error('No structure loaded — call load() first.');
			this._lastCovTexts = [...(this._lastCovTexts || []), covText]; // accumulate for reset()
			if (/^#\s+RM_HELIX\b/m.test(covText)) return this.loadHelixCov(covText);
			const pairs = parseCovFile(covText);
			const remapped = remapAnnotPairs(pairs, this._rna.positionLabels);
			// Build separate sets for nested vs pseudoknot pairs
			const pkSet = new Set(this._rna.pseudoPairs.map(ps => pairKey(ps.i, ps.j)));
			if (this._rna.ssConsPkPairs)
				for (const fps of Object.values(this._rna.ssConsPkPairs))
					for (const ps of fps) pkSet.add(pairKey(ps.i, ps.j));
			const allStructPairs = getStructurePairSet(this._rna.structure || '');
			const nestedStructPairs = new Set([...allStructPairs].filter(k => !pkSet.has(k)));
			const nestedCovPairs = remapped.filter(({
				i,
				j
			}) => nestedStructPairs.has(pairKey(i, j)));
			const pkCovPairs = remapped.filter(({
				i,
				j
			}) => pkSet.has(pairKey(i, j)));
			if (!nestedCovPairs.length && !pkCovPairs.length)
				buildAnnotationArrays(remapped, allStructPairs, 'cov', this._rna.label); // throws with proper message
			// Nested pairs → bounding boxes (existing flow)
			if (nestedCovPairs.length) {
				const {
					annotArr,
					pairAnnotColorMap
				} =
				buildAnnotationArrays(nestedCovPairs, nestedStructPairs, 'cov', this._rna.label);
				this._rna.pairAnnotations = annotArr;
				this._rna.pairAnnotColorMap = pairAnnotColorMap;
				this._buildPairAnnotLegend(pairAnnotColorMap, true);
			}
			// Pseudoknot pairs → per-base boxes + coloured arcs
			if (pkCovPairs.length) {
				const pkColorMap = buildAnnotColorMapAuto(pkCovPairs);
				this._rna.pseudoCovAnnotations = pkCovPairs.map(({
					i,
					j,
					category
				}) => ({
					i,
					j,
					color: pkColorMap ?
						(pkColorMap[category ?? ANNOT_MISSING_KEY] ?? ANNOT_DEFAULT_COLOR) :
						ANNOT_DEFAULT_COLOR,
				}));
			}
			this._rna.isCovAnnot = true;
			if (this._constructorConfig?.showPairAnnotations !== false) {
				this._showPairAnnotations = true;
				if (this._chkPAnnot) this._chkPAnnot.classList.add('rv--active');
			}
			// Sync trimmed-index annotations back to _base so _rebuildCurrentLayout
			// always has the canonical unshifted source regardless of ssEnds state.
			{
				const _layout = this._structLayouts[this._currentStructIdx];
				const _base = _layout?._base;
				if (_base && _base !== _layout) {
					const _shift = _base.ssEnds?.trimS || 0;
					const _unshift = (arr, keys) => arr?.map(p => {
						const r = {
							...p
						};
						for (const k of keys)
							if (r[k] != null) r[k] -= _shift;
						return r;
					});
					_base.pairAnnotations = _unshift(this._rna.pairAnnotations, ['i', 'j']) || _base.pairAnnotations;
					_base.pairAnnotColorMap = this._rna.pairAnnotColorMap || _base.pairAnnotColorMap;
					_base.helixAnnotations = this._rna.helixAnnotations?.map(h => ({
						...h,
						subHelices: h.subHelices.map(sh => ({
							pos5p: sh.pos5p.map(p => p - _shift),
							pos3p: sh.pos3p.map(p => p - _shift),
						}))
					})) || _base.helixAnnotations;
					_base.pseudoHelixCovAnnotations = _unshift(this._rna.pseudoHelixCovAnnotations, ['i', 'j']) || _base.pseudoHelixCovAnnotations;
					_base.pseudoCovAnnotations = _unshift(this._rna.pseudoCovAnnotations, ['i', 'j']) || _base.pseudoCovAnnotations;
					_base.isCovAnnot = this._rna.isCovAnnot;
				}
			}
			this._render();
		}
		// Load significant helix-level covariation from .helixcov text.
		// Draws a light-red bounding box around each significant helix.
		loadHelixCov(text) {
			if (!this._rna) throw new Error('No structure loaded — call load() first.');
			const helices = parseHelixCovFile(text).filter(h => h.significant);
			if (!helices.length) throw new Error('No significant helices found in .helixcov file.');
			const o2r = new Map();
			if (this._rna.positionLabels?.length) this._rna.positionLabels.forEach((col1, ri) => o2r.set(col1 - 1, ri));
			else
				for (let i = 0; i < this._rna.n; i++) o2r.set(i, i);
			const n = this._rna.n;
			const _pairsArr = buildPairsArray(this._rna.structure || '');
			// Build a combined partner map: ssConsPkPairs first, then pseudoPairs, then main structure.
			// Later entries overwrite earlier ones, so main structure pairs always take priority
			// for positions shared between the main helix and ssConsPkPairs (e.g. xc/sc pairs).
			const _partnerMap = new Map();
			if (this._rna.ssConsPkPairs)
				for (const fps of Object.values(this._rna.ssConsPkPairs))
					for (const ps of fps) {
						_partnerMap.set(ps.i, ps.j);
						_partnerMap.set(ps.j, ps.i);
					}
			for (const ps of this._rna.pseudoPairs) {
				_partnerMap.set(ps.i, ps.j);
				_partnerMap.set(ps.j, ps.i);
			}
			for (let i = 0; i < this._rna.n; i++) {
				if (_pairsArr[i] >= 0) {
					_partnerMap.set(i, _pairsArr[i]);
				}
			}
			const helixAnnotations = helices.map(h => {
				// Collect all rendered positions in the 5' arm range
				const ri5All = [];
				for (let c = h.start5p; c <= h.end5p; c++)
					if (o2r.has(c)) ri5All.push(o2r.get(c));
				// Map each 5' position directly to its structural partner.
				// Do NOT filter by a 3' column range — for reversed helices (c > d)
				// the actual partners may extend beyond the reported range end.
				const hp = ri5All
					.filter(r => _partnerMap.has(r))
					.map(r => ({
						ri5: r,
						ri3: _partnerMap.get(r)
					}))
					.sort((a, b) => a.ri5 - b.ri5);
				if (!hp.length) return null;
				// Group consecutive pairs (ri5+1, ri3-1) into sub-helices
				const subHelices = [];
				let cur = [hp[0]];
				for (let i = 1; i < hp.length; i++) {
					const pv = cur[cur.length - 1],
						nxt = hp[i];
					if (nxt.ri5 === pv.ri5 + 1 && nxt.ri3 === pv.ri3 - 1) cur.push(nxt);
					else {
						subHelices.push(cur);
						cur = [nxt];
					}
				}
				subHelices.push(cur);
				// Split sub-helices into nested and pseudoknot pairs.
				// PK helix type from RM_HELIX line takes priority; otherwise check structure brackets.
				const pkSet = new Set(this._rna.pseudoPairs.map(ps => pairKey(ps.i, ps.j)));
				if (this._rna.ssConsPkPairs)
					for (const fps of Object.values(this._rna.ssConsPkPairs))
						for (const ps of fps) pkSet.add(pairKey(ps.i, ps.j));
				const isPkHelix = h.helixType === 'PK' || h.helixType === 'XCOV';
				const nestedSubs = [],
					pkPairs = [];
				for (const sh of subHelices) {
					const nPos5p = [],
						nPos3p = [];
					for (let k = 0; k < sh.length; k++) {
						if (isPkHelix || pkSet.has(pairKey(sh[k].ri5, sh[k].ri3)))
							pkPairs.push({
								i: sh[k].ri5,
								j: sh[k].ri3
							});
						else {
							nPos5p.push(sh[k].ri5);
							nPos3p.push(sh[k].ri3);
						}
					}
					if (nPos5p.length) nestedSubs.push({
						pos5p: nPos5p,
						pos3p: nPos3p
					});
				}
				return {
					nestedSubs,
					pkPairs,
					evalue: h.evalue,
					pvalue: h.pvalue
				};
			}).filter(a => a?.nestedSubs?.length > 0 || a?.pkPairs?.length > 0);
			if (!helixAnnotations.length) throw new Error('No significant helix positions could be mapped to the current structure.');
			this._rna.helixAnnotations = helixAnnotations
				.map(a => ({
					subHelices: a.nestedSubs,
					pkPairs: a.pkPairs,
					evalue: a.evalue,
					pvalue: a.pvalue
				}));
			const pkGlowPairs = helixAnnotations.flatMap(a => a.pkPairs);
			if (pkGlowPairs.length) this._rna.pseudoHelixCovAnnotations = pkGlowPairs;
			this._rna.isCovAnnot = true;
			if (this._constructorConfig?.showPairAnnotations !== false) {
				this._showPairAnnotations = true;
				if (this._chkPAnnot) this._chkPAnnot.classList.add('rv--active');
			}
			this._buildPairAnnotLegend(this._rna.pairAnnotColorMap, true);
			// Sync trimmed-index annotations back to _base so _rebuildCurrentLayout
			// always has the canonical unshifted source regardless of ssEnds state.
			{
				const _layout = this._structLayouts[this._currentStructIdx];
				const _base = _layout?._base;
				if (_base && _base !== _layout) {
					const _shift = _base.ssEnds?.trimS || 0;
					const _unshift = (arr, keys) => arr?.map(p => {
						const r = {
							...p
						};
						for (const k of keys)
							if (r[k] != null) r[k] -= _shift;
						return r;
					});
					_base.pairAnnotations = _unshift(this._rna.pairAnnotations, ['i', 'j']) || _base.pairAnnotations;
					_base.pairAnnotColorMap = this._rna.pairAnnotColorMap || _base.pairAnnotColorMap;
					_base.helixAnnotations = this._rna.helixAnnotations?.map(h => ({
						...h,
						subHelices: h.subHelices.map(sh => ({
							pos5p: sh.pos5p.map(p => p - _shift),
							pos3p: sh.pos3p.map(p => p - _shift),
						}))
					})) || _base.helixAnnotations;
					_base.pseudoHelixCovAnnotations = _unshift(this._rna.pseudoHelixCovAnnotations, ['i', 'j']) || _base.pseudoHelixCovAnnotations;
					_base.pseudoCovAnnotations = _unshift(this._rna.pseudoCovAnnotations, ['i', 'j']) || _base.pseudoCovAnnotations;
					_base.isCovAnnot = this._rna.isCovAnnot;
				}
			}
			this._render();
		}
		// Fit the structure to fill the canvas
		fit() {
			if (!this._rna) return;
			const pw = this._canvas.clientWidth,
				ph = this._canvas.clientHeight;
			// Canvas not yet laid out — retry on next frame
			if (!pw || !ph) {
				requestAnimationFrame(() => this.fit());
				return;
			}
			const {
				coords,
				n
			} = this._rna;
			let minX = Infinity,
				minY = Infinity,
				maxX = -Infinity,
				maxY = -Infinity;
			for (let i = 0; i < n; i++) {
				minX = Math.min(minX, coords[i].x);
				minY = Math.min(minY, coords[i].y);
				maxX = Math.max(maxX, coords[i].x);
				maxY = Math.max(maxY, coords[i].y);
			}
			const pad = 50;
			const sx = (pw - 2 * pad) / (maxX - minX + BASE_PAIR_DISTANCE);
			const sy = (ph - 2 * pad) / (maxY - minY + BASE_PAIR_DISTANCE);
			this._vscale = Math.min(sx, sy, 2);
			this._vx = pw / 2 - this._vscale * ((minX + maxX) / 2);
			this._vy = ph / 2 - this._vscale * ((minY + maxY) / 2);
			this._applyTransform();
		}
		// Reset layout to the initial radiate drawing
		reset() {
			if (!this._lastConfig) return;
			const savedIdx = this._currentStructIdx;
			const savedCovs = this._lastCovTexts ?? [];
			this.load(this._lastConfig);
			// Re-apply annotations loaded via loadCov() (not captured in _lastConfig)
			for (const cov of savedCovs) this.loadCov(cov);
			if (savedIdx > 0 && savedIdx < this._structLayouts.length) {
				this._currentStructIdx = savedIdx;
				this._rna = this._structLayouts[savedIdx];
				this._buildStructSwitcher();
				this._render();
				this.fit();
			}
		}
		// Show or hide base-position index labels
		setShowIndices(val) {
			this._showIndices = !!val;
			if (this._chkIndices) this._chkIndices.classList.toggle('rv--active', this._showIndices);
			this._render();
		}
		// Show or hide color-map coloring on bases
		setShowColors(val) {
			this._showColors = !!val;
			if (this._chkColors) this._chkColors.classList.toggle('rv--active', this._showColors);
			this._updateLegendVisibility();
			this._render();
		}
		// Toggle pair-annotation boxes and their legend on/off
		setShowPairAnnotations(val) {
			this._showPairAnnotations = !!val;
			if (this._chkPAnnot) this._chkPAnnot.classList.toggle('rv--active', this._showPairAnnotations);
			this._buildPairAnnotLegend(this._rna?.pairAnnotColorMap, this._rna?.isCovAnnot);
			this._render();
		}
		// Toggle SS_cons annotations (R3D) on or off
		// Toggle inset panels visibility (Stockholm PK/R3D structures)
		setShowInsets(val) {
			this._showR3dInsets = !!val;
			if (this._chkR3dInsets) this._chkR3dInsets.classList.toggle('rv--active', this._showR3dInsets);
			if (!this._alnActive) this._render();
		}
		// Toggle annotation labels/lines visibility (Stockholm PK/R3D structures)
		setShowLabels(val) {
			this._showR3dLabels = !!val;
			if (this._chkR3dLabels) this._chkR3dLabels.classList.toggle('rv--active', this._showR3dLabels);
			if (!this._alnActive) this._render();
		}
		// Toggle display of trimmed single-stranded 5'/3' end bases on or off.
		// Has no effect if the current structure has no trimmed ss ends.
		setShowSsEnds(val) {
			const show = !!val;
			if (show === this._showSsEnds) return;
			this._showSsEnds = show;
			if (this._chkSsEnds) this._chkSsEnds.classList.toggle('rv--active', this._showSsEnds);
			this._rebuildCurrentLayout();
		}
		// Switch the layout algorithm and re-renders the current structure if one is loaded
		setLayoutAlgorithm(algo) {
			const valid = ['auto', 'naview', 'radiate'];
			if (!valid.includes(algo)) throw new Error(`Unknown layout algorithm "${algo}". Use: ${valid.join(', ')}`);
			this._layoutAlgo = algo;
			if (this._rna) {
				this.load(this._lastConfig);
			}
		}
		/* 
         Returns a discrete SHAPE-reactivity colormap that adapts to the current
		 theme: the unreactive band is black on light backgrounds, white on dark.
		 - 0-0.3: unreactive (black / white)
		 - 0.3-0.7: moderately reactive (yellow)
		 - 0.7+: reactive (red)
		*/
		_getDefaultShapeColorMap() {
			const bg = getComputedStyle(this._root).getPropertyValue('--rv-bg').trim() || '#ffffff';
			const dark = this._colorLuminance(bg) < 0.4;
			return {
				type: 'discrete',
				min: 0,
				nanColor: '#999999',
				stops: [{
					value: 0.3,
					color: dark ? '#e0e0e0' : '#111111'
				}, {
					value: 0.7,
					color: '#f5c518'
				}, {
					value: 1.0,
					color: '#cc0000'
				}, ],
			};
		}
		// Relative luminance of a hex  color (0 = black, 1 = white).
		// Returns true if at least 15% of bases are within the current canvas viewport
		_colorLuminance(hex) {
			const h = hex.replace(/^#/, '');
			if (h.length < 6) return 0.5;
			const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		}
		// Toggle toolbar position between 'top' and 'left'
		_toggleToolbarPos() {
			const next = this._toolbarPos === 'left' ? 'top' : 'left';
			this._toolbarPos = next;
			this._root.className = this._root.className.replace(/\brv--toolbar-\w+\b/g, '').trim();
			if (next !== 'top') this._root.classList.add(`rv--toolbar-${next}`);
			if (this._toolbarPosBtn) this._toolbarPosBtn.title = next === 'left' ? 'Move toolbar to top' : 'Move toolbar to left';
		}
		// Make a panel draggable from its header. Uses Pointer Events + setPointerCapture
		// so drag works regardless of which child element is clicked.
		_makeDraggable(panel) {
			const handle = panel.querySelector('.rv-drag-handle') || panel.querySelector('.rv-upload-hdr');
			if (!handle) return;
			let sx, sy, sl, st, active = false;
			// Blocks the browser's native text-drag which races with our handler
			handle.addEventListener('dragstart', e => e.preventDefault());
			handle.addEventListener('pointerdown', e => {
				if (e.button !== 0 || e.target.closest('button')) return;
				e.preventDefault();
				// First drag, convert CSS transform centering, explicit left/top
				if (!panel.dataset.dragged) {
					const pr = (panel.offsetParent || document.body).getBoundingClientRect();
					const cr = panel.getBoundingClientRect();
					panel.style.transform = 'none';
					panel.style.left = (cr.left - pr.left) + 'px';
					panel.style.top = (cr.top - pr.top) + 'px';
					panel.dataset.dragged = '1';
				}
				sx = e.clientX;
				sy = e.clientY;
				sl = parseFloat(panel.style.left);
				st = parseFloat(panel.style.top);
				active = true;
				// Capture ensures pointermove fires here even when pointer leaves handle
				handle.setPointerCapture(e.pointerId);
			});
			handle.addEventListener('pointermove', e => {
				if (!active) return;
				const par = panel.offsetParent || document.body;
				panel.style.left = Math.max(0, Math.min(par.clientWidth - panel.offsetWidth, sl + e.clientX - sx)) + 'px';
				panel.style.top = Math.max(0, Math.min(par.clientHeight - panel.offsetHeight, st + e.clientY - sy)) + 'px';
			});
			handle.addEventListener('pointerup', () => {
				active = false;
			});
			handle.addEventListener('pointercancel', () => {
				active = false;
			});
		}
		// Render pseudoknots for Stockholm structures using R3D-style arcs + mini helix panels.
		// Returns an array of stem descriptors for panel layout.
		// ── Shared Stockholm rendering helpers ──────────────────────────────────
		// These are used by both _render() (main structure) and _renderPkStockholm() (insets)
		// so any change to bond length, glow, layer order etc. only needs to happen once.

		/** White eraser circle that sits behind a base letter */
		/** Returns true if b1/b2 form a canonical Watson-Crick or wobble pair */
		_isCanonPair(b1, b2) {
			const a = b1.toUpperCase(),
				b = b2.toUpperCase();
			return (a === 'G' && b === 'C') || (a === 'C' && b === 'G') ||
				(a === 'A' && b === 'U') || (a === 'U' && b === 'A') ||
				(a === 'A' && b === 'T') || (a === 'T' && b === 'A') ||
				(a === 'G' && b === 'U') || (a === 'U' && b === 'G') ||
				(a === 'G' && b === 'T') || (a === 'T' && b === 'G');
		}

		/**
		 * Copies all runtime annotation properties from one layout object to another.
		 * Used when recomputing coordinates (layout switch, reset) to avoid losing
		 * annotations that were loaded post-layout via loadCov() or drag-drop.
		 */
		_copyLayoutAnnotations(src, dst) {
			const props = ['helixAnnotations', 'isCovAnnot', 'pseudoCovAnnotations',
				'pseudoHelixCovAnnotations', 'ssConsFeatures', 'ssConsPkPairs', 'ssEnds'
			];
			for (const p of props)
				if (src[p]) dst[p] = src[p];
		}

		/** Creates an SVG line element. cls is optional. Does not append it. */
		_mkSvgLine(x1, y1, x2, y2, cls) {
			const l = document.createElementNS(NS, 'line');
			l.setAttribute('x1', x1);
			l.setAttribute('y1', y1);
			l.setAttribute('x2', x2);
			l.setAttribute('y2', y2);
			if (cls) l.setAttribute('class', cls);
			return l;
		}

		_mkEraserCircle(cx, cy, baseR, bgColor) {
			const er = document.createElementNS(NS, 'circle');
			er.setAttribute('cx', cx);
			er.setAttribute('cy', cy);
			er.setAttribute('r', baseR * 1.5);
			er.style.cssText = `fill:${bgColor};stroke:none`;
			return er;
		}

		/** Base letter (text) or fill circle for a Stockholm base */
		_mkBaseElement(cx, cy, bd, baseR, bsW) {
			if (bd.letter !== null && bd.letter !== undefined) {
				const t = document.createElementNS(NS, 'text');
				t.setAttribute('x', cx);
				t.setAttribute('y', cy);
				t.setAttribute('dy', '0.35em');
				t.setAttribute('text-anchor', 'middle');
				t.style.cssText = `font-size:${baseR * 3}px;font-family:monospace;font-weight:bold;fill:${bd.textColor || '#1f2328'}`;
				t.textContent = bd.letter;
				return t;
			} else if (bd.fillColor) {
				const c = document.createElementNS(NS, 'circle');
				c.setAttribute('cx', cx);
				c.setAttribute('cy', cy);
				c.setAttribute('r', baseR);
				c.style.cssText = `fill:${bd.fillColor};stroke:#111111;stroke-width:${bsW}`;
				return c;
			}
			return null;
		}

		/**
		 * Stockholm bond between two base centres at (x1,y1) and (x2,y2).
		 * Returns an array of SVG elements (line and/or dot).
		 * Shortens the line by `shrinkEach` on each end to avoid overlapping eraser circles.
		 */
		_mkStockholmBond(x1, y1, x2, y2, b1, b2, baseR, dotR) {
			const isCanon = this._isCanonPair(b1, b2);
			const mkL = (ax, ay, bx, by) => this._mkSvgLine(ax, ay, bx, by, 'rv-basepair');
			const mkDot = (cx, cy, cls = 'rv-bp-noncanon') => {
				const c = document.createElementNS(NS, 'circle');
				c.setAttribute('class', cls);
				c.setAttribute('cx', cx);
				c.setAttribute('cy', cy);
				c.setAttribute('r', dotR);
				return c;
			};
			const len = Math.hypot(x2 - x1, y2 - y1) || 1;
			const shrink = baseR * 1.44 / len;
			const dx = x2 - x1,
				dy = y2 - y1;
			const sx1 = x1 + dx * shrink,
				sy1 = y1 + dy * shrink;
			const sx2 = x2 - dx * shrink,
				sy2 = y2 - dy * shrink;
			const mx = (x1 + x2) / 2,
				my = (y1 + y2) / 2;
			if (!isCanon) return [mkDot(mx, my)];
			if (len * (1 - 2 * shrink) <= 0) return []; // too short to draw
			return [mkL(sx1, sy1, sx2, sy2)];
		}

		/**
		 * Pair-annotation rectangle centred between two base positions.
		 * Works for any angle — used in both main structure and insets.
		 */
		_mkPairAnnotRect(x1, y1, x2, y2, color, opa, sw, pad, baseR) {
			const dist = Math.hypot(x2 - x1, y2 - y1);
			const w = dist + pad * 2;
			const h = pad * 2;
			const mx = (x1 + x2) / 2,
				my = (y1 + y2) / 2;
			const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
			const rect = document.createElementNS(NS, 'rect');
			rect.setAttribute('x', mx - w / 2);
			rect.setAttribute('y', my - h / 2);
			rect.setAttribute('width', w);
			rect.setAttribute('height', h);
			rect.setAttribute('rx', baseR * 0.6);
			rect.style.fill = color;
			rect.style.fillOpacity = String(opa);
			rect.style.stroke = color;
			rect.style.strokeWidth = String(sw);
			rect.style.strokeOpacity = String(Math.min(1, opa * 2.5));
			rect.setAttribute('transform', `rotate(${angle},${mx},${my})`);
			return rect;
		}

		_renderPkStockholm(gLines, gLabels, coords, n, pseudoPairs, pairs, sequence, cs, skipArcs = false, featureName = null, stemIdxOffset = 0) {
			if (!pseudoPairs?.length || !this._pkPanelsEl) return 0;

			// ── Group pseudoknot pairs into stems ──────────────────────────────
			const sorted = [...pseudoPairs].sort((a, b) => a.i - b.i);
			const stems = [];
			let cur = null;
			for (const ps of sorted) {
				if (cur) {
					const last = cur[cur.length - 1];
					if (ps.i === last.i + 1 &&
						(ps.j === last.j - 1 || ps.j === last.j + 1)) {
						cur.push(ps);
						continue;
					}
				}
				if (cur) stems.push(cur);
				cur = [ps];
			}
			if (cur) stems.push(cur);

			// ── Build R3D coverage map: pos → feature name ────────────────────
			// Used to: (a) avoid double-labelling PK positions already in R3D,
			// and (b) adopt the R3D feature name as the inset label for that stem.
			const r3dPosToName = new Map(); // residue index → R3D feature name
			if (this._rna.ssConsFeatures) {
				for (const [name, positions] of Object.entries(this._rna.ssConsFeatures))
					for (const p of positions) r3dPosToName.set(p, name);
			}
			// For each stem, resolve the display label:
			// - If R3D is ON and covers >= 1 position of the 5' arm, use that R3D feature name.
			// - Otherwise use the generated 'PK1', 'PK2', ... name.
			// Store resolved labels so the inset panels use the same names.
			// Label: always use the R3D feature name when the SS_cons covers this stem,
			// regardless of whether the R3D toggle is currently on or off.
			const stemLabels = stems.map((stem, si) => {
				if (featureName) return featureName;
				for (const p of stem.map(ps => ps.i))
					if (r3dPosToName.has(p)) return r3dPosToName.get(p);
				for (const p of stem.map(ps => ps.j))
					if (r3dPosToName.has(p)) return r3dPosToName.get(p);
				return `PK${si + 1}`;
			});

			// ── R3D-style arcs on main structure (non-skip path) ──────────────────
			stems.forEach((stem, si) => {
				const label = stemLabels[si];
				const label2 = label + "'";
				const r3dOn = this._showR3dInsets !== false;
				const pos5 = stem.map(p => p.i).filter(p => !r3dOn || !r3dPosToName.has(p));
				const pos3 = stem.map(p => p.j).filter(p => !r3dOn || !r3dPosToName.has(p));
				if (!skipArcs) {
					if (pos5.length) this._renderSsConsAnnotations(gLines, gLabels, coords, n, {
						[label]: pos5
					}, pairs, pseudoPairs, cs);
					if (pos3.length) this._renderSsConsAnnotations(gLines, gLabels, coords, n, {
						[label2]: pos3
					}, pairs, pseudoPairs, cs);
				}
			});

			// ── CSS vars ────────────────────────────────────────────────────────
			const baseR = 11; // fixed in insets — not affected by the base size settings slider
			const bpW = parseFloat(cs.getPropertyValue('--rv-basepair-width')) || 2.2;
			const bbW = parseFloat(cs.getPropertyValue('--rv-backbone-width')) || 2;
			const bbCol = cs.getPropertyValue('--rv-backbone').trim() || '#1f2328';
			const bpCol = cs.getPropertyValue('--rv-basepair').trim() || '#1f2328';
			const dotR = parseFloat(cs.getPropertyValue('--rv-noncanon-dot-r')) || 4.5;
			const BP_OFF = 2.8;
			const bgCol = cs.getPropertyValue('--rv-bg').trim() || '#ffffff';
			const pkColor = cs.getPropertyValue('--rv-pseudopair').trim() || '#1f2328';
			const helixColor = cs.getPropertyValue('--rv-helix-annot-color').trim() || '#aff0a8';
			const helixPad = baseR * 1.7; // fixed in insets, not affected by settings slider
			const pAnnotOpa = parseFloat(cs.getPropertyValue('--rv-pair-annot-opacity')) || 0.5;
			const pAnnotSW = parseFloat(cs.getPropertyValue('--rv-pair-annot-stroke-width')) || 1.5;
			const pAnnotPad = parseFloat(cs.getPropertyValue('--rv-pair-annot-padding')) || 5;
			const bsW = parseFloat(cs.getPropertyValue('--rv-base-stroke-width')) || 2;

			// ── Panel geometry ─────────────────────────────────────────────────
			const colSep = baseR * 6;
			const rowStep = baseR * 3.5;
			const _helixPadCS = baseR * 1.7; // inset helix pad is fixed, not controlled by settings slider
			const _annPadInset = _helixPadCS * 1.35; // helix box padding used in insets
			const col5x = _annPadInset + baseR * 0.5; // shift right so box doesn't clip left edge
			const col3x = col5x + colSep;
			const svgW = col3x + _annPadInset + baseR * 0.5; // enough room on right side too
			// Vertical padding: equal top and bottom
			// vPad must be at least annPad so the helix box isn't clipped at top/bottom
			const vPad = _annPadInset + baseR * 0.5;

			// When featureName is set (ssConsPkPairs call), all stems belong to the same
			// named feature and go into ONE panel with a gap between runs.
			// When featureName is null (pseudoPairs call), one panel per stem as before.
			const stemGroups = featureName ?
				[stems.map((stem, si) => ({
					stem,
					si
				}))] // all stems → one group
				:
				stems.map((stem, si) => [{
					stem,
					si
				}]); // one stem per group

			const betweenStemGap = rowStep * 0.8;

			stemGroups.forEach(group => {
				// Build combined inCoords / inPairs for all stems in this group
				const inCoords = {};
				const inPairs = {};
				let curY = vPad;
				group.forEach(({
					stem
				}, runIdx) => {
					stem.forEach((ps, k) => {
						inCoords[ps.i] = {
							x: col5x,
							y: curY + k * rowStep
						};
						inCoords[ps.j] = {
							x: col3x,
							y: curY + k * rowStep
						};
						inPairs[ps.i] = ps.j;
						inPairs[ps.j] = ps.i;
					});
					curY += stem.length * rowStep + (runIdx < group.length - 1 ? betweenStemGap : 0);
				});
				const totalBp = group.reduce((s, {
					stem
				}) => s + stem.length, 0);
				const svgH = curY - rowStep + baseR * 2 + baseR * 0.8;
				const label = stemLabels[group[0].si];
				const si = group[0].si; // representative si for this group
				const nbp = group[0].stem.length; // for single-stem compat

				const panel = document.createElement('div');
				panel.className = 'rv-pk-panel';
				panel.setAttribute('data-pk', si + stemIdxOffset);
				const _cw = this._canvas?.clientWidth || 0;
				const _pw = _cw > 0 ? Math.round(_cw / 17.5) : 120;
				panel.style.width = _pw + 'px';

				const h4 = document.createElement('h4');
				h4.textContent = label;
				panel.appendChild(h4);

				const svg = document.createElementNS(NS, 'svg');
				svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
				svg.setAttribute('width', _pw);
				svg.setAttribute('height', Math.round(svgH * _pw / svgW));
				svg.style.cssText = 'display:block';

				const style = document.createElementNS(NS, 'style');
				style.textContent = [
					`.rv-basepair{stroke:${bpCol};stroke-width:${bpW};fill:none;stroke-linecap:round}`,
					`.rv-bp-dot{fill:${bpCol};stroke:none}`,
					`.rv-bp-noncanon{fill:${bpCol};stroke:none}`,
				].join('');
				svg.appendChild(style);

				// SVG layer groups — order (bottom to top):
				// backbone → eraser circles → helix boxes → pair annot boxes → bases → bonds
				const ins_bb = document.createElementNS(NS, 'g'); // backbone
				const ins_era = document.createElementNS(NS, 'g'); // white eraser circles
				const ins_hbox = document.createElementNS(NS, 'g'); // helix annotation boxes
				const ins_abox = document.createElementNS(NS, 'g'); // pair annotation boxes
				const ins_base = document.createElementNS(NS, 'g'); // base letters / fill circles
				const ins_bp = document.createElementNS(NS, 'g'); // bonds (base-pair lines) — topmost
				svg.append(ins_bb, ins_era, ins_hbox, ins_abox, ins_base, ins_bp);

				// Rendering order:
				// 1. backbone
				// 2. eraser circles (white, behind everything else)
				// 3. helix annotation boxes
				// 4. pair annotation boxes
				// 5. bases (letters / fill circles)
				// 6. bonds (base-pair lines) — on top so they aren't hidden by annotation boxes

				// All pairs in this panel (across all runs)
				const allPairs = group.flatMap(({
					stem
				}) => stem);

				// ── 1. Backbone (one line per run, not spanning gaps) ──────────
				group.forEach(({
					stem
				}) => {
					if (stem.length < 2) return;
					const y0 = inCoords[stem[0].i].y;
					const yN = inCoords[stem[stem.length - 1].i].y;
					[col5x, col3x].forEach(cx => {
						const l = document.createElementNS(NS, 'line');
						l.setAttribute('x1', cx);
						l.setAttribute('y1', y0);
						l.setAttribute('x2', cx);
						l.setAttribute('y2', yN);
						l.style.cssText = `stroke:${bbCol};stroke-width:${bbW};stroke-linecap:round`;
						ins_bb.appendChild(l);
					});
				});

				// ── 2. White eraser circles ───────────────────────────────────
				allPairs.forEach(ps => {
					[ps.i, ps.j].forEach(ri => {
						const bd = this._rna.baseDisplay?.[ri];
						if (!bd || bd.skip) return;
						const cx = ri === ps.i ? col5x : col3x;
						const ry = inCoords[ri].y;
						if (bd.letter !== null && bd.letter !== undefined)
							ins_era.appendChild(this._mkEraserCircle(cx, ry, baseR, bgCol));
					});
				});

				// ── 4. Helix annotation box ────────────────────────────────────
				if (this._showPairAnnotations && this._rna.helixAnnotations?.length) {
					for (const ann of this._rna.helixAnnotations) {
						const hasPair = (ann.subHelices || []).some(sh =>
								sh.pos5p.some(ri => allPairs.some(p => p.i === ri || p.j === ri)) ||
								sh.pos3p.some(ri => allPairs.some(p => p.i === ri || p.j === ri))) ||
							(ann.pkPairs || []).some(pk => allPairs.some(p =>
								(p.i === pk.i && p.j === pk.j) || (p.i === pk.j && p.j === pk.i)));
						if (!hasPair) continue;
						const annPad = ann.padding != null ? ann.padding * 1.35 : _annPadInset;
						group.forEach(({
							stem: runStem
						}) => {
							const inRun = runStem.filter(p =>
								(ann.subHelices || []).some(sh => sh.pos5p.includes(p.i) || sh.pos3p.includes(p.j)) ||
								(ann.pkPairs || []).some(pk => (pk.i === p.i && pk.j === p.j) || (pk.i === p.j && pk.j === p.i)));
							if (!inRun.length) return;
							const yVals = inRun.map(p => inCoords[p.i].y);
							const yTop = Math.min(...yVals) - annPad;
							const yBot = Math.max(...yVals) + annPad;
							const bw = (col3x - col5x) + annPad * 2;
							const bh = yBot - yTop;
							const rx = Math.min(baseR * 0.6, bw / 2, bh / 2);
							const rect = document.createElementNS(NS, 'rect');
							rect.setAttribute('x', col5x - annPad);
							rect.setAttribute('y', yTop);
							rect.setAttribute('width', bw);
							rect.setAttribute('height', bh);
							rect.setAttribute('rx', rx);
							rect.setAttribute('ry', rx);
							rect.setAttribute('fill', ann.color ?? helixColor);
							rect.setAttribute('fill-opacity', String(ann.opacity ?? (parseFloat(cs?.getPropertyValue('--rv-helix-annot-opacity')) || 0.5)));
							rect.setAttribute('stroke', ann.color ?? helixColor);
							rect.setAttribute('stroke-opacity', '0.45');
							rect.setAttribute('stroke-width', String(ann.strokeWidth ?? 1.5));
							ins_hbox.appendChild(rect);
						});
						break;
					}
				}

				// ── 5. Annotation boxes ────────────────────────────────────────
				if (this._showPairAnnotations) {
					for (const ann of (this._rna.pairAnnotations || [])) {
						let ai = ann.i,
							aj = ann.j;
						if (ai != null && aj != null) {
							if (allPairs.some(p => (p.i === ai && p.j === aj) || (p.i === aj && p.j === ai))) {
								// exact match
							} else if (inPairs[ai] != null && inCoords[ai]) {
								aj = inPairs[ai];
							} else if (inPairs[aj] != null && inCoords[aj]) {
								ai = inPairs[aj];
							} else continue;
						} else if (ai != null) {
							aj = inPairs[ai];
							if (aj == null) continue;
						} else if (aj != null) {
							ai = inPairs[aj];
							if (ai == null) continue;
						} else continue;
						const ic5 = inCoords[ai],
							ic3 = inCoords[aj];
						if (!ic5 || !ic3) continue;
						let color = ann.color;
						if (!color && ann.key != null && this._rna.pairAnnotColorMap) {
							const e2 = this._rna.pairAnnotColorMap.find(e => e.key === ann.key);
							if (e2) color = e2.color;
						}
						ins_abox.appendChild(this._mkPairAnnotRect(
							ic5.x, ic5.y, ic3.x, ic3.y,
							color || '#ffffff', ann.opacity ?? pAnnotOpa, ann.strokeWidth ?? pAnnotSW, ann.padding ?? pAnnotPad, baseR));
					}
					for (const {
							i,
							j,
							color
						}
						of(this._rna.pseudoCovAnnotations || [])) {
						if (!allPairs.some(p => (p.i === i && p.j === j) || (p.i === j && p.j === i))) continue;
						const ic5 = inCoords[i],
							ic3 = inCoords[j];
						if (!ic5 || !ic3) continue;
						ins_abox.appendChild(this._mkPairAnnotRect(
							ic5.x, ic5.y, ic3.x, ic3.y,
							color, pAnnotOpa, pAnnotSW, pAnnotPad, baseR));
					}
				}

				// ── 5. Base letters / fill circles ────────────────────────────
				allPairs.forEach(ps => {
					[
						[col5x, ps.i],
						[col3x, ps.j]
					].forEach(([cx, ri]) => {
						const bd = this._rna.baseDisplay?.[ri];
						if (!bd || bd.skip) return;
						const el = this._mkBaseElement(cx, inCoords[ri].y, bd, baseR, bsW);
						if (el) ins_base.appendChild(el);
					});
				});

				// ── 6. Bonds (topmost) ─────────────────────────────────────────
				allPairs.forEach(ps => {
					const ry = inCoords[ps.i].y;
					const b5 = (sequence?.[ps.i] || '?').toUpperCase();
					const b3 = (sequence?.[ps.j] || '?').toUpperCase();
					this._mkStockholmBond(col5x, ry, col3x, ry, b5, b3, baseR, dotR)
						.forEach(el => ins_bp.appendChild(el));
				});

				panel.appendChild(svg);

				// ── Hover ──────────────────────────────────────────────────────
				const stemPositions = allPairs.flatMap(p => [p.i, p.j]);
				panel.addEventListener('mouseenter', () => {
					const glowSize = parseFloat(cs.getPropertyValue('--rv-inset-hover-glow')) || 6;
					stemPositions.forEach(idx => {
						const grp = this._scene.querySelector(`g[data-idx="${idx}"]`);
						if (!grp) return;
						grp._pkOrig = {
							filter: grp.style.filter
						};
						grp.style.filter = `drop-shadow(0 0 ${glowSize * 0.5}px ${pkColor}) drop-shadow(0 0 ${glowSize}px ${pkColor})`;
					});
				});
				panel.addEventListener('mouseleave', () => {
					stemPositions.forEach(idx => {
						const grp = this._scene.querySelector(`g[data-idx="${idx}"]`);
						if (!grp?._pkOrig) return;
						grp.style.filter = grp._pkOrig.filter;
						delete grp._pkOrig;
					});
				});

				this._pkPanelsEl.appendChild(panel);
			});

			this._pkPanelsEl.style.display = 'flex';

			// ── Resize panels + multi-column layout ───────────────────────────
			requestAnimationFrame(() => {
				const container = this._pkPanelsEl;
				if (!container) return;
				const panels = Array.from(container.children);
				if (!panels.length) return;

				// Step 1: constrain each panel to 1/15th of canvas width via CSS variable
				const canvasW = this._canvas?.clientWidth || container.parentElement?.clientWidth || 0;
				const panelW = canvasW > 0 ? Math.round(canvasW / 15) : 120;
				this._root.style.setProperty('--rv-inset-max-width', panelW + 'px');

				// Step 2: multi-column layout (needs a fresh rAF so browser reflects new sizes)
				requestAnimationFrame(() => {
					const canvasH = this._canvas?.clientHeight || container.parentElement?.clientHeight || 600;
					const available = canvasH - 52 - 16 - 16;
					const gap = 8;
					const heights = panels.map(p => p.getBoundingClientRect().height || p.offsetHeight);

					const cols = [
						[]
					];
					let colH = 0;
					for (let i = 0; i < panels.length; i++) {
						const next = colH + (cols[cols.length - 1].length > 0 ? gap : 0) + heights[i];
						if (next > available && cols[cols.length - 1].length > 0) {
							cols.push([]);
							colH = 0;
						}
						cols[cols.length - 1].push(i);
						colH += (cols[cols.length - 1].length > 1 ? gap : 0) + heights[i];
					}
					if (cols.length === 1) return;
					cols.forEach((col, ci) => {
						let y = 0;
						col.forEach(i => {
							panels[i].style.position = 'absolute';
							panels[i].style.left = (ci * (panelW + gap)) + 'px';
							panels[i].style.top = y + 'px';
							y += heights[i] + gap;
						});
					});
					container.style.width = (cols.length * (panelW + gap) - gap) + 'px';
					container.style.height = Math.max(...cols.map(col =>
						col.reduce((s, i) => s + heights[i] + gap, 0) - gap
					)) + 'px';
				});
			});
			return stemGroups.length;
		}

		_renderSsConsAnnotations(gLines, gLabels, coords, n, features, pairs, pseudoPairs, cs) {
			const cx = coords.reduce((s, c) => s + c.x, 0) / n;
			const cy = coords.reduce((s, c) => s + c.y, 0) / n;

			// Compute signed area of backbone polygon to determine winding order.
			// Positive = counterclockwise (SVG y-down: clockwise visually) → outside is LEFT of forward direction.
			// We use this to flip normals globally so they always point outside.
			let signedArea = 0;
			for (let i = 0; i < n; i++) {
				const j = (i + 1) % n;
				signedArea += coords[i].x * coords[j].y - coords[j].x * coords[i].y;
			}
			// outwardSign: +1 means left-perpendicular (-dy, dx) points outside, -1 means right does
			const outwardSign = signedArea >= 0 ? -1 : 1;
			const bbW = parseFloat(cs.getPropertyValue('--rv-backbone-width')) || 2;
			const baseR = parseFloat(cs.getPropertyValue('--rv-base-radius')) || 11;
			const idxOff = parseFloat(cs.getPropertyValue('--rv-base-index-offset')) || 26;
			const lineCol = cs.getPropertyValue('--rv-text').trim() || '#1f2328';
			const lblCol = cs.getPropertyValue('--rv-base-index-color').trim() || '#656d76';
			const bgCol = cs.getPropertyValue('--rv-bg').trim() || '#ffffff';
			// Auto-scale label font size so labels stay ~13px on screen regardless of structure size
			const _minX = Math.min(...coords.map(c => c.x)),
				_maxX = Math.max(...coords.map(c => c.x));
			const _minY = Math.min(...coords.map(c => c.y)),
				_maxY = Math.max(...coords.map(c => c.y));
			const _pw = this._canvas?.clientWidth || 800;
			const _ph = this._canvas?.clientHeight || 600;
			const _fitScale = Math.min((_pw - 100) / ((_maxX - _minX) || 1), (_ph - 100) / ((_maxY - _minY) || 1), 2);
			const lSz = Math.min(baseR * 3, Math.max(baseR * 0.5, 13 / _fitScale));
			const lFont = cs.getPropertyValue('--rv-base-index-font').trim() || 'monospace';
			// pad < baseR+idxOff so ss_cons lines sit inside the index label radius;
			// loop indices go inward so no conflict; helix indices already outside
			const pad = baseR + lSz * 1.2;

			// ── Pseudoknot partner map ─────────────────────────────────────────
			const pkPartner = new Map();
			for (const p of pseudoPairs) {
				pkPartner.set(p.i, p.j);
				pkPartner.set(p.j, p.i);
			}

			// ── Helix position set for arc-vs-line decision ────────────────────
			const helixPos = new Set();
			for (let i = 0; i < n; i++) {
				if (pairs[i] >= 0) helixPos.add(i);
			}

			// Pre-pass: if any position in a feature's run touches a helix base,
			// mark ALL positions in that run as helix-like so overlapping features
			// (e.g. tr_6 and rm2_csra_motif.rev sharing the same bases) both use
			// straight lines rather than one curve and one straight line.
			// We must do this before rendering so all features see the same helixPos.
			for (const [, positions] of Object.entries(features)) {
				if (!positions.length) continue;
				// Use a simple gap split here (same threshold as toRuns)
				const runs2 = [];
				let r2 = [positions[0]];
				for (let k = 1; k < positions.length; k++) {
					if (positions[k] <= positions[k - 1] + 3) r2.push(positions[k]);
					else {
						runs2.push(r2);
						r2 = [positions[k]];
					}
				}
				runs2.push(r2);
				for (const run of runs2) {
					if (run.some(i => helixPos.has(i)))
						run.forEach(i => helixPos.add(i));
				}
			}

			// ── Canvas occupancy map ───────────────────────────────────────────
			const occupied = [];
			const addOccupied = (cx2, cy2, tw, th) =>
				occupied.push({
					x: cx2 - tw / 2,
					y: cy2 - th / 2,
					w: tw,
					h: th
				});
			const isOccupied = (cx2, cy2, tw, th) => {
				const lx = cx2 - tw / 2,
					ly = cy2 - th / 2;
				return occupied.some(o =>
					lx < o.x + o.w + 2 && lx + tw > o.x - 2 && ly < o.y + o.h + 2 && ly + th > o.y - 2);
			};

			// Pre-fill occupancy with index label boxes AND base circle footprints
			for (let i = 0; i < n; i++) {
				// Base circle — prevents labels landing on the structure
				addOccupied(coords[i].x, coords[i].y, baseR * 2 + lSz * 0.8, baseR * 2 + lSz * 0.8);
				if (i === 0 || (i + 1) % 10 === 0 || i === n - 1) {
					const pi = Math.max(0, i - 1),
						ni2 = Math.min(n - 1, i + 1);
					const tx = coords[ni2].x - coords[pi].x,
						ty = coords[ni2].y - coords[pi].y;
					const tl = Math.hypot(tx, ty) || 1;
					let inx = -ty / tl,
						iny = tx / tl;
					if ((coords[i].x - cx) * inx + (coords[i].y - cy) * iny < 0) {
						inx = -inx;
						iny = -iny;
					}
					// Unpaired (loop) bases: index is placed INWARD — flip direction
					const inLoop = pairs[i] < 0 && !pkPartner.has(i);
					if (inLoop) {
						inx = -inx;
						iny = -iny;
					}
					const ix = coords[i].x + inx * (baseR + idxOff);
					const iy = coords[i].y + iny * (baseR + idxOff);
					addOccupied(ix, iy, lSz * 4.5, lSz * 2.2);
				}
			}

			// Register helix annotation boxes (rotated rects — use axis-aligned bounding box)
			if (this._showPairAnnotations && this._rna?.helixAnnotations?.length) {
				const hPad = parseFloat(cs.getPropertyValue('--rv-helix-annot-padding')) || baseR * 1.7;
				for (const ann of this._rna.helixAnnotations) {
					const annPad = ann.padding ?? hPad;
					for (const sh of (ann.subHelices || [])) {
						const p5 = sh.pos5p.filter(ri => ri >= 0 && ri < n);
						const p3 = sh.pos3p.filter(ri => ri >= 0 && ri < n);
						if (!p5.length || !p3.length) continue;
						const xs = [...p5, ...p3].map(ri => coords[ri].x);
						const ys = [...p5, ...p3].map(ri => coords[ri].y);
						const bx = Math.min(...xs) - annPad,
							by = Math.min(...ys) - annPad;
						const bw = Math.max(...xs) - Math.min(...xs) + annPad * 2;
						const bh = Math.max(...ys) - Math.min(...ys) + annPad * 2;
						occupied.push({
							x: bx,
							y: by,
							w: bw,
							h: bh
						});
					}
				}
			}

			// Register pair annotation boxes
			if (this._showPairAnnotations && this._rna?.pairAnnotations?.length) {
				const defPad = parseFloat(cs.getPropertyValue('--rv-pair-annot-padding')) || 5;
				for (const ann of this._rna.pairAnnotations) {
					let i = ann.i,
						j = ann.j;
					if (i == null) {
						i = pairs[j];
					} else if (j == null) {
						j = pairs[i];
					}
					if (i == null || j == null || i < 0 || j < 0 || i >= n || j >= n) continue;
					const pad2 = ann.padding ?? defPad;
					const mx = (coords[i].x + coords[j].x) / 2;
					const my = (coords[i].y + coords[j].y) / 2;
					const hw = Math.hypot(coords[j].x - coords[i].x, coords[j].y - coords[i].y) / 2 + pad2;
					const hh = pad2;
					occupied.push({
						x: mx - hw,
						y: my - hh,
						w: hw * 2,
						h: hh * 2
					});
				}
			}

			// ── Arc-length helpers ─────────────────────────────────────────────
			const arcLen = (pts) => {
				const L = [0];
				for (let k = 1; k < pts.length; k++)
					L.push(L[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
				return L;
			};
			const ptAtT = (pts, L, t) => {
				const tot = L[L.length - 1];
				if (tot === 0) return pts[0];
				const tgt = Math.max(0, Math.min(tot, t * tot));
				for (let k = 1; k < L.length; k++) {
					if (L[k] >= tgt || k === L.length - 1) {
						const frac = L[k] === L[k - 1] ? 0 : (tgt - L[k - 1]) / (L[k] - L[k - 1]);
						// Interpolate nx,ny so the label direction reflects the actual
						// midpoint normal rather than always using the first segment endpoint.
						const nxi = pts[k - 1].nx + frac * (pts[k].nx - pts[k - 1].nx);
						const nyi = pts[k - 1].ny + frac * (pts[k].ny - pts[k - 1].ny);
						const nl = Math.hypot(nxi, nyi) || 1;
						return {
							x: pts[k - 1].x + frac * (pts[k].x - pts[k - 1].x),
							y: pts[k - 1].y + frac * (pts[k].y - pts[k - 1].y),
							nx: nxi / nl,
							ny: nyi / nl
						};
					}
				}
				return pts[pts.length - 1];
			};

			// ── Merge labels that share a start position ─────────────────────
			const edgeGap = lSz * 3.5;
			// posDirection: ri → 'open' (5' arm) | 'close' (3' arm)
			// Built from ssConsPkPairs so arm boundaries are known exactly.
			const posDirection = new Map();
			if (this._rna.ssConsPkPairs)
				for (const fps of Object.values(this._rna.ssConsPkPairs))
					for (const ps of fps) {
						posDirection.set(ps.i, 'open');
						posDirection.set(ps.j, 'close');
					}
			// Also from pseudoPairs
			for (const ps of pseudoPairs) {
				posDirection.set(ps.i, 'open');
				posDirection.set(ps.j, 'close');
			}
			const toRuns = (positions) => {
				// Split on direction change (5'→3' arm boundary) or gap > 3 within same arm.
				const runs = [];
				let run = [positions[0]];
				for (let k = 1; k < positions.length; k++) {
					const gap = positions[k] - positions[k - 1];
					const d0 = posDirection.get(positions[k - 1]);
					const d1 = posDirection.get(positions[k]);
					const dirChange = d0 && d1 && d0 !== d1;
					if (!dirChange && gap <= 3) run.push(positions[k]);
					else {
						runs.push(run);
						run = [positions[k]];
					}
				}
				runs.push(run);
				return runs;
			};
			// Per-position labels: every annotated position (non-'.' non-':') gets a label.
			// Features sharing a position get one merged label (alphabetically sorted).
			const posToNames = new Map(); // pos -> [featureName, ...]
			for (const [name, positions] of Object.entries(features)) {
				for (const pos of positions) {
					if (!posToNames.has(pos)) posToNames.set(pos, []);
					posToNames.get(pos).push(name);
				}
			}
			const posLabel = new Map(); // pos -> merged label string
			const posOwner = new Map(); // pos -> featureName that renders the label
			for (const [pos, names] of posToNames) {
				const sorted = [...new Set(names)].sort();
				posLabel.set(pos, sorted.join(', '));
				posOwner.set(pos, sorted[0]);
			}

			// ── Render each feature ───────────────────────────────────────────
			// Collect placements: render all bg rects first, then all texts on top
			const labelPlacements = [];
			// Collect all label tasks first so we can sort by base index before placing
			const pendingLabels = [];
			for (const [name, positions] of Object.entries(features)) {
				if (!positions.length) continue;
				const groups = toRuns(positions);
				for (const group of groups) {
					const isNaview = this._rna?._algo === 'naview';
					// For helix-arm groups, expand to include all positions between
					// first and last so the line passes through every base in the arm.
					// Skip in naview — helix arms aren't linear there.
					const expandedGroup = (!isNaview && group.some(i => helixPos.has(i))) ?
						Array.from({
							length: group[group.length - 1] - group[0] + 1
						}, (_, k) => group[0] + k) :
						group;
					const activeGroup = expandedGroup;
					// Per-position offset points — always outside via outwardSign
					const allLoop = !isNaview && activeGroup.every(i => !helixPos.has(i));

					const pts = activeGroup.map(i => {
						const pi = Math.max(0, i - 1),
							ni2 = Math.min(n - 1, i + 1);
						const tx = coords[ni2].x - coords[pi].x;
						const ty = coords[ni2].y - coords[pi].y;
						const tl = Math.hypot(tx, ty) || 1;
						// Left-perpendicular of forward direction, scaled by outwardSign
						const nx = -ty / tl * outwardSign;
						const ny = tx / tl * outwardSign;
						return {
							x: coords[i].x + nx * pad,
							y: coords[i].y + ny * pad,
							nx,
							ny
						};
					});

					// Use curve for pure-loop groups, straight lines for helix-arm groups
					let d;
					const bezSegs = []; // { p0,c1,c2,p1 } per segment
					if (pts.length < 3 || !allLoop) {
						d = `M ${pts[0].x} ${pts[0].y}`;
						for (let k = 1; k < pts.length; k++) {
							d += ` L ${pts[k].x} ${pts[k].y}`;
							bezSegs.push({
								p0: pts[k - 1],
								c1: pts[k - 1],
								c2: pts[k],
								p1: pts[k]
							});
						}
					} else {
						// Tangent at each point = 90° rotation of outward normal,
						// chosen to face the direction of travel along the arc.
						const tangs = pts.map((p, k) => {
							const t1x = p.ny,
								t1y = -p.nx;
							const ref = k < pts.length - 1 ?
								{
									x: pts[k + 1].x - p.x,
									y: pts[k + 1].y - p.y
								} :
								{
									x: p.x - pts[k - 1].x,
									y: p.y - pts[k - 1].y
								};
							const fwd = ref.x * t1x + ref.y * t1y >= 0;
							return fwd ? {
								x: t1x,
								y: t1y
							} : {
								x: -t1x,
								y: -t1y
							};
						});
						d = `M ${pts[0].x} ${pts[0].y}`;
						for (let k = 0; k < pts.length - 1; k++) {
							const seg = Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y);
							const scale = seg / 3;
							const c1x = pts[k].x + tangs[k].x * scale;
							const c1y = pts[k].y + tangs[k].y * scale;
							const c2x = pts[k + 1].x - tangs[k + 1].x * scale;
							const c2y = pts[k + 1].y - tangs[k + 1].y * scale;
							d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${pts[k+1].x} ${pts[k+1].y}`;
							bezSegs.push({
								p0: pts[k],
								c1: {
									x: c1x,
									y: c1y
								},
								c2: {
									x: c2x,
									y: c2y
								},
								p1: pts[k + 1]
							});
						}
					}
					// Evaluate a cubic bezier at parameter u in [0,1]
					const cubicPt = (s, u) => {
						const v = 1 - u;
						return {
							x: v * v * v * s.p0.x + 3 * v * v * u * s.c1.x + 3 * v * u * u * s.c2.x + u * u * u * s.p1.x,
							y: v * v * v * s.p0.y + 3 * v * v * u * s.c1.y + 3 * v * u * u * s.c2.y + u * u * u * s.p1.y,
						};
					};
					// Sample the actual drawn curve at a normalised arc-fraction t in [0,1].
					// Uses the bezSegs array; falls back to pts[0] for single-point paths.
					const curvePtAtT = (t) => {
						if (bezSegs.length === 0) return {
							x: pts[0].x,
							y: pts[0].y
						};
						if (bezSegs.length === 1) return cubicPt(bezSegs[0], t);
						// Distribute t uniformly across segments by count
						const raw = t * bezSegs.length;
						const si = Math.min(Math.floor(raw), bezSegs.length - 1);
						const u = raw - si;
						return cubicPt(bezSegs[si], u);
					};
					const path = document.createElementNS(NS, 'path');
					path.setAttribute('d', d);
					path.setAttribute('class', 'rv-ss-cons-line');
					path.setAttribute('data-feat', name);
					path.style.cssText = `stroke:${lineCol};stroke-width:${bbW};fill:none;stroke-linecap:round;stroke-linejoin:round`;
					gLines.appendChild(path);

					// Pre-compute segment bounding boxes — added AFTER label placement
					const segM = bbW / 2 + lSz * 0.5;
					const segBoxes = [];
					for (let k = 0; k < pts.length - 1; k++) {
						segBoxes.push({
							x: Math.min(pts[k].x, pts[k + 1].x) - segM,
							y: Math.min(pts[k].y, pts[k + 1].y) - segM,
							w: Math.abs(pts[k + 1].x - pts[k].x) + 2 * segM,
							h: Math.abs(pts[k + 1].y - pts[k].y) + 2 * segM,
						});
					}

					// ── Collect label runs for this group ─────────────────────
					const L = arcLen(pts);

					// Collapse consecutive positions with the same label into one label run
					const labelRuns = [];
					for (let k = 0; k < group.length; k++) {
						const pos = group[k];
						if (posOwner.get(pos) !== name) continue;
						const labelText = posLabel.get(pos) ?? name;
						const last = labelRuns[labelRuns.length - 1];
						if (last && last.labelText === labelText) last.endK = k;
						else labelRuns.push({
							labelText,
							startK: k,
							endK: k
						});
					}
					for (const {
							labelText,
							startK,
							endK
						}
						of labelRuns) {
						const tw = labelText.length * lSz * 0.62 + lSz * 0.5;
						const akStart = activeGroup.indexOf(group[startK]);
						const akEnd = activeGroup.indexOf(group[endK]);
						const midK = (akStart + akEnd) / 2;
						const tBase = activeGroup.length > 1 ? midK / (activeGroup.length - 1) : 0.5;
						// Capture all context needed for placement
						pendingLabels.push({
							baseIdx: group[startK],
							labelText,
							tw,
							tBase,
							name,
							pts: pts.slice(),
							L: arcLen(pts),
							curvePtAtT,
						});
					}

					// Add segments to occupancy now (they block future labels in the same pass)
					for (const sb of segBoxes) occupied.push(sb);
				}
			}

			// ── Place labels in base-index order (lower index first) ─────────
			pendingLabels.sort((a, b) => a.baseIdx - b.baseIdx);
			for (const {
					labelText,
					tw,
					tBase,
					name,
					pts,
					L,
					curvePtAtT,
					baseIdx
				}
				of pendingLabels) {
				const th = lSz * 1.3;
				const occMargin = th * 0.5;
				const isOccupiedBox = (b) => occupied.some(o =>
					b.bx < o.x + o.w + occMargin && b.bx + b.bw > o.x - occMargin &&
					b.by < o.y + o.h + occMargin && b.by + b.bh > o.y - occMargin);
				const placeLabel = (layout, t) => {
					const arcMid = curvePtAtT(t);
					labelPlacements.push({
						layout,
						labelText,
						arcMid,
						name
					});
					const bgP = lSz * 0.35;
					occupied.push({
						x: layout.bx - bgP,
						y: layout.by - bgP,
						w: layout.bw + bgP * 2,
						h: layout.bh + bgP * 2
					});
					// Register leader line as an axis-aligned bounding box
					const lx1 = Math.min(arcMid.x, layout.lx),
						lx2 = Math.max(arcMid.x, layout.lx);
					const ly1 = Math.min(arcMid.y, layout.ly),
						ly2 = Math.max(arcMid.y, layout.ly);
					const lm = bbW;
					occupied.push({
						x: lx1 - lm,
						y: ly1 - lm,
						w: lx2 - lx1 + lm * 2,
						h: ly2 - ly1 + lm * 2
					});
				};
				const countOverlaps = (b, arcMid) => {
					let n = 0;
					for (const o of occupied) {
						// Label box overlap
						if (b.bx < o.x + o.w + occMargin && b.bx + b.bw > o.x - occMargin &&
							b.by < o.y + o.h + occMargin && b.by + b.bh > o.y - occMargin) {
							n++;
							continue;
						}
						// Leader line crosses this occupied box (only check if arcMid provided)
						if (arcMid && lineIntersectsBox(arcMid.x, arcMid.y, b.lx, b.ly, o.x, o.y, o.x + o.w, o.y + o.h)) n++;
					}
					return n;
				};
				// Check if segment (x1,y1)-(x2,y2) intersects axis-aligned box (bx0,by0)-(bx1,by1)
				const lineIntersectsBox = (x1, y1, x2, y2, bx0, by0, bx1, by1) => {
					// Cohen-Sutherland quick reject
					if (Math.min(x1, x2) > bx1 || Math.max(x1, x2) < bx0) return false;
					if (Math.min(y1, y2) > by1 || Math.max(y1, y2) < by0) return false;
					// Parametric clip
					const dx = x2 - x1,
						dy = y2 - y1;
					let tmin = 0,
						tmax = 1;
					for (const [p, q] of [
							[-dx, x1 - bx0],
							[dx, bx1 - x1],
							[-dy, y1 - by0],
							[dy, by1 - y1]
						]) {
						if (p === 0) {
							if (q < 0) return false;
							continue;
						}
						const t = q / p;
						if (p < 0) {
							if (t < tmin) return false;
							tmax = Math.min(tmax, t);
						} else {
							if (t > tmax) return false;
							tmin = Math.max(tmin, t);
						}
					}
					return tmin <= tmax;
				};
				const labelLayoutDir = (pt, dx, dy, dist) => {
					const ax = pt.x + dx * dist,
						ay = pt.y + dy * dist;
					const isLR = Math.abs(dx) >= Math.abs(dy);
					if (isLR) {
						if (dx < 0) return {
							lx: ax,
							ly: ay,
							anchor: 'end',
							bx: ax - tw,
							by: ay - th / 2,
							bw: tw,
							bh: th
						};
						else return {
							lx: ax,
							ly: ay,
							anchor: 'start',
							bx: ax,
							by: ay - th / 2,
							bw: tw,
							bh: th
						};
					} else {
						return {
							lx: ax,
							ly: ay,
							anchor: 'middle',
							bx: ax - tw / 2,
							by: ay - th / 2,
							bw: tw,
							bh: th
						};
					}
				};
				const pt0 = ptAtT(pts, L, tBase);
				const onx = pt0.nx,
					ony = pt0.ny;
				const angles = Array.from({
					length: 58
				}, (_, i) => -70 + i * 2.5).map(a => a * Math.PI / 180);
				const dirs = angles.map(a => {
					const cos = Math.cos(a),
						sin = Math.sin(a);
					return {
						dx: onx * cos - ony * sin,
						dy: onx * sin + ony * cos
					};
				});
				const dists = Array.from({
					length: 30
				}, (_, i) => edgeGap * (0.5 + i * 0.1));
				let bestLayout = null,
					bestT = tBase,
					bestOv = Infinity,
					bestDist2 = -1;
				let placed = false;
				const arcMid0 = curvePtAtT(tBase);
				outer: for (const dist of dists) {
					for (const {
							dx,
							dy
						}
						of dirs) {
						const layout = labelLayoutDir(pt0, dx, dy, dist);
						const nov = countOverlaps(layout, arcMid0);
						const bcx = layout.bx + layout.bw / 2,
							bcy = layout.by + layout.bh / 2;
						const minD = occupied.length ?
							Math.min(...occupied.map(o => Math.hypot(bcx - (o.x + o.w / 2), bcy - (o.y + o.h / 2)))) :
							Infinity;
						if (nov < bestOv || (nov === bestOv && minD > bestDist2)) {
							bestOv = nov;
							bestLayout = layout;
							bestT = tBase;
							bestDist2 = minD;
						}
						if (nov === 0) {
							placeLabel(layout, tBase);
							placed = true;
							break outer;
						}
					}
				}
				if (!placed) placeLabel(bestLayout ?? labelLayoutDir(pt0, onx, ony, dists[0]), bestT);
			}
			// Helper: find the point on the label bg-box edge that lies on the
			// line from arcMid toward the box centre. This gives a clean edge-exit
			// point for the leader line so it never overlaps the text.
			const boxEdgePt = (bx, by, bw, bh, px, py) => {
				const cx2 = bx + bw / 2,
					cy2 = by + bh / 2;
				const dx = cx2 - px,
					dy = cy2 - py;
				const distToCx = Math.hypot(dx, dy);
				if (distToCx === 0) return {
					x: px,
					y: py
				};
				// Parametric intersection with each of the 4 edges; take smallest t > 0
				let tMin = Infinity;
				const edges = [{
						nx: 1,
						ny: 0,
						c: bx
					}, // left edge
					{
						nx: -1,
						ny: 0,
						c: -(bx + bw)
					}, // right edge
					{
						nx: 0,
						ny: 1,
						c: by
					}, // top edge
					{
						nx: 0,
						ny: -1,
						c: -(by + bh)
					} // bottom edge
				];
				for (const e of edges) {
					const denom = e.nx * dx + e.ny * dy;
					if (Math.abs(denom) < 1e-9) continue;
					const t = (e.c - (e.nx * px + e.ny * py)) / denom;
					if (t > 1e-6 && t < tMin) tMin = t;
				}
				if (!isFinite(tMin)) return {
					x: cx2,
					y: cy2
				};
				return {
					x: px + tMin * dx,
					y: py + tMin * dy
				};
			};

			// Three-pass DOM rendering: leader lines, then bg+text groups (so text is on top of leader).
			const bgPad = lSz * 0.35;

			// Pass 1: leader lines — stored by index so drag can update x1/y1
			const leaderEls = [];
			for (const {
					layout,
					arcMid
				}
				of labelPlacements) {
				const dist = Math.hypot(layout.lx - arcMid.x, layout.ly - arcMid.y);
				if (dist > bbW) {
					const leader = document.createElementNS(NS, 'line');
					leader.setAttribute('x1', layout.lx);
					leader.setAttribute('y1', layout.ly);
					leader.setAttribute('x2', arcMid.x);
					leader.setAttribute('y2', arcMid.y);
					leader.setAttribute('class', 'rv-ss-cons-leader');
					leader.style.cssText = `stroke:${lineCol};stroke-width:${bbW};fill:none;stroke-linecap:round`;
					gLabels.appendChild(leader);
					leaderEls.push(leader);
				} else {
					leaderEls.push(null);
				}
			}

			// Pass 2: bg rect + text grouped together, draggable
			labelPlacements.forEach(({
				layout,
				labelText,
				name: featName
			}, idx) => {
				const g = document.createElementNS(NS, 'g');
				g.style.cursor = 'grab';

				const bg = document.createElementNS(NS, 'rect');
				bg.setAttribute('x', layout.bx - bgPad);
				bg.setAttribute('y', layout.by - bgPad);
				bg.setAttribute('width', layout.bw + bgPad * 2);
				bg.setAttribute('height', layout.bh + bgPad * 2);
				bg.setAttribute('fill', bgCol);
				bg.setAttribute('stroke', 'none');
				bg.setAttribute('class', 'rv-ss-cons-bg');
				bg.setAttribute('data-feat', featName);
				g.appendChild(bg);

				const txt = document.createElementNS(NS, 'text');
				txt.setAttribute('x', layout.lx);
				txt.setAttribute('y', layout.ly);
				txt.setAttribute('text-anchor', layout.anchor);
				txt.setAttribute('dominant-baseline', 'middle');
				txt.setAttribute('class', 'rv-ss-cons-label');
				txt.setAttribute('data-feat', featName);
				txt.style.cssText = `font-size:${lSz}px;font-weight:bold;fill:${lblCol};font-family:${lFont}`;
				txt.textContent = labelText;
				g.appendChild(txt);
				gLabels.appendChild(g);

				// Drag handling — SVG coordinate space
				const leader = leaderEls[idx];
				let dragging = false,
					startMx = 0,
					startMy = 0,
					startGx = 0,
					startGy = 0;
				const svgEl = gLabels.ownerSVGElement ?? gLabels.closest('svg');
				const toSVG = (clientX, clientY) => {
					if (!svgEl) return {
						x: clientX,
						y: clientY
					};
					const pt = svgEl.createSVGPoint();
					pt.x = clientX;
					pt.y = clientY;
					return pt.matrixTransform(svgEl.getScreenCTM().inverse());
				};
				g.addEventListener('mousedown', e => {
					if (e.button !== 0) return;
					e.preventDefault();
					e.stopPropagation();
					dragging = true;
					g.style.cursor = 'grabbing';
					const p = toSVG(e.clientX, e.clientY);
					startMx = p.x;
					startMy = p.y;
					// Current translation from transform
					const t = g.transform?.baseVal?.[0];
					startGx = t ? t.matrix.e : 0;
					startGy = t ? t.matrix.f : 0;
					const onMove = ev => {
						if (!dragging) return;
						const p2 = toSVG(ev.clientX, ev.clientY);
						const dx = p2.x - startMx,
							dy = p2.y - startMy;
						const nx = startGx + dx,
							ny = startGy + dy;
						g.setAttribute('transform', `translate(${nx},${ny})`);
						// Update leader x1/y1 to follow the label anchor
						if (leader) {
							leader.setAttribute('x1', layout.lx + nx);
							leader.setAttribute('y1', layout.ly + ny);
						}
					};
					const onUp = () => {
						dragging = false;
						g.style.cursor = 'grab';
						window.removeEventListener('mousemove', onMove);
						window.removeEventListener('mouseup', onUp);
					};
					window.addEventListener('mousemove', onMove);
					window.addEventListener('mouseup', onUp);
				});
			});
		}
		_openAbout() {
			this._settingsPanel?.classList.remove('rv-visible');
			this._aboutPanel?.classList.toggle('rv-visible');
			if (this._aboutPanel?.classList.contains('rv-visible')) {
				const rgba = getComputedStyle(this._aboutPanel).backgroundColor;
				const m = rgba.match(/[\d.]+/g);
				if (m && m.length >= 3) {
					const lum = (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255;
					this._root.style.setProperty('--rv-logo-filter', lum < 0.4 ? 'invert(1)' : 'none');
				}
			}
		}
		_openRfam() {
			this._settingsPanel?.classList.remove('rv-visible');
			this._aboutPanel?.classList.remove('rv-visible');
			this._rfamPanel?.classList.toggle('rv-visible');
		}
		async fetchRfam(rfamId) {
			if (!/^RF\d+$/i.test(rfamId)) throw new Error(`Invalid Rfam ID "${rfamId}": must be RF followed by digits`);
			let text;
			if (window.electronAPI?.fetchRfam) {
				text = await window.electronAPI.fetchRfam(rfamId.toUpperCase());
			} else {
				const url = `https://rfview.incarnatolab.com/rfam-proxy.php?id=${rfamId.toUpperCase()}`;
				const resp = await fetch(url);
				if (!resp.ok) throw new Error(`HTTP ${resp.status} — could not retrieve ${rfamId}`);
				text = await resp.text();
			}
			const incoming = RFviewJS.parseStockholmFile(text, rfamId.toUpperCase());
			if (this._structLayouts?.length) {
				const existing = this._structLayouts.map((s, i) => ({
					label: this._structures?.[i]?.label || s.label,
					sequence: s.sequence,
					structure: s.structure,
					values: s.values,
					colorMap: s.colorMap,
					pairAnnotations: s.pairAnnotations,
					pairAnnotColorMap: s.pairAnnotColorMap,
					helixAnnotations: s.helixAnnotations,
					pseudoCovAnnotations: s.pseudoCovAnnotations,
					pseudoHelixCovAnnotations: s.pseudoHelixCovAnnotations,
					isCovAnnot: s.isCovAnnot,
					ssConsFeatures: s.ssConsFeatures,
					ssConsPkPairs: s.ssConsPkPairs,
					baseDisplay: s.baseDisplay,
					positionLabels: s.positionLabels,
					alnSeqs: s.alnSeqs,
					alnStruct: s.alnStruct,
					alnLen: s.alnLen,
					ssEnds: s.ssEnds,
				}));
				const newIdx = existing.length + incoming.length - 1;
				this.load({
					structures: [...existing, ...incoming],
					showColors: this._showColors
				});
				// Switch to the newly added structure and focus its pill
				this.switchToStructure(newIdx);
			} else {
				this.load({
					structures: incoming,
					showColors: this._showColors
				});
				// Single new structure — switch to it (index 0)
				this.switchToStructure(0);
			}
		}
		_openSettings() {
			this._aboutPanel?.classList.remove('rv-visible');
			if (!this._settingsPanel) return;
			const _gv = v => getComputedStyle(this._root).getPropertyValue(v).trim();
			const q = s => this._settingsPanel.querySelector(s);
			const toHex = color => {
				const m = color.match(/\d+/g);
				if (!m || color.startsWith('#')) return color;
				return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
			};
			// Read  color values: prefer declared CSS custom property, fall back to computed stroke/fill
			const readColor = (cssVar, elSel, cssProp) => {
				const v = _gv(cssVar);
				if (v) return toHex(v);
				const el = this._svgEl?.querySelector(elSel);
				if (el) return toHex(getComputedStyle(el)[cssProp] || '') || null;
				return null;
			};
			q('.rv-set-backbone').value = readColor('--rv-backbone', '.rv-backbone', 'stroke') || '#111111';
			q('.rv-set-basepair').value = readColor('--rv-basepair', '.rv-basepair', 'stroke') || '#111111';
			// Read numeric values from CSS var or from actual rendered element attributes
			const readNum = (cssVar, elSel, attr) => {
				const v = parseFloat(_gv(cssVar));
				if (v) return v;
				const el = this._svgEl?.querySelector(elSel);
				return el ? parseFloat(el.getAttribute(attr)) || 0 : 0;
			};
			const r = readNum('--rv-base-radius', '.rv-base-circle', 'r') || 11;
			const lf = readNum('--rv-base-label-font-size', '.rv-base-label', 'font-size') || parseFloat(getComputedStyle(this._svgEl?.querySelector('.rv-base-label') || document.body).fontSize) || 13;
			const xf = readNum('--rv-base-index-font-size', '.rv-base-index', 'font-size') || parseFloat(getComputedStyle(this._svgEl?.querySelector('.rv-base-index') || document.body).fontSize) || 12;
			q('.rv-set-radius').value = r;
			q('.rv-val-radius').textContent = r;
			q('.rv-set-lbl-font').value = lf;
			q('.rv-val-lbl-font').textContent = lf;
			q('.rv-set-idx-font').value = xf;
			q('.rv-val-idx-font').textContent = xf;
			// Stockholm structures: circle size controls everything, base font slider is meaningless
			const isStockholm = !!this._rna?.baseDisplay;
			const radiusRow = q('.rv-row-radius');
			const lblFontRow = q('.rv-row-lbl-font');
			if (radiusRow) {
				const lbl = radiusRow.querySelector('.rv-setting-label');
				if (lbl) lbl.firstChild.textContent = isStockholm ? 'Base size  ' : 'Circle size  ';
			}
			if (lblFontRow) lblFontRow.style.display = isStockholm ? 'none' : '';
			// Color Map tab, visible only when current structure has reactivity
			const hasReact = !!this._rna?.values;
			const cmTab = q('.rv-settings-tab[data-tab="colormap"]');
			const cmPane = q('.rv-settings-pane[data-pane="colormap"]');
			if (cmTab) cmTab.style.display = hasReact ? '' : 'none';
			if (cmPane) cmPane.style.display = hasReact ? '' : 'none';
			// If colormap tab was active but structure has no reactivity, fall back to appearance
			if (!hasReact && cmTab?.classList.contains('rv--active')) {
				q('.rv-settings-tab[data-tab="appearance"]')?.click();
			}
			// Sync colormap from current structure only
			const cm = this._rna?.colorMap;
			if (cm) {
				const isDisc = (cm.type || 'gradient') === 'discrete';
				q('.rv-cm-type-btn[data-type="gradient"]').classList.toggle('rv--active', !isDisc);
				q('.rv-cm-type-btn[data-type="discrete"]').classList.toggle('rv--active', isDisc);
				q('.rv-set-nan').value = cm.nanColor || '#999999';
				this._settingsPanel._cmType = cm.type || 'gradient';
				this._settingsPanel._cmMin = cm.min ?? 0;
				this._settingsPanel._cmStops = cm.stops ? cm.stops.map(s => ({
					value: s.value,
					color: s.color
				})) : this._getDefaultShapeColorMap().stops.map(s => ({
					value: s.value,
					color: s.color
				}));
			} else {
				const def = this._getDefaultShapeColorMap();
				this._settingsPanel._cmType = def.type;
				this._settingsPanel._cmMin = def.min ?? 0;
				this._settingsPanel._cmStops = def.stops.map(s => ({
					value: s.value,
					color: s.color
				}));
			}
			this._refreshStopsList();
			this._settingsPanel.classList.add('rv-visible');
			// Pair annotation section
			const paTab = this._settingsPanel.querySelector('.rv-tab-pannot');
			const paPane = this._settingsPanel.querySelector('.rv-settings-pane[data-pane="pannot"]');
			const pAnnots = this._rna?.pairAnnotations;
			const hasAnnots = !!pAnnots?.length;
			if (paTab) paTab.style.display = hasAnnots ? '' : 'none';
			// If annotations tab was active but annotations are now gone, fall back to appearance
			if (!hasAnnots && paTab?.classList.contains('rv--active')) {
				this._settingsPanel.querySelectorAll('.rv-settings-tab,.rv-settings-pane').forEach(el => el.classList.remove('rv--active'));
				this._settingsPanel.querySelector('.rv-settings-tab[data-tab="appearance"]')?.classList.add('rv--active');
				this._settingsPanel.querySelector('.rv-settings-pane[data-pane="appearance"]')?.classList.add('rv--active');
			}
			if (hasAnnots && paPane) {
				// Sync slider values from current CSS variables
				const gvNum = (cssVar, def) => parseFloat(_gv(cssVar)) || def;
				const setSlider = (sel, valSel, v) => {
					const el = q(sel);
					if (!el) return;
					el.value = v;
					const lbl = q(valSel);
					if (lbl) lbl.textContent = v;
				};
				setSlider('.rv-set-pa-opac', '.rv-val-pa-opac', gvNum('--rv-pair-annot-opacity', 0.5));
				setSlider('.rv-set-pa-stroke', '.rv-val-pa-stroke', gvNum('--rv-pair-annot-stroke-width', 1.5));
				setSlider('.rv-set-pa-pad', '.rv-val-pa-pad', gvNum('--rv-pair-annot-padding', 16));
				setSlider('.rv-set-ha-opac', '.rv-val-ha-opac', gvNum('--rv-helix-annot-opacity', 0.5));
				setSlider('.rv-set-ha-pad', '.rv-val-ha-pad', gvNum('--rv-helix-annot-padding', 25));
				// Show helix settings section only when helixAnnotations are loaded
				const haSection = this._settingsPanel.querySelector('.rv-ha-settings');
				if (haSection) haSection.style.display = this._rna?.helixAnnotations?.length ? 'block' : 'none';
				const haColorPicker = this._settingsPanel.querySelector('.rv-set-ha-color');
				if (haColorPicker) {
					const cur = getComputedStyle(this._root).getPropertyValue('--rv-helix-annot-color').trim() || '#aff0a8';
					const hexMatch = cur.match(/#[0-9a-f]{6}/i);
					haColorPicker.value = hexMatch ? hexMatch[0] : '#064e3b';
					haColorPicker.addEventListener('input', () => {
						this._root.style.setProperty('--rv-helix-annot-color', haColorPicker.value);
						this._render();
					});
				}
				// Build category  color pickers
				const paColorDiv = this._settingsPanel.querySelector('.rv-pa-colors');
				if (paColorDiv) {
					paColorDiv.innerHTML = '';
					const cm = this._rna.pairAnnotColorMap;
					if (cm?.length) {
						cm.forEach(({
							key,
							color
						}) => {
							const row = document.createElement('div');
							row.className = 'rv-setting-row';
							row.innerHTML = `<span class="rv-setting-label">${key || ANNOT_MISSING_KEY}</span>` + `<input type="color" value="${color}" ` + `style="width:44px;height:24px;border:1px solid var(--rv-border,#d0d7de);border-radius:4px;cursor:pointer;padding:1px 2px">`;
							const picker = row.querySelector('input[type=color]');
							picker.addEventListener('input', () => {
								const newColor = picker.value;
								// Update all annotation objects with this key on current + layout
								const updateAnns = anns => {
									if (anns)
										for (const a of anns)
											if (a.key === key) a.color = newColor;
								};
								updateAnns(this._rna?.pairAnnotations);
								updateAnns(this._structLayouts?.[this._currentStructIdx]?.pairAnnotations);
								// Update colorMap entries
								const updateCM = cm2 => {
									if (cm2) {
										const e = cm2.find(x => x.key === key);
										if (e) e.color = newColor;
									}
								};
								updateCM(this._rna?.pairAnnotColorMap);
								updateCM(this._structLayouts?.[this._currentStructIdx]?.pairAnnotColorMap);
								this._buildPairAnnotLegend(this._rna.pairAnnotColorMap, this._rna?.isCovAnnot);
								this._render();
							});
							paColorDiv.appendChild(row);
						});
					} else {
						// No  color map (single  color), so show one picker using first annotation's  color
						const defaultColor = pAnnots[0]?.color || ANNOT_DEFAULT_COLOR;
						const row = document.createElement('div');
						row.className = 'rv-setting-row';
						row.innerHTML = `<span class="rv-setting-label">Annotation color</span>` + `<input type="color" value="${defaultColor}" ` + `style="width:44px;height:24px;border:1px solid var(--rv-border,#d0d7de);border-radius:4px;cursor:pointer;padding:1px 2px">`;
						const picker = row.querySelector('input[type=color]');
						picker.addEventListener('input', () => {
							const c = picker.value;
							const updateAnns = anns => {
								if (anns)
									for (const a of anns) a.color = c;
							};
							updateAnns(this._rna?.pairAnnotations);
							updateAnns(this._structLayouts?.[this._currentStructIdx]?.pairAnnotations);
							this._render();
						});
						paColorDiv.appendChild(row);
					}
				}
			}
			// Sync General tab checkbox
			const relaxedChk = q('.rv-set-relaxed-seq');
			if (relaxedChk) relaxedChk.checked = this._relaxedSequence;
		}
		_bindSettingsEvents() {
			const p = this._settingsPanel;
			const q = s => p.querySelector(s);
			// Tab switching
			p.querySelectorAll('.rv-settings-tab').forEach(tab => {
				tab.addEventListener('click', () => {
					p.querySelectorAll('.rv-settings-tab').forEach(t => t.classList.remove('rv--active'));
					p.querySelectorAll('.rv-settings-pane').forEach(t => t.classList.remove('rv--active'));
					tab.classList.add('rv--active');
					p.querySelector(`.rv-settings-pane[data-pane="${tab.dataset.tab}"]`)?.classList.add('rv--active');
				});
			});
			// Debounced re-render for geometry changes
			let _rt;
			const rerender = () => {
				clearTimeout(_rt);
				_rt = setTimeout(() => this._render(), 60);
			};
			// Color pickers, instant CSS update
			q('.rv-set-backbone').addEventListener('input', e => {
				this._root.style.setProperty('--rv-backbone', e.target.value);
			});
			q('.rv-set-basepair').addEventListener('input', e => {
				this._root.style.setProperty('--rv-basepair', e.target.value);
			});
			// Range sliders
			const bindRange = (sel, cssVar, valSel, unit = '', needRender = false) => {
				const inp = q(sel),
					lbl = q(valSel);
				inp.addEventListener('input', () => {
					lbl.textContent = inp.value;
					this._root.style.setProperty(cssVar, inp.value + unit);
					if (needRender) rerender();
				});
			};
			bindRange('.rv-set-radius', '--rv-base-radius', '.rv-val-radius', '', true);
			bindRange('.rv-set-lbl-font', '--rv-base-label-font-size', '.rv-val-lbl-font', 'px', false);
			bindRange('.rv-set-idx-font', '--rv-base-index-font-size', '.rv-val-idx-font', 'px', false);
			bindRange('.rv-set-pa-opac', '--rv-pair-annot-opacity', '.rv-val-pa-opac', '', true);
			bindRange('.rv-set-pa-stroke', '--rv-pair-annot-stroke-width', '.rv-val-pa-stroke', '', true);
			bindRange('.rv-set-pa-pad', '--rv-pair-annot-padding', '.rv-val-pa-pad', '', true);
			bindRange('.rv-set-ha-opac', '--rv-helix-annot-opacity', '.rv-val-ha-opac', '', true);
			bindRange('.rv-set-ha-pad', '--rv-helix-annot-padding', '.rv-val-ha-pad', '', true);

			// General tab: relaxed sequence checkbox
			const relaxedChk = q('.rv-set-relaxed-seq');
			if (relaxedChk) {
				relaxedChk.checked = this._relaxedSequence;
				relaxedChk.addEventListener('change', () => {
					this._relaxedSequence = relaxedChk.checked;
				});
			}

			// Reset all settings to defaults
			const SETTINGS_DEFAULTS = {
				'--rv-base-radius': ['11', '.rv-set-radius', '.rv-val-radius', ''],
				'--rv-base-label-font-size': ['12', '.rv-set-lbl-font', '.rv-val-lbl-font', 'px'],
				'--rv-base-index-font-size': ['12', '.rv-set-idx-font', '.rv-val-idx-font', 'px'],
				'--rv-pair-annot-opacity': ['0.5', '.rv-set-pa-opac', '.rv-val-pa-opac', ''],
				'--rv-pair-annot-stroke-width': ['1.5', '.rv-set-pa-stroke', '.rv-val-pa-stroke', ''],
				'--rv-pair-annot-padding': ['16', '.rv-set-pa-pad', '.rv-val-pa-pad', ''],
				'--rv-helix-annot-opacity': ['0.5', '.rv-set-ha-opac', '.rv-val-ha-opac', ''],
				'--rv-helix-annot-padding': ['25', '.rv-set-ha-pad', '.rv-val-ha-pad', ''],
			};
			const resetBtn = this._settingsPanel?.querySelector('.rv-settings-reset');
			if (resetBtn) {
				resetBtn.addEventListener('click', () => {
					for (const [cssVar, [defVal, sliderSel, lblSel, unit]] of Object.entries(SETTINGS_DEFAULTS)) {
						this._root.style.setProperty(cssVar, defVal + unit);
						const sl = q(sliderSel);
						if (sl) sl.value = defVal;
						const lb = q(lblSel);
						if (lb) lb.textContent = defVal;
					}
					// Reset color pickers
					const hCol = q('.rv-set-ha-color');
					if (hCol) {
						hCol.value = '#aff0a8';
						this._root.style.setProperty('--rv-helix-annot-color', '#aff0a8');
					}
					// Reset General tab
					this._relaxedSequence = true;
					const relaxedChk = q('.rv-set-relaxed-seq');
					if (relaxedChk) relaxedChk.checked = true;
					rerender();
				});
			}
			// NaN color
			q('.rv-set-nan').addEventListener('input', e => {
				this._applySettingsCM();
			});
			// Type buttons
			p.querySelectorAll('.rv-cm-type-btn').forEach(btn => {
				btn.addEventListener('click', () => {
					p._cmType = btn.dataset.type;
					p.querySelectorAll('.rv-cm-type-btn').forEach(b => b.classList.toggle('rv--active', b === btn));
					this._applySettingsCM();
				});
			});
			// Add stop
			q('.rv-stop-add').addEventListener('click', () => {
				const stops = p._cmStops;
				const last = stops[stops.length - 1];
				stops.push({
					value: last ? Math.min(last.value + 0.1, last.value + 1) : 1,
					color: '#ff0000de'
				});
				this._refreshStopsList();
				this._applySettingsCM();
			});
		}
		_refreshStopsList() {
			const p = this._settingsPanel;
			const list = p.querySelector('.rv-stops-list');
			list.innerHTML = '';
			p._cmStops.forEach((stop, idx) => {
				const row = document.createElement('div');
				row.className = 'rv-stop-row';
				row.innerHTML = `<input type="number" class="rv-stop-val" step="0.01" value="${stop.value}" min="0">` + `<input type="color" value="${stop.color}" style="width:40px;height:24px;border:1px solid var(--rv-border,#d0d7de);border-radius:4px;cursor:pointer;padding:1px 2px">` + `<button class="rv-stop-del" title="Remove">✕</button>`;
				const [valIn, colIn, delBtn] = row.querySelectorAll('input, button');
				valIn.addEventListener('input', () => {
					p._cmStops[idx].value = parseFloat(valIn.value) || 0;
					this._applySettingsCM();
				});
				colIn.addEventListener('input', () => {
					p._cmStops[idx].color = colIn.value;
					this._applySettingsCM();
				});
				delBtn.addEventListener('click', () => {
					if (p._cmStops.length > 2) {
						p._cmStops.splice(idx, 1);
						this._refreshStopsList();
					}
					this._applySettingsCM();
				});
				list.appendChild(row);
			});
		}
		// Read settings panel and apply the colormap to the current structure only
		_applySettingsCM() {
			const p = this._settingsPanel;
			const nan = p.querySelector('.rv-set-nan').value;
			const stops = p._cmStops.slice().sort((a, b) => a.value - b.value).map(s => ({
				value: s.value,
				color: s.color
			}));
			const cm = normalizeColorMap({
				colorMap: {
					type: p._cmType,
					min: p._cmMin ?? (p._cmType === 'discrete' ? 0 : (stops[0]?.value ?? 0)),
					stops,
					nanColor: nan,
				},
			});
			// Apply only to the current structure — colormaps are per-structure
			const idx = this._currentStructIdx ?? 0;
			if (this._structLayouts?.[idx]) this._structLayouts[idx].colorMap = cm;
			if (this._rna) this._rna.colorMap = cm;
			if (this._rna?.values && this._showColors) {
				this._updateLegend(cm);
				this._legend.style.display = 'block';
			}
			this._render();
		}
		_showUploadPanel() {
			if (!this._uploadPanel) return;
			this._upFileDb.value = '';
			this._upFileXml.value = '';
			if (this._upDbNames) this._upDbNames.textContent = '';
			if (this._upXmlNames) this._upXmlNames.textContent = '';
			this._upStatus.textContent = '';
			this._upStatus.className = 'rv-upload-status';
			this._upLoadBtn.disabled = true;
			this._pendingStructures = [];
			this._pendingXmlData = [];
			this._accumulatedDbFiles = [];
			this._accumulatedXmlFiles = [];
			this._accumulatedAnnotFiles = [];
			this._pendingAnnotData = [];
			// Clear browser file-input selections so stale picks from a previous
			// dialog session don't silently re-trigger on the next open
			if (this._upFileDb) this._upFileDb.value = '';
			if (this._upFileXml) this._upFileXml.value = '';
			if (this._upFileAnnot) this._upFileAnnot.value = '';
			if (this._upStructOrder) this._upStructOrder.style.display = 'none';
			if (this._upStructOrderList) this._upStructOrderList.innerHTML = '';
			if (this._upLoadedStructWrap) this._upLoadedStructWrap.style.display = 'none';
			if (this._upLoadedStructList) this._upLoadedStructList.innerHTML = '';
			this._loadedStructsOrder = [];
			if (this._upXmlOrder) this._upXmlOrder.style.display = 'none';
			if (this._upXmlOrderList) this._upXmlOrderList.innerHTML = '';
			if (this._upXmlTargetSection) this._upXmlTargetSection.style.display = 'none';
			if (this._upXmlTargetList) this._upXmlTargetList.innerHTML = '';
			this._accumulatedAnnotFiles = [];
			this._pendingAnnotData = [];
			if (this._upAnnotNames)
				if (this._upAnnotNames) this._upAnnotNames.textContent = '';
			if (this._upAnnotTargetSection) this._upAnnotTargetSection.style.display = 'none';
			if (this._upAnnotTargetList) this._upAnnotTargetList.innerHTML = '';
			this._uploadPanel.classList.add('rv-visible');
		}
		_hideUploadPanel() {
			this._uploadPanel?.classList.remove('rv-visible');
			// Clear all pending state so stale data never carries over to the next session
			this._pendingStructures = [];
			this._pendingXmlData = [];
			this._pendingAnnotData = [];
			this._accumulatedDbFiles = [];
			this._accumulatedXmlFiles = [];
			this._accumulatedAnnotFiles = [];
			this._loadedStructsOrder = [];
		}
		_updateUploadNames() {
			const fmt = files => Array.from(files).map(f => f.name).join(', ') || '';
			if (this._upDbNames) this._upDbNames.textContent = fmt(this._upFileDb.files);
			if (this._upXmlNames) this._upXmlNames.textContent = fmt(this._upFileXml.files);
			this._upLoadBtn.disabled = true; // re-enabled after preview completes
			this._upStatus.textContent = '';
			this._upStatus.className = 'rv-upload-status';
			// Accumulate db files across multiple selections (avoid replacing previous picks)
			if (this._upFileDb.files.length > 0) {
				for (const f of this._upFileDb.files) {
					if (!this._accumulatedDbFiles.some(e => e.name === f.name)) this._accumulatedDbFiles.push(f);
				}
				if (this._upDbNames) this._upDbNames.textContent = this._accumulatedDbFiles.map(f => f.name).join(', ');
				this._previewDbFiles();
			}
			if (this._upFileAnnot?.files.length > 0) {
				for (const f of this._upFileAnnot.files)
					if (!this._accumulatedAnnotFiles.some(e => e.name === f.name)) this._accumulatedAnnotFiles.push(f);
				if (this._upAnnotNames) this._upAnnotNames.textContent = this._accumulatedAnnotFiles.map(f => f.name).join(', ');
				this._previewAnnotFiles();
			}
			if (this._upFileXml.files.length > 0) {
				for (const f of this._upFileXml.files) {
					if (!this._accumulatedXmlFiles.some(e => e.name === f.name)) this._accumulatedXmlFiles.push(f);
				}
				if (this._upXmlNames) this._upXmlNames.textContent = this._accumulatedXmlFiles.map(f => f.name).join(', ');
				this._previewXmlFiles();
			}
		}
		// Parse db files immediately so user can review and reorder before loading
		async _previewDbFiles() {
			const readText = f => new Promise((res, rej) => {
				const r = new FileReader();
				r.onload = () => res(r.result);
				r.onerror = () => rej(r.error);
				r.readAsText(f);
			});
			this._pendingStructures = [];
			const errors = [];
			const validFiles = [];
			for (const file of this._accumulatedDbFiles) {
				try {
					const recs = parseDbFile(await readText(file), file.name);
					if (!recs.length) throw new Error('no records found');
					this._pendingStructures.push(...recs.map(s => ({
						...s,
						_src: file.name
					})));
					validFiles.push(file);
				} catch (e) {
					errors.push(`${file.name}: ${e.message || 'malformed dot-bracket file'}`);
				}
			}
			this._accumulatedDbFiles = validFiles;
			if (this._upDbNames) this._upDbNames.textContent = validFiles.map(f => f.name).join(', ');
			this._renderStructOrder();
			this._upLoadBtn.disabled = this._pendingStructures.length === 0;
			if (this._upStatus) {
				if (errors.length && this._pendingStructures.length === 0) {
					this._upStatus.textContent = errors.join(' · ');
					this._upStatus.className = 'rv-upload-status rv--err';
				} else if (errors.length) {
					this._upStatus.textContent = `Warning: ${errors.join(' · ')}`;
					this._upStatus.className = 'rv-upload-status';
				} else {
					this._upStatus.textContent = '';
					this._upStatus.className = 'rv-upload-status';
				}
			}
			return errors;
		}
		// Render (or re-render) the reorderable structure list
		// Render the reorderable list of already-loaded structures shown in annotation-drop mode
		_renderLoadedStructOrder() {
			if (!this._upLoadedStructWrap || !this._upLoadedStructList) return;
			const structs = this._loadedStructsOrder;
			this._upLoadedStructWrap.style.display = structs.length ? 'block' : 'none';
			this._upLoadedStructList.innerHTML = '';
			structs.forEach((s, idx) => {
				const row = document.createElement('div');
				row.className = 'rv-struct-order-row';
				row.innerHTML = `<span class="rv-struct-order-idx">${idx + 1}</span>` + `<span class="rv-struct-order-lbl" title="${s.label}">${s.label}</span>` + `<div class="rv-struct-order-btns">` + `<button class="rv-struct-order-btn" ${idx === 0 ? 'disabled' : ''}>▲</button>` + `<button class="rv-struct-order-btn" ${idx === structs.length - 1 ? 'disabled' : ''}>▼</button>` + `<button class="rv-struct-order-btn" title="Remove">✕</button>` + `</div>`;
				const [upBtn, dnBtn, rmBtn] = row.querySelectorAll('.rv-struct-order-btn');
				upBtn.addEventListener('click', () => {
					if (idx > 0) {
						[structs[idx - 1], structs[idx]] = [structs[idx], structs[idx - 1]];
						this._renderLoadedStructOrder();
					}
				});
				dnBtn.addEventListener('click', () => {
					if (idx < structs.length - 1) {
						[structs[idx + 1], structs[idx]] = [structs[idx], structs[idx + 1]];
						this._renderLoadedStructOrder();
					}
				});
				rmBtn.addEventListener('click', () => {
					structs.splice(idx, 1);
					this._renderLoadedStructOrder();
				});
				this._upLoadedStructList.appendChild(row);
			});
		}
		_renderStructOrder() {
			if (!this._upStructOrderList) return;
			const structs = this._pendingStructures;
			this._upStructOrder.style.display = structs.length ? 'block' : 'none';
			this._upStructOrderList.innerHTML = '';
			structs.forEach((s, idx) => {
				const row = document.createElement('div');
				row.className = 'rv-struct-order-row';
				row.innerHTML = `<span class="rv-struct-order-idx">${idx + 1}</span>` + `<span class="rv-struct-order-lbl" title="${s.label}">${s.label}</span>` + `<span class="rv-struct-order-src">${s._src}</span>` + `<div class="rv-struct-order-btns">` + `<button class="rv-struct-order-btn" ${idx === 0 ? 'disabled' : ''}>▲</button>` + `<button class="rv-struct-order-btn" ${idx === structs.length - 1 ? 'disabled' : ''}>▼</button>` + `<button class="rv-struct-order-btn" title="Remove">✕</button>` + `</div>`;
				const [upBtn, dnBtn, rmBtn] = row.querySelectorAll('.rv-struct-order-btn');
				upBtn.addEventListener('click', () => {
					if (idx > 0) {
						[structs[idx - 1], structs[idx]] = [structs[idx], structs[idx - 1]];
						this._renderStructOrder();
					}
				});
				dnBtn.addEventListener('click', () => {
					if (idx < structs.length - 1) {
						[structs[idx + 1], structs[idx]] = [structs[idx], structs[idx + 1]];
						this._renderStructOrder();
					}
				});
				rmBtn.addEventListener('click', () => {
					structs.splice(idx, 1);
					// Also remove source file from accumulated list if no remaining structs from it
					const srcStillUsed = structs.some(s2 => s2._src === s._src);
					if (!srcStillUsed) this._accumulatedDbFiles = this._accumulatedDbFiles.filter(f => f.name !== s._src);
					if (this._upDbNames) this._upDbNames.textContent = this._accumulatedDbFiles.map(f => f.name).join(', ') || '';
					this._upLoadBtn.disabled = structs.length === 0;
					this._renderStructOrder();
				});
				this._upStructOrderList.appendChild(row);
			});
		}
		// Remove all loaded structures and reset to an empty state
		clear() {
			this._exitAlnView();
			this._rna = null;
			this._structures = [];
			this._structLayouts = [];
			this._currentStructIdx = 0;
			this._scene.innerHTML = '';
			this._structBar.innerHTML = '';
			if (this._pkPanelsEl) {
				this._pkPanelsEl.innerHTML = '';
				this._pkPanelsEl.style.display = 'none';
			}
			this._structWrap?.classList.remove('rv-visible');
			this._legend.style.display = 'none';
			this._palLegend.style.display = 'none';
			this._errEl.style.display = 'none';
			if (this._sbSeq) this._sbSeq.textContent = '';
			if (this._sbPairs) this._sbPairs.textContent = '';
			if (this._alnLegend) this._alnLegend.classList.remove('rv-visible');
			// Reset all pending/accumulated load state so a fresh load after clear()
			// is never blocked by stale reactivity, annotation, or file data.
			this._pendingStructures = [];
			this._pendingXmlData = [];
			this._pendingAnnotData = [];
			this._accumulatedDbFiles = [];
			this._accumulatedXmlFiles = [];
			this._accumulatedAnnotFiles = [];
		}
		// Remove only the currently displayed structure; keep all others.
		_openManualDialog() {
			const panel = this._manualPanel;
			if (!panel) return;
			// Always query fresh — guarantees we have live elements even after DOM tweaks
			const seqEl = panel.querySelector('.rv-manual-seq');
			const strEl = panel.querySelector('.rv-manual-struct');
			const nameEl = panel.querySelector('.rv-manual-name');
			const statusEl = panel.querySelector('.rv-manual-status');
			const loadBtn = panel.querySelector('.rv-manual-load');
			if (!seqEl || !strEl || !nameEl || !statusEl || !loadBtn) return;
			// Tear down old listeners from previous opens before re-attaching
			if (this._manualValidateFn) {
				seqEl.removeEventListener('input', this._manualValidateFn);
				strEl.removeEventListener('input', this._manualValidateFn);
			}
			// Reset field state
			seqEl.value = '';
			strEl.value = '';
			nameEl.value = '';
			statusEl.textContent = '';
			statusEl.style.color = '';
			loadBtn.disabled = true;
			const showErr = msg => {
				statusEl.textContent = msg;
				statusEl.style.color = 'var(--rv-error,#cf222e)';
				loadBtn.disabled = true;
			};
			const clearStatus = () => {
				statusEl.textContent = '';
				statusEl.style.color = '';
				loadBtn.disabled = false;
			};
			const validate = () => {
				const seq = seqEl.value.trim();
				const str = strEl.value.trim();
				if (!str) {
					loadBtn.disabled = true;
					statusEl.textContent = '';
					return;
				}
				if (seq && seq.length !== str.length) {
					showErr(`Length mismatch: sequence ${seq.length} nt, structure ${str.length} nt.`);
				} else {
					clearStatus();
				}
			};
			this._manualValidateFn = validate;
			seqEl.addEventListener('input', validate);
			strEl.addEventListener('input', validate);
			const close = () => {
				panel.style.display = 'none';
			};
			panel.querySelector('.rv-manual-x').onclick = close;
			panel.querySelector('.rv-manual-cancel').onclick = close;
			loadBtn.onclick = () => {
				const str = strEl.value.trim();
				const label = nameEl.value.trim() || `Structure ${(this._structures?.length || 0) + 1}`;
				if (!str) {
					showErr('No structure provided');
					return;
				}
				const seq = normalizeSeq(seqEl.value.trim()) || 'N'.repeat(str.length);
				if (seqEl.value.trim() && seq.length !== str.length) {
					showErr(`Sequence (${seq.length} nt) and structure (${str.length} nt) have different lengths.`);
					return;
				}
				// Bracket balance
				const balErr = checkBracketBalance(str, false); // false = also flag invalid chars
				if (balErr) {
					showErr(balErr);
					return;
				}
				close();
				this._pendingStructures = [{
					label,
					sequence: seq,
					structure: str
				}];
				this._loadFromFiles();
			};
			panel.style.display = 'block';
			seqEl.focus();
		}
		// Remove only the currently displayed structure; keep all others
		clearCurrent() {
			if (!this._rna || !this._structLayouts.length) return;
			if (this._structLayouts.length === 1) {
				this.clear();
				return;
			}
			const idx = this._currentStructIdx;
			this._structures.splice(idx, 1);
			this._structLayouts.splice(idx, 1);
			const nextIdx = Math.min(idx, this._structLayouts.length - 1);
			this._currentStructIdx = nextIdx;
			this._rna = this._structLayouts[nextIdx];
			this._buildStructSwitcher();
			this._buildPairAnnotLegend(this._rna.pairAnnotColorMap, this._rna?.isCovAnnot);
			this._updateStatusBar();
			if (this._rna.values) this._updateLegend(this._rna.colorMap);
			this._updateLegendVisibility();
			this._render();
			this.fit();
		}
		// Parse XML files immediately so user can review and reorder before loading
		async _previewXmlFiles() {
			const readText = f => new Promise((res, rej) => {
				const r = new FileReader();
				r.onload = () => res(r.result);
				r.onerror = () => rej(r.error);
				r.readAsText(f);
			});
			this._pendingXmlData = [];
			for (const file of this._accumulatedXmlFiles) {
				try {
					const recs = parseXmlReactivity(await readText(file));
					this._pendingXmlData.push(...recs.map(r => ({
						...r,
						_src: file.name
					})));
				} catch (_) {
					/* skip */
				}
			}
			this._renderXmlOrder();
			// Enable Load when: 
			// (a) structures are queued 
			// (b) XML loaded and a structure is already displayed
			const xmlOnlyMode = this._pendingStructures.length === 0 && this._pendingXmlData.length > 0 && !!this._rna;
			if (xmlOnlyMode) {
				this._upLoadBtn.disabled = false;
				this._upStatus.textContent = '';
				this._upStatus.className = 'rv-upload-status';
				// Always use the reorderable list — never the checkbox target section.
				// Populate _loadedStructsOrder with matching structures (if not already
				// set by the canvas-drop handler which may have called us).
				if (!this._loadedStructsOrder?.length) {
					const xmlSeqs = new Set(this._pendingXmlData.map(r => normalizeSeq(r.sequence)));
					this._loadedStructsOrder = (this._structures?.length ? this._structures : []).filter(s => xmlSeqs.has(normalizeSeq(s.sequence || '')));
				}
				if (this._upXmlTargetSection) this._upXmlTargetSection.style.display = 'none';
				this._renderLoadedStructOrder();
			} else {
				if (this._upXmlTargetSection) this._upXmlTargetSection.style.display = 'none';
			}
		}
		async _previewAnnotFiles() {
			const readText = f => new Promise((res, rej) => {
				const r = new FileReader();
				r.onload = () => res(r.result);
				r.onerror = () => rej(r.error);
				r.readAsText(f);
			});
			this._pendingAnnotData = [];
			const errors = [],
				validFiles = [];
			for (const file of this._accumulatedAnnotFiles) {
				try {
					const text = await readText(file);
					const isHelixCov = /\.helixcov$/i.test(file.name);
					const isCov = !isHelixCov && /\.cov$/i.test(file.name);
					if (isHelixCov) {
						const helices = parseHelixCovFile(text);
						this._pendingAnnotData.push({
							filename: file.name,
							helices,
							isHelixCov: true,
							pairs: []
						});
					} else {
						const pairs = isCov ? parseCovFile(text) : parsePairAnnotFile(text);
						this._pendingAnnotData.push({
							filename: file.name,
							pairs,
							isCov
						});
					}
					validFiles.push(file);
				} catch (e) {
					errors.push(`${file.name}: ${e.message}`);
				}
			}
			this._accumulatedAnnotFiles = validFiles;
			if (this._upAnnotNames) this._upAnnotNames.textContent = validFiles.map(f => f.name).join(', ');
			if (this._upStatus) {
				if (errors.length) {
					this._upStatus.textContent = errors.join(' · ');
					this._upStatus.className = 'rv-upload-status rv--err';
				} else if (this._pendingAnnotData.length) {
					const _nP = this._pendingAnnotData.filter(d => !d.isHelixCov).reduce((s, d) => s + (d.pairs?.length || 0), 0);
					const _nH = this._pendingAnnotData.filter(d => d.isHelixCov).reduce((s, d) => s + (d.helices?.length || 0), 0);
					const _msg = [_nP && `${_nP} pair${_nP!==1?'s':''}`, _nH && `${_nH} helix record${_nH!==1?'s':''}`].filter(Boolean).join(', ');
					this._upStatus.textContent = `${_msg} parsed.`;
					this._upStatus.className = 'rv-upload-status rv--ok';
				}
			}
			// Show structure target selector if annotations parsed and structure is loaded
			if (this._pendingAnnotData.length && this._rna) {
				this._renderAnnotTarget();
				this._upLoadBtn.disabled = false;
			}
		}
		_renderAnnotTarget() {
			if (!this._upAnnotTargetSection || !this._upAnnotTargetList) return;
			const hasCov = this._pendingAnnotData.some(d => d.isCov || d.isHelixCov);
			const allStructs = this._structures?.length ? this._structures : this._rna ? [{
				label: this._rna._label || 'Structure',
				baseDisplay: this._rna.baseDisplay,
			}] : [];
			// .cov files only target Stockholm structures (those with baseDisplay)
			const structs = hasCov ? allStructs.filter(s => !!s.baseDisplay) : allStructs;
			this._upAnnotTargetList.innerHTML = '';
			structs.forEach(s => {
				const origIdx = allStructs.indexOf(s);
				const row = document.createElement('label');
				row.className = 'rv-annot-target-row';
				// .cov: never pre-select; .tab: pre-select the current structure
				const checked = !hasCov && origIdx === this._currentStructIdx ? ' checked' : '';
				row.innerHTML = `<input type="radio" name="rv-annot-target" value="${origIdx}"${checked}>` + `<span class="rv-annot-target-idx">${origIdx + 1}</span>` + `<span class="rv-annot-target-lbl" title="${s.label}">${s.label}</span>`;
				this._upAnnotTargetList.appendChild(row);
			});
			this._upAnnotTargetSection.style.display = structs.length > 0 ? 'block' : 'none';
		}
		_renderXmlOrder() {
			if (!this._upXmlOrderList) return;
			const recs = this._pendingXmlData;
			this._upXmlOrder.style.display = recs.length ? 'block' : 'none';
			this._upXmlOrderList.innerHTML = '';
			recs.forEach((r, idx) => {
				const row = document.createElement('div');
				row.className = 'rv-struct-order-row';
				row.innerHTML = `<span class="rv-struct-order-idx">${idx + 1}</span>` + `<span class="rv-struct-order-lbl" title="${r.id}">${r.id}</span>` + `<span class="rv-struct-order-src">${r._src}</span>` + `<div class="rv-struct-order-btns">` + `<button class="rv-struct-order-btn" ${idx === 0 ? 'disabled' : ''}>▲</button>` + `<button class="rv-struct-order-btn" ${idx === recs.length - 1 ? 'disabled' : ''}>▼</button>` + `<button class="rv-struct-order-btn" title="Remove">✕</button>` + `</div>`;
				const [upBtn, dnBtn, rmBtn] = row.querySelectorAll('.rv-struct-order-btn');
				upBtn.addEventListener('click', () => {
					if (idx > 0) {
						[recs[idx - 1], recs[idx]] = [recs[idx], recs[idx - 1]];
						this._renderXmlOrder();
					}
				});
				dnBtn.addEventListener('click', () => {
					if (idx < recs.length - 1) {
						[recs[idx + 1], recs[idx]] = [recs[idx], recs[idx + 1]];
						this._renderXmlOrder();
					}
				});
				rmBtn.addEventListener('click', () => {
					recs.splice(idx, 1);
					const srcStillUsed = recs.some(r2 => r2._src === r._src);
					if (!srcStillUsed) this._accumulatedXmlFiles = this._accumulatedXmlFiles.filter(f => f.name !== r._src);
					if (this._upXmlNames) this._upXmlNames.textContent = this._accumulatedXmlFiles.map(f => f.name).join(', ') || '';
					this._renderXmlOrder();
				});
				this._upXmlOrderList.appendChild(row);
			});
		}
		async _loadFromFiles() {
			if (this._alnActive) this._exitAlnView();
			const readText = f => new Promise((res, rej) => {
				const r = new FileReader();
				r.onload = () => res(r.result);
				r.onerror = () => rej(new Error(`Cannot read ${f.name}`));
				r.readAsText(f);
			});
			const setStatus = (msg, cls = '') => {
				this._upStatus.textContent = msg;
				this._upStatus.className = 'rv-upload-status' + (cls ? ' ' + cls : '');
			};
			this._upLoadBtn.disabled = true;
			setStatus('Parsing files…');
			try {
				// Annotation-only mode, apply pair annotations to an existing structure
				if (this._pendingAnnotData.length > 0 && this._pendingStructures.length === 0 && this._pendingXmlData.length === 0) {
					if (!this._rna) throw new Error('No structure loaded to annotate.');
					const layouts = this._structLayouts?.length ? this._structLayouts : [this._rna];
					// In positional (canvas-drop) mode the two lists must be the same length
					if (this._loadedStructsOrder?.length > 0) {
						const nFiles = this._pendingAnnotData.length;
						const nStructs = this._loadedStructsOrder.length;
						if (nStructs !== nFiles) {
							const diff = Math.abs(nStructs - nFiles);
							throw new Error(`${nFiles} annotation file${nFiles !== 1 ? 's' : ''} but ` + `${nStructs} structure${nStructs !== 1 ? 's' : ''} selected — ` + `remove ${diff} ${nFiles > nStructs ? 'annotation file' : 'structure'}${diff !== 1 ? 's' : ''} from the list above before loading.`);
						}
					}
					// Validate and apply each annotation file
					let _lastAnnotLabel = 'structure';
					for (let annotFileIdx = 0; annotFileIdx < this._pendingAnnotData.length; annotFileIdx++) {
						const {
							filename,
							pairs,
							isCov,
							isHelixCov,
							helices
						} = this._pendingAnnotData[annotFileIdx];
						// Determine target structure:
						// • positional mode (canvas drop): file[i] → _loadedStructsOrder[i]
						// • radio mode (upload panel): all files → radio-selected structure
						let targetIdx;
						if (this._loadedStructsOrder?.length > 0) {
							const orderedStruct = this._loadedStructsOrder[annotFileIdx];
							targetIdx = orderedStruct ? (this._structures || []).indexOf(orderedStruct) : this._currentStructIdx;
							if (targetIdx < 0) targetIdx = this._currentStructIdx;
						} else {
							const checkedRadio = this._upAnnotTargetList?.querySelector('input[type=radio]:checked');
							targetIdx = checkedRadio ? parseInt(checkedRadio.value) : this._currentStructIdx;
						}
						const layout = layouts[targetIdx];
						if (!layout) throw new Error('Selected structure not found.');
						_lastAnnotLabel = layout.label || 'structure';
						const structPairs = getStructurePairSet(layout.structure || '');
						// ── .helixcov: build helix bounding-box annotations ──────────────────
						if (isHelixCov) {
							const sigH = (helices || []).filter(h => h.significant);
							if (!sigH.length) throw new Error(`"${filename}": no significant helices.`);
							const o2r = new Map();
							if (layout.positionLabels?.length) layout.positionLabels.forEach((col1, ri) => o2r.set(col1 - 1, ri));
							else
								for (let i = 0; i < layout.n; i++) o2r.set(i, i);
							// Build pairs array from rendered structure (nested + pseudoknot)
							const _lpa = buildPairsArray(layout.structure || '');
							const _lpaMap = new Map();
							// ssConsPkPairs first so main structure pairs take priority for shared positions
							if (layout.ssConsPkPairs)
								for (const fps of Object.values(layout.ssConsPkPairs))
									for (const ps of fps) {
										_lpaMap.set(ps.i, ps.j);
										_lpaMap.set(ps.j, ps.i);
									}
							for (const ps of (layout.pseudoPairs || [])) {
								_lpaMap.set(ps.i, ps.j);
								_lpaMap.set(ps.j, ps.i);
							}
							for (let i = 0; i < layout.n; i++) {
								if (_lpa[i] >= 0) _lpaMap.set(i, _lpa[i]);
							}
							const helixAnnotations = sigH.map(h => {
								const ri5All = [];
								for (let c = h.start5p; c <= h.end5p; c++)
									if (o2r.has(c)) ri5All.push(o2r.get(c));
								const hp = ri5All
									.filter(r => _lpaMap.has(r))
									.map(r => ({
										ri5: r,
										ri3: _lpaMap.get(r)
									}))
									.sort((a, b) => a.ri5 - b.ri5);
								if (!hp.length) return null;
								// Group consecutive pairs into sub-helices (same as loadHelixCov)
								const subHelices = [];
								let shCur = [hp[0]];
								for (let i = 1; i < hp.length; i++) {
									const pv = shCur[shCur.length - 1],
										nxt = hp[i];
									if (nxt.ri5 === pv.ri5 + 1 && nxt.ri3 === pv.ri3 - 1) shCur.push(nxt);
									else {
										subHelices.push(shCur);
										shCur = [nxt];
									}
								}
								subHelices.push(shCur);
								const pkSet = new Set((layout.pseudoPairs || []).map(ps => pairKey(ps.i, ps.j)));
								if (layout.ssConsPkPairs)
									for (const fps of Object.values(layout.ssConsPkPairs))
										for (const ps of fps) pkSet.add(pairKey(ps.i, ps.j));
								const isPkHelix = h.helixType === 'PK' || h.helixType === 'XCOV';
								const nestedSubs = [],
									pkPairs = [];
								for (const sh of subHelices) {
									const nPos5p = [],
										nPos3p = [];
									for (let k = 0; k < sh.length; k++) {
										if (isPkHelix || pkSet.has(pairKey(sh[k].ri5, sh[k].ri3)))
											pkPairs.push({
												i: sh[k].ri5,
												j: sh[k].ri3
											});
										else {
											nPos5p.push(sh[k].ri5);
											nPos3p.push(sh[k].ri3);
										}
									}
									if (nPos5p.length) nestedSubs.push({
										pos5p: nPos5p,
										pos3p: nPos3p
									});
								}
								return {
									nestedSubs,
									pkPairs,
									evalue: h.evalue,
									pvalue: h.pvalue
								};
							}).filter(a => a?.nestedSubs?.length > 0 || a?.pkPairs?.length > 0);
							if (!helixAnnotations.length) throw new Error(`"${filename}": no helix positions mapped to "${layout.label||'selected'}".`);
							const helixAnnotFinal = helixAnnotations
								.map(a => ({
									subHelices: a.nestedSubs,
									pkPairs: a.pkPairs,
									evalue: a.evalue,
									pvalue: a.pvalue
								}));
							layout.helixAnnotations = helixAnnotFinal;
							const pkGlowPairs = helixAnnotations.flatMap(a => a.pkPairs);
							if (pkGlowPairs.length) layout.pseudoHelixCovAnnotations = pkGlowPairs;
							layout.isCovAnnot = true;
							this._currentStructIdx = targetIdx;
							this._rna = layout;
							if (this._constructorConfig?.showPairAnnotations !== false) this._showPairAnnotations = true;
							if (this._chkPAnnot) this._chkPAnnot.classList.add('rv--active');
							this._buildPairAnnotLegend(layout.pairAnnotColorMap, true);
							this._buildStructSwitcher();
							this._render();
							this.fit();
							continue;
						}
						// If this is a Stockholm-derived structure, remap alignment-space coords to rendered coords
						const remappedPairs = remapAnnotPairs(pairs, layout.positionLabels);
						// Split into nested vs pseudoknot pairs (same logic as loadCov)
						const pkSetCov = new Set((layout.pseudoPairs || []).map(ps => pairKey(ps.i, ps.j)));
						if (layout.ssConsPkPairs)
							for (const fps of Object.values(layout.ssConsPkPairs))
								for (const ps of fps) pkSetCov.add(pairKey(ps.i, ps.j));
						if (layout.ssConsPkPairs)
							for (const fps of Object.values(layout.ssConsPkPairs))
								for (const ps of fps) pkSetCov.add(pairKey(ps.i, ps.j));
						const nestedStructPairs = new Set([...structPairs].filter(k => !pkSetCov.has(k)));
						const nestedCovPairs = remappedPairs.filter(({
							i,
							j
						}) => nestedStructPairs.has(pairKey(i, j)));
						const pkCovPairs = remappedPairs.filter(({
							i,
							j
						}) => pkSetCov.has(pairKey(i, j)));
						if (!nestedCovPairs.length && !pkCovPairs.length)
							buildAnnotationArrays(remappedPairs, structPairs, filename, layout.label); // throws
						let pairAnnotColorMap = layout.pairAnnotColorMap || null;
						if (nestedCovPairs.length) {
							const res = buildAnnotationArrays(nestedCovPairs, nestedStructPairs, filename, layout.label);
							layout.pairAnnotations = res.annotArr;
							pairAnnotColorMap = res.pairAnnotColorMap;
						}
						if (pkCovPairs.length) {
							const pkColorMap = buildAnnotColorMapAuto(pkCovPairs);
							layout.pseudoCovAnnotations = pkCovPairs.map(({
								i,
								j,
								category
							}) => ({
								i,
								j,
								color: pkColorMap ? (pkColorMap[category ?? ANNOT_MISSING_KEY] ?? ANNOT_DEFAULT_COLOR) : ANNOT_DEFAULT_COLOR,
							}));
						}
						layout.pairAnnotColorMap = pairAnnotColorMap;
						layout.isCovAnnot = !!(isCov || layout.helixAnnotations?.length);
						this._currentStructIdx = targetIdx;
						this._rna = layout;
						if (this._constructorConfig?.showPairAnnotations !== false) {
							this._showPairAnnotations = true;
							if (this._chkPAnnot) this._chkPAnnot.classList.add('rv--active');
						}
						this._buildPairAnnotLegend(pairAnnotColorMap, isCov);
						this._buildStructSwitcher();
						this._render();
						this.fit();
					}
					setStatus(`Annotation applied to "${_lastAnnotLabel}".`, 'rv--ok');
					this._hideUploadPanel();
					return;
				}
				// Use pre-parsed structures (already ordered by user via ↑↓ buttons)
				let newStructures = this._pendingStructures.map(s => ({
					...s
				}));
				// XML-only mode: add reactivity to the already-loaded structures
				// Do NOT go through APPEND/REPLACE, just update values in-place.
				const isXmlOnly = newStructures.length === 0;
				let xmlOnlyTargetIdxs = null;
				if (isXmlOnly) {
					if (this._pendingXmlData.length === 0 || !this._rna) throw new Error('No structure records found');
					// Carry values + annotations from structLayouts (raw _structures[] doesn't have them).
					// Do NOT carry colorMap — let the top-level SHAPE default be applied correctly.
					const allExisting = this._structures?.length ? this._structures.map((s, i) => ({
						...s,
						values: this._structLayouts?.[i]?.values,
						pairAnnotations: this._structLayouts?.[i]?.pairAnnotations || s.pairAnnotations || null,
						pairAnnotColorMap: this._structLayouts?.[i]?.pairAnnotColorMap || s.pairAnnotColorMap || null,
					})) : [{
						label: this._rna._label || 'Structure',
						sequence: this._rna.sequence,
						structure: this._rna.structure,
						values: this._rna.values,
						colorMap: this._rna.colorMap
					}];
					if (this._loadedStructsOrder?.length > 0) {
						// Canvas-drop positional mode: user reordered both lists — match by position.
						// Both lists must be the same length before loading.
						const nXml = this._pendingXmlData.length;
						const nStructs = this._loadedStructsOrder.length;
						if (nStructs !== nXml) {
							const diff = Math.abs(nStructs - nXml);
							throw new Error(`${nXml} reactivity file${nXml !== 1 ? 's' : ''} but ` + `${nStructs} structure${nStructs !== 1 ? 's' : ''} selected — ` + `remove ${diff} ${nXml > nStructs ? 'reactivity file' : 'structure'}${diff !== 1 ? 's' : ''} from the list above before loading.`);
						}
						const orderedIdxs = this._loadedStructsOrder.map(s => (this._structures || []).indexOf(s)).filter(i => i >= 0);
						xmlOnlyTargetIdxs = new Set(orderedIdxs);
						// Subset for the positional matcher; mutations propagate back to allExisting
						newStructures = orderedIdxs.map(i => allExisting[i]);
						var _xmlAllExisting = allExisting; // restore after matching
					} else {
						const checkedIdxs = new Set(
							[...(this._upXmlTargetList?.querySelectorAll('input[type=checkbox]:checked') || [])].map(cb => parseInt(cb.value)));
						if (checkedIdxs.size === 0 && allExisting.length > 1) throw new Error('Select at least one structure to apply reactivity to');
						// Selected structure count must always equal the number of XML files.
						const nXml = this._pendingXmlData.length;
						const nSel = checkedIdxs.size || allExisting.length;
						if (nSel !== nXml) {
							const diff = Math.abs(nSel - nXml);
							const verb = nSel > nXml ? 'Deselect' : 'Select';
							throw new Error(`${nXml} reactivity files but ${nSel} structure${nSel !== 1 ? 's' : ''} selected — ` + `${verb} ${diff} structure${diff !== 1 ? 's' : ''} to match.`);
						}
						xmlOnlyTargetIdxs = checkedIdxs.size > 0 ? checkedIdxs : new Set(allExisting.map((_, i) => i));
						newStructures = allExisting;
					}
				}
				// Match reactivity to structures
				if (this._pendingXmlData.length > 0) {
					const xmlRecs = this._pendingXmlData;
					if (xmlRecs.length === newStructures.length) {
						// Positional match — user explicitly ordered both lists
						for (let i = 0; i < newStructures.length; i++) {
							const s = newStructures[i];
							const rec = xmlRecs[i];
							const normSeq = normalizeSeq(s.sequence);
							if (rec.sequence && rec.sequence !== normSeq) throw new Error(`Reactivity file's "${rec.id}" sequence does not match ` + `structure's "${s.label}" sequence`);
							if (rec.values.length !== s.sequence.length) throw new Error(`Reactivity length (${rec.values.length}) ≠ sequence length ` + `(${s.sequence.length}) for "${s.label}"`);
							s.values = rec.values;
						}
					} else {
						// Counts don't match — refuse to guess which file goes to which structure
						const diff = Math.abs(xmlRecs.length - newStructures.length);
						const verb = newStructures.length > xmlRecs.length ? 'Remove' : 'Add';
						throw new Error(`${xmlRecs.length} reactivity file${xmlRecs.length !== 1 ? 's' : ''} but ` + `${newStructures.length} structure${newStructures.length !== 1 ? 's' : ''} — ` + `${verb} ${diff} ${diff !== 1 ? 'entries' : 'entry'} so the counts match.`);
					}
				}
				// For XML-only: restore pre-load values on non-targeted structures.
				// Use structLayouts directly, null means no reactivity, no fallback to s.values
				// (which was just mutated by the XML matcher above).
				if (isXmlOnly && xmlOnlyTargetIdxs) {
					// In positional (canvas-drop) mode newStructures was the ordered subset;
					// switch back to the full allExisting list for the restore step.
					if (typeof _xmlAllExisting !== 'undefined') newStructures = _xmlAllExisting;
					newStructures = newStructures.map((s, i) => xmlOnlyTargetIdxs.has(i) ? s : {
						...s,
						values: this._structLayouts?.[i]?.values
					});
				}
				let allStructures, startIdx = 0;
				if (isXmlOnly) {
					// Reactivity added to existing structures, keep same tabs
					// Jump to the first structure that actually got reactivity
					allStructures = newStructures;
					startIdx = (xmlOnlyTargetIdxs?.size > 0) ? Math.min(...xmlOnlyTargetIdxs) : (this._currentStructIdx ?? 0);
				} else {
					const curSeq = this._rna ? normalizeSeq(this._rna.sequence) : null;
					const doAppend = curSeq !== null; // allow any sequences to coexist as tabs
					if (doAppend) {
						const existing = this._structures?.length ? this._structures.map((s, i) => ({
							...s,
							// Recover the actual used sequence from the layout, structure
							// objects loaded via the public API may not carry .sequence when
							// config.sequence was used as a shared value.
							sequence: s.sequence || this._structLayouts?.[i]?.sequence || '',
							pairAnnotations: this._structLayouts?.[i]?.pairAnnotations || s.pairAnnotations || null,
							pairAnnotColorMap: this._structLayouts?.[i]?.pairAnnotColorMap || s.pairAnnotColorMap || null,
							helixAnnotations: this._structLayouts?.[i]?.helixAnnotations || s.helixAnnotations || null,
							pseudoCovAnnotations: this._structLayouts?.[i]?.pseudoCovAnnotations || s.pseudoCovAnnotations || null,
							pseudoHelixCovAnnotations: this._structLayouts?.[i]?.pseudoHelixCovAnnotations || s.pseudoHelixCovAnnotations || null,
							isCovAnnot: this._structLayouts?.[i]?.isCovAnnot || s.isCovAnnot || false,
							ssConsFeatures: this._structLayouts?.[i]?.ssConsFeatures || s.ssConsFeatures || null,
							ssConsPkPairs: this._structLayouts?.[i]?.ssConsPkPairs || s.ssConsPkPairs || null,
						})) : [{
							label: this._rna._label || 'Structure 1',
							sequence: this._rna.sequence,
							structure: this._rna.structure,
							values: this._rna.values,
							colorMap: this._rna.colorMap,
							pairAnnotations: this._rna.pairAnnotations || null,
							pairAnnotColorMap: this._rna.pairAnnotColorMap || null,
							helixAnnotations: this._rna.helixAnnotations || null,
							pseudoCovAnnotations: this._rna.pseudoCovAnnotations || null,
							pseudoHelixCovAnnotations: this._rna.pseudoHelixCovAnnotations || null,
							isCovAnnot: this._rna.isCovAnnot || false,
							ssConsFeatures: this._rna.ssConsFeatures || null,
							ssConsPkPairs: this._rna.ssConsPkPairs || null,
						}];
						allStructures = [...existing, ...newStructures];
						startIdx = existing.length; // jump to first newly added structure
					} else {
						allStructures = newStructures;
					}
				}
				const hasReact = allStructures.some(s => s.values);
				const cfg = {
					sequence: allStructures[0].sequence,
					structures: allStructures,
					colorMap: hasReact ? this._getDefaultShapeColorMap() : undefined,
					_startIdx: startIdx,
				};
				this.load(cfg);
				this._pendingStructures = [];
				this._accumulatedDbFiles = [];
				if (hasReact) {
					if (this._constructorConfig?.showColors !== false) {
						this._showColors = true;
						if (this._chkColors) this._chkColors.classList.add('rv--active');
					}
					// Only show the  color legend if the structure now in focus has reactivity
					if (this._rna?.values && this._rna.colorMap?.stops?.length) {
						this._updateLegend(this._rna.colorMap);
						this._legend.style.display = 'block';
					} else {
						this._legend.style.display = 'none';
					}
					this._render();
				}
				// Apply pair annotations (combined DB+annotation load)
				if (this._pendingAnnotData.length) {
					const layouts = this._structLayouts?.length ? this._structLayouts : (this._rna ? [this._rna] : []);
					for (const {
							filename,
							pairs,
							isCov
						}
						of this._pendingAnnotData) {
						const checkedRadio = this._upAnnotTargetList?.querySelector('input[type=radio]:checked');
						const tIdx = checkedRadio ? parseInt(checkedRadio.value) : startIdx;
						const layout = layouts[tIdx] || layouts[startIdx] || layouts[0];
						if (!layout) continue;
						const structPairs = getStructurePairSet(layout.structure || '');
						// Stockholm remapping, same logic as annotation-only path
						const remappedPairs = remapAnnotPairs(pairs, layout.positionLabels);
						const {
							invalid,
							annotArr,
							pairAnnotColorMap
						} = buildAnnotationArrays(remappedPairs, structPairs, filename, layout.label);
						if (invalid.length) setStatus(`Warning: "${filename}", ${invalid.length} pair${invalid.length > 1 ? 's' : ''} not in structure were skipped`);
						layout.pairAnnotations = annotArr;
						layout.pairAnnotColorMap = pairAnnotColorMap;
						layout.isCovAnnot = !!isCov;
						if (tIdx === this._currentStructIdx || layouts.length === 1) {
							this._rna.pairAnnotations = annotArr;
							this._rna.pairAnnotColorMap = pairAnnotColorMap;
							this._rna.isCovAnnot = !!isCov;
							if (this._constructorConfig?.showPairAnnotations !== false) {
								this._showPairAnnotations = true;
								if (this._chkPAnnot) this._chkPAnnot.classList.add('rv--active');
							}
							this._buildPairAnnotLegend(pairAnnotColorMap, isCov);
						}
					}
					this._render();
				}
				const parts = [`${allStructures.length} structure${allStructures.length > 1 ? 's' : ''} loaded`,
					isXmlOnly ? '(reactivity added)' : (allStructures.length > (this._structures?.length || (this._rna ? 1 : 0)) ? '(appended)' : ''),
					hasReact ? `· reactivity matched` : '',
				].filter(Boolean);
				setStatus(parts.join(' '), 'rv--ok');
				this._hideUploadPanel();
			} catch (err) {
				setStatus(err.message, 'rv--err');
				this._upLoadBtn.disabled = false;
				// Keep panel open and annotation data intact so the user can
				// pick a different target structure and try again without
				// re-dropping the file.
			}
		}
		_buildPairAnnotLegend(colorMap, isCov = false) {
			if (!this._palLegend) return;
			const hasHelix = !!this._rna?.helixAnnotations?.length;
			if (!colorMap?.length && !hasHelix) {
				this._palLegend.style.display = 'none';
				this._palLegend.innerHTML = '';
				return;
			}
			const rows = (colorMap || []).map(({
				key,
				color
			}) => `<div class="rv-pal-entry">` + `<span class="rv-pal-swatch" style="background:${color};border-color:${color}"></span>` + `<span class="rv-pal-key">${key}</span>` + `</div>`).join('');
			const _helixAnnotCol = getComputedStyle(this._root).getPropertyValue('--rv-helix-annot-color').trim() || '#aff0a8';
			const helixRow = hasHelix ? `<div class="rv-pal-entry">` + `<span class="rv-pal-swatch" style="background:${_helixAnnotCol};opacity:0.35;border-color:${_helixAnnotCol}"></span>` + `<span class="rv-pal-key">Helix-level</span></div>` : '';
			const legendTitle = isCov ? 'Covarying pairs' : 'Pair annotations';
			this._palLegend.innerHTML = `<h4>${legendTitle}</h4>${rows}${helixRow}`;
			this._palLegend.style.display = this._showPairAnnotations ? 'block' : 'none';
		}
		/*
		 Cycle through layout algorithms.
		 In Auto mode each structure is independently scored and the algorithm
		 with fewer overlapping base circles is used.
		 */
		toggleLayout() {
			const _curAlgo = this._structLayouts?.[this._currentStructIdx]?._algo ?? this._rna?._algo ?? this._lastPickedAlgo ?? 'radiate';
			const current = this._layoutAlgo === 'auto' ? _curAlgo : this._layoutAlgo;
			this._layoutAlgo = current === 'naview' ? 'radiate' : 'naview';
			this._syncLayoutBtn(this._layoutAlgo);
			if (this._lastConfig) {
				const savedIdx = this._currentStructIdx;
				if (this._structures.length > 0) {
					const cfg = this._lastConfig;
					// Prefer structLayouts as source of truth, they carry user-applied
					// values, colorMaps and pairAnnotations that may not be in _structures[]
					const s = this._structures[savedIdx];
					const existing = this._structLayouts[savedIdx];
					const vals = existing?.values ?? s.values ?? cfg.values ?? null;
					const cm = existing?.colorMap ?? (s.colorMap != null ? normalizeColorMap({
						colorMap: s.colorMap
					}) : normalizeColorMap(cfg));
					const pa = existing?.pairAnnotations || s.pairAnnotations || cfg.pairAnnotations || null;
					const pacm = existing?.pairAnnotColorMap || normalizePairAnnotColorMap(s.pairAnnotColorMap || cfg.pairAnnotColorMap);
					const ha = existing?.helixAnnotations || s.helixAnnotations || null;
					this._structLayouts[savedIdx] = this._computeLayout(s.sequence, s.structure, vals, cm, pa, pacm, ha, s.baseDisplay || null, s.positionLabels || null, s.alnSeqs || null, s.alnStruct || null, s.alnLen || 0);
					this._copyLayoutAnnotations(existing, this._structLayouts[savedIdx]);
					this._currentStructIdx = savedIdx;
					this._rna = this._structLayouts[savedIdx];
					this._render();
					if (this._alnActive && this._pkPanelsEl) this._pkPanelsEl.style.display = 'none';
					this.fit();
				} else {
					// Single-structure: recompute preserving all current runtime state
					const prev = this._rna;
					const rna = this._computeLayout(prev.sequence, prev.structure, prev.values, prev.colorMap, prev.pairAnnotations, prev.pairAnnotColorMap, prev.baseDisplay, prev.positionLabels);
					this._copyLayoutAnnotations(prev, rna);
					this._rna = rna;
					this._render();
					if (this._alnActive && this._pkPanelsEl) this._pkPanelsEl.style.display = 'none';
					this.fit();
				}
			}
		}
		/*
		 Sync the layout button label and  color to `algo` ('radiate' or 'naview').
		 Always reflects the algorithm actually being rendered, regardless of whether
		 the internal _layoutAlgo is 'auto', 'naview', or 'radiate'.
		*/
		_syncLayoutBtn(algo) {
			if (!this._layoutBtn) return;
			// The button always shows the TARGET (where clicking takes you),
			// not the current state: NAView active → show "R" / Radiate; Radiate active → show "N" / NAView
			const goingTo = (algo === 'naview') ? 'radiate' : 'naview';
			const letter = this._layoutBtn.querySelector('.rv-layout-letter');
			const lbl = this._layoutBtn.querySelector('.rv-layout-lbl');
			if (letter) letter.textContent = goingTo === 'naview' ? 'N' : 'R';
			if (lbl) lbl.textContent = goingTo === 'naview' ? 'NAView' : 'Radiate';
			this._layoutBtn.title = goingTo === 'naview' ? 'Switch to NAView layout' : 'Switch to Radiate layout';
			this._layoutBtn.classList.remove('rv--naview', 'rv--auto');
			if (algo === 'naview') this._layoutBtn.classList.add('rv--naview');
		}
		/*
		 Choose the layout with fewer overlapping base circles.
		 Both radiate and NAView are computed; the one with the lower
		 overlap score (fast spatial-grid count) is returned.
		 Records the choice in _lastPickedAlgo and immediately syncs the button.
		*/
		_pickLayout(pairs, n) {
			const rad = drawRNARadiate(pairs, n);
			const nav = drawRNANAView(pairs, n);
			const sRad = this._scoreOverlaps(rad.coords, n);
			const sNav = this._scoreOverlaps(nav.coords, n);
			// Each overlapping helix pair contributes ~4 backbone crossings.
			// autoLayoutTolerance=0, prefer NAView whenever it has fewer crossings.
			// autoLayoutTolerance=1, allow 1 extra overlapping helix pair in NAView, etc.
			const threshold = this._autoTolerance * 4;
			const useNav = sNav + threshold < sRad;
			this._lastPickedAlgo = useNav ? 'naview' : 'radiate';
			this._syncLayoutBtn(this._lastPickedAlgo);
			return useNav ? this._autoRotateLayout(nav) : rad;
		}
		/*
		 Rotate a NAView layout result so the structure fills the canvas as
		 large as possible after fit().
		 
		 Tries 180 candidate angles (every 2°; the bounding-box has period π
		 so this covers all distinct orientations) and keeps the angle that
		 maximises min(canvasW/W, canvasH/H).  Falls back to minimising
		 max(W,H) when the canvas is not yet rendered.
		 
		 Both coords and loop-centre arrays are rotated so helix-rotation
		 interaction remains correct after the transform.
		*/
		_autoRotateLayout(result) {
			const n = result.coords.length;
			if (n < 2) return result;
			const cw = (this._svgEl?.clientWidth > 0) ? this._svgEl.clientWidth : 0;
			const ch = (this._svgEl?.clientHeight > 0) ? this._svgEl.clientHeight : 0;
			const scoreOf = (W, H) => (cw > 0 && ch > 0) ? Math.min(cw / W, ch / H) : 1 / Math.max(W, H);
			const STEPS = 180;
			let bestAngle = 0,
				bestScore = -Infinity;
			for (let a = 0; a < STEPS; a++) {
				const angle = (a / STEPS) * Math.PI;
				const cos = Math.cos(angle),
					sin = Math.sin(angle);
				let x0 = Infinity,
					x1 = -Infinity,
					y0 = Infinity,
					y1 = -Infinity;
				for (let i = 0; i < n; i++) {
					const rx = result.coords[i].x * cos - result.coords[i].y * sin;
					const ry = result.coords[i].x * sin + result.coords[i].y * cos;
					if (rx < x0) x0 = rx;
					if (rx > x1) x1 = rx;
					if (ry < y0) y0 = ry;
					if (ry > y1) y1 = ry;
				}
				const s = scoreOf((x1 - x0) || 1, (y1 - y0) || 1);
				if (s > bestScore) {
					bestScore = s;
					bestAngle = angle;
				}
			}
			if (bestAngle < 1e-4) return result;
			const cos = Math.cos(bestAngle),
				sin = Math.sin(bestAngle);
			return {
				...result,
				coords: result.coords.map(c => ({
					x: c.x * cos - c.y * sin,
					y: c.x * sin + c.y * cos,
				})),
				centers: result.centers.map(c => ({
					x: c.x * cos - c.y * sin,
					y: c.x * sin + c.y * cos,
				})),
			};
		}
		// Draw semi-transparent bounding boxes for significant helices (.helixcov)
		_renderHelixAnnotations(g, coords, n, baseR) {
			const anns = this._rna?.helixAnnotations;
			if (!anns?.length || !this._showPairAnnotations) return;
			const cs = getComputedStyle(this._root);
			const pad = parseFloat(cs.getPropertyValue('--rv-helix-annot-padding')) || (baseR * 1.7);
			const helixColor = cs.getPropertyValue('--rv-helix-annot-color').trim() || '#aff0a8';
			const helixOpacity = parseFloat(cs.getPropertyValue('--rv-helix-annot-opacity')) || 0.5;
			// Parse hex → rgba with opacity
			const _hm = helixColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
			const _hr = _hm ? parseInt(_hm[1], 16) : 239,
				_hg = _hm ? parseInt(_hm[2], 16) : 68,
				_hb = _hm ? parseInt(_hm[3], 16) : 68;
			const _hexColor = `#${_hr.toString(16).padStart(2,'0')}${_hg.toString(16).padStart(2,'0')}${_hb.toString(16).padStart(2,'0')}`;
			const _helixHex = _hexColor; // kept for SVG legend
			for (const ann of anns) {
				const annPad = ann.padding ?? pad;
				for (const sh of (ann.subHelices || [])) {
					const p5 = sh.pos5p.filter(ri => ri >= 0 && ri < n);
					const p3 = sh.pos3p.filter(ri => ri >= 0 && ri < n);
					if (!p5.length || !p3.length) continue;
					const x1 = coords[p5[0]].x,
						y1 = coords[p5[0]].y;
					const x2 = coords[p3[0]].x,
						y2 = coords[p3[0]].y;
					const ixm = (coords[p5[p5.length - 1]].x + coords[p3[p3.length - 1]].x) / 2;
					const iym = (coords[p5[p5.length - 1]].y + coords[p3[p3.length - 1]].y) / 2;
					const oxm = (x1 + x2) / 2,
						oym = (y1 + y2) / 2;
					const cx = (oxm + ixm) / 2,
						cy = (oym + iym) / 2;
					const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
					const w = Math.hypot(x2 - x1, y2 - y1) + annPad * 2;
					const h = Math.hypot(ixm - oxm, iym - oym) + annPad * 2;
					const rx = Math.min(baseR * 0.6, w / 2, h / 2);
					const rect = document.createElementNS(NS, 'rect');
					rect.setAttribute('x', cx - w / 2);
					rect.setAttribute('y', cy - h / 2);
					rect.setAttribute('width', w);
					rect.setAttribute('height', h);
					rect.setAttribute('rx', rx);
					rect.setAttribute('ry', rx);
					const annColor = ann.color ?? _helixHex;
					const annOpacity = ann.opacity ?? helixOpacity;
					const annStrokeWidth = ann.strokeWidth ?? 1.5;
					rect.setAttribute('fill', annColor);
					rect.setAttribute('fill-opacity', String(annOpacity));
					rect.setAttribute('stroke', annColor);
					rect.setAttribute('stroke-opacity', '0.45');
					rect.setAttribute('stroke-width', String(annStrokeWidth));
					rect.setAttribute('transform', `rotate(${angle},${cx},${cy})`);
					g.appendChild(rect);
				}
			}
		}
		/*
		 Draw  colored boxes behind each annotated base pair.
		 
		 Each annotation is an object with:
		 - i           {number}  0-indexed base position (lower of the pair)
		 - j           {number}  optional partner (defaults to pairs[i])
		 - color       {string}  hex  color, use this OR value
		 - value       {number}  mapped through pairAnnotColorMap
		 - opacity     {number}  fill opacity (default: 0.3)
		 - strokeWidth {number}  border thickness (default: 1.5)
		 - padding     {number}  extra space around pair (default: 5 scene units)
		*/
		_renderPairAnnotations(g, coords, pairs, annotations, colorMap, baseR, masterOpacity = 1) {
			// Read CSS variable defaults (per-annotation fields override these)
			const cs = getComputedStyle(this._root);
			const defOpa = parseFloat(cs.getPropertyValue('--rv-pair-annot-opacity')) || 0.5;
			const defSW = parseFloat(cs.getPropertyValue('--rv-pair-annot-stroke-width')) || 1.5;
			const defPad = parseFloat(cs.getPropertyValue('--rv-pair-annot-padding')) || 5;
			for (const ann of annotations) {
				let i = ann.i,
					j = ann.j;
				// Resolve i/j silently — already validated at load time
				if (i != null && j != null) {
					if (pairs[i] !== j || pairs[j] !== i) continue;
				} else if (i != null) {
					j = pairs[i];
					if (j == null || j < 0) continue;
				} else if (j != null) {
					i = pairs[j];
					if (i == null || i < 0) continue;
				} else continue;
				if (i < 0 || i >= coords.length || j < 0 || j >= coords.length) continue;
				// Color resolution: direct color > key lookup > white fallback
				let color = ann.color;
				if (!color && ann.key != null && colorMap) {
					const entry = colorMap.find(e => e.key === ann.key);
					if (entry) color = entry.color;
				}
				if (!color) color = '#ffffff';
				const x1 = coords[i].x,
					y1 = coords[i].y;
				const x2 = coords[j].x,
					y2 = coords[j].y;
				const pad = ann.padding ?? defPad;
				const sw = ann.strokeWidth ?? defSW;
				const fopacity = (ann.opacity ?? defOpa) * masterOpacity;
				g.appendChild(this._mkPairAnnotRect(x1, y1, x2, y2, color, fopacity, sw, pad, baseR));
			}
		}
		/*
		 Validate a pairAnnotations array against the actual pairs of a structure.
		 Returns the first error string found, or null if everything is valid.
		 Called during load, before _render(), so _showError can be used safely.
		*/
		_validatePairAnnotations(annotations, pairs, n) {
			for (const ann of annotations) {
				const i = ann.i,
					j = ann.j;
				if (i == null && j == null) return 'pairAnnotations: each annotation must have at least i or j';
				if (i != null && j != null) {
					if (i < 0 || i >= n || j < 0 || j >= n) return `pairAnnotations: indices ${i} / ${j} out of range (sequence length ${n})`;
					if (pairs[i] !== j || pairs[j] !== i) return `pairAnnotations: bases ${i} and ${j} are not paired in this structure`;
				} else if (i != null) {
					if (i < 0 || i >= n) return `pairAnnotations: index ${i} out of range (sequence length ${n})`;
					if (pairs[i] < 0) return `pairAnnotations: base ${i} is unpaired in this structure`;
				} else {
					if (j < 0 || j >= n) return `pairAnnotations: index ${j} out of range (sequence length ${n})`;
					if (pairs[j] < 0) return `pairAnnotations: base ${j} is unpaired in this structure`;
				}
				// key validation, must exist in the colormap
				if (ann.key != null) {
					if (!ann._colorMap && !ann.color); // validated later with the actual colormap, skip here
				}
			}
			return null;
		}
		_validatePairAnnotationsWithMap(annotations, pairs, n, colorMap) {
			const base = this._validatePairAnnotations(annotations, pairs, n);
			if (base) return base;
			if (!colorMap) return null;
			for (const ann of annotations) {
				if (ann.key != null) {
					if (!colorMap.find(e => e.key === ann.key)) return `pairAnnotations: key '${ann.key}' not found in pairAnnotColorMap.`;
				}
			}
			return null;
		}
		_scoreOverlaps(coords, n) {
			// Signed area of triangle OAB (cross product of OA × OB)
			function cross2(ox, oy, ax, ay, bx, by) {
				return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
			}
			// True iff segments (x1,y1)-(x2,y2) and (x3,y3)-(x4,y4) properly cross
			function segsCross(x1, y1, x2, y2, x3, y3, x4, y4) {
				const d1 = cross2(x3, y3, x4, y4, x1, y1);
				const d2 = cross2(x3, y3, x4, y4, x2, y2);
				const d3 = cross2(x1, y1, x2, y2, x3, y3);
				const d4 = cross2(x1, y1, x2, y2, x4, y4);
				return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
			}
			let count = 0;
			for (let i = 0; i < n - 1; i++) {
				const x1 = coords[i].x,
					y1 = coords[i].y;
				const x2 = coords[i + 1].x,
					y2 = coords[i + 1].y;
				// j starts at i+2 so segments never share an endpoint
				for (let j = i + 2; j < n - 1; j++) {
					if (segsCross(x1, y1, x2, y2, coords[j].x, coords[j].y, coords[j + 1].x, coords[j + 1].y)) count++;
				}
			}
			return count;
		}
		destroy() {
			window.removeEventListener('mousemove', this._boundMove);
			window.removeEventListener('mouseup', this._boundUp);
			window.removeEventListener('keydown', this._boundKeyDown);
			this._root.remove();
		}
		// Legend
		_updateLegend(colorMap) {
			if (!colorMap) return;
			const {
				type = 'gradient', stops
			} = colorMap;
			if (!stops || !stops.length) return;
			// Title
			const h4 = this._legend.querySelector('h4');
			if (h4) {
				h4.textContent = colorMap.title || 'Reactivity';
				h4.style.display = colorMap.showTitle === false ? 'none' : '';
			}
			const minVal = type === 'discrete' ? (colorMap.min ?? 0) : stops[0].value;
			const maxVal = stops[stops.length - 1].value;
			const range = maxVal - minVal || 1;
			const pct = v => ((v - minVal) / range * 100).toFixed(1) + '%';
			// Gradient bar (never includes the NaN color)
			let gradCSS;
			if (type === 'discrete') {
				const parts = [];
				let fromVal = minVal;
				for (const stop of stops) {
					parts.push(`${stop.color} ${pct(fromVal)}`, `${stop.color} ${pct(stop.value)}`);
					fromVal = stop.value;
				}
				gradCSS = `linear-gradient(to right,${parts.join(',')})`;
			} else {
				gradCSS = `linear-gradient(to right,${stops.map(s => `${s.color} ${pct(s.value)}`).join(',')})`;
			}
			this._legendGrad.style.background = gradCSS;
			// Numeric labels
			const labelVals = type === 'discrete' ? [minVal, ...stops.map(s => s.value)] : stops.map(s => s.value);
			const allInt = labelVals.every(v => Number.isInteger(v));
			const fmt = v => allInt ? String(v) : parseFloat(v.toPrecision(3)).toString();
			this._legendLabels.innerHTML = labelVals.map((v, idx, arr) => {
				const p = ((v - minVal) / range * 100).toFixed(1);
				const base = 'position:absolute;white-space:nowrap;';
				const pos = idx === 0 ? `${base}left:0` : idx === arr.length - 1 ? `${base}right:0` : `${base}left:${p}%;transform:translateX(-50%)`;
				return `<span style="${pos}">${fmt(v)}</span>`;
			}).join('');
			// NaN swatch, shown as a separate row BELOW the gradient
			if (this._legendNaN) {
				if (colorMap.nanColor) {
					this._legendNaN.style.display = 'flex';
					this._legendNaN.innerHTML = `<span class="rv-legend-nan-swatch" style="background:${colorMap.nanColor}"></span>` + `<span>NaN / missing</span>`;
				} else {
					this._legendNaN.style.display = 'none';
				}
			}
		}
		// Internal rendering
		_applyTransform() {
			const t = `translate(${this._vx},${this._vy}) scale(${this._vscale})`;
			this._scene.setAttribute('transform', t);
			this._rotRing.setAttribute('transform', t);
			this._zoomLbl.textContent = Math.round(this._vscale * 100) + '%';
		}
		_zoomBy(factor) {
			const cx = this._canvas.clientWidth / 2,
				cy = this._canvas.clientHeight / 2;
			const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._vscale * factor));
			const actualF = newScale / this._vscale;
			this._vscale = newScale;
			this._vx = cx - actualF * (cx - this._vx);
			this._vy = cy - actualF * (cy - this._vy);
			this._applyTransform();
		}
		_clientToScene(ex, ey) {
			const rect = this._svgEl.getBoundingClientRect();
			return {
				x: (ex - rect.left - this._vx) / this._vscale,
				y: (ey - rect.top - this._vy) / this._vscale
			};
		}
		_render() {
			if (!this._rna) return;
			this._scene.innerHTML = '';
			if (this._pkPanelsEl) {
				this._pkPanelsEl.innerHTML = '';
				this._pkPanelsEl.style.display = 'none';
				this._pkPanelsEl.style.width = '';
				this._pkPanelsEl.style.height = '';
				this._pkPanelsEl.style.flexDirection = '';
			}
			const {
				coords,
				pairs,
				pseudoPairs,
				sequence,
				n,
				values,
				colorMap
			} = this._rna;
			const g_bg = document.createElementNS(NS, 'g'); // white eraser circles
			const g_helix = document.createElementNS(NS, 'g'); // helix cov boxes (deepest)
			const g_annot = document.createElementNS(NS, 'g'); // pair annotation boxes
			const g_bb = document.createElementNS(NS, 'g');
			const g_bp = document.createElementNS(NS, 'g');
			const g_base = document.createElementNS(NS, 'g');
			const g_pk = document.createElementNS(NS, 'g'); // PK lines, above non-endpoint bases
			const g_pk_top = document.createElementNS(NS, 'g'); // PK endpoint bases, above PK lines
			const g_ss_labels = document.createElementNS(NS, 'g'); // SS_cons labels, topmost
			// Stockholm structures use a different PK visualization (R3D arcs + mini panels)
			const isStockholm = !!(this._rna?.baseDisplay);
			// Layer order differs: Stockholm bonds go ABOVE bases; standard bonds go BELOW bases
			if (isStockholm) {
				this._scene.append(g_bb, g_bg, g_helix, g_annot, g_base, g_bp, g_pk, g_pk_top, g_ss_labels);
			} else {
				this._scene.append(g_bb, g_bg, g_helix, g_annot, g_bp, g_base, g_pk, g_pk_top, g_ss_labels);
			}
			// Collect PK endpoint indices so their bases render on top of PK lines (non-Stockholm only)
			const pkEndpts = isStockholm ? new Set() : new Set(pseudoPairs.flatMap(ps => [ps.i, ps.j]));
			// Read configurable geometry from CSS variables
			const cs = getComputedStyle(this._root);
			const baseR = parseFloat(cs.getPropertyValue('--rv-base-radius')) || BASE_R;
			const idxOff = parseFloat(cs.getPropertyValue('--rv-base-index-offset')) || 26;
			const bgColor = cs.getPropertyValue('--rv-bg').trim() || '#ffffff';
			// Helix cov bounding boxes (behind everything)
			this._renderHelixAnnotations(g_helix, coords, n, baseR);
			// Pair annotation boxes
			if (this._showPairAnnotations && this._rna.pairAnnotations?.length) {
				this._renderPairAnnotations(g_annot, coords, pairs, this._rna.pairAnnotations, this._rna.pairAnnotColorMap, baseR);
			}
			// Precompute centroid + bounding radius
			// Used by both pseudoknot routing and index-label placement
			let cxS = 0,
				cyS = 0;
			for (let i = 0; i < n; i++) {
				cxS += coords[i].x;
				cyS += coords[i].y;
			}
			const centX = cxS / n,
				centY = cyS / n;
			let R = 0;
			for (let i = 0; i < n; i++) {
				R = Math.max(R, Math.hypot(coords[i].x - centX, coords[i].y - centY));
			}
			// Backbone, skip segments where either endpoint is a skipped alignment position
			for (let i = 0; i < n - 1; i++) {
				const bd = this._rna?.baseDisplay;
				if (bd?.[i]?.skip || bd?.[i + 1]?.skip) continue;
				const l = document.createElementNS(NS, 'line');
				l.setAttribute('class', 'rv-backbone');
				l.setAttribute('x1', coords[i].x);
				l.setAttribute('y1', coords[i].y);
				l.setAttribute('x2', coords[i + 1].x);
				l.setAttribute('y2', coords[i + 1].y);
				g_bb.appendChild(l);
			}
			// Helper to make a line element
			const dotR = this._gvn('--rv-noncanon-dot-r', 4.5);
			const mkLine = (x1, y1, x2, y2, cls) => this._mkSvgLine(x1, y1, x2, y2, cls);
			// Canonical base pairs (from bracket notation)
			// AU: single line
			// GC: two parallel lines (offset perpendicular to pair axis)
			// GU: single line + filled dot at midpoint
			// other: filled dot at midpoint
			const BP_OFFSET = 2.8; // scene units between GC double-line centres
			for (let i = 0; i < n; i++) {
				if (pairs[i] <= i) continue;
				const j = pairs[i];
				const x1 = coords[i].x,
					y1 = coords[i].y;
				const x2 = coords[j].x,
					y2 = coords[j].y;
				const dx = x2 - x1,
					dy = y2 - y1;
				const len = Math.hypot(dx, dy) || 1;
				const nx = -dy / len,
					ny = dx / len; // unit normal to pair axis
				const b1 = sequence[i].toUpperCase(),
					b2 = sequence[j].toUpperCase();
				const isGC = (b1 === 'G' && b2 === 'C') || (b1 === 'C' && b2 === 'G');
				const isAU = (b1 === 'A' && b2 === 'U') || (b1 === 'U' && b2 === 'A') || (b1 === 'A' && b2 === 'T') || (b1 === 'T' && b2 === 'A');
				const isGU = (b1 === 'G' && b2 === 'U') || (b1 === 'U' && b2 === 'G') || (b1 === 'G' && b2 === 'T') || (b1 === 'T' && b2 === 'G');
				const isCanon = this._isCanonPair(b1, b2);
				if (isStockholm) {
					// Stockholm: simplified — all canonical as single line, non-canonical as dot
					// Shortened by 1.44×baseR on each side via _mkStockholmBond
					this._mkStockholmBond(x1, y1, x2, y2, b1, b2, baseR, dotR)
						.forEach(el => g_bp.appendChild(el));
				} else if (!isCanon) {
					if (this._relaxedSequence) {
						// Non-standard bases — render as single line instead of dot
						g_bp.appendChild(mkLine(x1, y1, x2, y2, 'rv-basepair'));
					} else {
						// Non-canonical, dot only at midpoint
						const ndot = document.createElementNS(NS, 'circle');
						ndot.setAttribute('class', 'rv-bp-noncanon');
						ndot.setAttribute('cx', (x1 + x2) / 2);
						ndot.setAttribute('cy', (y1 + y2) / 2);
						ndot.setAttribute('r', dotR);
						g_bp.appendChild(ndot);
					}
				} else if (isGC) {
					g_bp.appendChild(mkLine(x1 + nx * BP_OFFSET, y1 + ny * BP_OFFSET, x2 + nx * BP_OFFSET, y2 + ny * BP_OFFSET, 'rv-basepair'));
					g_bp.appendChild(mkLine(x1 - nx * BP_OFFSET, y1 - ny * BP_OFFSET, x2 - nx * BP_OFFSET, y2 - ny * BP_OFFSET, 'rv-basepair'));
				} else if (isGU) {
					g_bp.appendChild(mkLine(x1, y1, x2, y2, 'rv-basepair'));
					const dot = document.createElementNS(NS, 'circle');
					dot.setAttribute('class', 'rv-bp-dot');
					dot.setAttribute('cx', (x1 + x2) / 2);
					dot.setAttribute('cy', (y1 + y2) / 2);
					dot.setAttribute('r', dotR);
					g_bp.appendChild(dot);
				} else {
					// AU: single line
					g_bp.appendChild(mkLine(x1, y1, x2, y2, 'rv-basepair'));
				}
			}
			// Per-base highlight boxes for covarying pseudoknot pairs
			// Gated on both pair-annotations AND pseudoknots toggles
			if (this._showPairAnnotations && this._showPseudoknots !== false && !isStockholm && this._rna.pseudoCovAnnotations?.length) {
				const s = baseR * 2.4;
				for (const {
						i,
						j,
						color
					}
					of this._rna.pseudoCovAnnotations) {
					for (const pos of [i, j]) {
						const box = document.createElementNS(NS, 'rect');
						box.setAttribute('x', coords[pos].x - s / 2);
						box.setAttribute('y', coords[pos].y - s / 2);
						box.setAttribute('width', s);
						box.setAttribute('height', s);
						box.setAttribute('rx', s * 0.2);
						box.setAttribute('ry', s * 0.2);
						box.setAttribute('fill', color);
						box.setAttribute('fill-opacity', '0.25');
						box.setAttribute('stroke', color);
						box.setAttribute('stroke-width', '2');
						box.setAttribute('stroke-opacity', '0.8');
						g_annot.appendChild(box);
					}
				}
			}
			// Pseudoknot pairs — curved dashed arcs (non-Stockholm only; Stockholm uses mini helix panels)
			if (this._showPseudoknots !== false && !isStockholm) {
				const _showAnnot = this._showPairAnnotations;
				const pkCovMap = _showAnnot ?
					new Map((this._rna.pseudoCovAnnotations || []).map(({
						i,
						j,
						color
					}) => [pairKey(i, j), color])) :
					new Map();
				const pkHelixGlowSet = _showAnnot ?
					new Set((this._rna.pseudoHelixCovAnnotations || []).map(({
						i,
						j
					}) => pairKey(i, j))) :
					new Set();
				const _helixColor = cs.getPropertyValue('--rv-helix-annot-color').trim() || '#aff0a8';
				const pkColor = cs.getPropertyValue('--rv-pseudopair').trim() || '#1f2328';
				const pkWidth = parseFloat(cs.getPropertyValue('--rv-basepair-width')) || 2.2;

				// Group pseudoPairs into helices (consecutive i,j pairs)
				const pkHelices = [];
				const pkSorted = [...pseudoPairs].sort((a, b) => a.i - b.i);
				let curHelix = null;
				for (const ps of pkSorted) {
					if (curHelix) {
						const last = curHelix[curHelix.length - 1];
						if (ps.i === last.i + 1 && (ps.j === last.j - 1 || ps.j === last.j + 1)) {
							curHelix.push(ps);
							continue;
						}
					}
					if (curHelix) pkHelices.push(curHelix);
					curHelix = [ps];
				}
				if (curHelix) pkHelices.push(curHelix);

				// Palette of distinct colors for multiple helices
				const PK_PALETTE = ['#e05c3a', '#3a7fe0', '#2ab56e', '#b83ab5', '#e0a53a', '#3ab5b5', '#8c5ae0', '#b5a03a'];
				const helixColorMap = new Map();
				pkHelices.forEach((helix, hi) => {
					const col = pkHelices.length > 1 ? PK_PALETTE[hi % PK_PALETTE.length] : pkColor;
					helix.forEach(ps => helixColorMap.set(pairKey(ps.i, ps.j), col));
				});

				// Build occupancy grid from all base coords to guide arc direction.
				const GRID = 30;
				let minGX = Infinity,
					maxGX = -Infinity,
					minGY = Infinity,
					maxGY = -Infinity;
				for (let k = 0; k < n; k++) {
					if (coords[k].x < minGX) minGX = coords[k].x;
					if (coords[k].x > maxGX) maxGX = coords[k].x;
					if (coords[k].y < minGY) minGY = coords[k].y;
					if (coords[k].y > maxGY) maxGY = coords[k].y;
				}
				// Uniform cell size based on smaller dimension to avoid aspect-ratio bias
				const _span = Math.max(maxGX - minGX, maxGY - minGY, 1);
				const cellSize = _span / GRID;
				const occupancy = new Uint8Array((GRID + 2) * (GRID + 2));
				const markCell = (gx, gy) => {
					if (gx >= 0 && gx <= GRID && gy >= 0 && gy <= GRID)
						occupancy[gy * (GRID + 2) + gx] = 1;
				};
				for (let k = 0; k < n; k++) {
					const gx = Math.min(GRID, Math.floor((coords[k].x - minGX) / cellSize));
					const gy = Math.min(GRID, Math.floor((coords[k].y - minGY) / cellSize));
					// Mark the cell and its immediate neighbours for a soft radius
					for (let dy = -1; dy <= 1; dy++)
						for (let dx = -1; dx <= 1; dx++)
							markCell(gx + dx, gy + dy);
				}
				const sampleOcc = (px, py) => {
					if (px < minGX || px > maxGX || py < minGY || py > maxGY) return 0;
					const gx = Math.min(GRID, Math.max(0, Math.floor((px - minGX) / cellSize)));
					const gy = Math.min(GRID, Math.max(0, Math.floor((py - minGY) / cellSize)));
					return occupancy[gy * (GRID + 2) + gx];
				};
				const arcOcc = (ax, ay, cpx, cpy, bx, by) => {
					let sum = 0;
					for (let s = 1; s < 8; s++) {
						const t = s / 8;
						const px = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cpx + t * t * bx;
						const py = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cpy + t * t * by;
						sum += sampleOcc(px, py);
					}
					return sum;
				};
				for (const ps of pseudoPairs) {
					const key = pairKey(ps.i, ps.j);
					const arcColor = pkCovMap.get(key) ?? helixColorMap.get(key) ?? pkColor;
					const strokeW = pkCovMap.has(key) ? pkWidth * 1.5 : pkWidth;
					const ax = coords[ps.i].x,
						ay = coords[ps.i].y;
					const bx = coords[ps.j].x,
						by = coords[ps.j].y;
					const mx = (ax + bx) / 2,
						my = (ay + by) / 2;
					const len = Math.hypot(bx - ax, by - ay) || 1;
					const nx = -(by - ay) / len,
						ny = (bx - ax) / len;
					const off = len * 0.35;
					const cp1x = mx + nx * off,
						cp1y = my + ny * off;
					const cp2x = mx - nx * off,
						cp2y = my - ny * off;
					const sign = arcOcc(ax, ay, cp1x, cp1y, bx, by) <= arcOcc(ax, ay, cp2x, cp2y, bx, by) ? 1 : -1;
					const arcD = `M ${ax} ${ay} Q ${mx + sign * nx * off} ${my + sign * ny * off} ${bx} ${by}`;
					if (pkHelixGlowSet.has(key)) {
						const glow = document.createElementNS(NS, 'path');
						glow.setAttribute('d', arcD);
						glow.style.cssText = `stroke:${_helixColor};stroke-width:${pkWidth * 5};fill:none;stroke-linecap:round;opacity:0.25`;
						g_pk.appendChild(glow);
					}
					const arc = document.createElementNS(NS, 'path');
					arc.setAttribute('d', arcD);
					arc.style.cssText = `stroke:${arcColor};stroke-width:${strokeW};fill:none;stroke-linecap:round;stroke-dasharray:5 3`;
					g_pk.appendChild(arc);
				}
			}
			// SS_cons_ feature annotations (gated on Labels toggle)
			if (isStockholm && this._showR3dLabels !== false && this._rna.ssConsFeatures && Object.keys(this._rna.ssConsFeatures).length)
				this._renderSsConsAnnotations(g_annot, g_ss_labels, coords, n, this._rna.ssConsFeatures, pairs, pseudoPairs, cs);
			// Stockholm PK visualization: R3D-style arcs + mini helix panels
			// Insets gated by I button, labels gated by L button independently
			if (isStockholm && (this._showR3dInsets !== false || this._showR3dLabels !== false)) {
				// Dedicated group for SS_cons arcs so L-button hiding doesn't affect pair annot boxes
				const g_ss_arcs = document.createElementNS(NS, 'g');
				this._scene.appendChild(g_ss_arcs);
				let stemOffset = 0;
				if (pseudoPairs?.length)
					stemOffset += this._renderPkStockholm(g_ss_arcs, g_ss_labels, coords, n, pseudoPairs, pairs, sequence, cs, false, null, stemOffset);
				if (this._rna.ssConsPkPairs)
					for (const [fn, featPairs] of Object.entries(this._rna.ssConsPkPairs))
						if (featPairs.length) {
							const label = fn.replace(/^SS_cons_/, '');
							stemOffset += this._renderPkStockholm(g_ss_arcs, g_ss_labels, coords, n, featPairs, pairs, sequence, cs, true, label, stemOffset);
						}
				// Hide insets panel if I button is off
				if (this._showR3dInsets === false && this._pkPanelsEl)
					this._pkPanelsEl.style.display = 'none';
				// Hide SS_cons arcs + labels if L button is off
				if (this._showR3dLabels === false) {
					g_ss_arcs.style.display = 'none';
					g_ss_labels.style.display = 'none';
				}
			}
			// Bases
			for (let i = 0; i < n; i++) {
				const grp = document.createElementNS(NS, 'g');
				grp.setAttribute('data-idx', i);
				const bd = this._rna.baseDisplay?.[i];
				const fillColor = (this._showColors && values && colorMap?.stops?.length) ? valueToColor(values[i], colorMap) : null;
				if (!bd?.skip) {
					const circ = document.createElementNS(NS, 'circle');
					circ.setAttribute('class', 'rv-base-circle');
					circ.setAttribute('cx', coords[i].x);
					circ.setAttribute('cy', coords[i].y);
					circ.setAttribute('r', baseR);
					const lbl = document.createElementNS(NS, 'text');
					lbl.setAttribute('class', 'rv-base-label');
					lbl.setAttribute('x', coords[i].x);
					lbl.setAttribute('y', coords[i].y);
					if (fillColor) {
						circ.style.fill = fillColor;
						circ.style.stroke = 'rgba(0,0,0,0.18)';
						lbl.textContent = bd?.letter ?? (this._rna.sequence[i] || '?');
						lbl.style.fill = getContrastTextColor(fillColor);
						grp.append(circ, lbl);
					} else if (bd) {
						if (bd.letter !== null) {
							// Letter-only (Stockholm), white eraser goes to g_bg (behind annotations),
							// letter goes to g_base (in front of annotations)
							const er = this._mkEraserCircle(coords[i].x, coords[i].y, baseR, bgColor);
							er.setAttribute('class', 'rv-base-circle rv-eraser');
							er.style.pointerEvents = 'none';
							g_bg.appendChild(er); // eraser behind annotation boxes
							// Invisible hit-target in g_base so _onMouseDown finds the base
							const hit = document.createElementNS(NS, 'circle');
							hit.setAttribute('class', 'rv-hit');
							hit.setAttribute('cx', coords[i].x);
							hit.setAttribute('cy', coords[i].y);
							hit.setAttribute('r', baseR * 1.5);
							hit.style.fill = 'transparent';
							hit.style.stroke = 'none';
							lbl.textContent = bd.letter;
							lbl.style.fill = bd.textColor;
							lbl.style.fontSize = (baseR * 3) + 'px';
							lbl.style.fontWeight = 'bold';
							grp.append(hit, lbl); // hit-target + letter in front of annotation boxes
						} else {
							// Circle only, no letter
							circ.style.fill = bd.fillColor;
							circ.style.stroke = '#111111';
							lbl.textContent = '';
							grp.append(circ, lbl);
						}
					} else {
						lbl.textContent = this._rna.sequence[i] || '?';
						grp.append(circ, lbl);
					}
				}
				// Position index shown even for skipped positions (keeps numbering aligned)
				if (this._showIndices && (i === 0 || (i + 1) % 10 === 0 || i === n - 1)) {
					// Outward direction = perpendicular to the local backbone tangent,
					// on the side AWAY from the WC partner (paired) or centroid (unpaired).
					// This is always truly outside the helix/loop regardless of orientation.
					const prev = i > 0 ? coords[i - 1] : coords[i];
					const next = i < n - 1 ? coords[i + 1] : coords[i];
					const tx = next.x - prev.x;
					const ty = next.y - prev.y;
					let dx, dy;
					if (Math.hypot(tx, ty) < 0.5) {
						// Degenerate tangent, fall back to centroid direction
						dx = coords[i].x - centX;
						dy = coords[i].y - centY;
					} else {
						// Two perpendiculars to the backbone tangent
						const p1x = -ty,
							p1y = tx; // 90° CCW
						const p2x = ty,
							p2y = -tx; // 90° CW
						const partner = pairs[i];
						if (partner !== -1) {
							// Paired base: go to the side AWAY from the WC partner
							const vpx = coords[partner].x - coords[i].x;
							const vpy = coords[partner].y - coords[i].y;
							const useP1 = (p1x * vpx + p1y * vpy) < 0;
							dx = useP1 ? p1x : p2x;
							dy = useP1 ? p1y : p2y;
						} else {
							// Unpaired base, go to the side AWAY from the structure centroid
							const vcx = centX - coords[i].x;
							const vcy = centY - coords[i].y;
							const useP1 = (p1x * vcx + p1y * vcy) < 0;
							dx = useP1 ? p1x : p2x;
							dy = useP1 ? p1y : p2y;
						}
					}
					const d = Math.hypot(dx, dy) || 1;
					const idx = document.createElementNS(NS, 'text');
					idx.setAttribute('class', 'rv-base-index');
					idx.setAttribute('x', coords[i].x + (dx / d) * (baseR + idxOff));
					idx.setAttribute('y', coords[i].y + (dy / d) * (baseR + idxOff));
					idx.textContent = this._rna?.positionLabels?.[i] ?? (i + 1);
					grp.appendChild(idx);
				}
				grp.addEventListener('mouseenter', e => this._onBaseEnter(e, i));
				grp.addEventListener('mouseleave', () => {
					this._tooltip.style.display = 'none';
				});
				// PK endpoint bases go above PK lines; all others behind them
				(pkEndpts.has(i) ? g_pk_top : g_base).appendChild(grp);
			}
			if (this._alnBtn) this._alnBtn.style.display = this._rna?.baseDisplay ? '' : 'none';
			if (this._chkPk) this._chkPk.style.display =
				(!isStockholm && this._rna?.pseudoPairs?.length) ? '' : 'none';
			// I button: show only when ssConsFeatures has entries (Stockholm with insets)
			const hasR3dContent = isStockholm && !!(
				(this._rna?.ssConsFeatures && Object.keys(this._rna.ssConsFeatures).length) ||
				(this._rna?.ssConsPkPairs && Object.values(this._rna.ssConsPkPairs).some(p => p.length)) ||
				this._rna?.pseudoPairs?.length
			);
			if (this._chkR3dInsets) this._chkR3dInsets.style.display = hasR3dContent ? '' : 'none';
			if (this._chkR3dLabels) this._chkR3dLabels.style.display = hasR3dContent ? '' : 'none';
			// PA button: show only if annotations are present (any source, any structure type)
			const hasPairAnnot = !!(this._rna?.pairAnnotations?.length || this._rna?.helixAnnotations?.length);
			if (this._chkPAnnot) this._chkPAnnot.style.display = hasPairAnnot ? '' : 'none';
			// Reactivity button: show only for non-Stockholm with values loaded
			const hasReactivity = !isStockholm && !!(this._rna?.values);
			if (this._chkColors) this._chkColors.style.display = hasReactivity ? '' : 'none';
			if (this._chkSsEnds) this._chkSsEnds.style.display = this._rna?.ssEnds ? '' : 'none';
			if (this._alnLegend) this._alnLegend.classList.toggle('rv-visible', !!this._rna?.baseDisplay && !this._alnActive);
			// XML upload section: hide for Stockholm
			const xmlSection = this._root?.querySelector('.rv-upload-section:has(.rv-upload-drop-xml)') ??
				this._root?.querySelector('.rv-upload-drop-xml')?.closest('.rv-upload-section');
			if (xmlSection) xmlSection.style.display = isStockholm ? 'none' : '';
		}
		_saveSVG(returnString = false) {
			if (!this._rna) return returnString ? null : undefined;
			const {
				coords,
				n,
				values,
				colorMap,
				pairAnnotations,
				pairAnnotColorMap
			} = this._rna;
			// Structure bounding box
			let minX = Infinity,
				minY = Infinity,
				maxX = -Infinity,
				maxY = -Infinity;
			for (let i = 0; i < n; i++) {
				minX = Math.min(minX, coords[i].x);
				minY = Math.min(minY, coords[i].y);
				maxX = Math.max(maxX, coords[i].x);
				maxY = Math.max(maxY, coords[i].y);
			}
			const pad = 40;
			const vbX = minX - pad,
				vbY = minY - pad;
			const vbW = maxX - minX + 2 * pad;
			let vbH = maxY - minY + 2 * pad;
			// Decide which legends to export
			const hasColorLegend = !this._noLegend && this._showColors && values && colorMap?.stops?.length;
			const hasHelixAnnot = !this._noLegend && this._showPairAnnotations && !!this._rna?.helixAnnotations?.length;
			const hasPAnnotLegend = !this._noLegend && this._showPairAnnotations && ((pairAnnotColorMap?.length && this._rna.isCovAnnot) || hasHelixAnnot);
			const hasAlnLegend = !this._noLegend && !!this._rna?.baseDisplay;
			// Legend scale, proportional to the shorter viewBox dimension
			// This keeps legends readable on both tiny and huge structures.
			const LS = Math.max(0.5, Math.min(4, Math.min(vbW, vbH) / 200)) * 0.9;
			const LX = 8 * LS;
			const LY = 6 * LS;
			const LTIT = 10 * LS;
			const LROW = 16 * LS;
			const LSEP = 14 * LS;
			const LSWW = 20 * LS;
			const LSWH = 10 * LS;
			const LFONT = 9 * LS;
			const LFONT_SM = 8 * LS;
			// Colormap legend geometry (no background box)
			const clStops = hasColorLegend ? colorMap.stops : [];
			const clMax = hasColorLegend ? clStops[clStops.length - 1].value : 1;
			// min-width ensures the NaN swatch + label always fit (approx. 45 x LS units needed)
			const clW = Math.max(140, vbW * 0.1225, 45 * LS);
			const clGradH = 10 * LS;
			const clLblH = 14 * LS;
			const clNaNH = colorMap?.nanColor ? LROW : 0;
			const clH = LY + clGradH + clLblH + clNaNH + LY;
			// Pair-annot legend geometry (no background box)
			const _helixLegColor = getComputedStyle(this._root).getPropertyValue('--rv-helix-annot-color').trim() || '#aff0a8';
			const _helixEntry = hasHelixAnnot ? [{
				key: 'Helix-level',
				color: _helixLegColor,
				isHelix: true
			}] : [];
			const paEntries = hasPAnnotLegend ? [...((pairAnnotColorMap?.length && this._rna.isCovAnnot) ? pairAnnotColorMap : []), ..._helixEntry] : [];
			const paH = LY + paEntries.length * LROW + LY;
			// Stockholm alignment legend geometry
			const ALN_CIRC = [{
				fill: '#cc0000',
				label: '≥97%'
			}, {
				fill: '#111111',
				label: '≥90%'
			}, {
				fill: '#888888',
				label: '≥75%'
			}, {
				fill: '#ffffff',
				label: '≥50%'
			}, ];
			const ALN_LETT = [{
				color: '#cc0000',
				label: '≥97%'
			}, {
				color: '#111111',
				label: '≥90%'
			}, {
				color: '#888888',
				label: '≥75%'
			}, ];
			const alCR = LSWH * 0.5; // circle radius
			const alLblW = 32 * LS; // estimated label text width
			const alCol1W = alCR * 2 + LX + alLblW;
			const alCol2W = LFONT * 1.4 + LX + alLblW;
			const alW = alCol1W + 2 * LX + alCol2W;
			const alH = LY + ALN_CIRC.length * LROW + LY;
			// Extra vertical space for legends row
			const lgndH2 = (hasColorLegend || hasPAnnotLegend || hasAlnLegend) ? Math.max(hasColorLegend ? clH : 0, hasPAnnotLegend ? paH : 0, hasAlnLegend ? alH : 0) + LSEP : 0;
			vbH += lgndH2;
			// Extend viewBox width if legend would overflow the structure bounds
			if (hasColorLegend && vbW < clW + 2 * pad) vbW = clW + 2 * pad;
			// SVG always uses the canonical light-theme palette
			// Independent of whatever CSS theme is currently applied to the viewer.
			// Read actual current theme values from computed CSS
			const _cs = getComputedStyle(this._root);
			const _gv = p => _cs.getPropertyValue(p).trim();
			const _gvn = (p, def) => parseFloat(_gv(p)) || def;
			const C = {
				bg: _gv('--rv-bg') || '#ffffff',
				surface: _gv('--rv-surface') || '#f6f8fa',
				border: _gv('--rv-border') || '#d0d7de',
				backbone: _gv('--rv-backbone') || '#1f2328',
				backboneWidth: _gvn('--rv-backbone-width', 2),
				basepair: _gv('--rv-basepair') || '#1f2328',
				basepairWidth: _gvn('--rv-basepair-width', 2.2),
				pseudopair: _gv('--rv-pseudopair') || '#1f2328',
				pseudopairWidth: _gvn('--rv-pseudopair-width', 2),
				baseFill: _gv('--rv-base-fill') || '#eaeef2',
				baseStroke: _gv('--rv-base-stroke') || '#1f2328',
				baseStrokeWidth: _gvn('--rv-base-stroke-width', 2),
				baseText: _gv('--rv-base-label-color') || '#1f2328',
				labelFont: _gv('--rv-base-label-font') || 'monospace',
				indexFont: _gv('--rv-base-index-font') || 'monospace',
				muted: _gv('--rv-muted') || '#656d76',
			};
			const baseR = BASE_R;
			// Font sizes, read from CSS, scaled up for SVG resolution
			const labelFSz = _gvn('--rv-base-label-font-size', 13) * 1.6;
			const indexFSz = _gvn('--rv-base-index-font-size', 12) * 1.6;
			const rawLSz = indexFSz / 1.6; // unscaled, matches canvas font-size
			const labelColor = C.baseText;
			const indexColor = C.muted;
			// Build SVG
			const exp = document.createElementNS(NS, 'svg');
			exp.setAttribute('xmlns', NS);
			exp.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
			exp.setAttribute('width', vbW * 2);
			exp.setAttribute('height', vbH * 2);
			// Stylesheet (user units, scales with circles)
			const st = document.createElementNS(NS, 'style');
			st.textContent = [`.rv-backbone  {stroke:${C.backbone};stroke-width:${C.backboneWidth};fill:none;stroke-linecap:round}`, `.rv-basepair  {stroke:${C.basepair};stroke-width:${C.basepairWidth};fill:none;stroke-linecap:round}`, `.rv-bp-dot    {fill:${C.basepair};stroke:none}`, `.rv-bp-noncanon{fill:${C.basepair};stroke:none}`, `.rv-pseudopair{stroke:${C.pseudopair};stroke-width:${C.pseudopairWidth};fill:none;stroke-linecap:round;stroke-dasharray:5 3}`, `.rv-base-circle{stroke:${C.baseStroke};stroke-width:${C.baseStrokeWidth};fill:${C.baseFill}}`, `.rv-base-label{font-family:${C.labelFont};font-size:${labelFSz};font-weight:bold;fill:${labelColor};text-anchor:middle}`, `.rv-base-index{font-family:${C.indexFont};font-size:${indexFSz};font-weight:bold;fill:${indexColor};text-anchor:middle}`,
				`.rv-ss-cons-label{font-family:${C.indexFont};font-size:${indexFSz};font-weight:bold;fill:${indexColor};paint-order:stroke fill}`,
				`.rv-ss-cons-line{stroke:${C.backbone};stroke-width:${C.backboneWidth};fill:none;stroke-linecap:round;stroke-linejoin:round}`,
				`.rv-ss-cons-leader{stroke:${C.backbone};stroke-width:${C.backboneWidth};fill:none;stroke-linecap:round}`,
			].join('\n');
			exp.appendChild(st);
			// Scene clone, strip hit circles (mouse-only), shrink erasers, scale real circles
			const sc2 = this._scene.cloneNode(true);
			sc2.removeAttribute('transform');
			sc2.querySelectorAll('circle.rv-hit').forEach(c => c.remove());
			sc2.querySelectorAll('circle.rv-eraser').forEach(c => {
				const r = parseFloat(c.getAttribute('r')) || BASE_R;
				c.setAttribute('r', r * 0.75); // ~1.1× baseR
			});
			sc2.querySelectorAll('circle.rv-base-circle:not(.rv-eraser)').forEach(c => {
				const r = parseFloat(c.getAttribute('r')) || BASE_R;
				c.setAttribute('r', r * 1.1);
			});
			sc2.querySelectorAll('text').forEach(t => {
				t.setAttribute('dy', '0.3em');
			});
			// ss_cons labels: rebuild inline style — no stroke halo,
			// font-size is scaled up (indexFSz = rawLSz * 1.6) for SVG resolution.
			// We also rescale the bg rects and re-anchor the label positions to match.
			const svgLScale = indexFSz / rawLSz; // = 1.6
			sc2.querySelectorAll('text.rv-ss-cons-label').forEach(t => {
				const anchor = t.getAttribute('text-anchor') || 'middle';
				// Shift the text anchor point to stay centred after font scale-up.
				// The extra half-height added by the larger font is (indexFSz - rawLSz) * 0.5
				// in the vertical direction; horizontal position is already at the anchor edge.
				t.setAttribute('style',
					`font-size:${indexFSz};font-weight:bold;fill:${indexColor};` +
					`font-family:${C.indexFont};text-anchor:${anchor};dominant-baseline:middle`);
				t.removeAttribute('dy'); // dominant-baseline handles vertical centering
			});
			// ss_cons bg rects: recompute size from scratch using SVG font metrics.
			// Paired with text elements by index (same two-pass emission order).
			// Uses 0.6em char advance (Courier New monospace), tight bgPad for SVG scale.
			{
				const rects = Array.from(sc2.querySelectorAll('rect.rv-ss-cons-bg'));
				const txts = Array.from(sc2.querySelectorAll('text.rv-ss-cons-label'));
				const svgBgPad = indexFSz * 0.25; // tighter padding at SVG scale
				const svgTh = indexFSz * 0.75; // cap-height approximation
				const svgNh = svgTh + svgBgPad * 2; // total rect height
				rects.forEach((r, i) => {
					const t = txts[i];
					if (!t) return;
					const label = t.textContent || '';
					const svgTw = label.length * indexFSz * 0.6; // true monospace advance
					const svgNw = svgTw + svgBgPad * 2;
					// ly = vertical centre, recovered from the old rect
					const oldY = parseFloat(r.getAttribute('y')) || 0;
					const oldH = parseFloat(r.getAttribute('height')) || 0;
					const ly = oldY + oldH / 2;
					// lx and anchor from the paired text element
					const lx = parseFloat(t.getAttribute('x')) || 0;
					const anchor = t.getAttribute('text-anchor') || 'middle';
					let nx;
					if (anchor === 'end') nx = lx - svgNw;
					else if (anchor === 'start') nx = lx;
					else nx = lx - svgNw / 2;
					r.setAttribute('x', nx);
					r.setAttribute('y', ly - svgNh / 2);
					r.setAttribute('width', svgNw);
					r.setAttribute('height', svgNh);
				});
			}
			// ss_cons lines: use class styling
			sc2.querySelectorAll('path.rv-ss-cons-line').forEach(p => {
				p.removeAttribute('style');
			});
			// ss_cons leader lines: use class styling
			sc2.querySelectorAll('line.rv-ss-cons-leader').forEach(l => {
				l.removeAttribute('style');
			});
			exp.appendChild(sc2);
			//  color-map legend
			if (hasColorLegend) {
				const lx = vbX + vbW - clW - pad;
				const ly = vbY + (vbH - lgndH2) + LSEP;
				const ctype = colorMap.type || 'gradient';
				const cMin = ctype === 'discrete' ? (colorMap.min ?? 0) : clStops[0].value;
				const cMax = clMax;
				const cRange = cMax - cMin || 1;
				const cpct = v => (v - cMin) / cRange;
				// Shared defs element (gradient + clipPath both live here)
				const defs2 = document.createElementNS(NS, 'defs');
				exp.appendChild(defs2);
				const barY = ly + LY;
				// ClipPath, clips every fill rect to the rounded-corner outline shape
				const clipId = 'rv-bar-clip';
				const cp = document.createElementNS(NS, 'clipPath');
				cp.setAttribute('id', clipId);
				const cr = document.createElementNS(NS, 'rect');
				cr.setAttribute('x', lx);
				cr.setAttribute('y', barY);
				cr.setAttribute('width', clW);
				cr.setAttribute('height', clGradH);
				cr.setAttribute('rx', 2 * LS);
				cr.setAttribute('ry', 2 * LS);
				cp.appendChild(cr);
				defs2.appendChild(cp);
				if (ctype === 'discrete') {
					// Discrete, solid rects per band, clipped to rounded outline
					const g = document.createElementNS(NS, 'g');
					g.setAttribute('clip-path', `url(#${clipId})`);
					let fromVal = cMin;
					for (const s of clStops) {
						const x1 = lx + clW * cpct(fromVal);
						const bw = clW * cpct(s.value) - clW * cpct(fromVal);
						const band = document.createElementNS(NS, 'rect');
						band.setAttribute('x', x1);
						band.setAttribute('y', barY);
						band.setAttribute('width', bw);
						band.setAttribute('height', clGradH);
						band.setAttribute('fill', s.color);
						g.appendChild(band);
						fromVal = s.value;
					}
					exp.appendChild(g);
				} else {
					// Gradient, linearGradient (single rect already rounded)
					const grad = document.createElementNS(NS, 'linearGradient');
					grad.setAttribute('id', 'rv-exp-grad');
					grad.setAttribute('x1', '0%');
					grad.setAttribute('y1', '0%');
					grad.setAttribute('x2', '100%');
					grad.setAttribute('y2', '0%');
					clStops.forEach(s => {
						const stop = document.createElementNS(NS, 'stop');
						stop.setAttribute('offset', (cpct(s.value) * 100).toFixed(1) + '%');
						stop.setAttribute('stop-color', s.color);
						grad.appendChild(stop);
					});
					defs2.appendChild(grad);
					const bar = document.createElementNS(NS, 'rect');
					bar.setAttribute('x', lx);
					bar.setAttribute('y', barY);
					bar.setAttribute('width', clW);
					bar.setAttribute('height', clGradH);
					bar.setAttribute('rx', 2 * LS);
					bar.setAttribute('fill', 'url(#rv-exp-grad)');
					exp.appendChild(bar);
				}
				// Rounded outline drawn on top of fills
				const outline = document.createElementNS(NS, 'rect');
				outline.setAttribute('x', lx);
				outline.setAttribute('y', barY);
				outline.setAttribute('width', clW);
				outline.setAttribute('height', clGradH);
				outline.setAttribute('rx', 2 * LS);
				outline.setAttribute('fill', 'none');
				outline.setAttribute('stroke', C.muted);
				outline.setAttribute('stroke-width', 0.5 * LS);
				exp.appendChild(outline);
				// Labels
				const lblVals = ctype === 'discrete' ? [cMin, ...clStops.map(s => s.value)] : clStops.map(s => s.value);
				const allInt = lblVals.every(v => Number.isInteger(v));
				const fmt = v => allInt ? String(v) : parseFloat(v.toPrecision(3)).toString();
				const lblY = barY + clGradH + clLblH * 0.85;
				lblVals.forEach((v, idx, arr) => {
					const t = document.createElementNS(NS, 'text');
					t.setAttribute('y', lblY);
					t.setAttribute('font-family', 'monospace');
					t.setAttribute('font-size', LFONT_SM);
					t.setAttribute('fill', C.muted);
					t.setAttribute('text-anchor', 'middle');
					// Center all labels on their boundary, first at bar left, last at bar right
					const xPos = idx === 0 ? lx : idx === arr.length - 1 ? lx + clW : lx + clW * cpct(v);
					t.setAttribute('x', xPos);
					t.textContent = fmt(v);
					exp.appendChild(t);
				});
				// NaN swatch below labels
				if (colorMap.nanColor) {
					const nanY = lblY + clLblH * 0.5;
					const sw = document.createElementNS(NS, 'rect');
					sw.setAttribute('x', lx);
					sw.setAttribute('y', nanY);
					sw.setAttribute('width', LSWH);
					sw.setAttribute('height', LSWH);
					sw.setAttribute('rx', 2 * LS);
					sw.setAttribute('fill', colorMap.nanColor);
					exp.appendChild(sw);
					const nt = document.createElementNS(NS, 'text');
					nt.setAttribute('x', lx + LSWH + LX * 0.6);
					nt.setAttribute('y', nanY + LSWH * 0.82);
					nt.setAttribute('font-family', 'monospace');
					nt.setAttribute('font-size', LFONT_SM);
					nt.setAttribute('fill', C.muted);
					nt.textContent = 'NaN';
					exp.appendChild(nt);
				}
			}
			// Pair-annotation legend
			if (hasPAnnotLegend) {
				const lx = vbX + pad + (hasAlnLegend ? alW + 2 * LX : 0);
				const ly = vbY + (vbH - lgndH2) + LSEP;
				// Entries
				const paOpa = parseFloat(_gv('--rv-pair-annot-opacity')) || 0.5;
				const paStroke = parseFloat(_gv('--rv-pair-annot-stroke-width')) || 1.5;
				paEntries.forEach(({
					key,
					color,
					isHelix
				}, idx) => {
					const ey = ly + LY + idx * LROW;
					const sw = document.createElementNS(NS, 'rect');
					sw.setAttribute('x', lx);
					sw.setAttribute('y', ey);
					sw.setAttribute('width', LSWW);
					sw.setAttribute('height', LSWH);
					sw.setAttribute('rx', 2 * LS);
					sw.setAttribute('fill', color);
					sw.setAttribute('fill-opacity', isHelix ? 0.35 : paOpa);
					sw.setAttribute('stroke', color);
					sw.setAttribute('stroke-width', paStroke * LS * 0.5);
					sw.setAttribute('stroke-opacity', isHelix ? 0.8 : Math.min(1, paOpa * 2.5));
					exp.appendChild(sw);
					const kt = document.createElementNS(NS, 'text');
					kt.setAttribute('x', lx + LSWW + LX * 0.8);
					kt.setAttribute('y', ey + LSWH * 0.85);
					kt.setAttribute('font-family', 'monospace');
					kt.setAttribute('font-size', LFONT);
					kt.setAttribute('fill', C.baseText);
					kt.textContent = key;
					exp.appendChild(kt);
				});
			}
			// Stockholm alignment legend (nucleotide present + identity)
			if (hasAlnLegend) {
				const lx = vbX + pad;
				const ly = vbY + (vbH - lgndH2) + LSEP;
				const col2X = lx + alCol1W + 2 * LX;
				const rowY0 = ly + LY;
				ALN_CIRC.forEach(({
					fill,
					label
				}, idx) => {
					const cy = rowY0 + idx * LROW + alCR;
					const circ = document.createElementNS(NS, 'circle');
					circ.setAttribute('cx', lx + alCR);
					circ.setAttribute('cy', cy);
					circ.setAttribute('r', alCR);
					circ.setAttribute('fill', fill);
					circ.setAttribute('stroke', C.baseStroke);
					circ.setAttribute('stroke-width', Math.max(0.5, LS * 0.8));
					exp.appendChild(circ);
					const lt = document.createElementNS(NS, 'text');
					lt.setAttribute('x', lx + alCR * 2 + LX);
					lt.setAttribute('y', cy + LFONT * 0.4);
					lt.setAttribute('font-family', 'monospace');
					lt.setAttribute('font-size', LFONT);
					lt.setAttribute('fill', C.baseText);
					lt.textContent = label;
					exp.appendChild(lt);
				});
				ALN_LETT.forEach(({
					color,
					label
				}, idx) => {
					const cy = rowY0 + idx * LROW + alCR;
					const letter = document.createElementNS(NS, 'text');
					letter.setAttribute('x', col2X);
					letter.setAttribute('y', cy + LFONT * 0.4);
					letter.setAttribute('font-family', 'monospace');
					letter.setAttribute('font-size', LFONT * 1.4);
					letter.setAttribute('font-weight', 'bold');
					letter.setAttribute('fill', color);
					letter.textContent = 'N';
					exp.appendChild(letter);
					const ll = document.createElementNS(NS, 'text');
					ll.setAttribute('x', col2X + LFONT * 1.4 + LX);
					ll.setAttribute('y', cy + LFONT * 0.4);
					ll.setAttribute('font-family', 'monospace');
					ll.setAttribute('font-size', LFONT);
					ll.setAttribute('fill', C.baseText);
					ll.textContent = label;
					exp.appendChild(ll);
				});
			}
			// ── PK inset panels in SVG export ─────────────────────────────────
			// Mirrors _render() which handles both pseudoPairs and ssConsPkPairs
			const expIsStockholm = !!this._rna?.baseDisplay;
			if (expIsStockholm && (this._showR3dInsets !== false || this._showR3dLabels !== false)) {
				// Collect all pair sources exactly as _render() does
				const expPairSources = []; // [{pairs, featureName}]
				if (this._rna.pseudoPairs?.length)
					expPairSources.push({
						pairs: this._rna.pseudoPairs,
						featureName: null
					});
				if (this._rna.ssConsPkPairs)
					for (const [fn, featPairs] of Object.entries(this._rna.ssConsPkPairs))
						if (featPairs.length)
							expPairSources.push({
								pairs: featPairs,
								featureName: fn.replace(/^SS_cons_/, '')
							});

				// Collect all stems across all sources
				const expAllStems = []; // [{stem, featureName}]
				const expR3dPosToName = new Map();
				if (this._rna.ssConsFeatures)
					for (const [name, positions] of Object.entries(this._rna.ssConsFeatures))
						for (const p of positions) expR3dPosToName.set(p, name);

				for (const {
						pairs: srcPairs,
						featureName
					}
					of expPairSources) {
					const expSorted = [...srcPairs].sort((a, b) => a.i - b.i);
					const expStems = [];
					let expCur = null;
					for (const ps of expSorted) {
						if (expCur) {
							const last = expCur[expCur.length - 1];
							if (ps.i === last.i + 1 && (ps.j === last.j - 1 || ps.j === last.j + 1)) {
								expCur.push(ps);
								continue;
							}
						}
						if (expCur) expStems.push(expCur);
						expCur = [ps];
					}
					if (expCur) expStems.push(expCur);
					expStems.forEach((stem, si) => {
						let lbl = featureName;
						if (!lbl) {
							for (const p of stem.map(ps => ps.i))
								if (expR3dPosToName.has(p)) {
									lbl = expR3dPosToName.get(p);
									break;
								}
							if (!lbl)
								for (const p of stem.map(ps => ps.j))
									if (expR3dPosToName.has(p)) {
										lbl = expR3dPosToName.get(p);
										break;
									}
							if (!lbl) lbl = `PK${expAllStems.length + 1}`;
						}
						expAllStems.push({
							stem,
							featureName: lbl
						});
					});
				}

				if (expAllStems.length && this._showR3dInsets !== false) {
					// Panel geometry (same proportions as interactive panels)
					const pk_baseR = BASE_R * Math.min(LS, 1.2) * 0.57;
					const pk_colSep = pk_baseR * 6;
					const pk_rowStep = pk_baseR * 3.2;
					const pk_svgW = pk_colSep + pk_baseR * 4;
					const pk_col5x = pk_baseR * 2;
					const pk_col3x = pk_col5x + pk_colSep;
					const _pkHelixPad = ((parseFloat(_gv('--rv-helix-annot-padding')) || BASE_R * 1.7) / BASE_R) * pk_baseR;
					const pk_vPad = Math.max(pk_baseR * 1.5, _pkHelixPad / 2 + pk_baseR * 0.5);
					const pk_hPad = pk_baseR * 2;
					const pk_gap = pk_baseR * 4;
					const pk_titleH = indexFSz * 1.0 + pk_baseR * 2.5;

					const pk_totalW = expAllStems.length * (pk_svgW + pk_hPad) - pk_hPad;
					const pk_maxH = Math.max(...expAllStems.map(({
							stem
						}) =>
						(stem.length - 1) * pk_rowStep + pk_baseR * 2 + pk_vPad + pk_vPad * 0.4
					)) + pk_titleH + pk_vPad;

					const pk_blockH = pk_maxH + pk_gap;
					const oldVbY = parseFloat(exp.getAttribute('viewBox').split(' ')[1]);
					const newVbY = oldVbY - pk_blockH;
					const oldVbH = parseFloat(exp.getAttribute('viewBox').split(' ')[3]);
					exp.setAttribute('viewBox', `${vbX} ${newVbY} ${vbW} ${oldVbH + pk_blockH}`);
					exp.setAttribute('height', (oldVbH + pk_blockH) * 2);

					const pk_startX = vbX + (vbW - pk_totalW) / 2;
					const pk_startY = newVbY + pk_gap * 0.4;

					const _scale2 = pk_baseR / BASE_R;
					const bpW2 = C.basepairWidth * _scale2;
					const bbW2 = C.backboneWidth * _scale2;
					const bbCol2 = C.backbone;
					const bpCol2 = C.basepair;
					const dotR2 = _gvn('--rv-noncanon-dot-r', 4.5) * _scale2;
					const BP_OFF2 = 2.8 * _scale2;
					const helixColor2 = _gv('--rv-helix-annot-color') || '#aff0a8';
					const helixOpa2 = parseFloat(_gv('--rv-helix-annot-opacity')) || 0.5;
					const pAnnotOpa2 = parseFloat(_gv('--rv-pair-annot-opacity')) || 0.5;
					const pAnnotSW2 = (parseFloat(_gv('--rv-pair-annot-stroke-width')) || 1.5) * _scale2;
					const pAnnotPad2 = (parseFloat(_gv('--rv-pair-annot-padding')) || 16) * _scale2;
					const bsW2 = _gvn('--rv-base-stroke-width', 2) * _scale2;
					const bgCol2 = C.bg;

					expAllStems.forEach(({
						stem,
						featureName: lbl
					}, si) => {
						const nbp = stem.length;
						const row0y = pk_startY + pk_titleH + pk_vPad;
						const panelX = pk_startX + si * (pk_svgW + pk_hPad);
						const panelG = document.createElementNS(NS, 'g');
						exp.appendChild(panelG);
						const inCoords = {};
						stem.forEach((ps, k) => {
							inCoords[ps.i] = {
								x: panelX + pk_col5x,
								y: row0y + k * pk_rowStep
							};
							inCoords[ps.j] = {
								x: panelX + pk_col3x,
								y: row0y + k * pk_rowStep
							};
						});
						const inPairs2 = {};
						stem.forEach(ps => {
							inPairs2[ps.i] = ps.j;
							inPairs2[ps.j] = ps.i;
						});

						// Background
						const panelH = (nbp - 1) * pk_rowStep + pk_baseR * 2 + pk_vPad + pk_vPad * 0.4;
						const bgRect = document.createElementNS(NS, 'rect');
						bgRect.setAttribute('x', panelX - pk_baseR * 0.5);
						bgRect.setAttribute('y', pk_startY);
						bgRect.setAttribute('width', pk_svgW + pk_baseR);
						bgRect.setAttribute('height', pk_titleH + pk_vPad + panelH + pk_vPad * 0.4);
						bgRect.setAttribute('rx', pk_baseR * 0.6);
						bgRect.setAttribute('fill', bgCol2);
						bgRect.setAttribute('stroke', 'none');
						panelG.appendChild(bgRect);

						// Title
						const titleT = document.createElementNS(NS, 'text');
						titleT.setAttribute('x', panelX + pk_svgW * 0.5);
						titleT.setAttribute('y', pk_startY + pk_titleH * 0.65);
						titleT.setAttribute('text-anchor', 'middle');
						titleT.setAttribute('font-family', C.indexFont);
						titleT.setAttribute('font-size', indexFSz);
						titleT.setAttribute('font-weight', '700');
						titleT.setAttribute('fill', C.muted);
						titleT.textContent = lbl.toUpperCase();
						panelG.appendChild(titleT);

						// 1. Backbone
						if (nbp > 1) {
							[panelX + pk_col5x, panelX + pk_col3x].forEach(cx => {
								const l = document.createElementNS(NS, 'line');
								l.setAttribute('class', 'rv-backbone');
								l.setAttribute('x1', cx);
								l.setAttribute('y1', row0y);
								l.setAttribute('x2', cx);
								l.setAttribute('y2', row0y + (nbp - 1) * pk_rowStep);
								panelG.appendChild(l);
							});
						}

						// 2. Eraser circles (behind everything)
						stem.forEach((ps, k) => {
							const ry = row0y + k * pk_rowStep;
							[
								[ps.i, panelX + pk_col5x],
								[ps.j, panelX + pk_col3x]
							].forEach(([ri, cx]) => {
								const bd = this._rna.baseDisplay?.[ri];
								if (!bd || bd.skip || bd.letter == null) return;
								const er = document.createElementNS(NS, 'circle');
								er.setAttribute('cx', cx);
								er.setAttribute('cy', ry);
								er.setAttribute('r', pk_baseR * 1.5);
								er.style.cssText = `fill:${bgCol2};stroke:none`;
								panelG.appendChild(er);
							});
						});

						// 3. Helix annotation box
						if (this._showPairAnnotations && this._rna.helixAnnotations?.length) {
							for (const ann of this._rna.helixAnnotations) {
								const hasPair = (ann.subHelices || []).some(sh =>
										sh.pos5p.some(ri => stem.some(p => p.i === ri || p.j === ri)) ||
										sh.pos3p.some(ri => stem.some(p => p.i === ri || p.j === ri))) ||
									(ann.pkPairs || []).some(pk => stem.some(p =>
										(p.i === pk.i && p.j === pk.j) || (p.i === pk.j && p.j === pk.i)));
								if (!hasPair) continue;
								const annPad2 = (ann.padding ?? _pkHelixPad);
								const cx5 = panelX + pk_col5x,
									cx3 = panelX + pk_col3x;
								const yTop = row0y - annPad2;
								const yBot = row0y + (nbp - 1) * pk_rowStep + annPad2;
								const bw2 = (cx3 - cx5) + annPad2 * 2;
								const bh2 = yBot - yTop;
								const rx2 = Math.min(pk_baseR * 0.6, bw2 / 2, bh2 / 2);
								const r = document.createElementNS(NS, 'rect');
								r.setAttribute('x', cx5 - annPad2);
								r.setAttribute('y', yTop);
								r.setAttribute('width', bw2);
								r.setAttribute('height', bh2);
								r.setAttribute('rx', rx2);
								r.setAttribute('ry', rx2);
								r.setAttribute('fill', ann.color ?? helixColor2);
								r.setAttribute('fill-opacity', String(ann.opacity ?? helixOpa2));
								r.setAttribute('stroke', ann.color ?? helixColor2);
								r.setAttribute('stroke-opacity', '0.45');
								r.setAttribute('stroke-width', String(ann.strokeWidth ?? 1.5));
								panelG.appendChild(r);
								break;
							}
						}

						// 4. Pair annotation boxes
						if (this._showPairAnnotations) {
							for (const ann of (this._rna.pairAnnotations || [])) {
								let ai = ann.i,
									aj = ann.j;
								if (ai != null && aj != null) {
									if (!stem.some(p => (p.i === ai && p.j === aj) || (p.i === aj && p.j === ai))) continue;
								} else if (ai != null) {
									aj = inPairs2[ai];
									if (aj == null) continue;
								} else if (aj != null) {
									ai = inPairs2[aj];
									if (ai == null) continue;
								} else continue;
								const ic5 = inCoords[ai],
									ic3 = inCoords[aj];
								if (!ic5 || !ic3) continue;
								let color = ann.color;
								if (!color && ann.key != null && this._rna.pairAnnotColorMap) {
									const e2 = this._rna.pairAnnotColorMap.find(e => e.key === ann.key);
									if (e2) color = e2.color;
								}
								panelG.appendChild(this._mkPairAnnotRect(ic5.x, ic5.y, ic3.x, ic3.y,
									color || '#ffffff', ann.opacity ?? pAnnotOpa2, ann.strokeWidth ?? pAnnotSW2, ann.padding ?? pAnnotPad2, pk_baseR));
							}
							for (const {
									i,
									j,
									color
								}
								of(this._rna.pseudoCovAnnotations || [])) {
								if (!stem.some(p => (p.i === i && p.j === j) || (p.i === j && p.j === i))) continue;
								const ic5 = inCoords[i],
									ic3 = inCoords[j];
								if (!ic5 || !ic3) continue;
								panelG.appendChild(this._mkPairAnnotRect(ic5.x, ic5.y, ic3.x, ic3.y,
									color, pAnnotOpa2, pAnnotSW2, pAnnotPad2, pk_baseR));
							}
						}

						// 5. Base letters / fill circles
						stem.forEach((ps, k) => {
							const ry = row0y + k * pk_rowStep;
							[
								[ps.i, panelX + pk_col5x],
								[ps.j, panelX + pk_col3x]
							].forEach(([ri, cx]) => {
								const bd = this._rna.baseDisplay?.[ri];
								if (!bd || bd.skip) return;
								if (bd.letter !== null && bd.letter !== undefined) {
									const t = document.createElementNS(NS, 'text');
									t.setAttribute('x', cx);
									t.setAttribute('y', ry);
									t.setAttribute('dy', '0.35em');
									t.setAttribute('text-anchor', 'middle');
									t.setAttribute('font-size', pk_baseR * 3);
									t.setAttribute('font-family', 'monospace');
									t.setAttribute('font-weight', 'bold');
									t.setAttribute('fill', bd.textColor || C.baseText);
									t.textContent = bd.letter;
									panelG.appendChild(t);
								} else if (bd.fillColor) {
									const circ = document.createElementNS(NS, 'circle');
									circ.setAttribute('cx', cx);
									circ.setAttribute('cy', ry);
									circ.setAttribute('r', pk_baseR);
									circ.style.cssText = `fill:${bd.fillColor};stroke:#111111;stroke-width:${bsW2}`;
									panelG.appendChild(circ);
								}
							});
						});

						// 6. Bonds (topmost)
						stem.forEach((ps, k) => {
							const ry = row0y + k * pk_rowStep;
							const cx5 = panelX + pk_col5x,
								cx3 = panelX + pk_col3x;
							const b5 = (this._rna.sequence?.[ps.i] || '?').toUpperCase();
							const b3 = (this._rna.sequence?.[ps.j] || '?').toUpperCase();
							this._mkStockholmBond(cx5, ry, cx3, ry, b5, b3, pk_baseR, dotR2)
								.forEach(el => panelG.appendChild(el));
						});
					});
				} // end if expAllStems.length
			}
			// For Stockholm structures, labels can extend beyond the structure bounding box.
			// Expand viewBox to include all SS_cons label bg rects and leader lines.
			if (expIsStockholm && this._showR3dLabels !== false) {
				// Read current viewBox (may have been expanded by PK inset block)
				const curVBStr = exp.getAttribute('viewBox');
				const curVB = curVBStr ? curVBStr.split(' ').map(Number) : [vbX, vbY, vbW, vbH];
				let [cvX, cvY, cvW, cvH] = curVB;
				let lMinX = cvX + cvW,
					lMinY = cvY + cvH,
					lMaxX = cvX,
					lMaxY = cvY;
				let expanded = false;
				exp.querySelectorAll('.rv-ss-cons-bg').forEach(el => {
					const x = parseFloat(el.getAttribute('x') || 0);
					const y = parseFloat(el.getAttribute('y') || 0);
					const w = parseFloat(el.getAttribute('width') || 0);
					const h = parseFloat(el.getAttribute('height') || 0);
					lMinX = Math.min(lMinX, x);
					lMinY = Math.min(lMinY, y);
					lMaxX = Math.max(lMaxX, x + w);
					lMaxY = Math.max(lMaxY, y + h);
					expanded = true;
				});
				exp.querySelectorAll('.rv-ss-cons-leader').forEach(el => {
					[1, 2].forEach(n => {
						const x = parseFloat(el.getAttribute(`x${n}`) || 0);
						const y = parseFloat(el.getAttribute(`y${n}`) || 0);
						lMinX = Math.min(lMinX, x);
						lMinY = Math.min(lMinY, y);
						lMaxX = Math.max(lMaxX, x);
						lMaxY = Math.max(lMaxY, y);
					});
					expanded = true;
				});
				if (expanded) {
					const newX = Math.min(cvX, lMinX - pad);
					const newY = Math.min(cvY, lMinY - pad);
					const newW = Math.max(cvX + cvW, lMaxX + pad) - newX;
					const newH = Math.max(cvY + cvH, lMaxY + pad) - newY;
					exp.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
					exp.setAttribute('width', newW * 2);
					exp.setAttribute('height', newH * 2);
				}
			}
			const exportId = this._id || this._structures?.[this._currentStructIdx]?.label || this._rna?._label || 'RF_structure';
			const exportName = exportId.replace(/[^a-zA-Z0-9_\-\.]/g, '_') + '.svg';
			const svgString = new XMLSerializer().serializeToString(exp);
			if (returnString) return svgString;
			const blob = new Blob([svgString], {
				type: 'image/svg+xml'
			});
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = exportName;
			a.click();
			URL.revokeObjectURL(a.href);
		}
		// Return the current structure as a standalone SVG string (no download)
		exportSVGString() {
			return this._saveSVG(true);
		}
		// Tooltip
		_onBaseEnter(e, idx) {
			const {
				pairs,
				pseudoPairs,
				values,
				sequence,
				baseDisplay,
				positionLabels
			} = this._rna;
			const posLabel = positionLabels?.[idx] ?? (idx + 1);
			const bd = baseDisplay?.[idx];
			let html;
			if (bd?.colStats) {
				// Stockholm alignment: show column composition
				const s = bd.colStats;
				const partner = pairs[idx];
				html = `<b>${posLabel}`;
				if (partner !== -1) html += ` ↔ ${positionLabels?.[partner] ?? (partner + 1)}`;
				const ps = pseudoPairs.find(p => p.i === idx || p.j === idx);
				if (ps) {
					const pk = ps.i === idx ? ps.j : ps.i;
					html += ` ↔ ${positionLabels?.[pk] ?? (pk + 1)} (pk)`;
				}
				html += `</b><br>A ${s.A}%<br>C ${s.C}%<br/>G ${s.G}%<br>U ${s.U}%`;
				if (s.gap > 0) html += `<br>– ${s.gap}%`;
			} else {
				// Standard structure: show base identity and pair partner
				html = `<b>${sequence[idx]}${posLabel}</b>`;
				const partner = pairs[idx];
				if (partner !== -1) html += ` ↔ ${sequence[partner]}${positionLabels?.[partner] ?? (partner + 1)}`;
				const ps = pseudoPairs.find(p => p.i === idx || p.j === idx);
				if (ps) {
					const pk = ps.i === idx ? ps.j : ps.i;
					html += ` ↔ ${sequence[pk]}${positionLabels?.[pk] ?? (pk + 1)}`;
				}
				if (values && values[idx] != null) html += `<br>Value: ${values[idx].toFixed(3)}`;
			}
			this._tooltip.innerHTML = html;
			this._tooltip.style.display = 'block';
			this._positionTooltip(e.clientX, e.clientY);
		}
		_positionTooltip(cx, cy) {
			const rect = this._canvas.getBoundingClientRect();
			this._tooltip.style.left = (cx - rect.left + 14) + 'px';
			this._tooltip.style.top = (cy - rect.top + 14) + 'px';
		}
		// CSS variable helpers
		_gv(prop) {
			return getComputedStyle(this._root).getPropertyValue(prop).trim();
		}
		_gvn(prop, def) {
			return parseFloat(this._gv(prop)) || def;
		}
		// Sync reactivity legend visibility with current state
		_updateLegendVisibility() {
			this._legend.style.display = (this._showColors && this._rna?.values) ? 'block' : 'none';
		}
		// Error display
		_showError(msg) {
			this._rna = null;
			this._scene.innerHTML = '';
			this._errEl.style.display = 'none';
			if (this._sbSeq) this._sbSeq.textContent = '—';
			if (this._sbPairs) this._sbPairs.textContent = '— pairs';
			if (this._errDialog && this._errDialogBody) {
				this._errDialogBody.textContent = msg;
				this._errDialog.classList.add('rv-visible');
			} else {
				this._errEl.innerHTML = `<span style="font-size:24px;">⚠</span>&nbsp; ${msg}`;
				this._errEl.style.display = 'block';
			}
		}
		_showErrorDialog(msg) {
			if (this._errDialog && this._errDialogBody) {
				this._errDialogBody.textContent = msg;
				this._errDialog.classList.add('rv-visible');
			}
		}
		// Interaction
		// Returns true when a helix has no enclosing base-pair, i.e. it lives
		// directly in the flat exterior loop (not nested inside another helix).
		_isExteriorLoop(helix) {
			const {
				pairs
			} = this._rna;
			const hi = helix.i;
			for (let k = 0; k < hi; k++) {
				if (pairs[k] > hi) return false; // a pair that encloses hi
			}
			return true;
		}
		// Signed distance (sign only) from point (mx,my) to the backbone axis
		// (the line through the two outermost bases of the helix).
		_getBackboneSide(helix, coords, mx, my) {
			const {
				i: hi,
				j: hj
			} = helix;
			const ax = coords[hi].x,
				ay = coords[hi].y;
			const dx = coords[hj].x - ax,
				dy = coords[hj].y - ay;
			const len = Math.hypot(dx, dy) || 1;
			// Unit normal to backbone
			const nx = -dy / len,
				ny = dx / len;
			return Math.sign((mx - ax) * nx + (my - ay) * ny);
		}
		// Reflect all bases strictly inside the helix (hi+1 … hj-1) across the
		// backbone axis (line through coords[hi] to coords[hj]).
		_flipInteriorAcrossBackbone(helix, coords) {
			const {
				i: hi,
				j: hj
			} = helix;
			const ax = coords[hi].x,
				ay = coords[hi].y;
			const dx = coords[hj].x - ax,
				dy = coords[hj].y - ay;
			const len = Math.hypot(dx, dy) || 1;
			const ux = dx / len,
				uy = dy / len; // unit along backbone
			for (let k = hi + 1; k < hj; k++) {
				const px = coords[k].x - ax,
					py = coords[k].y - ay;
				const t = px * ux + py * uy; // projection onto backbone
				const perpX = px - t * ux,
					perpY = py - t * uy; // perpendicular component
				coords[k].x = ax + t * ux - perpX; // negate perp = reflect
				coords[k].y = ay + t * uy - perpY;
			}
		}
		_findDirectHelix(idx) {
			const {
				pairs,
				n,
				helices
			} = this._rna;
			const j = pairs[idx];
			if (j === -1) return null;
			let i = Math.min(idx, j),
				jj = Math.max(idx, j);
			while (i > 0 && jj < n - 1 && pairs[i - 1] === jj + 1) {
				i--;
				jj++;
			}
			return helices.find(h => h.i === i && h.j === jj) || null;
		}
		_onMouseDown(e) {
			if (this._isAnimating) return;
			if (e.button !== 0) return;
			const grp = e.target.closest('[data-idx]');
			if (grp) {
				const idx = parseInt(grp.getAttribute('data-idx'));
				const helix = this._findDirectHelix(idx);
				if (helix) {
					e.preventDefault();
					const snapCoords = this._rna.coords.map(c => ({
						...c
					}));
					if (this._isExteriorLoop(helix)) {
						// Exterior-loop helix, flip above/below the backbone
						// Record which side of the backbone the helix interior is on.
						const lc = helix.loopCenter;
						const innerSide = this._getBackboneSide(helix, snapCoords, lc.x, lc.y);
						this._flipState = {
							helix,
							snapCoords,
							innerSide,
							snapLCs: this._rna.helices.map(h => ({
								x: h.loopCenter.x,
								y: h.loopCenter.y
							})),
						};
						this._canvas.classList.add('rotating');
					} else {
						// Interior-loop helix, rotate around the loop centre
						// Interior-loop helix, rotate around the loop centre
						const pt = this._clientToScene(e.clientX, e.clientY);
						// For NAView the loopCenter centroid can sit geometrically between the
						// helix arms — use the midpoint of the flanking backbone positions instead.
						let cx = helix.loopCenter.x,
							cy = helix.loopCenter.y;
						let navPath = null;
						if (this._rna._algo === 'naview') {
							const _hi = helix.i,
								_hj = helix.j;
							const _c = this._rna.coords;
							const _mlX = helix.ml.x,
								_mlY = helix.ml.y;
							let _sx = 0,
								_sy = 0,
								_cnt = 0;
							for (let _k = _mlX; _k < _hi; _k++) {
								_sx += _c[_k].x;
								_sy += _c[_k].y;
								_cnt++;
							}
							for (let _k = _hj + 1; _k <= _mlY; _k++) {
								_sx += _c[_k].x;
								_sy += _c[_k].y;
								_cnt++;
							}
							if (_cnt > 0) {
								cx = _sx / _cnt;
								cy = _sy / _cnt;
							}
							const _nu = helix.nextUnpaired,
								_pu = helix.prevUnpaired;
							const _nuRev = [..._nu].reverse();
							const _n = this._rna.n;
							const _lf = Math.max(0, _nu.length > 0 ? _nu[_nu.length - 1] - 1 : _hi - 1);
							const _rf = Math.min(_n - 1, _pu.length > 0 ? _pu[_pu.length - 1] + 1 : _hj + 1);
							const _pp = [_lf, ..._nuRev, _hi, _hj, ..._pu, _rf];
							const _pc = _pp.map(i => ({
								x: _c[i].x,
								y: _c[i].y
							}));
							const _al = [0];
							for (let _k = 1; _k < _pc.length; _k++) _al.push(_al[_k - 1] + Math.hypot(_pc[_k].x - _pc[_k - 1].x, _pc[_k].y - _pc[_k - 1].y));
							navPath = {
								pc: _pc,
								al: _al,
								total: _al[_al.length - 1],
								shi: _al[1 + _nuRev.length],
								shj: _al[2 + _nuRev.length]
							};
						}
						const startAngle = Math.atan2(pt.y - cy, pt.x - cx);
						// Snapshot loop centers of ALL helices so child loop centers
						// can be kept in sync as the drag progresses (see _onMouseMove).
						const snapLCs = this._rna.helices.map(h => ({
							x: h.loopCenter.x,
							y: h.loopCenter.y
						}));
						this._rotState = {
							helix,
							cx,
							cy,
							startAngle,
							snapCoords,
							snapLCs,
							navPath
						};
						this._canvas.classList.add('rotating');
						const r = Math.hypot(this._rna.coords[helix.i].x - cx, this._rna.coords[helix.i].y - cy);
						this._rotCirc.setAttribute('cx', cx);
						this._rotCirc.setAttribute('cy', cy);
						this._rotCirc.setAttribute('r', r || 30);
						this._rotLine.setAttribute('x1', cx);
						this._rotLine.setAttribute('y1', cy);
						this._rotLine.setAttribute('x2', cx + (r || 30) * Math.cos(startAngle));
						this._rotLine.setAttribute('y2', cy + (r || 30) * Math.sin(startAngle));
						this._rotRing.style.display = 'block';
					}
					return;
				}
			}
			this._panStart = {
				x: e.clientX - this._vx,
				y: e.clientY - this._vy
			};
			this._canvas.classList.add('grabbing');
		}
		_onMouseMove(e) {
			if (this._flipState) {
				const {
					helix,
					snapCoords,
					innerSide,
					snapLCs
				} = this._flipState;
				const pt = this._clientToScene(e.clientX, e.clientY);
				const mouseSide = this._getBackboneSide(helix, snapCoords, pt.x, pt.y);
				const workCoords = snapCoords.map(c => ({
					...c
				}));
				const flipped = mouseSide !== 0 && mouseSide !== innerSide;
				if (flipped) this._flipInteriorAcrossBackbone(helix, workCoords);
				for (let i = 0; i < this._rna.n; i++) {
					this._rna.coords[i].x = workCoords[i].x;
					this._rna.coords[i].y = workCoords[i].y;
				}
				// Keep child-helix loopCenters in sync with the flip so subsequent
				// interior-loop rotation uses the correct pivot point.
				const {
					i: hi,
					j: hj
				} = helix;
				const ax = snapCoords[hi].x,
					ay = snapCoords[hi].y;
				const ddx = snapCoords[hj].x - ax,
					ddy = snapCoords[hj].y - ay;
				const len = Math.hypot(ddx, ddy) || 1;
				const ux = ddx / len,
					uy = ddy / len;
				this._rna.helices.forEach((h, idx) => {
					const snap = snapLCs[idx];
					if (flipped && h !== helix && h.i >= hi && h.j <= hj) {
						// Reflect this child's loopCenter across the backbone axis
						const px = snap.x - ax,
							py = snap.y - ay;
						const t = px * ux + py * uy;
						const perpX = px - t * ux,
							perpY = py - t * uy;
						h.loopCenter.x = ax + t * ux - perpX;
						h.loopCenter.y = ay + t * uy - perpY;
					} else {
						// Not flipped (or not a child), restore from snapshot
						h.loopCenter.x = snap.x;
						h.loopCenter.y = snap.y;
					}
				});
				this._render();
				return;
			}
			if (this._rotState) {
				const pt = this._clientToScene(e.clientX, e.clientY);
				const {
					helix,
					cx,
					cy,
					startAngle,
					snapCoords,
					snapLCs
				} = this._rotState;
				const dragAngle = Math.atan2(pt.y - cy, pt.x - cx);
				const workCoords = snapCoords.map(c => ({
					...c
				}));
				// For NAView path-sliding bypass VARNA entirely: its minDelta snap
				// (0.25 rad) maps tiny rightward drags to delta≈maxDelta≈6.03, which
				// after sign-conversion becomes -0.25 → helix moves backwards and
				// snaps. Use the raw signed drag angle instead.
				const {
					navPath
				} = this._rotState;
				let delta;
				if (this._rna._algo === 'naview' && navPath && navPath.total > 1e-9) {
					delta = dragAngle - startAngle;
					if (delta > Math.PI) delta -= 2 * Math.PI;
					if (delta < -Math.PI) delta += 2 * Math.PI;
				} else {
					// applyHelixRotation returns the actual delta applied (post-hysteresis).
					delta = applyHelixRotation(helix, dragAngle, startAngle, workCoords, this._rna.pairs, this._rna.n, cx, cy);
				}
				if (this._rna._algo === 'naview' && navPath && navPath.total > 1e-9) {
					const {
						pc,
						al,
						total,
						shi,
						shj
					} = navPath;
					const hi = helix.i,
						hj = helix.j;
					const nu = helix.nextUnpaired,
						pu = helix.prevUnpaired;
					const span = shj - shi;
					// delta is already raw-signed. Cap R to total/π so short loops
					// (1 base) don't overshoot on the first tiny drag.
					const R = Math.min(Math.hypot(snapCoords[hi].x - cx, snapCoords[hi].y - cy) || 1, total / Math.PI);
					const nshi = Math.max(0, Math.min(shi + delta * R, total - span));
					const nshj = nshi + span;
					const interp = s => {
						for (let k = 0; k < al.length - 1; k++) {
							if (s <= al[k + 1] + 1e-9) {
								const seg = al[k + 1] - al[k];
								const t = seg < 1e-9 ? 0 : (s - al[k]) / seg;
								return {
									x: pc[k].x + t * (pc[k + 1].x - pc[k].x),
									y: pc[k].y + t * (pc[k + 1].y - pc[k].y)
								};
							}
						}
						return {
							...pc[pc.length - 1]
						};
					};
					const nHi = interp(nshi);
					workCoords[hi].x = nHi.x;
					workCoords[hi].y = nHi.y;
					const oHi = snapCoords[hi],
						oHj = snapCoords[hj];
					const oDx = oHj.x - oHi.x,
						oDy = oHj.y - oHi.y;
					// Rigid transform: rotation only, NO scale — prevents the helix
					// from compressing when the path chord shortens.
					const origLen = Math.hypot(oDx, oDy);
					const nHj_path = interp(nshj);
					const nDxP = nHj_path.x - nHi.x,
						nDyP = nHj_path.y - nHi.y;
					const pathLen = Math.hypot(nDxP, nDyP);
					let rC = 1,
						rS = 0;
					if (origLen > 1e-9 && pathLen > 1e-9) {
						rC = (nDxP * oDx + nDyP * oDy) / (origLen * pathLen);
						rS = (nDyP * oDx - nDxP * oDy) / (origLen * pathLen);
					}
					// Place hj at original chord length from nHi in the new direction
					workCoords[hj].x = nHi.x + rC * oDx - rS * oDy;
					workCoords[hj].y = nHi.y + rS * oDx + rC * oDy;
					const actualNHj = workCoords[hj];
					for (let k = hi + 1; k < hj; k++) {
						const dx = snapCoords[k].x - oHi.x,
							dy = snapCoords[k].y - oHi.y;
						workCoords[k].x = nHi.x + rC * dx - rS * dy;
						workCoords[k].y = nHi.y + rS * dx + rC * dy;
					}
					nu.forEach((idx, k) => {
						const p = interp((nu.length - k) / (nu.length + 1) * nshi);
						workCoords[idx].x = p.x;
						workCoords[idx].y = p.y;
					});
					// Redistribute pu via similarity transform anchored at actualNHj
					// (not the path-derived nHj) so pu path shape is preserved.
					const rfC = pc[pc.length - 1];
					const puODx = rfC.x - oHj.x,
						puODy = rfC.y - oHj.y;
					const puNDx = rfC.x - actualNHj.x,
						puNDy = rfC.y - actualNHj.y;
					const puOL2 = puODx * puODx + puODy * puODy;
					if (puOL2 > 1e-9) {
						const puRC = (puNDx * puODx + puNDy * puODy) / puOL2;
						const puRS = (puNDy * puODx - puNDx * puODy) / puOL2;
						pu.forEach(idx => {
							const dx = snapCoords[idx].x - oHj.x,
								dy = snapCoords[idx].y - oHj.y;
							workCoords[idx].x = actualNHj.x + puRC * dx - puRS * dy;
							workCoords[idx].y = actualNHj.y + puRS * dx + puRC * dy;
						});
					}
					this._rna.helices.forEach((h, idx) => {
						const snap = snapLCs[idx];
						if (h !== helix && h.i >= hi && h.j <= hj) {
							const dx = snap.x - oHi.x,
								dy = snap.y - oHi.y;
							h.loopCenter.x = nHi.x + rC * dx - rS * dy;
							h.loopCenter.y = nHi.y + rS * dx + rC * dy;
						} else {
							h.loopCenter.x = snap.x;
							h.loopCenter.y = snap.y;
						}
					});
				} else {
					this._rna.helices.forEach((h, idx) => {
						const snap = snapLCs[idx];
						if (h !== helix && h.i > helix.i && h.j < helix.j) {
							const r = rotatePoint(cx, cy, snap.x, snap.y, delta);
							h.loopCenter.x = r.x;
							h.loopCenter.y = r.y;
						} else {
							h.loopCenter.x = snap.x;
							h.loopCenter.y = snap.y;
						}
					});
				}
				for (let i = 0; i < this._rna.n; i++) {
					this._rna.coords[i].x = workCoords[i].x;
					this._rna.coords[i].y = workCoords[i].y;
				}
				this._render();
				const r = parseFloat(this._rotCirc.getAttribute('r'));
				this._rotLine.setAttribute('x2', cx + r * Math.cos(dragAngle));
				this._rotLine.setAttribute('y2', cy + r * Math.sin(dragAngle));
				return;
			}
			if (this._panStart) {
				this._vx = e.clientX - this._panStart.x;
				this._vy = e.clientY - this._panStart.y;
				this._applyTransform();
			}
			if (this._tooltip.style.display !== 'none') this._positionTooltip(e.clientX, e.clientY);
		}
		_onMouseUp() {
			const wasActive = !!(this._rotState || this._flipState);
			this._panStart = null;
			this._rotState = null;
			this._flipState = null;
			this._canvas.classList.remove('grabbing', 'rotating');
			this._rotRing.style.display = 'none';
			if (wasActive && this._rna) {
				const {
					coords,
					n
				} = this._rna;
				const pw = this._canvas.clientWidth,
					ph = this._canvas.clientHeight,
					pad = 30;
				let outside = false;
				for (let i = 0; i < n; i++) {
					const px = coords[i].x * this._vscale + this._vx;
					const py = coords[i].y * this._vscale + this._vy;
					if (px < pad || px > pw - pad || py < pad || py > ph - pad) {
						outside = true;
						break;
					}
				}
				if (outside) this.fit();
			}
		}
		// Multi-structure support
		// Compute a full rna layout object for one structure (without touching this._rna).
		_computeLayout(sequence, structure, values, colorMap, pairAnnotations = null, pairAnnotColorMap = null, helixAnnotations = null, baseDisplay = null, positionLabels = null, alnSeqs = null, alnStruct = null, alnLen = 0) {
			const {
				pairs,
				pseudoPairs
			} = parseDotBracket(structure);
			const result = this._layoutAlgo === 'naview' ? this._autoRotateLayout(drawRNANAView(pairs, sequence.length)) : this._layoutAlgo === 'radiate' ? drawRNARadiate(pairs, sequence.length) : this._pickLayout(pairs, sequence.length);
			const _usedAlgo = this._layoutAlgo === 'auto' ? this._lastPickedAlgo : this._layoutAlgo;
			// If helixAnnotations are already resolved (have subHelices/pkPairs from loadHelixCov),
			// skip re-resolution — they're in the final format already.
			const _alreadyResolved = helixAnnotations?.length && ('subHelices' in helixAnnotations[0] || 'pkPairs' in helixAnnotations[0]);
			const resolvedHelixAnnotations = helixAnnotations?.length ?
				(_alreadyResolved ? helixAnnotations : resolveHelixAnnotations(helixAnnotations, pairs, positionLabels)) :
				null;
			return {
				sequence,
				structure,
				coords: result.coords,
				centers: result.centers,
				pairs,
				pseudoPairs,
				n: sequence.length,
				values: values || null,
				colorMap,
				helices: buildHelixTree(pairs, sequence.length, result.centers),
				pairAnnotations: pairAnnotations || null,
				pairAnnotColorMap: pairAnnotColorMap || null,
				helixAnnotations: resolvedHelixAnnotations || null,
				isCovAnnot: !!(pairAnnotations?.length || resolvedHelixAnnotations?.length),
				baseDisplay: baseDisplay || null,
				positionLabels: positionLabels || null,
				baseDisplay: baseDisplay || null,
				positionLabels: positionLabels || null,
				alnSeqs: alnSeqs || null,
				alnStruct: alnStruct || null,
				alnLen: alnLen || 0,
				_algo: _usedAlgo,
			};
		}
		_initStructures(config) {
			this._lastCovTexts = [];
			this._lastConfig = config;
			this._errEl.style.display = 'none';
			this._legend.style.display = 'none';
			// Save existing state so we can restore it if load fails while structures are already loaded
			const prevRna = this._rna;
			const prevStructures = this._structures;
			const prevLayouts = this._structLayouts;
			const prevIdx = this._currentStructIdx;
			// Helper: if structures already loaded, show dialog without wiping; otherwise fatal error
			const reportError = (msg) => {
				if (prevRna) {
					this._rna = prevRna;
					this._structures = prevStructures;
					this._structLayouts = prevLayouts;
					this._currentStructIdx = prevIdx;
					this._showErrorDialog(msg);
				} else {
					this._showError(msg);
				}
			};
			const sharedValues = config.values || null;
			const sharedColorMap = normalizeColorMap(config);
			this._structures = config.structures; // enriched after layout loop below
			this._structLayouts = [];
			this._currentStructIdx = Math.min(config._startIdx ?? 0, config.structures.length - 1);
			for (let idx = 0; idx < config.structures.length; idx++) {
				const s = config.structures[idx];
				const structure = s.structure;
				const label = s.label || `Structure ${idx + 1}`;
				if (!structure) {
					reportError(`${label}: structure string is missing.`);
					return;
				}
				// Per-structure sequence, change T to U.
				// Fall back to shared config.sequence ONLY when it has the same length as the
				// structure, otherwise a wrong-length shared sequence causes a spurious error.
				const perSeq = normalizeSeq(s.sequence);
				const sharedSeq = normalizeSeq(config.sequence);
				const sequence = perSeq || (sharedSeq.length === structure.length ? sharedSeq : '');
				if (!sequence) {
					reportError(`${label}: sequence is missing.`);
					return;
				}
				if (structure.length !== sequence.length) {
					reportError(`${label}: structure length (${structure.length}) ≠ sequence length (${sequence.length}).`);
					return;
				}
				// Strict sequence validation when relaxedSequence is off
				if (!this._relaxedSequence) {
					const STRICT_RE = /^[ACGUTRYSWKMBDHVNacgutryswkmbdhvn]+$/;
					if (!STRICT_RE.test(sequence)) {
						reportError(`${label}:\nSequence contains invalid characters. Enable non-standard sequence alphabets under Settings > General.`);
						return;
					}
				}
				// Bracket balance check
				const balErr = checkBracketBalance(structure);
				if (balErr) {
					reportError(`${label}: ${balErr}`);
					return;
				}
				const values = s.values != null ? s.values : sharedValues;
				const colorMap = s.colorMap != null ? normalizeColorMap({
					colorMap: s.colorMap
				}) : sharedColorMap;
				const pAnnots = s.pairAnnotations || config.pairAnnotations || null;
				const pAnnotCM = normalizePairAnnotColorMap(s.pairAnnotColorMap || config.pairAnnotColorMap);
				const hAnnots = s.helixAnnotations || config.helixAnnotations || null;
				if (pAnnots) {
					const {
						pairs: sPairs
					} = parseDotBracket(structure);
					const err = this._validatePairAnnotationsWithMap(pAnnots, sPairs, sequence.length, pAnnotCM);
					if (err) {
						reportError(`${label}: ${err}`);
						return;
					}
				}
				const _sl = this._computeLayout(sequence, structure, values, colorMap, pAnnots, pAnnotCM, hAnnots, s.baseDisplay || null, s.positionLabels || null, s.alnSeqs || null, s.alnStruct || null, s.alnLen || 0);
				if (s.ssConsFeatures) _sl.ssConsFeatures = s.ssConsFeatures;
				if (s.ssConsPkPairs) _sl.ssConsPkPairs = s.ssConsPkPairs;
				if (s.ssEnds) _sl.ssEnds = s.ssEnds;
				if (s.pseudoCovAnnotations) _sl.pseudoCovAnnotations = s.pseudoCovAnnotations;
				if (s.pseudoHelixCovAnnotations) _sl.pseudoHelixCovAnnotations = s.pseudoHelixCovAnnotations;
				if (s.isCovAnnot) _sl.isCovAnnot = s.isCovAnnot;
				this._structLayouts.push(_sl);
			}
			// Ensure every stored structure carries .sequence so future append operations
			// can recover it even when the caller used a shared config.sequence.
			// Also mirror resolved annotations onto each structure record so that
			// _rebuildCurrentLayout always has the canonical unshifted data on s,
			// regardless of whether annotations came from the config or a file upload.
			this._structures = config.structures.map((s, i) => {
				const sl = this._structLayouts[i];
				return {
					...s,
					sequence: s.sequence || sl?.sequence || '',
					pairAnnotations: s.pairAnnotations || config.pairAnnotations || sl?.pairAnnotations || undefined,
					pairAnnotColorMap: s.pairAnnotColorMap || config.pairAnnotColorMap || sl?.pairAnnotColorMap || undefined,
					helixAnnotations: s.helixAnnotations || config.helixAnnotations || sl?.helixAnnotations || undefined,
					pseudoHelixCovAnnotations: s.pseudoHelixCovAnnotations || sl?.pseudoHelixCovAnnotations || undefined,
					pseudoCovAnnotations: s.pseudoCovAnnotations || sl?.pseudoCovAnnotations || undefined,
					isCovAnnot: s.isCovAnnot || sl?.isCovAnnot || undefined,
					ssConsFeatures: s.ssConsFeatures || sl?.ssConsFeatures || undefined,
					ssConsPkPairs: s.ssConsPkPairs || sl?.ssConsPkPairs || undefined,
				};
			});
			this._lastConfig = config;
			this._buildStructSwitcher();
			this._rna = this._structLayouts[this._currentStructIdx];
			this._buildPairAnnotLegend(this._rna.pairAnnotColorMap, this._rna?.isCovAnnot);
			this._updateStatusBar();
			if (this._rna.values) this._updateLegend(this._rna.colorMap);
			this._updateLegendVisibility();
			// Auto-hide/restore indices based on whether the current structure is Stockholm.
			this._applyStructIndices(this._rna, config);
			// Auto-activate R3D toggle when SS_cons_ annotations are present,
			// unless disabled via constructor config or direct instance flag (e.g. headless --noR3d).
			if (this._rna?.baseDisplay && (
					(this._rna?.ssConsFeatures && Object.keys(this._rna.ssConsFeatures).length > 0) ||
					(this._rna?.ssConsPkPairs && Object.values(this._rna.ssConsPkPairs).some(p => p.length)) ||
					this._rna?.pseudoPairs?.length
				)) {
				if (this._constructorConfig?.showInsets !== false && this._showR3dInsets !== false) {
					this._showR3dInsets = true;
					this._showR3dLabels = true;
					if (this._chkR3dInsets) this._chkR3dInsets.classList.add('rv--active');
					if (this._chkR3dLabels) this._chkR3dLabels.classList.add('rv--active');
				}
			}
			// If showSsEnds is true and the current structure has trimmed ends, rebuild now.
			if (this._showSsEnds && this._rna?.ssEnds) {
				this._rebuildCurrentLayout();
			} else {
				this._render();
				this.fit();
			}
		}
		// Re-layout the current structure using trimmed or full (ss-ends) data
		// depending on this._showSsEnds. Called when the SS-ends toggle changes.
		_rebuildCurrentLayout() {
			const idx = this._currentStructIdx;
			const s = this._structures?.[idx];
			if (!s) return;
			const ends = s.ssEnds;
			const shift = (this._showSsEnds && ends?.trimS > 0) ? ends.trimS : 0;

			// Read from _base (the trimmed-index canonical), falling back to the layout itself
			// (when ssEnds is off, _base is not set and the layout IS trimmed-index).
			const layout = this._structLayouts[idx];
			if (!layout) return;
			const src = layout._base || layout;

			// Sequence/structure: trimmed or full depending on toggle
			const sequence = this._showSsEnds && ends ? ends.fullSeq.join('') : s.sequence;
			const structure = this._showSsEnds && ends ? ends.fullStruct.join('') : s.structure;
			const baseDisplay = this._showSsEnds && ends ? ends.fullBaseDisplay : s.baseDisplay || null;
			const positionLabels = this._showSsEnds && ends ? ends.fullPositionLabels : s.positionLabels || null;

			const shiftPairs = (arr) => !arr || shift === 0 ? arr :
				arr.map(p => ({
					...p,
					...(p.i != null ? {
						i: p.i + shift
					} : {}),
					...(p.j != null ? {
						j: p.j + shift
					} : {}),
				}));

			const shiftHelixAnnots = (arr) => !arr || shift === 0 ? arr :
				arr.map(h => ({
					...h,
					subHelices: (h.subHelices || []).map(sh => ({
						pos5p: sh.pos5p.map(p => p + shift),
						pos3p: sh.pos3p.map(p => p + shift),
					})),
				}));

			const _sl = this._computeLayout(
				sequence, structure,
				src.values || null,
				src.colorMap || null,
				shiftPairs(src.pairAnnotations || null),
				src.pairAnnotColorMap || null,
				shiftHelixAnnots(src.helixAnnotations || null),
				baseDisplay, positionLabels,
				s.alnSeqs || null,
				s.alnStruct || null,
				s.alnLen || 0
			);

			// ssConsFeatures
			const rawFeatures = src.ssConsFeatures;
			if (rawFeatures && shift > 0) {
				const shifted = {};
				for (const [name, positions] of Object.entries(rawFeatures))
					shifted[name] = positions.map(p => p + shift);
				_sl.ssConsFeatures = shifted;
			} else {
				_sl.ssConsFeatures = rawFeatures || undefined;
			}

			// ssConsPkPairs
			const rawPkPairs = src.ssConsPkPairs;
			if (rawPkPairs && shift > 0) {
				const shifted = {};
				for (const [name, fps] of Object.entries(rawPkPairs))
					shifted[name] = fps.map(p => ({
						i: p.i + shift,
						j: p.j + shift
					}));
				_sl.ssConsPkPairs = shifted;
			} else {
				_sl.ssConsPkPairs = rawPkPairs || undefined;
			}

			// pseudoHelixCovAnnotations
			const rawPhc = src.pseudoHelixCovAnnotations;
			_sl.pseudoHelixCovAnnotations = rawPhc && shift > 0 ?
				rawPhc.map(p => ({
					i: p.i + shift,
					j: p.j + shift
				})) :
				rawPhc || undefined;

			// Carry non-annotation data
			_sl.ssEnds = ends || undefined;
			_sl.isCovAnnot = src.isCovAnnot;
			_sl.pseudoCovAnnotations = src.pseudoCovAnnotations || undefined;

			// Store the trimmed-index base on the new layout so future rebuilds
			// always have a stable unshifted source, even after loadCov writes onto _rna.
			_sl._base = src._base || src;
			this._structLayouts[idx] = _sl;
			this._rna = _sl;
			this._render();
			this.fit();
		}
		// Update index visibility to match the given structure layout.
		// Stockholm structures (with ssConsFeatures) hide indices; others restore them,
		// unless the caller explicitly set showIndices:false in the config.
		_applyStructIndices(rna, config) {
			const isStockholm = !!(rna?.baseDisplay);
			if (isStockholm) {
				this._showIndices = false;
				if (this._chkIndices) this._chkIndices.classList.remove('rv--active');
			} else {
				// Restore indices — but only if the user hasn't explicitly disabled them.
				// Check constructor config first (highest priority), then per-load config.
				const constructorSaysOff = this._constructorConfig?.showIndices === false;
				const loadSaysOff = (config ?? {}).showIndices === false;
				if (!constructorSaysOff && !loadSaysOff) {
					this._showIndices = true;
					if (this._chkIndices) this._chkIndices.classList.add('rv--active');
				}
			}
			// Reset ss-ends toggle to the config default when switching structures.
			if (rna?.ssEnds) {
				this._showSsEnds = this._constructorConfig?.showSsEnds === true;
				if (this._chkSsEnds) this._chkSsEnds.classList.toggle('rv--active', this._showSsEnds);
			} else {
				this._showSsEnds = false;
				if (this._chkSsEnds) this._chkSsEnds.classList.remove('rv--active');
			}
		}
		_buildStructSwitcher() {
			this._structBar.innerHTML = '';
			if (this._structures.length <= 1) {
				this._structWrap?.classList.remove('rv-visible');
				return;
			}
			this._structWrap?.classList.add('rv-visible');
			this._structures.forEach((s, idx) => {
				const pill = document.createElement('button');
				pill.className = 'rv-struct-pill' + (idx === this._currentStructIdx ? ' rv--active' : '');
				pill.textContent = s.label || `Structure ${idx + 1}`;
				pill.addEventListener('click', () => this.switchToStructure(idx));
				this._structBar.appendChild(pill);
			});
			// Wire scroll arrows, update state after each scroll and on build
			const updateArrows = () => {
				if (!this._structArrowL) return;
				const bar = this._structBar;
				this._structArrowL.disabled = bar.scrollLeft <= 0;
				this._structArrowR.disabled = bar.scrollLeft >= bar.scrollWidth - bar.clientWidth - 1;
			};
			if (this._structArrowL) {
				this._structArrowL.onclick = () => {
					this._structBar.scrollBy({
						left: -120,
						behavior: 'smooth'
					});
					setTimeout(updateArrows, 320);
				};
			}
			if (this._structArrowR) {
				this._structArrowR.onclick = () => {
					this._structBar.scrollBy({
						left: 120,
						behavior: 'smooth'
					});
					setTimeout(updateArrows, 320);
				};
			}
			this._structBar.addEventListener('scroll', updateArrows, {
				passive: true
			});
			// Initial state after layout (scrollWidth not reliable until rendered)
			requestAnimationFrame(() => {
				// Scroll the active pill into view inside the bar
				const active = this._structBar.querySelector('.rv-struct-pill.rv--active');
				if (active) {
					const bar = this._structBar;
					const pl = active.offsetLeft,
						pw = active.offsetWidth;
					if (pl + pw > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = pl + pw - bar.clientWidth + 8;
					else if (pl < bar.scrollLeft) bar.scrollLeft = Math.max(0, pl - 8);
				}
				updateArrows();
			});
		}
		_updateStatusBar() {
			if (!this._rna) return;
			const {
				pairs,
				pseudoPairs,
				n,
				sequence,
				baseDisplay
			} = this._rna;
			const pk = pseudoPairs.length;
			if (this._sbSeq) this._sbSeq.textContent = `${n} bases`;
			if (baseDisplay) {
				// Stockholm alignment, just show base-pairs and pseudoknots
				const bp = pairs.reduce((s, p, i) => s + (p > i ? 1 : 0), 0);
				if (this._sbPairs) this._sbPairs.textContent = `${bp} base-pair${bp !== 1 ? 's' : ''}${pk ? ` · ${pk} pseudoknot` : ''}`;
			} else {
				// Standard structure, canonical / non-canonical breakdown
				let canonical = 0,
					nonCanon = 0;
				for (let i = 0; i < n; i++) {
					if (pairs[i] > i) {
						const b1 = normalizeSeq(sequence[i] || '');
						const b2 = normalizeSeq(sequence[pairs[i]] || '');
						const c = (b1 === 'G' && b2 === 'C') || (b1 === 'C' && b2 === 'G') || (b1 === 'A' && b2 === 'U') || (b1 === 'U' && b2 === 'A') || (b1 === 'G' && b2 === 'U') || (b1 === 'U' && b2 === 'G');
						if (c) canonical++;
						else nonCanon++;
					}
				}
				if (this._sbPairs) this._sbPairs.textContent = `${canonical} canonical${nonCanon ? ` · ${nonCanon} non-canonical` : ''}${pk ? ` · ${pk} pseudoknot` : ''} pair${canonical + nonCanon + pk !== 1 ? 's' : ''}`;
			}
		}
		// Switch to a structure by index or label, with animated transition
		switchToStructure(idxOrLabel) {
			if (!this._structLayouts.length) return;
			// Ignore new requests while an animation is running, prevents corrupted frames
			if (this._isAnimating) return;
			const idx = typeof idxOrLabel === 'number' ? idxOrLabel : this._structures.findIndex(s => s.label === idxOrLabel);
			if (idx < 0 || idx >= this._structLayouts.length || idx === this._currentStructIdx) return;
			// Update pill states immediately so the user gets feedback
			this._root.querySelectorAll('.rv-struct-pill').forEach((p, i) => {
				p.classList.toggle('rv--active', i === idx);
				if (i === idx) p.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'nearest'
				});
			});
			const srcRna = this._structLayouts[this._currentStructIdx];
			const tgtRna = this._structLayouts[idx];

			// Save current toggle state onto the source layout so it's restored when switching back
			srcRna._toggleState = {
				showPairAnnotations: this._showPairAnnotations,
				showColors: this._showColors,
				showIndices: this._showIndices,
				showPseudoknots: this._showPseudoknots,
				showR3dInsets: this._showR3dInsets,
				showR3dLabels: this._showR3dLabels,
				showSsEnds: this._showSsEnds,
			};
			// Restore toggle state from the target layout (if previously saved)
			if (tgtRna._toggleState) {
				const s = tgtRna._toggleState;
				this._showPairAnnotations = s.showPairAnnotations;
				this._showColors = s.showColors;
				this._showIndices = s.showIndices;
				this._showPseudoknots = s.showPseudoknots;
				this._showR3dInsets = s.showR3dInsets;
				this._showR3dLabels = s.showR3dLabels;
				this._showSsEnds = s.showSsEnds;
				// Sync button visual states
				if (this._chkPAnnot) this._chkPAnnot.classList.toggle('rv--active', this._showPairAnnotations);
				if (this._chkColors) this._chkColors.classList.toggle('rv--active', this._showColors);
				if (this._chkIndices) this._chkIndices.classList.toggle('rv--active', this._showIndices);
				if (this._chkPk) this._chkPk.classList.toggle('rv--active', this._showPseudoknots);
				if (this._chkR3dInsets) this._chkR3dInsets.classList.toggle('rv--active', this._showR3dInsets);
				if (this._chkR3dLabels) this._chkR3dLabels.classList.toggle('rv--active', this._showR3dLabels);
				if (this._chkSsEnds) this._chkSsEnds.classList.toggle('rv--active', this._showSsEnds);
			}

			this._currentStructIdx = idx;
			// Animate only when both structures share the same sequence — different
			// sequences mean different lengths / base identities which would corrupt
			// the transition frame interpolation.
			if (srcRna.sequence === tgtRna.sequence && this._transitionDuration > 0 && !srcRna.baseDisplay && !tgtRna.baseDisplay) {
				this._animateTransition(srcRna, tgtRna);
			} else {
				this._rna = tgtRna;
				this._applyStructIndices(tgtRna, this._lastConfig);
				this._buildPairAnnotLegend(tgtRna.pairAnnotColorMap, tgtRna?.isCovAnnot);
				this._updateStatusBar();
				if (tgtRna.values) this._updateLegend(tgtRna.colorMap);
				this._updateLegendVisibility();
				if (this._showSsEnds && tgtRna?.ssEnds) {
					this._rebuildCurrentLayout();
				} else {
					this._render();
					this.fit();
				}
			}
		}
		_animateTransition(srcRna, tgtRna) {
			const n = srcRna.n;
			const duration = this._transitionDuration;
			// Classify pairs
			const key = (i, j) => `${Math.min(i,j)}_${Math.max(i,j)}`;
			const srcMap = new Map(),
				tgtMap = new Map();
			for (let i = 0; i < n; i++) {
				if (srcRna.pairs[i] > i) srcMap.set(key(i, srcRna.pairs[i]), {
					i,
					j: srcRna.pairs[i]
				});
				if (tgtRna.pairs[i] > i) tgtMap.set(key(i, tgtRna.pairs[i]), {
					i,
					j: tgtRna.pairs[i]
				});
			}
			const lostPairs = [...srcMap.entries()].filter(([k]) => !tgtMap.has(k)).map(([, v]) => v);
			const gainedPairs = [...tgtMap.entries()].filter(([k]) => !srcMap.has(k)).map(([, v]) => v);
			const commonPairs = [...tgtMap.entries()].filter(([k]) => srcMap.has(k)).map(([, v]) => v);
			// Snapshot source positions (may include user rotations)
			const srcCoords = srcRna.coords.map(c => ({
				...c
			}));
			const tgtCoords = tgtRna.coords;
			const ease = t => t * t * (3 - 2 * t); // smoothstep
			this._isAnimating = true;
			this._structBar?.classList.add('rv--animating');
			const t0 = performance.now();
			const frame = now => {
				const raw = Math.min((now - t0) / duration, 1);
				const et = ease(raw);
				const interp = srcCoords.map((s, i) => ({
					x: s.x + (tgtCoords[i].x - s.x) * et,
					y: s.y + (tgtCoords[i].y - s.y) * et,
				}));
				this._renderTransitionFrame(interp, srcRna.sequence, lostPairs, gainedPairs, commonPairs, tgtRna.pseudoPairs, 1 - et, et, tgtRna.values, tgtRna.colorMap, tgtRna.pairAnnotations, tgtRna.pairAnnotColorMap);
				if (raw < 1) {
					this._animFrame = requestAnimationFrame(frame);
				} else {
					this._isAnimating = false;
					this._structBar?.classList.remove('rv--animating');
					this._rna = tgtRna;
					this._applyStructIndices(tgtRna, this._lastConfig);
					this._buildPairAnnotLegend(tgtRna.pairAnnotColorMap, tgtRna?.isCovAnnot);
					this._updateStatusBar();
					if (tgtRna.values) this._updateLegend(tgtRna.colorMap);
					this._updateLegendVisibility();
					if (this._showSsEnds && tgtRna?.ssEnds) {
						this._rebuildCurrentLayout();
					} else {
						this._render();
						this.fit();
					}
				}
			};
			this._animFrame = requestAnimationFrame(frame);
		}
		_renderTransitionFrame(coords, sequence, lostPairs, gainedPairs, commonPairs, pseudoPairs, fadeOut, fadeIn, values, colorMap, pairAnnotations = null, pairAnnotColorMap = null) {
			this._scene.innerHTML = '';
			const n = coords.length;
			const g_helix = document.createElementNS(NS, 'g'); // helix cov boxes
			const g_annot = document.createElementNS(NS, 'g'); // annotation boxes
			const g_bb = document.createElementNS(NS, 'g');
			const g_bp = document.createElementNS(NS, 'g');
			const g_base = document.createElementNS(NS, 'g');
			const g_pk = document.createElementNS(NS, 'g');
			const g_pk_top = document.createElementNS(NS, 'g');
			this._scene.append(g_bb, g_bp, g_helix, g_annot, g_base, g_pk, g_pk_top);
			const pkEndpts = new Set(pseudoPairs.flatMap(ps => [ps.i, ps.j]));
			const _animBaseR = parseFloat(getComputedStyle(this._root).getPropertyValue('--rv-base-radius')) || BASE_R;
			this._renderHelixAnnotations(g_helix, coords, n, _animBaseR);
			const dotR = this._gvn('--rv-noncanon-dot-r', 4.5);
			const BP_OFFSET = 2.8;
			// Backbone, skip segments adjacent to skipped alignment positions
			for (let i = 0; i < n - 1; i++) {
				const bd = this._rna?.baseDisplay;
				if (bd?.[i]?.skip || bd?.[i + 1]?.skip) continue;
				const l = document.createElementNS(NS, 'line');
				l.setAttribute('class', 'rv-backbone');
				l.setAttribute('x1', coords[i].x);
				l.setAttribute('y1', coords[i].y);
				l.setAttribute('x2', coords[i + 1].x);
				l.setAttribute('y2', coords[i + 1].y);
				g_bb.appendChild(l);
			}
			// Theme colors for animation
			const cs = getComputedStyle(this._root);
			const baseR = parseFloat(cs.getPropertyValue('--rv-base-radius')) || BASE_R;
			const idxOff = parseFloat(cs.getPropertyValue('--rv-base-index-offset')) || 26;
			const bgColor = cs.getPropertyValue('--rv-bg').trim() || '#ffffff';
			const pairColor = cs.getPropertyValue('--rv-pair-break').trim ? cs.getPropertyValue('--rv-basepair').trim() || '#000' : '#000';
			const breakColor = cs.getPropertyValue('--rv-pair-break').trim ? cs.getPropertyValue('--rv-pair-break').trim() || '#bc1717' : '#bc1717';
			const formColor = cs.getPropertyValue('--rv-pair-form').trim() || '#21a325';
			const bpWidth = parseFloat(cs.getPropertyValue('--rv-basepair-width')) || 2.2;
			const pseudopairWidth = parseFloat(cs.getPropertyValue('--rv-pseudopair-width')) || 2;
			// Helper, draw a styled bond (GC=double, GU=dot, AU=single)
			const drawBond = (i, j, color, opacity) => {
				if (opacity < 0.01) return;
				const x1 = coords[i].x,
					y1 = coords[i].y;
				const x2 = coords[j].x,
					y2 = coords[j].y;
				const b1 = normalizeSeq(sequence[i] || '');
				const b2 = normalizeSeq(sequence[j] || '');
				const pair = [b1, b2].sort().join('');
				const css = `stroke:${color};stroke-width:${bpWidth};fill:none;stroke-linecap:round;opacity:${opacity}`;
				const mkL = (x1, y1, x2, y2) => {
					const l = this._mkSvgLine(x1, y1, x2, y2);
					l.style.cssText = css;
					g_bp.appendChild(l);
				};
				if (pair === 'CG') {
					const dx = x2 - x1,
						dy = y2 - y1,
						len = Math.hypot(dx, dy) || 1;
					const nx = -dy / len * BP_OFFSET,
						ny = dx / len * BP_OFFSET;
					mkL(x1 + nx, y1 + ny, x2 + nx, y2 + ny);
					mkL(x1 - nx, y1 - ny, x2 - nx, y2 - ny);
				} else if (pair === 'GU') {
					mkL(x1, y1, x2, y2);
					const mx = (x1 + x2) / 2,
						my = (y1 + y2) / 2;
					const dot = document.createElementNS(NS, 'circle');
					dot.setAttribute('cx', mx);
					dot.setAttribute('cy', my);
					dot.setAttribute('r', dotR);
					dot.style.cssText = `fill:${color};stroke:none;opacity:${opacity}`;
					g_bp.appendChild(dot);
				} else if (pair === 'AU' || pair === 'UA') {
					mkL(x1, y1, x2, y2);
				} else if (this._relaxedSequence) {
					// Non-standard bases — single line
					mkL(x1, y1, x2, y2);
				} else {
					// Non-canonical, dot only
					const mx = (x1 + x2) / 2,
						my = (y1 + y2) / 2;
					const ndot = document.createElementNS(NS, 'circle');
					ndot.setAttribute('cx', mx);
					ndot.setAttribute('cy', my);
					ndot.setAttribute('r', dotR);
					ndot.style.cssText = `fill:${color};stroke:none;opacity:${opacity}`;
					g_bp.appendChild(ndot);
				}
			};
			// Simple helper for lost/gained (always single line)
			const drawPair = (i, j, color, opacity) => {
				if (opacity < 0.01) return;
				const l = document.createElementNS(NS, 'line');
				l.setAttribute('x1', coords[i].x);
				l.setAttribute('y1', coords[i].y);
				l.setAttribute('x2', coords[j].x);
				l.setAttribute('y2', coords[j].y);
				l.style.cssText = `stroke:${color};stroke-width:${bpWidth};fill:none;stroke-linecap:round;opacity:${opacity}`;
				g_bp.appendChild(l);
			};
			// Common pairs, retain proper GC/GU bond style
			for (const {
					i,
					j
				}
				of commonPairs) drawBond(i, j, pairColor, 1);
			// Lost pairs, breaking color, fading to transparent
			for (const {
					i,
					j
				}
				of lostPairs) drawPair(i, j, breakColor, fadeOut);
			// Gained pairs, forming color, fading in
			for (const {
					i,
					j
				}
				of gainedPairs) drawPair(i, j, formColor, fadeIn);
			// Pseudoknot pairs (target) fading in, on top of bases
			if (this._showPseudoknots !== false) {
				const _showAnnot = this._showPairAnnotations;
				const pkCovMap = _showAnnot ?
					new Map((this._rna.pseudoCovAnnotations || []).map(({
						i,
						j,
						color
					}) => [pairKey(i, j), color])) :
					new Map();
				const pkHelixGlowSet = _showAnnot ?
					new Set((this._rna.pseudoHelixCovAnnotations || []).map(({
						i,
						j
					}) => pairKey(i, j))) :
					new Set();
				const _helixColor = cs.getPropertyValue('--rv-helix-annot-color').trim() || '#aff0a8';
				const _pkColor = cs.getPropertyValue('--rv-pseudopair').trim() || '#1f2328';
				const _pkWidth = parseFloat(cs.getPropertyValue('--rv-basepair-width')) || 2.2;
				// Build occupancy grid for arc direction selection
				const _GRID = 30;
				let _minGX = Infinity,
					_maxGX = -Infinity,
					_minGY = Infinity,
					_maxGY = -Infinity;
				for (let k = 0; k < coords.length; k++) {
					if (coords[k].x < _minGX) _minGX = coords[k].x;
					if (coords[k].x > _maxGX) _maxGX = coords[k].x;
					if (coords[k].y < _minGY) _minGY = coords[k].y;
					if (coords[k].y > _maxGY) _maxGY = coords[k].y;
				}
				const _span = Math.max(_maxGX - _minGX, _maxGY - _minGY, 1);
				const _cellSize = _span / _GRID;
				const _occ = new Uint8Array((_GRID + 2) * (_GRID + 2));
				const _markCell = (gx, gy) => {
					if (gx >= 0 && gx <= _GRID && gy >= 0 && gy <= _GRID)
						_occ[gy * (_GRID + 2) + gx] = 1;
				};
				for (let k = 0; k < coords.length; k++) {
					const gx = Math.min(_GRID, Math.floor((coords[k].x - _minGX) / _cellSize));
					const gy = Math.min(_GRID, Math.floor((coords[k].y - _minGY) / _cellSize));
					for (let dy = -1; dy <= 1; dy++)
						for (let dx = -1; dx <= 1; dx++)
							_markCell(gx + dx, gy + dy);
				}
				const _sampleOcc = (px, py) => {
					if (px < _minGX || px > _maxGX || py < _minGY || py > _maxGY) return 0;
					const gx = Math.min(_GRID, Math.max(0, Math.floor((px - _minGX) / _cellSize)));
					const gy = Math.min(_GRID, Math.max(0, Math.floor((py - _minGY) / _cellSize)));
					return _occ[gy * (_GRID + 2) + gx];
				};
				const _arcOcc = (ax, ay, cpx, cpy, bx, by) => {
					let sum = 0;
					for (let s = 1; s < 8; s++) {
						const t = s / 8;
						const px = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cpx + t * t * bx;
						const py = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cpy + t * t * by;
						sum += _sampleOcc(px, py);
					}
					return sum;
				};
				for (const ps of pseudoPairs) {
					const key = pairKey(ps.i, ps.j);
					const arcColor = pkCovMap.get(key) ?? _pkColor;
					const strokeW = pkCovMap.has(key) ? _pkWidth * 1.5 : _pkWidth;
					const ax = coords[ps.i].x,
						ay = coords[ps.i].y;
					const bx = coords[ps.j].x,
						by = coords[ps.j].y;
					const mx = (ax + bx) / 2,
						my = (ay + by) / 2;
					const len = Math.hypot(bx - ax, by - ay) || 1;
					const nx = -(by - ay) / len,
						ny = (bx - ax) / len;
					const off = len * 0.35;
					const cp1x = mx + nx * off,
						cp1y = my + ny * off;
					const cp2x = mx - nx * off,
						cp2y = my - ny * off;
					const sign = _arcOcc(ax, ay, cp1x, cp1y, bx, by) <= _arcOcc(ax, ay, cp2x, cp2y, bx, by) ? 1 : -1;
					const arcD = `M ${ax} ${ay} Q ${mx + sign * nx * off} ${my + sign * ny * off} ${bx} ${by}`;
					if (pkHelixGlowSet.has(key)) {
						const glow = document.createElementNS(NS, 'path');
						glow.setAttribute('d', arcD);
						glow.style.cssText = `stroke:${_helixColor};stroke-width:${_pkWidth * 5};fill:none;stroke-linecap:round;opacity:0.25`;
						g_pk.appendChild(glow);
					}
					const arc = document.createElementNS(NS, 'path');
					arc.setAttribute('d', arcD);
					arc.style.cssText = `stroke:${arcColor};stroke-width:${strokeW};fill:none;stroke-linecap:round;stroke-dasharray:5 3`;
					g_pk.appendChild(arc);
				}
			}
			// Pair annotation boxes (fade with target structure)
			if (this._showPairAnnotations && pairAnnotations?.length) {
				// Build a minimal pairs array from commonPairs + gainedPairs for the target
				const tgtPairs = new Int32Array(n).fill(-1);
				for (const {
						i,
						j
					}
					of [...commonPairs, ...gainedPairs]) {
					tgtPairs[i] = j;
					tgtPairs[j] = i;
				}
				this._renderPairAnnotations(g_annot, coords, tgtPairs, pairAnnotations, pairAnnotColorMap, baseR, fadeIn);
			}
			// Bases
			for (let i = 0; i < n; i++) {
				const bd = this._rna?.baseDisplay?.[i];
				const fillColor = (this._showColors && values) ? valueToColor(values[i], colorMap) : null;
				if (bd?.skip && !fillColor) {
					// Skip invisible positions, still render index label below if needed
				} else {
					const circ = document.createElementNS(NS, 'circle');
					circ.setAttribute('class', 'rv-base-circle');
					circ.setAttribute('cx', coords[i].x);
					circ.setAttribute('cy', coords[i].y);
					circ.setAttribute('r', baseR);
					const lbl = document.createElementNS(NS, 'text');
					lbl.setAttribute('class', 'rv-base-label');
					lbl.setAttribute('x', coords[i].x);
					lbl.setAttribute('y', coords[i].y);
					if (fillColor) {
						circ.style.fill = fillColor;
						circ.style.stroke = 'rgba(0,0,0,0.18)';
						lbl.textContent = bd?.letter ?? (sequence[i] || '?');
						lbl.style.fill = getContrastTextColor(fillColor);
					} else if (bd) {
						if (bd.letter !== null) {
							circ.setAttribute('r', baseR * 1.5);
							circ.style.fill = bgColor;
							circ.style.stroke = 'none';
							lbl.textContent = bd.letter;
							lbl.style.fill = bd.textColor;
							lbl.style.fontSize = (baseR * 3) + 'px';
							lbl.style.fontWeight = 'bold';
						} else {
							circ.style.fill = bd.fillColor;
							circ.style.stroke = '#111111';
							lbl.textContent = '';
						}
					} else {
						lbl.textContent = sequence[i] || '?';
						if (fillColor) lbl.style.fill = getContrastTextColor(fillColor);
					}
					(pkEndpts.has(i) ? g_pk_top : g_base).append(circ, lbl);
				}
			}
		}
		_exitAlnView() {
			this._alnActive = false;
			if (this._alnViewEl) {
				this._alnViewEl.classList.remove('rv--active');
				this._alnViewEl.innerHTML = '';
			}
			this._root.classList.remove('rv--aln-mode');
			if (this._svgEl) this._svgEl.style.display = '';
			if (this._structWrap) this._structWrap.style.display = '';
			if (this._pkPanelsEl && this._pkPanelsEl.children.length) {
				this._pkPanelsEl.style.display = 'flex';
			}
			if (this._alnBtn) {
				this._alnBtn.classList.remove('rv--active');
				this._alnBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg><span class="rv-btn-label">Alignment view</span>';
			}
			if (this._rna?.values && this._showColors) this._legend.style.display = 'block';
			if (this._rna?.pairAnnotColorMap && this._rna?.isCovAnnot && this._showPairAnnotations) this._palLegend.style.display = 'block';
			if (this._alnLegend && this._rna?.baseDisplay) this._alnLegend.classList.add('rv-visible');
		}
		_toggleAlnView() {
			if (!this._rna?.alnSeqs) return;
			this._alnActive = !this._alnActive;
			if (this._alnActive) {
				this._svgEl.style.display = 'none';
				if (this._structWrap) this._structWrap.style.display = 'none';
				if (this._pkPanelsEl) this._pkPanelsEl.style.display = 'none';
				this._root.classList.add('rv--aln-mode');
				this._legend.style.display = 'none';
				this._palLegend.style.display = 'none';
				if (this._alnLegend) this._alnLegend.classList.remove('rv-visible');
				this._alnViewEl.classList.add('rv--active');
				if (this._alnBtn) {
					this._alnBtn.classList.add('rv--active');
					this._alnBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg><span class="rv-btn-label">Structure</span>';
				}
				this._buildAlnView();
			} else {
				this._exitAlnView();
			}
		}
		_buildAlnView() {
			if (!this._alnViewEl || !this._rna?.alnSeqs) return;
			const {
				alnSeqs,
				alnStruct,
				alnLen,
				positionLabels,
				helices,
				pairs,
				n
			} = this._rna;
			const pseudoPairs = this._rna.pseudoPairs || [];
			// Rendered-index → helix colour
			const nHelices = helices?.length || 0;
			const posColor = new Array(n).fill(null);
			if (helices) {
				helices.forEach((h, idx) => {
					const hue = Math.round(idx * 360 / Math.max(nHelices, 1)) % 360;
					const col = `hsl(${hue},55%,72%)`;
					let ii = h.i,
						jj = h.j;
					while (ii <= jj && pairs[ii] === jj) {
						posColor[ii] = col;
						posColor[jj] = col;
						ii++;
						jj--;
					}
				});
			}
			if (pseudoPairs.length) {
				const sorted = [...pseudoPairs].sort((a, b) => a.i - b.i);
				const pkStems = [];
				let stem = [sorted[0]];
				for (let k = 1; k < sorted.length; k++) {
					const p = sorted[k - 1],
						c = sorted[k];
					if (c.i === p.i + 1 && c.j === p.j - 1) stem.push(c);
					else {
						pkStems.push(stem);
						stem = [c];
					}
				}
				pkStems.push(stem);
				const total = nHelices + pkStems.length;
				pkStems.forEach((st, idx) => {
					const hue = Math.round((nHelices + idx) * 360 / Math.max(total, 1)) % 360;
					const col = `hsl(${hue},70%,62%)`;
					for (const {
							i,
							j
						}
						of st) {
						posColor[i] = col;
						posColor[j] = col;
					}
				});
			}
			// Original alignment column (0-based) → colour
			const colColor = new Array(alnLen).fill(null);
			if (positionLabels) positionLabels.forEach((origCol1, ri) => {
				colColor[origCol1 - 1] = posColor[ri];
			});
			// Number-row characters
			const numRow = new Array(alnLen).fill('\u00a0');
			for (let col = 0; col < alnLen; col++) {
				if ((col + 1) % 10 === 0) {
					const s = String(col + 1);
					for (let k = 0; k < s.length; k++) {
						const c = col - (s.length - 1) + k;
						if (c >= 0 && c < alnLen) numRow[c] = s[k];
					}
				}
			}
			const validSeqs = alnSeqs.filter(({
				name,
				seq
			}) => !name.startsWith('#') && seq && /[A-Za-z]/.test(seq));
			const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const muted = 'var(--rv-muted,#656d76)';
			// thead
			const hParts = ['<thead class="rv-aln-thead"><tr><td class="rv-aln-name">\u00a0</td>'];
			for (let col = 0; col < alnLen; col++) {
				const bg = colColor[col] ? colColor[col].replace('72%', '88%').replace('62%', '80%') : null;
				hParts.push(`<th class="rv-aln-c"${bg ? ` style="background:${bg}"` : ''}>${numRow[col]}</th>`);
			}
			hParts.push('</tr></thead>');
			// tfoot
			const fParts = ['<tfoot class="rv-aln-tfoot"><tr><td class="rv-aln-name">SS_cons</td>'];
			for (let col = 0; col < alnLen; col++) {
				const ch = col < (alnStruct?.length || 0) ? alnStruct[col] : '.';
				const fg = colColor[col] ? colColor[col].replace('72%', '38%').replace('62%', '32%') : muted;
				fParts.push(`<td class="rv-aln-c" style="color:${fg}">${esc(ch)}</td>`);
			}
			fParts.push('</tr></tfoot>');
			this._alnViewEl.innerHTML = `<div class="rv-aln-scroll"><table class="rv-aln-table">` + hParts.join('') + `<tbody>` + `<tr class="rv-sp-t"><td colspan="${alnLen+1}" style="padding:0;border:0;height:0"></td></tr>` + `<tr class="rv-sp-b"><td colspan="${alnLen+1}" style="padding:0;border:0;height:0"></td></tr>` + `</tbody>` + fParts.join('') + `</table></div>`;
			const scroll = this._alnViewEl.querySelector('.rv-aln-scroll');
			const tbody = this._alnViewEl.querySelector('tbody');
			const spTd_t = tbody.querySelector('.rv-sp-t td');
			const spTd_b = tbody.querySelector('.rv-sp-b td');
			const spB_el = tbody.querySelector('.rv-sp-b');
			const buildRow = (r) => {
				const {
					name,
					seq
				} = validSeqs[r];
				const parts = [`<tr><td class="rv-aln-name" title="${esc(name)}">${esc(name.slice(0,13))}</td>`];
				for (let col = 0; col < alnLen; col++) {
					const ch = col < seq.length ? seq[col] : '-';
					const isGap = ch === '-' || ch === '.';
					const bg = !isGap && colColor[col] ? colColor[col] : null;
					const st = bg ? `background:${bg};color:#222;` : (isGap ? `color:${muted};` : '');
					parts.push(`<td class="rv-aln-c"${st ? ` style="${st}"` : ''}>${esc(ch)}</td>`);
				}
				parts.push('</tr>');
				return parts.join('');
			};
			let rowH = 20,
				lastFirst = -1,
				lastLast = -1;
			const BUFFER = 8;
			const updateRows = () => {
				const scrollTop = scroll.scrollTop;
				const visH = scroll.clientHeight || 400;
				const firstVis = Math.max(0, Math.floor(scrollTop / rowH) - BUFFER);
				const lastVis = Math.min(validSeqs.length - 1, Math.ceil((scrollTop + visH) / rowH) + BUFFER);
				if (firstVis === lastFirst && lastVis === lastLast) return;
				lastFirst = firstVis;
				lastLast = lastVis;
				const rowParts = [];
				for (let r = firstVis; r <= lastVis; r++) rowParts.push(buildRow(r));
				spTd_t.style.height = (firstVis * rowH) + 'px';
				spTd_b.style.height = (Math.max(0, validSeqs.length - 1 - lastVis) * rowH) + 'px';
				let el = tbody.querySelector('.rv-sp-t').nextSibling;
				while (el && el !== spB_el) {
					const next = el.nextSibling;
					tbody.removeChild(el);
					el = next;
				}
				const tmp = document.createElement('table');
				tmp.innerHTML = `<tbody>${rowParts.join('')}</tbody>`;
				const frag = document.createDocumentFragment();
				const nb = tmp.querySelector('tbody');
				while (nb.firstChild) frag.appendChild(nb.firstChild);
				tbody.insertBefore(frag, spB_el);
			};
			scroll.addEventListener('scroll', updateRows);
			requestAnimationFrame(() => {
				const testTbl = document.createElement('table');
				testTbl.className = 'rv-aln-table';
				testTbl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
				testTbl.innerHTML = `<tbody>${buildRow(0)}</tbody>`;
				this._alnViewEl.appendChild(testTbl);
				const tr = testTbl.querySelector('tr');
				if (tr && tr.offsetHeight > 0) rowH = tr.offsetHeight;
				this._alnViewEl.removeChild(testTbl);
				spTd_b.style.height = (validSeqs.length * rowH) + 'px';
				updateRows();
			});
		}
		// end of class
	}
	// Export
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = RFviewJS; // CommonJS
	} else {
		global.RFviewJS = RFviewJS; // browser global
	}
	// Static parser exports (useful for Electron renderer or server-side use)
	RFviewJS.parseDbFile = parseDbFile;
	RFviewJS.parseCTFile = parseCTFile;
	RFviewJS.parseStockholmFile = parseStockholmFile;
	RFviewJS.parseXmlReactivity = parseXmlReactivity;
	RFviewJS.parsePairAnnotFile = parsePairAnnotFile;
	RFviewJS.parseCovFile = parseCovFile;
	RFviewJS.parseHelixCovFile = parseHelixCovFile;
	RFviewJS.buildAnnotColorMap = buildAnnotColorMap;
	RFviewJS.ANNOT_MISSING_KEY = ANNOT_MISSING_KEY;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));