// Preload script for Electron
// This runs in a sandboxed context with access to some Node.js APIs

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getVersion: () => process.versions.electron,
    getPlatform: () => process.platform,

    // Window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    // Notifications
    showNotification: (title, body) => {
        new Notification(title, { body });
    }
});

// Log that preload script loaded
console.log('Electron preload script loaded');
