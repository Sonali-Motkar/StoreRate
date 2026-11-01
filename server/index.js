import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import session from 'express-session';
import { Pool } from 'pg';
import { z } from 'zod';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || (!production ? 'development-only-change-this-secret' : '');
if (!sessionSecret) throw new Error('SESSION_SECRET is required in production.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: production ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '32kb' }));

const PgStore = connectPgSimple(session);
app.use(session({
  name: 'storerate.sid',
  store: new PgStore({ pool, tableName: 'sessions', createTableIfMissing: true }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

const roleNames = { admin: 'Admin', customer: 'Customer', store_owner: 'Store owner' };
const passwordSchema = z.string().min(8).max(16).regex(/[A-Z]/, 'Include at least one uppercase letter.').regex(/[^A-Za-z0-9]/, 'Include at least one special character.');
const nameSchema = z.string().trim().min(20).max(60);
const addressSchema = z.string().trim().max(400);
const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const signupSchema = z.object({ name: nameSchema, email: emailSchema, address: addressSchema.min(1), password: passwordSchema });
const adminUserSchema = signupSchema.extend({ role: z.enum(['admin', 'customer', 'store_owner']) });
const storeSchema = z.object({ name: nameSchema, email: emailSchema, address: addressSchema.min(1), ownerEmail: emailSchema.optional().or(z.literal('')) });
const sendError = (res, status, error) => res.status(status).json({ error });
const validate = (schema, body) => {
  const result = schema.safeParse(body);
  return result.success ? { data: result.data } : { error: result.error.issues[0]?.message || 'Invalid request.' };
};

function requireAuth(req, res, next) {
  if (!req.session.user) return sendError(res, 401, 'Please sign in to continue.');
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return sendError(res, 401, 'Please sign in to continue.');
    if (!roles.includes(req.session.user.role)) return sendError(res, 403, 'You do not have permission to do that.');
    next();
  };
}

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.get('origin')) return next();
  const ownOrigin = `${req.protocol}://${req.get('host')}`;
  const configuredOrigins = [process.env.APP_ORIGIN, process.env.RENDER_EXTERNAL_URL, ...(!production ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])].filter(Boolean);
  if (req.get('origin') !== ownOrigin && !configuredOrigins.includes(req.get('origin'))) {
    return sendError(res, 403, 'Request origin is not allowed.');
  }
  next();
});

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { sendError(res, 503, 'Database is not available.'); }
});

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const parsed = validate(signupSchema, req.body);
    if (parsed.error) return sendError(res, 400, parsed.error);
    const { name, email, address, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, address, password_hash, role)
       VALUES ($1, $2, $3, $4, 'customer')
       ON CONFLICT (email) DO NOTHING
       RETURNING id, name, email, address, role`,
      [name, email, address, passwordHash],
    );
    if (!result.rowCount) return sendError(res, 409, 'An account with this email already exists.');
    const user = result.rows[0];
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.user = { id: user.id, role: user.role };
    res.status(201).json({ user: { ...user, roleLabel: roleNames[user.role] } });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = emailSchema.safeParse(req.body?.email);
    const password = z.string().min(1).max(100).safeParse(req.body?.password);
    if (!email.success || !password.success) return sendError(res, 400, 'Enter a valid email and password.');
    const result = await pool.query('SELECT id, name, email, address, role, password_hash FROM users WHERE email = $1', [email.data]);
    const record = result.rows[0];
    if (!record || !(await bcrypt.compare(password.data, record.password_hash))) return sendError(res, 401, 'Email or password is incorrect.');
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.user = { id: record.id, role: record.role };
    const { password_hash: _passwordHash, ...user } = record;
    res.json({ user: { ...user, roleLabel: roleNames[user.role] } });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name, email, address, role FROM users WHERE id = $1', [req.session.user.id]);
    if (!result.rowCount) return req.session.destroy(() => sendError(res, 401, 'Session has expired. Please sign in again.'));
    res.json({ user: { ...result.rows[0], roleLabel: roleNames[result.rows[0].role] } });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', requireAuth, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('storerate.sid', { httpOnly: true, secure: production, sameSite: 'lax' });
    res.status(204).end();
  });
});

app.put('/api/auth/password', requireAuth, async (req, res, next) => {
  try {
    const current = z.string().min(1).max(100).safeParse(req.body?.currentPassword);
    const nextPassword = passwordSchema.safeParse(req.body?.newPassword);
    if (!current.success || !nextPassword.success) return sendError(res, 400, nextPassword.error?.issues[0]?.message || 'Enter your current and new passwords.');
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.user.id]);
    if (!result.rowCount || !(await bcrypt.compare(current.data, result.rows[0].password_hash))) return sendError(res, 400, 'Current password is incorrect.');
    const hash = await bcrypt.hash(nextPassword.data, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.user.id]);
    res.json({ message: 'Password updated.' });
  } catch (error) { next(error); }
});

const sortOptions = { name: 's.name', address: 's.address', rating: 'average_rating', email: 's.email' };
app.get('/api/stores', requireAuth, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 200);
    const sortBy = sortOptions[String(req.query.sortBy)] || 's.name';
    const direction = String(req.query.order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const result = await pool.query(
      `SELECT s.id, s.name, s.email, s.address, s.created_at,
              COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::float AS average_rating,
              COUNT(r.id)::int AS ratings_count,
              MAX(r.rating) FILTER (WHERE r.user_id = $1)::int AS my_rating,
              u.id AS owner_id, u.name AS owner_name
       FROM stores s
       LEFT JOIN ratings r ON r.store_id = s.id
       LEFT JOIN users u ON u.id = s.owner_id
       WHERE ($2 = '' OR s.name ILIKE '%' || $2 || '%' OR s.address ILIKE '%' || $2 || '%' OR s.email ILIKE '%' || $2 || '%')
       GROUP BY s.id, u.id
       ORDER BY ${sortBy} ${direction}, s.name ASC`,
      [req.session.user.id, search],
    );
    res.json({ stores: result.rows });
  } catch (error) { next(error); }
});

app.put('/api/stores/:storeId/rating', requireRole('customer'), async (req, res, next) => {
  try {
    const parsed = z.object({ rating: z.number().int().min(1).max(5) }).safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, 'Rating must be a whole number from 1 to 5.');
    const result = await pool.query(
      `INSERT INTO ratings (user_id, store_id, rating)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, store_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()
       RETURNING id, rating, created_at, updated_at`,
      [req.session.user.id, req.params.storeId, parsed.data.rating],
    );
    res.json({ rating: result.rows[0] });
  } catch (error) {
    if (error.code === '23503') return sendError(res, 404, 'Store not found.');
    next(error);
  }
});

app.get('/api/admin/dashboard', requireRole('admin'), async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM users) AS total_users,
              (SELECT COUNT(*)::int FROM stores) AS total_stores,
              (SELECT COUNT(*)::int FROM ratings) AS total_ratings,
              (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::float FROM ratings) AS average_rating`,
    );
    const trend = await pool.query(
      `SELECT TO_CHAR(days.day, 'Dy') AS label, COUNT(r.id)::int AS count
       FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') AS days(day)
       LEFT JOIN ratings r ON r.created_at >= days.day AND r.created_at < days.day + INTERVAL '1 day'
       GROUP BY days.day ORDER BY days.day`,
    );
    res.json({ ...result.rows[0], daily_ratings: trend.rows });
  } catch (error) { next(error); }
});

