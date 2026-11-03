export function getLocationOptions(kind, countryCode, stateName, countries, regions) {
  if (kind === "country") return countries.map(country => ({ name: country.name, value: country.iso }));
  const states = regions.countries[countryCode] || [];
  if (kind === "state") return states.map(state => ({ name: typeof state === "string" ? state : state.name, value: typeof state === "string" ? state : state.name }));
  if (kind === "lga") {
    const state = states.find(item => (typeof item === "string" ? item : item.name) === stateName);
    return (typeof state === "object" ? state.lgas || [] : []).map(name => ({ name, value: name }));
  }
  return [];
}

export function filterLocationOptions(options, search, limit = 12) {
  const query = String(search || "").trim().toLocaleLowerCase();
  return options.filter(option => !query || option.name.toLocaleLowerCase().includes(query)).slice(0, limit);
}
