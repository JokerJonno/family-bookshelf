const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.join(__dirname, 'plugins');
const loadedPlugins = [];

/**
 * Scan the plugins directory and load each valid plugin.
 * Each plugin must have:
 *   manifest.json  — metadata and hook declarations
 *   server.js      — exports { router } (Express Router)
 *   public/        — optional static assets served at /plugins/:id/
 */
async function loadPlugins(app, db, helpers) {
  if (!fs.existsSync(PLUGINS_DIR)) {
    console.log('📦 No plugins directory found — skipping plugin load');
    return;
  }

  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory());

  for (const dir of dirs) {
    const pluginPath = path.join(PLUGINS_DIR, dir.name);
    const manifestPath = path.join(pluginPath, 'manifest.json');
    const serverPath = path.join(pluginPath, 'server.js');

    if (!fs.existsSync(manifestPath)) {
      console.warn(`⚠️  Plugin "${dir.name}" missing manifest.json — skipping`);
      continue;
    }
    if (!fs.existsSync(serverPath)) {
      console.warn(`⚠️  Plugin "${dir.name}" missing server.js — skipping`);
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Validate required manifest fields
      if (!manifest.id || !manifest.name) {
        console.warn(`⚠️  Plugin "${dir.name}" manifest missing id or name — skipping`);
        continue;
      }

      // Load plugin server module, passing db and helpers
      const pluginModule = require(serverPath);
      const router = pluginModule.init({ db, helpers, manifest });

      // Mount API routes at /api/plugins/:id
      app.use(`/api/plugins/${manifest.id}`, router);

      // Serve plugin static assets at /plugins/:id/
      const publicDir = path.join(pluginPath, 'public');
      if (fs.existsSync(publicDir)) {
        app.use(`/plugins/${manifest.id}`, require('express').static(publicDir));
      }

      loadedPlugins.push({
        ...manifest,
        _path: pluginPath,
        enabled: true,
      });

      console.log(`🔌 Plugin loaded: ${manifest.name} (${manifest.id}) v${manifest.version || '?'}`);
    } catch (e) {
      console.error(`❌ Failed to load plugin "${dir.name}":`, e.message);
    }
  }

  console.log(`📦 ${loadedPlugins.length} plugin(s) active`);
}

function getLoadedPlugins() {
  return loadedPlugins;
}

module.exports = { loadPlugins, getLoadedPlugins };
