<p align="center">
  <img src="https://rfview.incarnatolab.com/images/RFview_logo.png" width="50%" />
</p>
<br/>

# RFviewJS - RNA Framework Structure Viewer

## Introduction

__RFviewJS__ is a self-contained JavaScript library for rendering RNA secondary structures and consensus structures from Stockholm alignments. It supports, __all without any external dependencies__:

- automatic layout selection (Radiate vs. NAView)
- manual helix rotation, reactivity color mapping (SHAPE/DMS)
- base-pair and helix-level covariation annotations from R-scape
- CSS styling
- SVG export

Furthermore, thanks to the power of __[Electron](https://www.electronjs.org/)__, __RFview__ is also provided as a stand-alone app for Windows, Linux and Mac.

For support requests, please post your questions to: <https://github.com/dincarnato/RFviewJS/issues>


## Author

Danny Incarnato (dincarnato[at]rnaframework.com)  
University of Groningen


## Notes

The main plotting functions for the Radiate layout were ported from __[Yann Ponty's VARNA](https://github.com/yannponty/VARNA)__.

The NAView layout was ported from __[Ivo Hofacker's adaptation](https://github.com/ViennaRNA/RNAcode/blob/master/librna/naview.c)__ of [Bruccoleri & Heinrich](https://pubmed.ncbi.nlm.nih.gov/2454712/) original algorithm, and adapted to enable helix rotation in a Radiate-like fashion.

Code auditing and bug fixing, as well as bundling of the JS into an Electron app was done with the crucial aid of __[ClaudeAI](https://claude.ai/)__.


## License

This program is free software, and can be redistribute and/or modified under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or any later version.

Please see <http://www.gnu.org/licenses/> for more information.


## Demo

__RFviewJS__ can be tested at: <https://rfview.incarnatolab.com>

A variety of examples can be found here:

- [Structure](https://rfview.incarnatolab.com/examples/demo-structure.html)
- [Multiple structures](https://rfview.incarnatolab.com/examples/demo-multiple-structures.html)
- [Stockholm alignment](https://rfview.incarnatolab.com/examples/demo-stockholm.html)
- [Multiple Stockholm alignments](https://rfview.incarnatolab.com/examples/demo-multiple-stockholm.html)


## Standalone executables

Standalone __RFview__ executables are available from the __[Releases](https://github.com/dincarnato/RFviewJS/releases)__ section.

__Note to macOS users:__ as the app is not code-signed, before running it, issue the following command in the Terminal:

```bash
xattr -cr /path/to/RFview.app
```


## Installation

To install __RFviewJS__ on your webpage, just obtain `RFview.js` (under `renderer/RFview.js` on this repository), upload it to your webserver and include it with a plain `<script>` tag:

```html
<script src="path/to/RFview.js"></script>
```

Alternatively, you can directly import it from the official RFviewJS website:

```html
<script src="https://rfview.incarnatolab.com/scripts/RFview.js"></script>
```

The module exports a single global class, `RFviewJS`. 


## Documentation

For any information, please refer to the documentation: <http://rfviewjs-docs.readthedocs.io/>