app.get('/api/admin/users', requireRole('admin'), async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 200);
    const role = ['admin', 'customer', 'store_owner'].includes(req.query.role) ? req.query.role : '';
    const sortBy = { name: 'u.name', email: 'u.email', address: 'u.address', role: 'u.role', created_at: 'u.created_at' }[String(req.query.sortBy)] || 'u.name';
    const direction = String(req.query.order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.address, u.role, u.created_at,
              CASE WHEN u.role = 'store_owner' THEN COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::float END AS owner_rating
       FROM users u
       LEFT JOIN stores s ON s.owner_id = u.id
       LEFT JOIN ratings r ON r.store_id = s.id
       WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%' OR u.address ILIKE '%' || $1 || '%')
         AND ($2 = '' OR u.role = $2)
       GROUP BY u.id
       ORDER BY ${sortBy} ${direction}, u.name ASC`,
      [search, role],
    );
    res.json({ users: result.rows.map(user => ({ ...user, roleLabel: roleNames[user.role] })) });
  } catch (error) { next(error); }
});

app.post('/api/admin/users', requireRole('admin'), async (req, res, next) => {
  try {
    const parsed = validate(adminUserSchema, req.body);
    if (parsed.error) return sendError(res, 400, parsed.error);
    const { name, email, address, password, role } = parsed.data;
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, address, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, name, email, address, role, created_at`,
      [name, email, address, hash, role],
    );
    if (!result.rowCount) return sendError(res, 409, 'An account with this email already exists.');
    res.status(201).json({ user: { ...result.rows[0], roleLabel: roleNames[role] } });
  } catch (error) { next(error); }
});

