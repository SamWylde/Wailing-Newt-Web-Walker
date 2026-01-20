# Wailing Newt Launcher Guide

## Quick Start (First Time Users)

### Step 1: Run Setup (Once)
**Double-click:** `setup.bat`

This will:
- Install Node.js packages
- Install Python dependencies
- Install Playwright browsers
- Verify everything is ready

You only need to run this **once** (or after pulling updates).

### Step 2: Launch the App

Choose your preferred launcher:

#### Option A: Silent Launch (Recommended) 🌟
**Double-click:** `start-silent.vbs`
- No CMD window at all
- Green loading screen appears immediately
- Cleanest experience

#### Option B: Fast Launch
**Double-click:** `start.bat`
- Minimized CMD window (in taskbar)
- Green loading screen appears immediately
- Can view console logs if needed

#### Option C: Developer Mode
**Run in terminal:** `npm start`
- Full console output visible
- Useful for debugging
- See all backend logs

## What You'll See

All launchers show the **Wailing Newt Loading Screen**:

```
┌─────────────────────────────────────┐
│            🐸                        │
│      Wailing Newt                    │
│    SEO Spider Tool                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━       │
│  Starting Python server...           │
│  ┌─────────────────────────────┐    │
│  │ Installing dependencies...  │    │
│  │ Dependencies installed      │    │
│  │ Starting Python server...   │    │
│  │ Initializing database...    │    │
│  │ Starting in local mode...   │    │
│  │ Waiting for server...       │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

The loading screen shows:
- Real-time status updates
- Console-style log output
- Progress through startup steps
- Automatically closes when app is ready

## Troubleshooting

### "Python not found" Error
Install Python 3.11 or later from https://www.python.org/

### "Module not found" Error
Run `setup.bat` to install all dependencies

### Loading screen doesn't appear
Try `start-silent.vbs` for the cleanest launch experience

### Want to see all logs?
Use `npm start` in the terminal for developer mode

## Legacy Launchers (Still Work)

These older launchers still function but are less optimized:
- `start-electron.bat` - Original launcher with inline dependency checks
- `start-electron-silent.vbs` - Original silent launcher

**Recommendation:** Use the new `start.bat` or `start-silent.vbs` for faster launches.

## Platform Support

### Windows
- ✅ `start-silent.vbs` (recommended)
- ✅ `start.bat`
- ✅ `npm start`

### Linux/Mac
- ✅ `start-electron.sh`
- ✅ `npm start`

## Architecture

```
setup.bat          → Run once: Install all dependencies

start-silent.vbs   → Launch: Shows loading screen immediately
start.bat          →         All setup happens in Electron
                             Real-time progress displayed
```

This approach ensures:
1. **Fast launches** - No dependency checking on every start
2. **Visible progress** - Loading screen shows everything
3. **Clean experience** - No CMD windows (if using .vbs)
