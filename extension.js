import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PREFERRED_LABELS = ['Tctl', 'Package id 0', 'Core 0', 'CPU', 'x86_pkg_temp', 'acpitz'];
const CPU_DRIVERS = ['coretemp', 'k10temp', 'zenpower', 'acpitz', 'cpu_thermal'];

export default class CpuTempExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._loadSettings();

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        this._label = new St.Label({
            text: '--°C',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-weight: 600; padding: 0 4px;'
        });
        this._indicator.add_child(this._label);

        this._sensorSection = new PopupMenu.PopupMenuSection();
        this._indicator.menu.addMenuItem(this._sensorSection);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._unitToggleItem = new PopupMenu.PopupMenuItem(this._getToggleLabel());
        this._unitToggleItem.connect('activate', () => {
            this._settings.set_boolean('use-fahrenheit', !this._useFahrenheit);
        });
        this._indicator.menu.addMenuItem(this._unitToggleItem);

        this._settingsItem = new PopupMenu.PopupMenuItem('Settings');
        this._settingsItem.connect('activate', () => {
            this.openPreferences();
        });
        this._indicator.menu.addMenuItem(this._settingsItem);

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            this._loadSettings();
            if (key === 'use-fahrenheit' && this._unitToggleItem) {
                this._unitToggleItem.label.set_text(this._getToggleLabel());
            }
            if (key === 'poll-interval') {
                this._restartTimer();
            }
            this._updateTemp();
        });

        // Place at index 0 of the right box (immediately to the left of the system tray icons)
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');

        this._updateTemp();
        this._restartTimer();
    }

    disable() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._sensorSection = null;
        this._unitToggleItem = null;
        this._settingsItem = null;
        this._label = null;
        this._settings = null;
    }

    _loadSettings() {
        this._useFahrenheit = this._settings.get_boolean('use-fahrenheit');
        this._warnTempC = this._settings.get_int('warn-temp-c');
        this._critTempC = this._settings.get_int('crit-temp-c');
        this._pollInterval = Math.max(1, this._settings.get_int('poll-interval'));
    }

    _restartTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._pollInterval, () => {
            this._updateTemp();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _getToggleLabel() {
        return this._useFahrenheit
            ? 'Unit: Fahrenheit (°F) — Switch to °C'
            : 'Unit: Celsius (°C) — Switch to °F';
    }

    _formatTemp(celsius) {
        if (this._useFahrenheit) {
            const fahrenheit = (celsius * 9) / 5 + 32;
            return `${Math.round(fahrenheit)}°F`;
        }
        return `${Math.round(celsius)}°C`;
    }

    _getTempColor(celsius) {
        if (celsius >= this._critTempC) {
            return '#ff5555';
        }
        if (celsius >= this._warnTempC) {
            return '#ffb86c';
        }
        return null;
    }

    _readFile(path) {
        try {
            const [ok, bytes] = GLib.file_get_contents(path);
            if (ok) {
                return new TextDecoder().decode(bytes).trim();
            }
        } catch (_e) {}
        return null;
    }

    _getSensorData() {
        const sensors = [];
        let fallbackTemp = null;
        let bestPriority = PREFERRED_LABELS.length;
        let bestTemp = null;

        // 1. Scan /sys/class/hwmon/hwmon* (coretemp on Intel, k10temp/zenpower on AMD)
        const hwmonBase = '/sys/class/hwmon';
        try {
            const dir = GLib.Dir.open(hwmonBase, 0);
            let name;
            while ((name = dir.read_name()) !== null) {
                const hwDir = `${hwmonBase}/${name}`;
                const driverName = this._readFile(`${hwDir}/name`) || '';
                const isCpuDriver = CPU_DRIVERS.some(d => driverName.toLowerCase().includes(d));

                for (let i = 1; i <= 32; i++) {
                    const inputPath = `${hwDir}/temp${i}_input`;
                    const raw = this._readFile(inputPath);
                    if (!raw) continue;

                    const val = parseInt(raw, 10) / 1000.0;
                    if (isNaN(val) || val <= 0 || val > 130) continue;

                    const rawLabel = this._readFile(`${hwDir}/temp${i}_label`);
                    const displayLabel = rawLabel || `${driverName} #${i}`;
                    const lowerLabel = displayLabel.toLowerCase();

                    const isCoreOrPkg =
                        isCpuDriver ||
                        lowerLabel.includes('core') ||
                        lowerLabel.includes('package') ||
                        lowerLabel.includes('tctl') ||
                        lowerLabel.includes('tdie') ||
                        lowerLabel.includes('ccd') ||
                        lowerLabel.includes('cpu');

                    if (isCoreOrPkg) {
                        sensors.push({ label: displayLabel, temp: val });
                    }

                    const idx = PREFERRED_LABELS.findIndex(p => lowerLabel.includes(p.toLowerCase()));
                    if (idx !== -1 && idx < bestPriority) {
                        bestPriority = idx;
                        bestTemp = val;
                    } else if (fallbackTemp === null && isCpuDriver) {
                        fallbackTemp = val;
                    }
                }
            }
            dir.close();
        } catch (_e) {}

        // 2. Fallback to /sys/class/thermal/thermal_zone*
        if (sensors.length === 0) {
            const thermalBase = '/sys/class/thermal';
            try {
                const dir = GLib.Dir.open(thermalBase, 0);
                let name;
                while ((name = dir.read_name()) !== null) {
                    if (!name.startsWith('thermal_zone')) continue;
                    const zoneDir = `${thermalBase}/${name}`;
                    const raw = this._readFile(`${zoneDir}/temp`);
                    if (!raw) continue;

                    const val = parseInt(raw, 10) / 1000.0;
                    if (isNaN(val) || val <= 0 || val > 130) continue;

                    const type = this._readFile(`${zoneDir}/type`) || name;
                    if (type.includes('x86_pkg_temp') || type.includes('cpu') || type.includes('acpitz')) {
                        sensors.push({ label: type, temp: val });
                        if (bestTemp === null) bestTemp = val;
                    } else if (fallbackTemp === null) {
                        fallbackTemp = val;
                    }
                }
                dir.close();
            } catch (_e) {}
        }

        const primaryTemp = bestTemp !== null ? bestTemp : fallbackTemp;
        return { primaryTemp, sensors };
    }

    _updateMenu(sensors) {
        if (!this._sensorSection) return;
        this._sensorSection.removeAll();

        const header = new PopupMenu.PopupMenuItem('CPU Thermal Sensors', {
            reactive: false,
            can_focus: false
        });
        header.label.set_style('font-weight: bold; opacity: 0.75;');
        this._sensorSection.addMenuItem(header);
        this._sensorSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (sensors.length === 0) {
            const emptyItem = new PopupMenu.PopupMenuItem('No individual core sensors found', {
                reactive: false,
                can_focus: false
            });
            this._sensorSection.addMenuItem(emptyItem);
            return;
        }

        for (const sensor of sensors) {
            const item = new PopupMenu.PopupMenuItem('', {
                reactive: false,
                can_focus: false
            });
            item.label.set_text(sensor.label);

            const color = this._getTempColor(sensor.temp);
            const colorCss = color ? ` color: ${color};` : '';

            const valueLabel = new St.Label({
                text: this._formatTemp(sensor.temp),
                y_align: Clutter.ActorAlign.CENTER,
                style: `font-weight: 600; margin-left: 24px;${colorCss}`
            });
            item.add_child(valueLabel);
            this._sensorSection.addMenuItem(item);
        }
    }

    _updateTemp() {
        if (!this._label) return;
        const { primaryTemp, sensors } = this._getSensorData();

        if (primaryTemp !== null) {
            this._label.set_text(this._formatTemp(primaryTemp));
            const color = this._getTempColor(primaryTemp);
            const colorCss = color ? ` color: ${color};` : '';
            this._label.set_style(`font-weight: 600; padding: 0 4px;${colorCss}`);
        } else {
            this._label.set_text('N/A');
            this._label.set_style('font-weight: 600; padding: 0 4px;');
        }

        this._updateMenu(sensors);
    }
}
