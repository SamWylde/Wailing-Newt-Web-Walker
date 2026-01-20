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
    const pythonCommands = process.platform === 'win32'
        ? ['python', 'py', 'python3']
        : ['python3', 'python'];

    for (const cmd of pythonCommands) {
        try {
            const result = require('child_process').spawnSync(cmd, ['--version']);
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
        const installProcess = spawn(pythonCmd, ['-m', 'pip', 'install', '-r', requirementsPath, '--quiet'], {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

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
        pythonProcess = spawn(pythonCmd, ['main.py', '-l', '--no-browser'], {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

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

        if (process.platform === 'win32') {
            // On Windows, use taskkill to ensure child processes are killed
            spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
        } else {
            pythonProcess.kill('SIGTERM');
        }

        pythonProcess = null;
    }
}

// App event handlers
app.whenReady().then(async () => {
    // Show loading dialog
    loadingWindow = new BrowserWindow({
        width: 500,
        height: 350,
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

    loadingWindow.loadURL(`data:text/html;charset=utf-8,
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    background: linear-gradient(135deg, #7cb342 0%, #8bc34a 100%);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    color: #ffffff;
                    overflow: hidden;
                }
                .logo {
                    font-size: 80px;
                    margin-bottom: 20px;
                    animation: float 3s ease-in-out infinite;
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                .title {
                    font-size: 32px;
                    font-weight: 700;
                    margin-bottom: 10px;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                }
                .subtitle {
                    font-size: 14px;
                    opacity: 0.95;
                    margin-bottom: 30px;
                }
                .progress-container {
                    width: 350px;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 20px;
                }
                .progress-bar {
                    height: 100%;
                    background: #ffffff;
                    border-radius: 3px;
                    animation: progress 2s ease-in-out infinite;
                    box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
                }
                @keyframes progress {
                    0% { width: 20%; margin-left: 0%; }
                    50% { width: 40%; margin-left: 30%; }
                    100% { width: 20%; margin-left: 80%; }
                }
                .status {
                    font-size: 13px;
                    opacity: 0.9;
                    min-height: 20px;
                    text-align: center;
                    padding: 0 20px;
                    max-width: 450px;
                }
                .console {
                    width: 450px;
                    height: 80px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 6px;
                    margin-top: 20px;
                    padding: 10px;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 11px;
                    overflow-y: auto;
                    text-align: left;
                    line-height: 1.4;
                }
                .console::-webkit-scrollbar {
                    width: 6px;
                }
                .console::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                }
                .console::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 3px;
                }
                .console-line {
                    opacity: 0.85;
                    margin-bottom: 4px;
                }
            </style>
        </head>
        <body>
            <div class="logo">🐸</div>
            <div class="title">Wailing Newt</div>
            <div class="subtitle">SEO Spider Tool</div>
            <div class="progress-container">
                <div class="progress-bar"></div>
            </div>
            <div class="status" id="status">Initializing...</div>
            <div class="console" id="console"></div>

            <script>
                const { ipcRenderer } = require('electron');
                const consoleEl = document.getElementById('console');
                const statusEl = document.getElementById('status');
                const maxConsoleLines = 6;
                const consoleLines = [];

                ipcRenderer.on('loading-status', (event, message) => {
                    // Update main status
                    statusEl.textContent = message;

                    // Add to console
                    consoleLines.push(message);
                    if (consoleLines.length > maxConsoleLines) {
                        consoleLines.shift();
                    }

                    consoleEl.innerHTML = consoleLines
                        .map(line => '<div class="console-line">' + line + '</div>')
                        .join('');

                    // Auto-scroll to bottom
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                });
            </script>
        </body>
        </html>
    `);

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
        dialog.showErrorBox('Startup Error', error.message);
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    dialog.showErrorBox('Error', error.message);
});
