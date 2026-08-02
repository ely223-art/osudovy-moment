const normalizeMomentIdentityToken = (value = '') => String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '');

const normalizeCoordinateValue = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }

  return numericValue.toFixed(5);
};

export const getMomentStableId = (moment = {}) => {
  const latitude = normalizeCoordinateValue(moment?.latitude);
  const longitude = normalizeCoordinateValue(moment?.longitude);
  const location = [moment?.obec, moment?.okres, moment?.kraj, moment?.stat]
    .map((value) => normalizeMomentIdentityToken(value || ''))
    .filter(Boolean)
    .join('|');

  const seed = [latitude, longitude, location].filter(Boolean).join('::');
  const fallbackId = normalizeMomentIdentityToken(seed) || 'legacy-moment';

  if (fallbackId && fallbackId !== 'legacy-moment') {
    return fallbackId;
  }

  return normalizeMomentIdentityToken(moment?.id || '') || 'legacy-moment';
};
