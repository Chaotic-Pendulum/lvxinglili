export function visitCount(visits, id) {
  if (id !== "CN") return visits[id] || 0;
  return Object.entries(visits).reduce((total, [key, count]) => total + (key.startsWith("CN-") ? count : 0), 0);
}

export function atlasSelectionForMode(selected, mode) {
  if (mode === "world") return selected.startsWith("CN-") ? "CN" : selected;
  return selected === "CN" || selected.startsWith("CN-") ? selected : "";
}

export function photosForRegion(photos, selected) {
  return photos.filter((photo) => selected === "CN"
    ? photo.destinationId?.startsWith("CN-")
    : selected ? photo.destinationId === selected : photo.destinationId);
}
