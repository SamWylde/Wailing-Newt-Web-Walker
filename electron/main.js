const { app, BrowserWindow, Menu, Tray, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

// Auto-updater (optional - gracefully handle if electron-updater not installed)
let updater = null;
try {
    updater = require('./updater');
} catch (e) {
    console.log('[AutoUpdater] electron-updater not available:', e.message);
}

const initAutoUpdater = updater?.initAutoUpdater || (() => {});
const checkForUpdates = updater?.checkForUpdates || (() => {});
const getUpdateState = updater?.getUpdateState || (() => ({ updateDownloaded: false, downloadProgress: 0 }));

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let pythonProcess = null;
let isQuitting = false;
let loadingWindow = null;

// Configuration
const SERVER_PORT = 5000;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`; // Use IPv4 explicitly to avoid IPv6 issues

// Determine paths based on whether we're in development or production
const isDev = !app.isPackaged;
const appPath = isDev
    ? path.join(__dirname, '..')
    : path.join(process.resourcesPath, 'app');

/**
 * Update loading window status
 */
function updateLoadingStatus(message) {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.send('loading-status', message);
    }
    console.log(`[Startup] ${message}`);
}

/**
 * Find Python executable
 */
function findPython() {
    // On Windows, prefer pythonw.exe to avoid console window
    // pythonw is a GUI version that doesn't create a console
    const pythonCommands = process.platform === 'win32'
        ? ['pythonw', 'python', 'py', 'python3']
        : ['python3', 'python'];

    for (const cmd of pythonCommands) {
        try {
            // Use python (not pythonw) just for version check
            const checkCmd = cmd === 'pythonw' ? 'python' : cmd;
            const spawnOptions = {
                windowsHide: true,
                shell: false
            };
            const result = require('child_process').spawnSync(checkCmd, ['--version'], spawnOptions);
            if (result.status === 0) {
                return cmd;
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

/**
 * Install Python dependencies
 */
function installPythonDependencies(pythonCmd) {
    return new Promise((resolve, reject) => {
        updateLoadingStatus('Installing Python dependencies...');

        const requirementsPath = path.join(appPath, 'requirements.txt');

        // Configure spawn options to hide console window on Windows
        const spawnOptions = {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            windowsHide: true,
            detached: false
        };

        // On Windows, redirect to log files to prevent console window
        if (process.platform === 'win32') {
            spawnOptions.shell = false;
            const fs = require('fs');
            const logPath = path.join(appPath, 'logs');
            if (!fs.existsSync(logPath)) {
                fs.mkdirSync(logPath, { recursive: true });
            }
            const pipLog = fs.openSync(path.join(logPath, 'pip-install.log'), 'a');
            spawnOptions.stdio = ['ignore', pipLog, pipLog];
        } else {
            // On Unix, pipe normally
            spawnOptions.stdio = ['ignore', 'pipe', 'pipe'];
        }

        const installProcess = spawn(pythonCmd, ['-m', 'pip', 'install', '-r', requirementsPath, '--quiet'], spawnOptions);

        let output = '';
        let errorOutput = '';

        // Only set up handlers on non-Windows platforms
        if (process.platform !== 'win32' && installProcess.stdout && installProcess.stderr) {
            installProcess.stdout.on('data', (data) => {
                output += data.toString();
                const message = data.toString().trim();
                console.log(`[pip] ${message}`);
                // Send simplified message to loading window
                if (message.includes('Installing')) {
                    updateLoadingStatus('Installing dependencies...');
                }
            });

            installProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                const message = data.toString().trim();
                console.error(`[pip] ${message}`);
            });
        }

        installProcess.on('error', (err) => {
            console.error('Failed to install dependencies:', err);
            updateLoadingStatus('Error installing dependencies');
            reject(err);
        });

        installProcess.on('exit', (code) => {
            if (code === 0) {
                updateLoadingStatus('Dependencies installed successfully');
                resolve();
            } else {
                console.error(`Dependency installation failed with code ${code}`);
                console.error('Error output:', errorOutput);
                updateLoadingStatus('Dependency installation failed');
                reject(new Error(`Failed to install Python dependencies (exit code ${code})`));
            }
        });
    });
}

/**
 * Start the Python backend server
 */
async function startPythonBackend() {
    const pythonCmd = findPython();

    if (!pythonCmd) {
        throw new Error('Python not found. Please install Python 3.11 or later.');
    }

    updateLoadingStatus(`Found Python: ${pythonCmd}`);
    console.log(`Starting Python backend with: ${pythonCmd}`);
    console.log(`App path: ${appPath}`);

    // Install dependencies first
    try {
        await installPythonDependencies(pythonCmd);
    } catch (error) {
        console.error('Warning: Failed to install Python dependencies:', error.message);
        // Continue anyway - dependencies might already be installed
    }

    return new Promise((resolve, reject) => {
        updateLoadingStatus('Starting Python server...');

        // Start Python server (with --no-browser to prevent opening system browser)
        // Use comprehensive options to hide console window on Windows
        const spawnOptions = {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
            windowsHide: true,
            detached: false
        };

        // On Windows, use special configuration to prevent console window
        if (process.platform === 'win32') {
            spawnOptions.shell = false;
            // Don't pipe stdio on Windows - this can cause console window to appear
            // Instead, write to log files
            const fs = require('fs');
            const logPath = path.join(appPath, 'logs');
            if (!fs.existsSync(logPath)) {
                fs.mkdirSync(logPath, { recursive: true });
            }
            const stdoutLog = fs.openSync(path.join(logPath, 'stdout.log'), 'a');
            const stderrLog = fs.openSync(path.join(logPath, 'stderr.log'), 'a');
            spawnOptions.stdio = ['ignore', stdoutLog, stderrLog];
        } else {
            // On Unix, pipe normally
            spawnOptions.stdio = ['ignore', 'pipe', 'pipe'];
        }

        pythonProcess = spawn(pythonCmd, ['main.py', '-l', '--no-browser'], spawnOptions);

        // Only set up stdout/stderr handlers on non-Windows platforms
        // On Windows, output is redirected to log files to prevent console window
        if (process.platform !== 'win32' && pythonProcess.stdout && pythonProcess.stderr) {
            pythonProcess.stdout.on('data', (data) => {
                const message = data.toString().trim();
                console.log(`[Python] ${message}`);

                // Update loading status based on key messages
                if (message.includes('Database initialized')) {
                    updateLoadingStatus('Initializing database...');
                } else if (message.includes('LOCAL MODE')) {
                    updateLoadingStatus('Starting in local mode...');
                } else if (message.includes('Starting Wailing Newt')) {
                    updateLoadingStatus('Server starting...');
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`[Python Error] ${data.toString().trim()}`);
            });
        } else if (process.platform === 'win32') {
            // On Windows, log that output is being written to files
            console.log('[Python] Output is being written to logs/stdout.log and logs/stderr.log');
        }

        pythonProcess.on('error', (err) => {
            console.error('Failed to start Python process:', err);
            reject(err);
        });

        pythonProcess.on('exit', (code) => {
            console.log(`Python process exited with code ${code}`);
            if (!isQuitting) {
                dialog.showErrorBox('Server Stopped',
                    'The backend server has stopped unexpectedly. The application will close.');
                app.quit();
            }
        });

        // Wait for server to be ready
        waitForServer(resolve, reject);
    });
}

/**
 * Wait for the server to be ready
 */
function waitForServer(resolve, reject, attempts = 0) {
    const maxAttempts = 30; // 30 seconds timeout

    if (attempts >= maxAttempts) {
        updateLoadingStatus('Server failed to start');
        reject(new Error('Server failed to start within 30 seconds'));
        return;
    }

    // Update status every 5 attempts
    if (attempts % 5 === 0) {
        updateLoadingStatus(`Waiting for server... (${attempts}/${maxAttempts})`);
    }

    console.log(`[Electron] Checking server (attempt ${attempts + 1}/${maxAttempts})...`);

    http.get(SERVER_URL, (res) => {
        console.log(`[Electron] Server responded with status: ${res.statusCode}`);
        // Accept any response - server is running
        if (res.statusCode >= 200 && res.statusCode < 500) {
            console.log('[Electron] Server is ready!');
            updateLoadingStatus('Server is ready!');
            resolve();
        } else {
            setTimeout(() => waitForServer(resolve, reject, attempts + 1), 1000);
        }
    }).on('error', (err) => {
        console.log(`[Electron] Server not ready yet: ${err.message}`);
        setTimeout(() => waitForServer(resolve, reject, attempts + 1), 1000);
    });
}

/**
 * Create the main application window
 */
function createWindow() {
    console.log('[Electron] Creating main window...');

    const windowOptions = {
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: 'Wailing Newt Web Walker',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false, // Don't show until ready
        backgroundColor: '#1a1d29'
    };

    // Add icon if it exists
    const iconPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(iconPath)) {
        windowOptions.icon = iconPath;
    } else {
        console.log('[Electron] Icon file not found, using default icon');
    }

    mainWindow = new BrowserWindow(windowOptions);

    // Load the web UI
    console.log(`[Electron] Loading URL: ${SERVER_URL}`);
    mainWindow.loadURL(SERVER_URL);

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        console.log('[Electron] Window ready to show');
        mainWindow.show();
        mainWindow.focus();
    });

    // Fallback: show window after 5 seconds even if ready-to-show doesn't fire
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            console.log('[Electron] Fallback: forcing window to show');
            mainWindow.show();
            mainWindow.focus();
        }
    }, 5000);

    // Handle window close
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();

            // Show tray notification on first minimize
            if (tray) {
                tray.displayBalloon({
                    title: 'Wailing Newt',
                    content: 'Application minimized to system tray'
                });
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Create application menu
    createMenu();
}

/**
 * Create system tray icon
 */
function createTray() {
    const iconPath = path.join(__dirname, 'icon.png');

    // Only create tray if icon exists
    if (!fs.existsSync(iconPath)) {
        console.log('[Electron] Icon file not found, skipping tray creation');
        return;
    }

    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Wailing Newt',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Wailing Newt Web Walker');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

/**
 * Create application menu
 */
function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Crawl',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.executeJavaScript('clearCrawlData()');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'Alt+F4',
                    click: () => {
                        isQuitting = true;
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Documentation',
                    click: () => {
                        shell.openExternal('https://github.com/SamWylde/Wailing-Newt-Web-Walker');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Check for Updates...',
                    click: () => {
                        if (app.isPackaged) {
                            checkForUpdates(true);
                        } else {
                            dialog.showMessageBox(mainWindow, {
                                type: 'info',
                                title: 'Updates',
                                message: 'Auto-updates are only available in packaged builds.',
                                detail: 'Run "npm run build:win" to create an installer with auto-update support.'
                            });
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Toggle Developer Tools',
                    accelerator: 'F12',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.toggleDevTools();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'About',
                    click: () => {
                        const updateState = getUpdateState();
                        const versionInfo = `Version ${app.getVersion()}`;
                        const updateInfo = updateState.updateDownloaded
                            ? '\n\nUpdate downloaded and ready to install!'
                            : '';
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Wailing Newt',
                            message: 'Wailing Newt Web Walker',
                            detail: `${versionInfo}${updateInfo}\n\nAn SEO Spider Tool for crawling and analyzing websites.`
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/**
 * Stop the Python backend
 */
function stopPythonBackend() {
    if (pythonProcess) {
        console.log('Stopping Python backend...');

        try {
            if (process.platform === 'win32') {
                // On Windows, use taskkill to ensure child processes are killed
                // Use /T to kill child processes and /F to force kill
                // Use spawnSync for synchronous execution to ensure process is killed before app quits
                const { spawnSync } = require('child_process');
                try {
                    console.log(`Killing Python process ${pythonProcess.pid}...`);
                    const result = spawnSync('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'], {
                        windowsHide: true,
                        shell: false,
                        stdio: 'ignore'
                    });
                    if (result.error) {
                        console.log('taskkill error:', result.error.message);
                    } else {
                        console.log('Python process killed successfully');
                    }
                } catch (e) {
                    // taskkill might fail if process already exited, that's ok
                    console.log('taskkill exception:', e.message);
                }
            } else {
                // On Unix, kill the process group
                try {
                    process.kill(-pythonProcess.pid, 'SIGTERM');
                } catch (e) {
                    pythonProcess.kill('SIGTERM');
                }
            }
        } catch (e) {
            console.log('Error killing Python process:', e);
            // Try a direct kill as fallback
            try {
                pythonProcess.kill('SIGKILL');
            } catch (e2) {
                console.log('Fallback kill also failed:', e2);
            }
        }

        pythonProcess = null;
    }
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Another instance is already running, quit this one
    console.log('[Electron] Another instance is already running. Quitting...');
    app.quit();
} else {
    // Handle second instance attempt - focus the existing window
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('[Electron] Second instance attempted. Focusing existing window...');
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.show();
        }
    });
}

// App event handlers
app.whenReady().then(async () => {
    // Show loading dialog
    loadingWindow = new BrowserWindow({
        width: 500,
        height: 420,
        frame: false,
        transparent: false,
        backgroundColor: '#7cb342',
        alwaysOnTop: true,
        resizable: false,
        center: true,
        show: false,
        skipTaskbar: true,
        focusable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Don't start backend until loading window is shown
    let windowShown = false;
    let windowShowResolver;
    const windowShownPromise = new Promise(resolve => {
        windowShowResolver = resolve;
    });

    // Show window once content is loaded AND force it to front
    loadingWindow.once('ready-to-show', () => {
        loadingWindow.show();
        loadingWindow.focus();
        loadingWindow.setAlwaysOnTop(true, 'screen-saver');
        loadingWindow.moveTop();

        // Extra insurance: bring to front after a short delay
        setTimeout(() => {
            if (loadingWindow && !loadingWindow.isDestroyed()) {
                loadingWindow.focus();
                loadingWindow.moveTop();
                windowShown = true;
                windowShowResolver();
                console.log('[Electron] Loading window displayed and ready');
            }
        }, 100);
    });

    // Load the loading screen HTML file
    const loadingHtmlPath = path.join(__dirname, 'loading.html');
    loadingWindow.loadFile(loadingHtmlPath);

    // WAIT for loading window to show before starting backend
    await windowShownPromise;
    console.log('[Electron] Waiting 200ms for window to settle...');
    await new Promise(resolve => setTimeout(resolve, 200));

    try {
        await startPythonBackend();

        // Keep loading window visible for a moment before switching
        await new Promise(resolve => setTimeout(resolve, 500));

        if (loadingWindow && !loadingWindow.isDestroyed()) {
            loadingWindow.close();
        }

        createTray();
        createWindow();

        // Initialize auto-updater (always initialize to register IPC handlers)
        initAutoUpdater(mainWindow, tray);
    } catch (error) {
        if (loadingWindow && !loadingWindow.isDestroyed()) {
            loadingWindow.close();
        }

        // Show helpful error message
        let errorDetail = error.message;
        if (error.message.includes('Python not found')) {
            errorDetail += '\n\nPlease install Python 3.11 or later from https://www.python.org/';
        } else if (error.message.includes('dependencies')) {
            errorDetail += '\n\nTry running setup.bat to install all dependencies.';
        }

        dialog.showErrorBox('Startup Error', errorDetail);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    // On macOS, keep app running in menu bar
    if (process.platform !== 'darwin') {
        isQuitting = true;
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS, recreate window when dock icon is clicked
    if (mainWindow === null) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    stopPythonBackend();
});

app.on('will-quit', () => {
    // Ensure Python is stopped when app is quitting
    stopPythonBackend();
});

app.on('window-all-closed', () => {
    // Stop Python backend when all windows are closed
    stopPythonBackend();

    // On macOS, apps typically stay open until explicitly quit
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    dialog.showErrorBox('Error', error.message);
});
