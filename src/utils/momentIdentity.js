const normalizeMomentIdentityToken = (value = '') => String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '');

const normalizeCoordinateValue = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }

  return numericValue.toFixed(5);
};

export const getMomentStableId = (moment = {}) => {
  const explicitId = normalizeMomentIdentityToken(moment?.id || '');
  if (explicitId) {
    return explicitId;
  }

  const latitude = normalizeCoordinateValue(moment?.latitude);
  const longitude = normalizeCoordinateValue(moment?.longitude);
  const location = [moment?.obec, moment?.okres, moment?.kraj, moment?.stat]
    .map((value) => normalizeMomentIdentityToken(value || ''))
    .filter(Boolean)
    .join('|');

  const seed = [latitude, longitude, location].filter(Boolean).join('::');
  return normalizeMomentIdentityToken(seed) || 'legacy-moment';
};
