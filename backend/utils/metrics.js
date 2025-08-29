function dot(a, b) {
  let s = 0;
  const L = Math.min(a.length, b.length);
  for (let i = 0; i < L; i++) s += (a[i] || 0) * (b[i] || 0);
  return s;
}
function norm(a) {
  return Math.sqrt(dot(a, a)) || 1; // avoid /0
}

export function cosine(a = [], b = []) {
  return dot(a, b) / (norm(a) * norm(b));
}

export function jaccard(A = [], B = []) {
  const a = new Set(A);
  const b = new Set(B);
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = new Set([...A, ...B]).size || 1;
  return inter / uni;
}
