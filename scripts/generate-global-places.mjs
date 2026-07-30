import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const outputDir = path.join(process.cwd(), 'public', 'data');
mkdirSync(outputDir, { recursive: true });

const url = 'https://raw.githubusercontent.com/datasets/world-cities/master/data/world-cities.csv';
const response = await fetch(url);

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const csv = await response.text();
const lines = csv.trim().split(/\r?\n/);
const header = lines[0].split(',');
const rows = lines.slice(1).map((line) => {
  const values = line.split(',');
  const item = {};
  header.forEach((key, index) => {
    item[key] = values[index] || '';
  });
  return item;
});

const items = rows
  .slice(0, 12000)
  .map((row) => ({
    kod: `global-${row.geonameid || Math.random().toString(36).slice(2)}`,
    nazev: row.name || '',
    okres: row.subcountry || '',
    kraj: row.country || '',
    latitude: null,
    longitude: null,
    type: 'city',
  }))
  .filter((item) => item.nazev);

const outputPath = path.join(outputDir, 'global-places.json');
writeFileSync(outputPath, JSON.stringify(items, null, 2));
console.log(`Wrote ${items.length} entries to ${outputPath}`);
