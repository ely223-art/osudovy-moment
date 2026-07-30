import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
}

function readAdminMap(filePath) {
  const map = new Map();
  for (const line of readLines(filePath)) {
    const parts = line.split('\t');
    const code = parts[0] || '';
    const name = (parts[1] || parts[2] || '').trim();
    if (code && name) {
      map.set(code, name);
    }
  }
  return map;
}

function parseAlternates(raw = '') {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value.length > 1)
    .map((value) => value.replace(/_/g, ' '));
}

function getRegionAndDistrict(admin1Code, admin2Code, admin1Map, admin2Map) {
  const a1 = (admin1Code || '').split('.')[1] || admin1Code || '';
  const a2 = (admin2Code || '').split('.')[1] || admin2Code || '';

  const krajKey = a1 ? `CZ.${a1}` : '';
  const okresKey = a1 && a2 ? `CZ.${a1}.${a2}` : '';

  const kraj = krajKey ? (admin1Map.get(krajKey) || '') : '';
  const okres = okresKey ? (admin2Map.get(okresKey) || '') : '';

  return { kraj, okres };
}

const geoDir = path.join(__dirname, '..', 'geo');
const existingPath = path.join(__dirname, '..', 'public', 'data', 'obce.json');

const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
const out = [...existing];

const admin1Map = readAdminMap(path.join(geoDir, 'admin1CodesASCII.txt'));
const admin2Map = readAdminMap(path.join(geoDir, 'admin2Codes.txt'));

const seen = new Set(
  out.map((entry) => {
    const lat = Number(entry.latitude || 0).toFixed(3);
    const lon = Number(entry.longitude || 0).toFixed(3);
    return `${normalize(entry.nazev)}|${normalize(entry.okres)}|${normalize(entry.kraj)}|${lat}|${lon}`;
  })
);

let added = 0;
for (const line of readLines(path.join(geoDir, 'CZ.txt'))) {
  const parts = line.split('\t');
  if (parts[8] !== 'CZ') continue;

  const featureCode = parts[7] || '';
  if (!/^PPL/.test(featureCode) && featureCode !== 'PPL') continue;

  const name = (parts[1] || '').trim();
  if (!name) continue;

  const { kraj, okres } = getRegionAndDistrict(parts[10], parts[11], admin1Map, admin2Map);
  const lat = Number(parts[4] || 0);
  const lon = Number(parts[5] || 0);
  const aliases = parseAlternates(parts[3] || '').filter((alias) => alias !== name);

  const key = `${normalize(name)}|${normalize(okres)}|${normalize(kraj)}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
  if (seen.has(key)) continue;

  out.push({
    kod: String(parts[0] || ''),
    nazev: name,
    okres: okres || '',
    kraj: kraj || '',
    latitude: lat,
    longitude: lon,
    aliases,
  });

  seen.add(key);
  added += 1;
}

fs.writeFileSync(existingPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`written ${out.length} entries, added ${added}`);
