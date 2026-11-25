'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    writeFile: (p, content) => ipcRenderer.invoke('write-file', p, content),
    saveSvgDialog: defaultName => ipcRenderer.invoke('save-svg-dialog', defaultName),
    saveFileDialog: (defaultName, filters) => ipcRenderer.invoke('save-file-dialog', defaultName, filters),
    writeFileB64: (p, b64) => ipcRenderer.invoke('write-file-b64', p, b64),
    headlessDone: (svgText, outPath, pdfPath) => ipcRenderer.invoke('headless-done', svgText, outPath, pdfPath),
    headlessError: message => ipcRenderer.invoke('headless-error', message),
    fetchRfam: id => ipcRenderer.invoke('fetch-rfam', id),
    // CLI mode: next chunk of whole lines of the --structureFile Stockholm alignment (null at the end)
    readStructureChunk: () => ipcRenderer.invoke('structure-chunk'),
});