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
    },

    // Auto-update functions
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (event, info) => callback(info));
    }
});

// Log that preload script loaded
console.log('Electron preload script loaded');
