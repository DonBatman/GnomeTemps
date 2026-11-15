import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CpuTempPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const displayGroup = new Adw.PreferencesGroup({
            title: 'Display & Polling',
            description: 'Configure temperature units and sensor refresh rate.',
        });
        page.add(displayGroup);

        const unitRow = new Adw.SwitchRow({
            title: 'Use Fahrenheit (°F)',
            subtitle: 'Display temperatures in Fahrenheit instead of Celsius',
        });
        settings.bind('use-fahrenheit', unitRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        displayGroup.add(unitRow);

        const pollRow = new Adw.SpinRow({
            title: 'Polling Interval (seconds)',
            subtitle: 'How frequently CPU sensors are read',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 60,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        settings.bind('poll-interval', pollRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        displayGroup.add(pollRow);

        const thresholdGroup = new Adw.PreferencesGroup({
            title: 'Color Warning Thresholds (°C)',
            description: 'Thresholds are stored in Celsius and applied automatically in °C or °F mode.',
        });
        page.add(thresholdGroup);

        const warnRow = new Adw.SpinRow({
            title: 'Warning Threshold (Amber)',
            subtitle: 'Highlight temperature in amber at or above this value (°C)',
            adjustment: new Gtk.Adjustment({
                lower: 30,
                upper: 110,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        settings.bind('warn-temp-c', warnRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        thresholdGroup.add(warnRow);

        const critRow = new Adw.SpinRow({
            title: 'Critical Threshold (Red)',
            subtitle: 'Highlight temperature in red at or above this value (°C)',
            adjustment: new Gtk.Adjustment({
                lower: 40,
                upper: 120,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        settings.bind('crit-temp-c', critRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        thresholdGroup.add(critRow);
    }
}
