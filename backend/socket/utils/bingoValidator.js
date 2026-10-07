function normalizeMarked(markedCells) {
  if (!Array.isArray(markedCells)) return [];
  return markedCells.map((m) => {
    if (Array.isArray(m)) return [m[0], m[1]];
    return [m.row, m.col];
  }).filter((p) => Array.isArray(p) && p.length === 2);
}

function isFullCard(markedCells) {
  const norm = normalizeMarked(markedCells);
  const set = new Set(norm.map(([r, c]) => `${r},${c}`));
  return set.size === 25;
}

module.exports = {
  normalizeMarked,
  isFullCard
};
