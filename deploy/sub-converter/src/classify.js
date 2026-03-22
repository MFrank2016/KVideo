export function loadPremiumKeywords(text) {
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n/)
    .map(line => line.replace(/#.*$/u, '').trim())
    .filter(line => line.length > 0);
}

export function isPremiumName(name, keywords = []) {
  if (!name || !keywords || keywords.length === 0) {
    return false;
  }

  const normalizedName = String(name).toLowerCase();

  for (const keyword of keywords) {
    if (!keyword) {
      continue;
    }

    if (normalizedName.includes(String(keyword).toLowerCase())) {
      return true;
    }
  }

  return false;
}
