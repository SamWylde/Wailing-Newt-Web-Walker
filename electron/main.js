const { app, BrowserWindow, Menu, Tray, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
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
const HEALTH_ENDPOINT = '/api/health';
const HEALTH_URL = `${SERVER_URL}${HEALTH_ENDPOINT}`;
const HEALTH_SERVICE_NAME = 'wailing-newt-web-walker';

// Determine paths based on whether we're in development or production
const isDev = !app.isPackaged;
const appPath = isDev
    ? path.join(__dirname, '..')
    : path.join(process.resourcesPath, 'app');
const REQUIRED_PY_MODULES = ['crawl4ai', 'patchright', 'flask', 'waitress'];
const PIP_LOG_FILE = path.join(appPath, 'logs', 'pip-install.log');
const PY_STDOUT_LOG_FILE = path.join(appPath, 'logs', 'stdout.log');
const PY_STDERR_LOG_FILE = path.join(appPath, 'logs', 'stderr.log');
const PIP_INSTALL_TIMEOUT_MS = parsePositiveIntEnv('WNW_PIP_INSTALL_TIMEOUT_MS', 300000);
const HTTP_PROBE_TIMEOUT_MS = parsePositiveIntEnv('WNW_HTTP_PROBE_TIMEOUT_MS', 2000);
const LOADING_WINDOW_READY_TIMEOUT_MS = 5000;

function parsePositiveIntEnv(name, fallback) {
    const raw = (process.env[name] || '').trim();
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        console.log(`[Startup] Invalid ${name} value "${raw}", using default ${fallback}`);
        return fallback;
    }
    return parsed;
}

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
 * Ensure logs directory exists
 */
function ensureLogsDir() {
    const logPath = path.join(appPath, 'logs');
    if (!fs.existsSync(logPath)) {
        fs.mkdirSync(logPath, { recursive: true });
    }
}

function probeServer(url, timeoutMs = HTTP_PROBE_TIMEOUT_MS) {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (result) => {
            if (!settled) {
                settled = true;
                resolve(result);
            }
        };

        const request = http.get(url, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                if (body.length < 8192) {
                    body += chunk;
                }
            });
            res.on('end', () => {
                settle({
                    statusCode: res.statusCode ?? null,
                    body,
                    timedOut: false,
                    error: null
                });
            });
        });

        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
        });

        request.on('error', (err) => {
            settle({
                statusCode: null,
                body: '',
                timedOut: /timed out/i.test(err.message),
                error: err.message
            });
        });
    });
}

function isLenientServerResponse(probeResult) {
    return Boolean(
        probeResult &&
        probeResult.statusCode !== null &&
        probeResult.statusCode >= 200 &&
        probeResult.statusCode < 500
    );
}

function isHealthyServerResponse(probeResult) {
    if (!probeResult || probeResult.statusCode !== 200 || !probeResult.body) {
        return false;
    }

    try {
        const payload = JSON.parse(probeResult.body);
        return payload?.ok === true && payload?.service === HEALTH_SERVICE_NAME;
    } catch (e) {
        return false;
    }
}

/**
 * Parse an optional env command override (e.g. "py -3.11")
 */
function parseCommandSpec(spec) {
    if (!spec || typeof spec !== 'string' || !spec.trim()) {
        return null;
    }

    const parts = spec.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (!parts || parts.length === 0) {
        return null;
    }

    const normalized = parts.map((part) => part.replace(/^"(.*)"$/, '$1'));
    return {
        command: normalized[0],
        baseArgs: normalized.slice(1),
        display: normalized.join(' ')
    };
}

function createPythonCandidate(command, baseArgs = []) {
    return {
        command,
        baseArgs,
        display: [command, ...baseArgs].join(' ')
    };
}

function isPythonCandidateAvailable(candidate) {
    try {
        const result = spawnSync(
            candidate.command,
            [...candidate.baseArgs, '--version'],
            { windowsHide: true, shell: false }
        );
        return result.status === 0;
    } catch (e) {
        return false;
    }
}

