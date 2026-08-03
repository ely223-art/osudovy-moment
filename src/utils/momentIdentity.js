const normalizeMomentIdentityToken = (value = '') => String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '');

const normalizeCoordinateValue = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }

  return numericValue.toFixed(5);
};

const normalizeMomentIdentityText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

export const getMomentStableId = (moment = {}) => {
  const latitude = normalizeCoordinateValue(moment?.latitude);
  const longitude = normalizeCoordinateValue(moment?.longitude);
  const location = [moment?.obec, moment?.okres, moment?.kraj, moment?.stat]
    .map((value) => normalizeMomentIdentityToken(value || ''))
    .filter(Boolean)
    .join('|');
  const fingerprint = [
    normalizeMomentIdentityText(moment?.nazev),
    normalizeMomentIdentityText(moment?.datum),
    normalizeMomentIdentityText(moment?.createdAt),
  ]
    .filter(Boolean)
    .join('|');

  const seed = [latitude, longitude, location, fingerprint].filter(Boolean).join('::');
  const fallbackId = normalizeMomentIdentityToken(seed) || 'legacy-moment';

  if (fallbackId && fallbackId !== 'legacy-moment') {
    return fallbackId;
  }

  return normalizeMomentIdentityToken(moment?.id || '') || 'legacy-moment';
};
