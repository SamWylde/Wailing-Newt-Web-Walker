const { app, BrowserWindow, Menu, Tray, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

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

// Configuration
const SERVER_PORT = 5000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Determine paths based on whether we're in development or production
const isDev = !app.isPackaged;
const appPath = isDev
    ? path.join(__dirname, '..')
    : path.join(process.resourcesPath, 'app');

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
        console.log('Installing Python dependencies...');

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
            console.log(`[pip] ${data.toString().trim()}`);
        });

        installProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(`[pip] ${data.toString().trim()}`);
        });

        installProcess.on('error', (err) => {
            console.error('Failed to install dependencies:', err);
            reject(err);
        });

        installProcess.on('exit', (code) => {
            if (code === 0) {
                console.log('Python dependencies installed successfully');
                resolve();
            } else {
                console.error(`Dependency installation failed with code ${code}`);
                console.error('Error output:', errorOutput);
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
        // Start Python server (with --no-browser to prevent opening system browser)
        pythonProcess = spawn(pythonCmd, ['main.py', '-l', '--no-browser'], {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        pythonProcess.stdout.on('data', (data) => {
            console.log(`[Python] ${data.toString().trim()}`);
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
        reject(new Error('Server failed to start within 30 seconds'));
        return;
    }

    console.log(`[Electron] Checking server (attempt ${attempts + 1}/${maxAttempts})...`);

    http.get(SERVER_URL, (res) => {
        console.log(`[Electron] Server responded with status: ${res.statusCode}`);
        // Accept any response - server is running
        if (res.statusCode >= 200 && res.statusCode < 500) {
            console.log('[Electron] Server is ready!');
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

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: 'Wailing Newt Web Walker',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false, // Don't show until ready
        backgroundColor: '#1a1d29'
    });

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
    const loadingWindow = new BrowserWindow({
        width: 400,
        height: 200,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true
        }
    });

    loadingWindow.loadURL(`data:text/html;charset=utf-8,
        <html>
        <body style="
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: rgba(26, 29, 41, 0.95);
            color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            border-radius: 10px;
        ">
            <div style="text-align: center;">
                <h2 style="margin: 0 0 20px 0;">Wailing Newt</h2>
                <p>Starting server...</p>
                <div style="
                    width: 200px;
                    height: 4px;
                    background: #475569;
                    border-radius: 2px;
                    overflow: hidden;
                    margin-top: 20px;
                ">
                    <div style="
                        width: 30%;
                        height: 100%;
                        background: #8b5cf6;
                        animation: loading 1.5s ease-in-out infinite;
                    "></div>
                </div>
            </div>
            <style>
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                }
            </style>
        </body>
        </html>
    `);

    try {
        await startPythonBackend();
        loadingWindow.close();
        createTray();
        createWindow();

        // Initialize auto-updater (only in production builds)
        if (app.isPackaged) {
            initAutoUpdater(mainWindow, tray);
        }
    } catch (error) {
        loadingWindow.close();
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