function findPythonCandidate(candidates) {
    for (const candidate of candidates) {
        if (isPythonCandidateAvailable(candidate)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Find console Python executable for dependency verification/install
 */
function findPythonConsole() {
    const candidates = [];
    const override = parseCommandSpec(process.env.WNW_PYTHON_CONSOLE);
    if (override) {
        candidates.push(override);
    }

    if (process.platform === 'win32') {
        candidates.push(
            createPythonCandidate('python'),
            createPythonCandidate('py', ['-3.11']),
            createPythonCandidate('py', ['-3']),
            createPythonCandidate('py'),
            createPythonCandidate('python3')
        );
    } else {
        candidates.push(createPythonCandidate('python3'), createPythonCandidate('python'));
    }

    return findPythonCandidate(candidates);
}

function resolveWindowsCommandPath(command) {
    if (!command || process.platform !== 'win32') {
        return null;
    }

    if (path.isAbsolute(command) && fs.existsSync(command)) {
        return command;
    }

    try {
        const result = spawnSync('where', [command], {
            windowsHide: true,
            shell: false,
            encoding: 'utf8'
        });
        if (result.status === 0) {
            const firstMatch = (result.stdout || '')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find(Boolean);
            if (firstMatch && fs.existsSync(firstMatch)) {
                return firstMatch;
            }
        }
    } catch (e) {
        return null;
    }

    return null;
}

function derivePythonGuiCandidate(consoleCandidate) {
    if (!consoleCandidate || process.platform !== 'win32') {
        return null;
    }

    if (consoleCandidate.baseArgs?.length) {
        return null;
    }

    const resolvedConsolePath = resolveWindowsCommandPath(consoleCandidate.command);
    if (!resolvedConsolePath) {
        return null;
    }

    const candidatePath = path.join(path.dirname(resolvedConsolePath), 'pythonw.exe');
    if (!fs.existsSync(candidatePath)) {
        return null;
    }

    return createPythonCandidate(candidatePath);
}

/**
 * Find GUI Python executable for backend runtime (Windows)
 */
function findPythonGui(consoleCandidate) {
    const candidates = [];
    const override = parseCommandSpec(process.env.WNW_PYTHON_GUI);
    if (override) {
        candidates.push(override);
    }

    const derived = derivePythonGuiCandidate(consoleCandidate);
    if (derived) {
        candidates.push(derived);
    }

    if (process.platform === 'win32') {
        candidates.push(createPythonCandidate('pythonw'));
    }

    if (consoleCandidate) {
        candidates.push(consoleCandidate);
    }

    return findPythonCandidate(candidates);
}

function runPythonSync(candidate, args, options = {}) {
    return spawnSync(
        candidate.command,
        [...candidate.baseArgs, ...args],
        {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
            windowsHide: true,
            shell: false,
            ...options
        }
    );
}

function verifyPythonDeps(pythonCandidate) {
    const moduleList = REQUIRED_PY_MODULES.map((moduleName) => `'${moduleName}'`).join(', ');
    const checkScript = [
        'import importlib.util, sys',
        `mods=[${moduleList}]`,
        'missing=[m for m in mods if importlib.util.find_spec(m) is None]',
        'print(",".join(missing)) if missing else print("ok")',
        'raise SystemExit(1 if missing else 0)'
    ].join('; ');

    const result = runPythonSync(
        pythonCandidate,
        ['-c', checkScript],
        { encoding: 'utf-8' }
    );

    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    const missing = stdout && stdout !== 'ok'
        ? stdout.split(',').map((value) => value.trim()).filter(Boolean)
        : [];

    return {
        ok: result.status === 0,
        status: result.status,
        missing,
        stdout,
        stderr,
        error: result.error
    };
}

function shouldSkipPipInstall() {
    const raw = (process.env.WNW_SKIP_PIP_INSTALL || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
}

function buildDependencyErrorMessage(reason, pythonCandidate, checkResult = null) {
    const details = [reason];
    if (pythonCandidate) {
        details.push(`Python command: ${pythonCandidate.display}`);
    }
    if (checkResult?.missing?.length) {
        details.push(`Missing modules: ${checkResult.missing.join(', ')}`);
    }
    if (checkResult?.stderr) {
        details.push(`Dependency check stderr: ${checkResult.stderr}`);
    }
    details.push(`Logs: ${PIP_LOG_FILE}`);
    details.push(`Logs: ${PY_STDERR_LOG_FILE}`);
    return details.join('\n');
}

/**
 * Install Python dependencies
 */
function installPythonDependencies(pythonCandidate) {
    return new Promise((resolve, reject) => {
        updateLoadingStatus('Installing dependencies...');
        ensureLogsDir();

        const requirementsPath = path.join(appPath, 'requirements.txt');

        const spawnOptions = {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            windowsHide: true,
            detached: false
        };

        if (process.platform === 'win32') {
            const pipLog = fs.openSync(PIP_LOG_FILE, 'a');
            spawnOptions.stdio = ['ignore', pipLog, pipLog];
        } else {
            spawnOptions.stdio = ['ignore', 'pipe', 'pipe'];
        }

        const installProcess = spawn(
            pythonCandidate.command,
            [...pythonCandidate.baseArgs, '-m', 'pip', 'install', '-r', requirementsPath, '--quiet'],
            spawnOptions
        );

        let errorOutput = '';
        let settled = false;

        const finalize = (error = null) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeoutHandle);
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        const killInstallProcess = () => {
            if (!installProcess || installProcess.killed || installProcess.exitCode !== null) {
                return;
            }

            const pid = installProcess.pid;
            if (!pid) {
                return;
            }

            if (process.platform === 'win32') {
                try {
                    spawnSync(
                        'taskkill',
                        ['/pid', pid.toString(), '/f', '/t'],
                        { windowsHide: true, shell: false, stdio: 'ignore' }
                    );
                } catch (e) {
                    try {
                        installProcess.kill('SIGKILL');
                    } catch (killError) {
                        console.log(`[Startup] Failed to force stop pip: ${killError.message}`);
                    }
                }
                return;
            }

            try {
                installProcess.kill('SIGKILL');
            } catch (e) {
                console.log(`[Startup] Failed to force stop pip: ${e.message}`);
            }
        };

        const timeoutHandle = setTimeout(() => {
            killInstallProcess();
            finalize(
                new Error(
                    buildDependencyErrorMessage(
                        `Dependency installation timed out after ${PIP_INSTALL_TIMEOUT_MS}ms.`,
                        pythonCandidate
                    )
                )
            );
        }, PIP_INSTALL_TIMEOUT_MS);

        if (process.platform !== 'win32' && installProcess.stderr) {
            installProcess.stderr.on('data', (data) => {
                const message = data.toString().trim();
                errorOutput += message;
                if (message) {
                    console.error(`[pip] ${message}`);
                }
            });
        }

        installProcess.on('error', (err) => {
            finalize(
                new Error(
                    buildDependencyErrorMessage(
                        `Failed to run pip install: ${err.message}`,
                        pythonCandidate
                    )
                )
            );
        });

        installProcess.on('exit', (code) => {
            if (code === 0) {
                finalize();
            } else {
                const reason = errorOutput
                    ? `Dependency installation failed (exit ${code}): ${errorOutput}`
                    : `Dependency installation failed (exit ${code})`;
                finalize(new Error(buildDependencyErrorMessage(reason, pythonCandidate)));
            }
        });
    });
}

async function ensurePythonDependencies(pythonConsole) {
    updateLoadingStatus('Checking dependencies...');
    const initialCheck = verifyPythonDeps(pythonConsole);
    if (initialCheck.ok) {
        updateLoadingStatus('Dependencies verified');
        return initialCheck;
    }

    if (shouldSkipPipInstall()) {
        throw new Error(
            buildDependencyErrorMessage(
                'Missing required Python dependencies and WNW_SKIP_PIP_INSTALL is enabled.',
                pythonConsole,
                initialCheck
            )
        );
    }

    await installPythonDependencies(pythonConsole);

    updateLoadingStatus('Verifying dependencies...');
    const finalCheck = verifyPythonDeps(pythonConsole);
    if (!finalCheck.ok) {
        throw new Error(
            buildDependencyErrorMessage(
                'Dependencies are still missing after pip install.',
                pythonConsole,
                finalCheck
            )
        );
    }

    updateLoadingStatus('Dependencies verified');
    return finalCheck;
}

/**
 * Start the Python backend server
 */
async function startPythonBackend() {
    const pythonConsole = findPythonConsole();
    if (!pythonConsole) {
        throw new Error('Python console interpreter not found. Please install Python 3.11 or later.');
    }

    const pythonGui = findPythonGui(pythonConsole);
    if (!pythonGui) {
        throw new Error('Python GUI interpreter not found. Set WNW_PYTHON_GUI or install pythonw.');
    }

    console.log(`[Startup] Python console: ${pythonConsole.display}`);
    console.log(`[Startup] Python runtime: ${pythonGui.display}`);
    console.log(`[Startup] App path: ${appPath}`);

    await ensurePythonDependencies(pythonConsole);

    return new Promise((resolve, reject) => {
        updateLoadingStatus('Starting backend...');
        ensureLogsDir();

        const spawnOptions = {
            cwd: appPath,
            env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
            windowsHide: true,
            detached: process.platform !== 'win32'
        };

        if (process.platform === 'win32') {
            const stdoutLog = fs.openSync(PY_STDOUT_LOG_FILE, 'a');
            const stderrLog = fs.openSync(PY_STDERR_LOG_FILE, 'a');
            spawnOptions.stdio = ['ignore', stdoutLog, stderrLog];
        } else {
            spawnOptions.stdio = ['ignore', 'pipe', 'pipe'];
        }

        pythonProcess = spawn(
            pythonGui.command,
            [...pythonGui.baseArgs, 'main.py', '-l', '--no-browser'],
            spawnOptions
        );

        let startupSettled = false;
        const settleResolve = () => {
            if (!startupSettled) {
                startupSettled = true;
                resolve();
            }
        };
        const settleReject = (err) => {
            if (!startupSettled) {
                startupSettled = true;
                reject(err);
            }
        };

        if (process.platform !== 'win32' && pythonProcess.stdout && pythonProcess.stderr) {
            pythonProcess.stdout.on('data', (data) => {
                const message = data.toString().trim();
                if (message) {
                    console.log(`[Python] ${message}`);
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                const message = data.toString().trim();
                if (message) {
                    console.error(`[Python Error] ${message}`);
                }
            });
        } else if (process.platform === 'win32') {
            console.log(`[Startup] Backend logs: ${PY_STDOUT_LOG_FILE}`);
            console.log(`[Startup] Backend logs: ${PY_STDERR_LOG_FILE}`);
        }

        pythonProcess.on('error', (err) => {
            settleReject(
                new Error(
                    `Failed to start Python backend: ${err.message}\nLogs: ${PY_STDERR_LOG_FILE}`
                )
            );
        });

        pythonProcess.on('exit', (code) => {
            console.log(`Python process exited with code ${code}`);
            if (!startupSettled) {
                updateLoadingStatus('Backend exited before readiness');
                settleReject(
                    new Error(
                        `Python backend exited before readiness (code ${code}).\nLogs: ${PY_STDERR_LOG_FILE}`
                    )
                );
                return;
            }

            if (!isQuitting) {
                probeServer(SERVER_URL).then((probeResult) => {
                    if (isLenientServerResponse(probeResult)) {
                        console.log('[Electron] Server already running on another instance. Quitting silently...');
                    } else {
                        dialog.showErrorBox(
                            'Server Stopped',
                            `The backend server stopped unexpectedly.\n\nLogs:\n${PY_STDERR_LOG_FILE}`
                        );
                    }
                    app.quit();
                });
            }
        });

        waitForServer(
            settleResolve,
            settleReject,
            0,
            () => pythonProcess,
            () => startupSettled
        );
    });
}

/**
 * Wait for the server to be ready
 */
function waitForServer(resolve, reject, attempts = 0, getBackendProcess = () => pythonProcess, isSettled = () => false) {
    if (isSettled()) {
        return;
    }

    const backendProcess = getBackendProcess();
    if (!backendProcess || backendProcess.exitCode !== null || backendProcess.killed) {
        updateLoadingStatus('Backend exited before readiness');
        reject(new Error(`Python backend exited before readiness.\nLogs: ${PY_STDERR_LOG_FILE}`));
        return;
    }

    const maxAttempts = 30; // bounded retry count with per-probe timeout
    if (attempts >= maxAttempts) {
        updateLoadingStatus('Server failed to start');
        reject(
            new Error(
                `Server failed to start after ${maxAttempts} health checks (probe timeout ${HTTP_PROBE_TIMEOUT_MS}ms).\nLogs: ${PY_STDERR_LOG_FILE}`
            )
        );
        return;
    }

    if (attempts % 5 === 0) {
        updateLoadingStatus(`Waiting for server... (${attempts}/${maxAttempts})`);
    }

    console.log(`[Electron] Checking health endpoint (attempt ${attempts + 1}/${maxAttempts})...`);

    probeServer(HEALTH_URL).then((probeResult) => {
        if (isHealthyServerResponse(probeResult)) {
            console.log('[Electron] Server health check passed');
            updateLoadingStatus('Server is ready');
            resolve();
            return;
        }

        if (probeResult.timedOut) {
            console.log('[Electron] Health check timed out');
        } else if (probeResult.statusCode !== null) {
            console.log(`[Electron] Health check response status: ${probeResult.statusCode}`);
        } else if (probeResult.error) {
            console.log(`[Electron] Health check error: ${probeResult.error}`);
        }

        if (!isSettled()) {
            setTimeout(() => waitForServer(resolve, reject, attempts + 1, getBackendProcess, isSettled), 1000);
        }
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
            isQuitting = true;
            app.quit();
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
    if (!pythonProcess) {
        return Promise.resolve();
    }

    console.log('Stopping Python backend...');
    const processToKill = pythonProcess;
    pythonProcess = null;

    return new Promise((resolve) => {
        let resolved = false;

        const finish = () => {
            if (resolved) {
                return;
            }
            resolved = true;
            resolve();
        };

        processToKill.once('exit', finish);

        setTimeout(() => {
            if (!resolved) {
                console.log('Python process did not exit in time, forcing shutdown...');
                try {
                    processToKill.kill('SIGKILL');
                } catch (e) {
                    console.log('Force kill failed:', e.message);
                }
            }
            finish();
        }, 3000);

        try {
            if (process.platform === 'win32') {
                try {
                    console.log(`Killing Python process ${processToKill.pid}...`);
                    const result = spawnSync('taskkill', ['/pid', processToKill.pid.toString(), '/f', '/t'], {
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
                    console.log('taskkill exception:', e.message);
                }
            } else {
                try {
                    process.kill(-processToKill.pid, 'SIGTERM');
                } catch (e) {
                    processToKill.kill('SIGTERM');
                }
            }
        } catch (e) {
            console.log('Error killing Python process:', e);
            try {
                processToKill.kill('SIGKILL');
            } catch (e2) {
                console.log('Fallback kill also failed:', e2);
            }
        }
    });
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

function loadLoadingWindowContent() {
    return new Promise((resolve, reject) => {
        if (!loadingWindow || loadingWindow.isDestroyed()) {
            reject(new Error('Loading window is not available.'));
            return;
        }

        let settled = false;
        let timeoutHandle = null;

        const finish = (error = null) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            loadingWindow.webContents.removeListener('did-finish-load', onFinishLoad);
            loadingWindow.webContents.removeListener('did-fail-load', onFailLoad);
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        const onFinishLoad = () => finish();
        const onFailLoad = (_event, errorCode, errorDescription) => {
            finish(new Error(`Failed to load loading screen (${errorCode}): ${errorDescription}`));
        };

        timeoutHandle = setTimeout(() => {
            finish(new Error(`Loading screen failed to initialize within ${LOADING_WINDOW_READY_TIMEOUT_MS}ms.`));
        }, LOADING_WINDOW_READY_TIMEOUT_MS);

        loadingWindow.webContents.once('did-finish-load', onFinishLoad);
        loadingWindow.webContents.once('did-fail-load', onFailLoad);

        loadingWindow.loadFile(path.join(__dirname, 'loading.html'))
            .catch((error) => finish(error));
    });
}

// App event handlers
app.whenReady().then(async () => {
    try {
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

        await loadLoadingWindowContent();

        if (loadingWindow && !loadingWindow.isDestroyed()) {
            loadingWindow.show();
            loadingWindow.focus();
            loadingWindow.setAlwaysOnTop(true, 'screen-saver');
            loadingWindow.moveTop();

            setTimeout(() => {
                if (loadingWindow && !loadingWindow.isDestroyed()) {
                    loadingWindow.focus();
                    loadingWindow.moveTop();
                }
            }, 100);
        }

        updateLoadingStatus('Starting Wailing Newt...');

        // Check if server is already running (another instance)
        const healthProbe = await probeServer(HEALTH_URL);
        let serverAlreadyRunning = isHealthyServerResponse(healthProbe);
        if (!serverAlreadyRunning) {
            const fallbackProbe = await probeServer(SERVER_URL);
            serverAlreadyRunning = isLenientServerResponse(fallbackProbe);
        }

        if (serverAlreadyRunning) {
            console.log('[Electron] Server already running - focusing existing instance');
            updateLoadingStatus('App already running...');
            if (loadingWindow && !loadingWindow.isDestroyed()) {
                loadingWindow.close();
            }
            // Open browser to existing instance instead of showing error
            require('electron').shell.openExternal(SERVER_URL);
            app.quit();
            return;
        }

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
        if (error.message.includes('Python')) {
            errorDetail += '\n\nPlease install Python 3.11 or later from https://www.python.org/';
        } else if (error.message.toLowerCase().includes('dependencies')) {
            errorDetail += '\n\nTry running setup.bat to install all dependencies.';
        }
        if (!errorDetail.includes(PIP_LOG_FILE)) {
            errorDetail += `\n\nLogs:\n${PIP_LOG_FILE}\n${PY_STDERR_LOG_FILE}`;
        }

        dialog.showErrorBox('Startup Error', errorDetail);
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

app.on('before-quit', (event) => {
    if (isQuitting) {
        return;
    }
    isQuitting = true;

    if (pythonProcess) {
        event.preventDefault();
        stopPythonBackend()
            .finally(() => app.quit());
    }
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
