// Isolated in-memory stand-ins; this test must never connect to the shared database.
export const memory = { role: null, candidates: [], venues: [], orgs: [], statsCalls: 0 };
export const getCurrentUser = async () => memory.role ? { role: memory.role } : null;
export const requireAdmin = async () => { if (memory.role !== 'ADMIN') throw new Error('forbidden'); };
export const createPlaybackUrls = async () => ({});
export class NextResponse extends Response {
  static json(body, options = {}) { return new Response(JSON.stringify(body), { ...options, headers: { 'content-type': 'application/json' } }); }
}

function match(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every((v) => match(row, v));
    if (key === 'OR') return value.some((v) => match(row, v));
    if (key === 'NOT') return !match(row, value);
    const field = row[key];
    if (value && typeof value === 'object') {
      if ('contains' in value) return String(field ?? '').toLowerCase().includes(value.contains.toLowerCase());
      if ('startsWith' in value) return String(field ?? '').startsWith(value.startsWith);
      if ('isEmpty' in value) return (field.length === 0) === value.isEmpty;
    }
    return field === value;
  });
}
function list(table) {
  return async ({ where, orderBy, skip = 0, take }) => {
    const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
    return memory[table].filter((row) => match(row, where)).sort((a, b) => {
      for (const order of orders) {
        const [key, direction] = Object.entries(order)[0];
        const result = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
        if (result) return direction === 'desc' ? -result : result;
      }
      return 0;
    }).slice(skip, skip + take);
  };
}
export const prisma = {
  facilityCandidate: {
    findMany: list('candidates'),
    groupBy: async () => { memory.statsCalls++; throw new Error('map must not load stats'); },
    count: async () => { memory.statsCalls++; throw new Error('map must not load stats'); },
  },
  venue: { findMany: list('venues') },
  org: { findMany: list('orgs') },
};
