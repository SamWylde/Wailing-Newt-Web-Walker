# Wailing Newt Launcher Options

## Windows

### Option 1: Silent Launcher (Recommended)
**File:** `start-electron-silent.vbs`

- **Double-click to launch** - No console window will appear
- Only the green Electron loader will be visible
- Cleanest user experience

### Option 2: Minimized Launcher
**File:** `start-electron.bat`

- **Double-click to launch** - Console window will minimize automatically
- Console runs in background (minimized to taskbar)
- The green Electron loader will be the main window
- Console can be restored from taskbar to see background logs

## Linux/Mac

### Launcher Script
**File:** `start-electron.sh`

- Make executable: `chmod +x start-electron.sh`
- Run: `./start-electron.sh`
- Shows status in terminal while loading

## What You'll See

All launchers will display the **Wailing Newt startup loader**:
- Green gradient background with frog emoji 🐸
- Real-time status updates
- Progress bar animation
- Console-style output showing:
  - Python dependency installation
  - Database initialization
  - Server startup
  - Connection status

The loader automatically closes when the main application window opens.

## For Developers

Run directly with npm:
```bash
cd electron
npm start
```

This will show full console output for debugging.
