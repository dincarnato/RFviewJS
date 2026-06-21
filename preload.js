'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    writeFile: (p, content) => ipcRenderer.invoke('write-file', p, content),
    saveSvgDialog: defaultName => ipcRenderer.invoke('save-svg-dialog', defaultName),
    headlessDone: (svgText, outPath, pdfPath) => ipcRenderer.invoke('headless-done', svgText, outPath, pdfPath),
    headlessError: message => ipcRenderer.invoke('headless-error', message),
    fetchRfam: id => ipcRenderer.invoke('fetch-rfam', id),
});