# Wailing Newt Web Walker - Electron Desktop App

This is the Electron wrapper that packages Wailing Newt as a native desktop application.

## Requirements

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.11+** - [Download](https://www.python.org/downloads/)

## Quick Start (Development)

1. Open a terminal in this folder
2. Run `start-electron.bat` (Windows) or:
   ```bash
   npm install
   npm start
   ```

## Building the Installer

### Windows
Run `build-installer.bat` or:
```bash
npm install
npm run build:win
```

The installer will be created in the `dist` folder.

### macOS
```bash
npm install
npm run build:mac
```

### Linux
```bash
npm install
npm run build:linux
```

## Features

- **Native Window** - Runs as a proper Windows application
- **System Tray** - Minimizes to system tray instead of closing
- **Auto-start Backend** - Python server starts automatically
- **Native Menus** - File, View, Help menus
- **Keyboard Shortcuts** - Standard shortcuts work

## Project Structure

```
electron/
├── main.js          # Main Electron process
├── preload.js       # Security preload script
├── package.json     # Electron dependencies
├── start-electron.bat    # Development launcher
├── build-installer.bat   # Build script
└── README.md        # This file
```

## Customization

### App Icon
Replace these files with your own icons:
- `icon.png` - 512x512 PNG for Linux/general use
- `icon.ico` - Windows icon (multiple sizes embedded)
- `icon.icns` - macOS icon

### App Information
Edit `package.json` to change:
- `name` - App identifier
- `version` - Version number
- `description` - App description
- `build.appId` - Unique app ID

## Troubleshooting

### Python not found
Make sure Python is installed and added to PATH.

### Server won't start
Check that all Python dependencies are installed:
```bash
cd ..
pip install -r requirements.txt
playwright install chromium
```

### Build fails
Make sure you have enough disk space and all dependencies installed.
