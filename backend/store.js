const fs = require('fs');
const path = require('path');

// Small JSON file store. On Railway, DATA_DIR points at a mounted volume so data survives redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'data.json');

const EMPTY = () => ({
  schedule: { date: null, slots: [] },
  mantras: [],
  stats: { success: 0, failed: 0 },
  pushSubscriptions: [],
});

let data = null;

function load() {
  if (data) return data;
  try {
    data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Could not read ${FILE}, starting empty:`, err.message);
    data = EMPTY();
  }
  return data;
}

// Applies `fn` to the data and writes it to disk. Synchronous on purpose: no two updates can interleave.
function update(fn) {
  const current = load();
  const result = fn(current);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2));
  fs.renameSync(tmp, FILE);
  return result;
}

module.exports = { load, update, DATA_DIR };
