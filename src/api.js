export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

export const roleLabel = role => ({ admin: 'Admin', customer: 'Customer', store_owner: 'Store owner' }[role] || role);

export function mapStore(store, index = 0) {
  const colors = ['mint', 'peach', 'lavender', 'sage', 'blue'];
  return {
    ...store,
    rating: Number(store.average_rating || 0),
    ratings: Number(store.ratings_count || 0),
    myRating: Number(store.my_rating || 0),
    category: 'Coffee & cafés',
    color: colors[index % colors.length],
    initials: store.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(),
  };
}

export function mapUser(user, index = 0) {
  const colors = ['rose', 'blue', 'peach', 'lavender', 'mint', 'sage'];
  return {
    ...user,
    role: user.roleLabel || roleLabel(user.role),
    status: 'Active',
    joined: new Date(user.created_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    initials: user.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(),
    color: colors[index % colors.length],
  };
}
