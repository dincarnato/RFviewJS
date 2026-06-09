<p align="center">
  <img src="https://rfview.incarnatolab.com/images/RFview_logo.png" width="50%" />
</p>
<br/>

# RFview.js - RNA Framework Structure Viewer

## Introduction

__RFview.js__ is a self-contained JavaScript library for rendering RNA secondary structures and consensus structures from Stockholm alignments. It supports, __all without any external dependencies__:

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


## Documentation

For any information, please refer to the documentation: <http://rfviewjs-docs.readthedocs.io/>

