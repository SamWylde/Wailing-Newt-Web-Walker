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
    module.exports = {
        initAutoUpdater: () => console.log('[AutoUpdater] Not available - electron-updater not installed'),
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

/**
 * Configure and initialize the auto-updater
 * @param {BrowserWindow} mainWindow - Reference to main window for notifications
 * @param {Tray} tray - Reference to system tray for balloon notifications
 */
function initAutoUpdater(mainWindow, tray) {
    mainWindowRef = mainWindow;
    trayRef = tray;

    // Configure updater settings for optimal Windows performance
    autoUpdater.autoDownload = true;           // Auto-download updates in background
    autoUpdater.autoInstallOnAppQuit = true;   // Install when user closes app
    autoUpdater.autoRunAppAfterInstall = true; // Restart app after update
    autoUpdater.allowDowngrade = false;        // Don't allow downgrading
    autoUpdater.allowPrerelease = false;       // Only stable releases

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

    // IPC handlers for renderer process communication
    setupIpcHandlers();

    // Initial check after short delay (don't block startup)
    // Skip check on first run after install (Squirrel.Windows)
    if (!isFirstRun()) {
        setTimeout(() => {
            checkForUpdates();
        }, 5000); // 5 second delay for faster app startup
    }

    // Periodic check every 4 hours
    setInterval(() => {
        checkForUpdates();
    }, 4 * 60 * 60 * 1000);
}

/**
 * Check if this is the first run after Squirrel.Windows installation
 * On first run, Squirrel has a file lock that interferes with updates
 */
function isFirstRun() {
    return process.argv.includes('--squirrel-firstrun');
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
        const result = await autoUpdater.checkForUpdates();

        if (userInitiated && !result.updateInfo) {
            showTrayNotification('No Updates', 'You are running the latest version.');
        }
    } catch (error) {
        console.error('[AutoUpdater] Check failed:', error.message);
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
function quitAndInstall() {
    if (updateDownloaded) {
        console.log('[AutoUpdater] Quitting and installing update...');
        autoUpdater.quitAndInstall(false, true);
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
    ipcMain.handle('install-update', () => {
        quitAndInstall();
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
