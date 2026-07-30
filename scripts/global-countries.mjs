import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = 'https://restcountries.com/v3.1/all?fields=name,capital,cca2,region,latlng';

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const countries = await response.json();
const items = [];

for (const country of countries) {
  const countryName = country.name?.common || country.name?.official || '';
  const region = country.region || 'Svět';
  const code = country.cca2 || '';
  const latlng = Array.isArray(country.latlng) ? country.latlng : [0, 0];

  if (countryName) {
    items.push({
      kod: `country-${code || items.length + 1}`,
      nazev: countryName,
      okres: '',
      kraj: region,
      latitude: Number(latlng[0] || 0),
      longitude: Number(latlng[1] || 0),
      type: 'country',
    });
  }

  const capital = (country.capital && country.capital[0]) || '';
  if (capital) {
    items.push({
      kod: `city-${code || items.length + 1}`,
      nazev: capital,
      okres: '',
      kraj: countryName,
      latitude: Number(latlng[0] || 0),
      longitude: Number(latlng[1] || 0),
      type: 'city',
    });
  }
}

const outputPath = path.join(__dirname, '..', 'public', 'data', 'countries.json');
fs.writeFileSync(outputPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
console.log(`wrote ${items.length} global places`);