app.post('/api/admin/stores', requireRole('admin'), async (req, res, next) => {
  try {
    const parsed = validate(storeSchema, req.body);
    if (parsed.error) return sendError(res, 400, parsed.error);
    const { name, email, address, ownerEmail } = parsed.data;
    let ownerId = null;
    if (ownerEmail) {
      const owner = await pool.query('SELECT id FROM users WHERE email = $1 AND role = $2', [ownerEmail, 'store_owner']);
      if (!owner.rowCount) return sendError(res, 400, 'Add a store owner account before assigning them to this store.');
      ownerId = owner.rows[0].id;
    }
    const result = await pool.query(
      'INSERT INTO stores (owner_id, name, email, address) VALUES ($1, $2, $3, $4) RETURNING id, owner_id, name, email, address, created_at',
      [ownerId, name, email, address],
    );
    res.status(201).json({ store: result.rows[0] });
  } catch (error) { next(error); }
});

app.get('/api/owner/dashboard', requireRole('store_owner'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.name, s.email, s.address,
              COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)::float AS average_rating,
              COUNT(r.id)::int AS ratings_count
       FROM stores s LEFT JOIN ratings r ON r.store_id = s.id
       WHERE s.owner_id = $1 GROUP BY s.id ORDER BY s.name`,
      [req.session.user.id],
    );
    const stores = await Promise.all(result.rows.map(async store => {
      const ratings = await pool.query(
        `SELECT r.id, r.rating, r.created_at, r.updated_at,
                u.id AS user_id, u.name AS user_name, u.email AS user_email
         FROM ratings r JOIN users u ON u.id = r.user_id
         WHERE r.store_id = $1 ORDER BY r.updated_at DESC`,
        [store.id],
      );
      return { ...store, ratings: ratings.rows };
    }));
    res.json({ stores });
  } catch (error) { next(error); }
});

const demoStores = [
  ['The Himalayan Brew House', 'hello@himalayanbrew.example', 'Old Manali Road, Manali, Himachal Pradesh'],
  ["Cloud’s End Mountain Café", 'hello@cloudsend.example', 'Library Bazaar, The Mall Road, Mussoorie, Uttarakhand'],
  ['Dal Lake Coffee House', 'hello@dallakecoffee.example', 'Boulevard Road, Srinagar, Jammu and Kashmir'],
  ['Pine & Peak View Café', 'hello@pineandpeak.example', 'Jogiwara Road, McLeod Ganj, Dharamshala, Himachal Pradesh'],
  ['Parvati Riverside Café', 'hello@parvatiriverside.example', 'Kasol Market, Kasol, Himachal Pradesh'],
];

async function initialize() {
  const schema = await fs.readFile(path.join(root, 'server', 'schema.sql'), 'utf8');
  await pool.query(schema);
  for (const [name, email, address] of demoStores) {
    await pool.query('INSERT INTO stores (name, email, address) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [name, email, address]);
  }
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const validEmail = emailSchema.safeParse(adminEmail);
    if (!validEmail.success) throw new Error('ADMIN_EMAIL must be a valid email address.');
    const checked = passwordSchema.safeParse(adminPassword);
    if (!checked.success) throw new Error(`ADMIN_PASSWORD: ${checked.error.issues[0].message}`);
    const adminName = (process.env.ADMIN_NAME || 'Sonal Motkar Platform Administrator').trim();
    const validName = nameSchema.safeParse(adminName);
    if (!validName.success) throw new Error('ADMIN_NAME must contain 20 to 60 characters.');
    const hash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      `INSERT INTO users (name, email, address, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin') ON CONFLICT (email) DO NOTHING`,
      [validName.data, validEmail.data, process.env.ADMIN_ADDRESS || 'India', hash],
    );
  }
}

app.use('/api', (req, res) => sendError(res, 404, `No API route for ${req.method} ${req.path}.`));
app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: production ? '1h' : 0 }));
app.get(/.*/, async (_req, res, next) => {
  try { await fs.access(path.join(root, 'dist', 'index.html')); res.sendFile(path.join(root, 'dist', 'index.html')); }
  catch { sendError(res, 503, 'Frontend has not been built yet.'); }
});

app.use((error, _req, res, _next) => {
  if (error.code === '23505') return sendError(res, 409, 'That email address is already in use.');
  if (error.code === '22P02') return sendError(res, 400, 'Invalid identifier.');
  console.error(error);
  sendError(res, 500, 'Something went wrong. Please try again.');
});

initialize().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`StoreRate listening on port ${port}`));
}).catch(error => {
  console.error('StoreRate startup failed:', error);
  process.exit(1);
});
