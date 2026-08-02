const normalizeMomentIdentityToken = (value = '') => String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '');

export const getMomentStableId = (moment = {}) => {
  const explicitId = normalizeMomentIdentityToken(moment?.id || '');
  if (explicitId) {
    return explicitId;
  }

  const latitude = String(moment?.latitude ?? '').trim();
  const longitude = String(moment?.longitude ?? '').trim();
  const createdAt = String(moment?.createdAt ?? '').trim();
  const title = String(moment?.nazev || moment?.name || '').trim();
  const location = [moment?.obec, moment?.okres, moment?.kraj, moment?.stat].filter(Boolean).join('|');
  const seed = [title, latitude, longitude, createdAt, location].filter(Boolean).join('::');

  return normalizeMomentIdentityToken(seed) || 'legacy-moment';
};
