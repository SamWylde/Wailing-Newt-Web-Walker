/**
 * Auto-Updater Module for Wailing Newt Web Walker
 *
 * Provides automatic updates from GitHub Releases with:
 * - Silent background checking and downloading
 * - Progress notifications via system tray
 * - Automatic installation on quit (or immediate if requested)
 * - Windows-optimized with differential updates for speed
 */

let autoUpdater;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.error('[AutoUpdater] electron-updater not installed. Run: npm install electron-updater');

    // Export stub functions if electron-updater is not available
    const { ipcMain, app } = require('electron');

    // Register stub IPC handlers to prevent errors
    const registerStubHandlers = () => {
        ipcMain.handle('check-for-updates', async () => {
            return { updateAvailable: false };
        });

        ipcMain.handle('get-update-status', () => {
            return {
                updateDownloaded: false,
                downloadProgress: 0,
                version: app.getVersion()
            };
        });

        ipcMain.handle('install-update', () => {
            console.log('[AutoUpdater] Not available - electron-updater not installed');
        });
    };

    module.exports = {
        initAutoUpdater: () => {
            console.log('[AutoUpdater] Not available - electron-updater not installed');
            registerStubHandlers();
        },
        checkForUpdates: () => Promise.resolve(null),
        quitAndInstall: () => {},
        getUpdateState: () => ({ updateDownloaded: false, downloadProgress: 0 })
    };
    return;
}

const { app, dialog, Notification, ipcMain } = require('electron');
const path = require('path');

// Update state
let updateDownloaded = false;
let downloadProgress = 0;
let mainWindowRef = null;
let trayRef = null;
let userInitiatedCheck = false;
let cleanupFn = null;

/**
 * Configure and initialize the auto-updater
 * @param {BrowserWindow} mainWindow - Reference to main window for notifications
 * @param {Tray} tray - Reference to system tray for balloon notifications
 */
function initAutoUpdater(mainWindow, tray, cleanupCallback) {
    mainWindowRef = mainWindow;
    trayRef = tray;
    cleanupFn = cleanupCallback;

    // Always register IPC handlers (even in development)
    setupIpcHandlers();

    // Only configure and start auto-updater in packaged builds
    if (!app.isPackaged) {
        console.log('[AutoUpdater] Skipping update checks in development mode');
        return;
    }

    // Configure updater settings for optimal Windows performance
    autoUpdater.autoDownload = true;           // Auto-download updates in background
    autoUpdater.autoInstallOnAppQuit = true;   // Install when user closes app
    autoUpdater.autoRunAppAfterInstall = true; // Restart app after update
    autoUpdater.allowDowngrade = false;        // Don't allow downgrading
    autoUpdater.allowPrerelease = true;        // Include prereleases from CI builds

    // Use differential downloads for faster updates on Windows
    autoUpdater.disableDifferentialDownload = false;

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
        console.log(`[AutoUpdater] Update available: v${info.version}`);
        showTrayNotification(
            'Update Available',
            `Version ${info.version} is downloading in the background...`
        );
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log(`[AutoUpdater] App is up to date (v${info.version})`);
        if (userInitiatedCheck) {
            userInitiatedCheck = false;
            dialog.showMessageBox(mainWindowRef, {
                type: 'info',
                title: 'No Updates Available',
                message: 'You\'re running the latest version.',
                detail: `Current version: v${app.getVersion()}`
            });
        }
    });

    autoUpdater.on('download-progress', (progress) => {
        downloadProgress = Math.round(progress.percent);
        const mbPerSec = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
        console.log(`[AutoUpdater] Download progress: ${downloadProgress}% (${mbPerSec} MB/s)`);

        // Update tray tooltip with progress
        if (trayRef) {
            trayRef.setToolTip(`Wailing Newt - Downloading update: ${downloadProgress}%`);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log(`[AutoUpdater] Update downloaded: v${info.version}`);
        updateDownloaded = true;
        downloadProgress = 100;

        // Reset tray tooltip
        if (trayRef) {
            trayRef.setToolTip('Wailing Newt Web Walker - Update ready!');
        }

        // Show notification about update ready
        showTrayNotification(
            'Update Ready',
            `Version ${info.version} will install when you close the app. Click here to restart now.`
        );

        // Also send to renderer if available
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            mainWindowRef.webContents.send('update-downloaded', info);
        }
    });

    autoUpdater.on('error', (error) => {
        console.error('[AutoUpdater] Error:', error.message);
        // Don't bother user with update errors - just log them
        // Updates will be retried on next app launch
    });

    // Initial check after short delay (don't block startup)
    setTimeout(() => {
        checkForUpdates();
    }, 5000);

    // Periodic check every 4 hours
    setInterval(() => {
        checkForUpdates();
    }, 4 * 60 * 60 * 1000);
}

