# CPU Temperature Monitor (GNOME Shell Extension)

A lightweight GNOME Shell extension (compatible with GNOME 45 through 51+) that displays live CPU temperature in the top bar immediately beside the right-side system status icons, with color-coded thermal warnings, a click dropdown listing all individual CPU core temperatures, a `°C` / `°F` toggle, and a native Libadwaita preferences window (`prefs.js`).

## Installation Path
`~/.local/share/gnome-shell/extensions/cpu-temp@serfdon.com/`

```text
cpu-temp@serfdon.com/
├── metadata.json
├── extension.js
├── prefs.js
├── README.md
└── schemas/
    ├── org.gnome.shell.extensions.cpu-temp.gschema.xml
    └── gschemas.compiled