/**
 * Check for updates
 * @param {boolean} userInitiated - Whether user clicked "Check for Updates"
 */
async function checkForUpdates(userInitiated = false) {
    if (updateDownloaded) {
        if (userInitiated) {
            promptInstallUpdate();
        }
        return;
    }

    try {
        console.log('[AutoUpdater] Starting update check...');
        userInitiatedCheck = userInitiated;
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error('[AutoUpdater] Check failed:', error.message);
        userInitiatedCheck = false;
        if (userInitiated) {
            showTrayNotification('Update Check Failed', 'Could not check for updates. Try again later.');
        }
    }
}

/**
 * Prompt user to install downloaded update
 */
function promptInstallUpdate() {
    if (!updateDownloaded) return;

    const choice = dialog.showMessageBoxSync(mainWindowRef, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded.',
        detail: 'Would you like to restart now to install the update?',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
    });

    if (choice === 0) {
        quitAndInstall();
    }
}

/**
 * Quit app and install update
 */
async function quitAndInstall() {
    if (updateDownloaded) {
        console.log('[AutoUpdater] Quitting and installing update...');
        // Stop Python backend BEFORE launching the installer so NSIS
        // doesn't hit locked files and show "cannot be closed" error
        if (cleanupFn) {
            try {
                await cleanupFn();
            } catch (e) {
                console.log('[AutoUpdater] Cleanup error (continuing):', e.message);
            }
        }
        // isSilent=true: run NSIS silently (no UI, no "cannot be closed" dialog)
        // isForceRunAfter=true: relaunch the app after silent install
        autoUpdater.quitAndInstall(true, true);
    }
}

/**
 * Show system tray notification
 */
function showTrayNotification(title, body) {
    // Use native Windows notifications for better experience
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: title,
            body: body,
            icon: path.join(__dirname, 'icon.png'),
            silent: true // Don't play sound for update notifications
        });

        notification.on('click', () => {
            if (updateDownloaded) {
                promptInstallUpdate();
            } else if (mainWindowRef && !mainWindowRef.isDestroyed()) {
                mainWindowRef.show();
                mainWindowRef.focus();
            }
        });

        notification.show();
    } else if (trayRef) {
        // Fallback to tray balloon on older Windows
        trayRef.displayBalloon({
            title: title,
            content: body,
            iconType: 'info'
        });
    }
}

/**
 * Setup IPC handlers for renderer communication
 */
function setupIpcHandlers() {
    // Check for updates from renderer
    ipcMain.handle('check-for-updates', async () => {
        await checkForUpdates(true);
        return { updateAvailable: updateDownloaded };
    });

    // Get update status
    ipcMain.handle('get-update-status', () => {
        return {
            updateDownloaded,
            downloadProgress,
            version: app.getVersion()
        };
    });

    // Install update from renderer
    ipcMain.handle('install-update', async () => {
        await quitAndInstall();
    });
}

/**
 * Get current update state
 */
function getUpdateState() {
    return {
        updateDownloaded,
        downloadProgress
    };
}

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    quitAndInstall,
    getUpdateState
};
