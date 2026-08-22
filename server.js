/**
 * server.js - CineClassify Pro
 *
 * Servidor HTTP (cero dependencias):
 *  - Sirve la SPA estática (reemplaza a http-server)
 *  - API REST /api/* respaldada por SQLite real (node:sqlite)
 *
 * Ejecutar:  node --experimental-sqlite server.js
 *
 * La base de datos vive en data/cineclassify.db (disco, no navegador).
 */

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(ROOT, 'data');
const DB_PATH = join(DATA_DIR, 'cineclassify.db');
const PORT = Number(process.env.PORT) || 3000;

// =====================================================
// SQLITE (esquema relacional con triggers SQL reales)
// =====================================================
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'movie',
    title TEXT NOT NULL,
    release_year INTEGER NOT NULL,
    genre_ids TEXT NOT NULL DEFAULT '[]',
    synopsis TEXT NOT NULL DEFAULT '',
    director TEXT NOT NULL DEFAULT '',
    cast TEXT NOT NULL DEFAULT '',
    duration TEXT NOT NULL DEFAULT '',
    age_rating TEXT NOT NULL DEFAULT 'PG',
    image TEXT NOT NULL DEFAULT '',
    average_rating REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, media_id)
);

CREATE TABLE IF NOT EXISTS tier_states (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    UNIQUE (user_id, media_id)
);

CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, media_id)
);

CREATE TABLE IF NOT EXISTS watch_status (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'no_vista',
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, media_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Trigger: recalcular rating/contador de media al insertar una reseña
CREATE TRIGGER IF NOT EXISTS trg_reviews_insert AFTER INSERT ON reviews
BEGIN
    UPDATE media SET
        average_rating = ROUND((SELECT AVG(rating) FROM reviews WHERE media_id = NEW.media_id), 2),
        review_count   = (SELECT COUNT(*) FROM reviews WHERE media_id = NEW.media_id),
        updated_at     = NEW.created_at
    WHERE id = NEW.media_id;
END;

-- Trigger: recalcular al actualizar una reseña
CREATE TRIGGER IF NOT EXISTS trg_reviews_update AFTER UPDATE ON reviews
BEGIN
    UPDATE media SET
        average_rating = ROUND((SELECT AVG(rating) FROM reviews WHERE media_id = NEW.media_id), 2),
        review_count   = (SELECT COUNT(*) FROM reviews WHERE media_id = NEW.media_id),
        updated_at     = NEW.created_at
    WHERE id = NEW.media_id;
END;

-- Trigger: recalcular al eliminar una reseña
CREATE TRIGGER IF NOT EXISTS trg_reviews_delete AFTER DELETE ON reviews
BEGIN
    UPDATE media SET
        average_rating = ROUND((SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE media_id = OLD.media_id), 2),
        review_count   = (SELECT COUNT(*) FROM reviews WHERE media_id = OLD.media_id),
        updated_at     = datetime('now')
    WHERE id = OLD.media_id;
END;
`);

// =====================================================
// UTILIDADES
// =====================================================
const now = () => new Date().toISOString();

function mapMedia(row) {
    if (!row) return null;
    let genre_ids = [];
    try { genre_ids = JSON.parse(row.genre_ids || '[]'); } catch { /* noop */ }
    return { ...row, genre_ids };
}

function publicUser(row) {
    if (!row) return null;
    return { id: row.id, username: row.username, email: row.email, role: row.role, created_at: row.created_at };
}

// Hash simple (mismo algoritmo que la app original; en producción: bcrypt)
function simpleHash(password) {
    let hash = 0;
    const pwdStr = String(password);
    const len = pwdStr.length;
    for (let i = 0; i < len; i++) {
        hash = ((hash << 5) - hash) + pwdStr.charCodeAt(i);
        hash |= 0;
    }
    return `$simhash$${Math.abs(hash).toString(16)}$${Buffer.from(pwdStr).toString('base64')}`;
}

function getToken(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function getAuthUser(req) {
    const token = getToken(req);
    if (!token) return null;
    return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token) || null;
}

function send(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
}
const ok = (res, payload) => send(res, 200, payload);
const fail = (res, status, error) => send(res, status, { error });

function readBody(req) {
    return new Promise((resolvePromise) => {
        let body = '';
        req.on('data', (c) => {
            body += c;
            if (body.length > 1e6) req.destroy();
        });
        req.on('end', () => {
            try { resolvePromise(body ? JSON.parse(body) : {}); }
            catch { resolvePromise({}); }
        });
        req.on('error', () => resolvePromise({}));
    });
}

function requireUser(res, user) {
    if (!user) { send(res, 401, { error: 'Debes iniciar sesión para realizar esta acción.' }); return false; }
    return true;
}

function requireAdmin(res, user) {
    if (!requireUser(res, user)) return false;
    if (user.role !== 'admin') { send(res, 403, { error: 'No tienes permisos para realizar esta acción.' }); return false; }
    return true;
}

// =====================================================
// SEED DATA (primera ejecución)
// =====================================================
function seedIfEmpty() {
    const count = db.prepare('SELECT COUNT(*) AS c FROM genres').get()?.c ?? 0;
    if (count > 0) return;

    const genres = ['Sci-Fi', 'Drama', 'Acción', 'Thriller', 'Fantasía', 'Terror', 'Comedia', 'Romance', 'Animación', 'Documental'];
    const insGenre = db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)');
    genres.forEach((name, i) => insGenre.run(i + 1, name));

    const insUser = db.prepare('INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insUser.run(randomUUID(), 'admin', 'admin@cineclassify.com', simpleHash('admin123'), 'admin', now());
    insUser.run(randomUUID(), 'demo', 'demo@cineclassify.com', simpleHash('demo123'), 'user', now());

    const insMedia = db.prepare(`
        INSERT INTO media (id, type, title, release_year, genre_ids, synopsis, director, cast, duration, age_rating, image, average_rating, review_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `);
    const mediaData = [
        { type:'movie', title:'La Quinta Ola', release_year:2016, genre_ids:[1,3], synopsis:'Cuatro oleadas de devastadores ataques extraterrestres han diezmado la Tierra. Cassie Sullivan lleva una lucha solitaria por encontrar a su hermano pequeño.', director:'J Blakeson', cast:'Chloë Grace Moretz, Nick Robinson, Liev Schreiber', duration:'112 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1618666012174-83b441c0bc76?q=80&w=300&auto=format&fit=crop' },
        { type:'movie', title:'Interstellar', release_year:2014, genre_ids:[1,2], synopsis:'Un equipo de exploradores viaja a través de un agujero de gusano en el espacio interestelar para asegurar la supervivencia de la humanidad.', director:'Christopher Nolan', cast:'Matthew McConaughey, Anne Hathaway, Jessica Chastain', duration:'169 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=300&auto=format&fit=crop' },
        { type:'movie', title:'Inception', release_year:2010, genre_ids:[1,4], synopsis:'Un ladrón que roba secretos corporativos a través del uso de la tecnología de compartir sueños recibe la tarea inversa de plantar una idea en la mente de un CEO.', director:'Christopher Nolan', cast:'Leonardo DiCaprio, Elliot Page, Tom Hardy', duration:'148 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1518773553398-650c184e0bb3?q=80&w=300&auto=format&fit=crop' },
        { type:'movie', title:'The Matrix', release_year:1999, genre_ids:[1,3], synopsis:'Un hacker descubre que el mundo entero es una simulación diseñada por máquinas para controlar a la humanidad.', director:'Lana y Lilly Wachowski', cast:'Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss', duration:'136 min', age_rating:'R', image:'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=300&auto=format&fit=crop' },
        { type:'movie', title:'El Padrino', release_year:1972, genre_ids:[2,4], synopsis:'El patriarca envejecido de una dinastía del crimen organizado transfiere el control de su imperio clandestino a su hijo a regañadientes.', director:'Francis Ford Coppola', cast:'Marlon Brando, Al Pacino, James Caan', duration:'175 min', age_rating:'R', image:'https://images.unsplash.com/photo-1589315486255-80f49c06180a?q=80&w=300&auto=format&fit=crop' },
        { type:'movie', title:'Avengers: Endgame', release_year:2019, genre_ids:[3,5], synopsis:'Tras los devastadores eventos de Infinity War, los Vengadores se reúnen para revertir las acciones de Thanos.', director:'Anthony y Joe Russo', cast:'Robert Downey Jr., Chris Evans, Scarlett Johansson', duration:'181 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1608346128025-1896b97a6fa7?q=80&w=300&auto=format&fit=crop' },
        { type:'series', title:'Breaking Bad', release_year:2008, genre_ids:[2,4], synopsis:'Un profesor de química con cáncer se une a un ex alumno para fabricar y vender metanfetamina con el fin de asegurar el futuro de su familia.', director:'Vince Gilligan', cast:'Bryan Cranston, Aaron Paul, Anna Gunn', duration:'45-47 min/ep', age_rating:'TV-MA', image:'https://images.unsplash.com/photo-1546960814-7f287413a1fa?q=80&w=300&auto=format&fit=crop' },
        { type:'series', title:'Stranger Things', release_year:2016, genre_ids:[1,6,5], synopsis:'Cuando un niño desaparece, sus amigos, su familia y la policía descubren un misterio con experimentos secretos, fuerzas sobrenaturales y una niña.', director:'Hermanos Duffer', cast:'Millie Bobby Brown, Finn Wolfhard, Winona Ryder', duration:'42-77 min/ep', age_rating:'TV-14', image:'https://images.unsplash.com/photo-1618683525164-84c47b59616e?q=80&w=300&auto=format&fit=crop' },
        { type:'series', title:'Game of Thrones', release_year:2011, genre_ids:[5,2,3], synopsis:'Nueve familias nobles luchan por el control de las tierras míticas de Westeros mientras una antigua amenaza regresa del norte.', director:'David Benioff, D.B. Weiss', cast:'Emilia Clarke, Peter Dinklage, Kit Harington', duration:'50-80 min/ep', age_rating:'TV-MA', image:'https://images.unsplash.com/photo-1596781427506-4b68e7ec8930?q=80&w=300&auto=format&fit=crop' },
        { type:'series', title:'Dark', release_year:2017, genre_ids:[1,4,2], synopsis:'Un misterio de niños desaparecidos expone una doble vida de adultos y los bucles temporales de cuatro familias interconectadas en una ciudad alemana.', director:'Baran bo Odar', cast:'Louis Hofmann, Oliver Masucci, Karoline Eichhorn', duration:'45-60 min/ep', age_rating:'TV-MA', image:'https://images.unsplash.com/photo-1519097729895-c8e874052309?q=80&w=300&auto=format&fit=crop' },
    ];
    mediaData.forEach((m) => {
        const ts = now();
        insMedia.run(randomUUID(), m.type, m.title, m.release_year, JSON.stringify(m.genre_ids), m.synopsis, m.director, m.cast, m.duration, m.age_rating, m.image, ts, ts);
    });

    const insReview = db.prepare('INSERT INTO reviews (id, user_id, media_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const rows = db.prepare('SELECT id, title FROM media ORDER BY created_at').all();
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r.id]));
    const adminId = db.prepare('SELECT id FROM users WHERE username = ?').get('admin').id;
    const demoId = db.prepare('SELECT id FROM users WHERE username = ?').get('demo').id;

    const reviewsData = [
        { user: adminId, media: 'La Quinta Ola', rating: 8, comment: 'Excelente adaptación del libro. La acción es increíble.' },
        { user: demoId,  media: 'La Quinta Ola', rating: 7, comment: 'Buena película, aunque podría tener más profundidad.' },
        { user: adminId, media: 'Interstellar', rating: 10, comment: 'Obra maestra del cine moderno. Visualmente espectacular.' },
        { user: demoId,  media: 'Interstellar', rating: 9, comment: 'Una de las mejores del siglo, sin duda.' },
        { user: adminId, media: 'Inception', rating: 9, comment: 'Nolan en su máximo esplendor. Imprescindible.' },
        { user: adminId, media: 'Breaking Bad', rating: 10, comment: 'La mejor serie de televisión jamás hecha. Punto.' },
        { user: demoId,  media: 'Breaking Bad', rating: 10, comment: 'Bryan Cranston merecía todos los Emmy.' },
        { user: adminId, media: 'Stranger Things', rating: 9, comment: 'Perfecta mezcla de terror y nostalgia de los 80.' },
        { user: adminId, media: 'Game of Thrones', rating: 8, comment: 'Las primeras 6 temporadas son perfectas.' },
    ];
    reviewsData.forEach((r) => {
        insReview.run(randomUUID(), r.user, byTitle[r.media], r.rating, r.comment, now());
    });
}

seedIfEmpty();

// =====================================================
// API REST
// =====================================================
const routes = [];

// ---- AUTH ----
routes.push({
    method: 'POST', pattern: /^\/api\/auth\/register$/,
    handler: async (req, res, m, user, body) => {
        const { username, email, password } = body;
        if (!username || String(username).length < 3) return send(res, 400, { error: 'El usuario debe tener al menos 3 caracteres.' });
        if (!email || !String(email).includes('@')) return send(res, 400, { error: 'Email inválido.' });
        if (!password || String(password).length < 4) return send(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });

        const existing = db.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?').get(String(username), String(email));
        if (existing) {
            return send(res, 400, { error: existing.username === String(username) ? 'El nombre de usuario ya existe.' : 'El email ya está registrado.' });
        }

        const id = randomUUID();
        db.prepare('INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, String(username), String(email), simpleHash(password), 'user', now());
        const token = randomUUID();
        db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, id, now());
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        return ok(res, { data: { user: publicUser(row), token } });
    }
});

routes.push({
    method: 'POST', pattern: /^\/api\/auth\/login$/,
    handler: async (req, res, m, user, body) => {
        const { username, password } = body;
        if (!username || !password) return send(res, 400, { error: 'Completa todos los campos.' });
        const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username));
        if (!row) return send(res, 401, { error: 'Usuario no encontrado.' });
        if (simpleHash(password) !== row.password_hash) return send(res, 401, { error: 'Contraseña incorrecta.' });
        const token = randomUUID();
        db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, row.id, now());
        return ok(res, { data: { user: publicUser(row), token } });
    }
});

routes.push({
    method: 'POST', pattern: /^\/api\/auth\/logout$/,
    handler: async (req, res) => {
        const token = getToken(req);
        if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return ok(res, { success: true });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/auth\/me$/,
    handler: async (req, res, m, user) => {
        if (!requireUser(res, user)) return;
        return ok(res, { data: { user: publicUser(user) } });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/auth\/users$/,
    handler: async (req, res, m, user) => {
        if (!requireAdmin(res, user)) return;
        const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all();
        return ok(res, { data: rows.map(publicUser) });
    }
});

routes.push({
    method: 'PATCH', pattern: /^\/api\/auth\/users\/([^/]+)\/role$/,
    handler: async (req, res, m, user, body) => {
        if (!requireAdmin(res, user)) return;
        const targetId = m[1];
        if (targetId === user.id) return send(res, 400, { error: 'No puedes cambiar tu propio rol.' });
        const role = body.role;
        if (!['user', 'admin'].includes(role)) return send(res, 400, { error: 'Rol inválido.' });
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
        return ok(res, { success: true });
    }
});

routes.push({
    method: 'DELETE', pattern: /^\/api\/auth\/users\/([^/]+)$/,
    handler: async (req, res, m, user) => {
        if (!requireAdmin(res, user)) return;
        const targetId = m[1];
        if (targetId === user.id) return send(res, 400, { error: 'No puedes eliminar tu propia cuenta.' });
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM reviews WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM tier_states WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM watchlist WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM watch_status WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
        return ok(res, { success: true });
    }
});

// ---- CATÁLOGO / MEDIA ----
routes.push({
    method: 'GET', pattern: /^\/api\/media$/,
    handler: async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const p = url.searchParams;
        const query = p.get('query') || '';
        const type = p.get('type') || 'all';
        const genre_id = p.get('genre_id') || null;
        const year = p.get('year') || null;
        const director = p.get('director') || '';
        const min_rating = parseFloat(p.get('min_rating') || '0') || 0;
        const sort = p.get('sort') || 'title';
        const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') || '20', 10) || 20));

        const conds = [];
        const args = [];
        if (type !== 'all') { conds.push('type = ?'); args.push(type); }
        if (genre_id) {
            conds.push('EXISTS (SELECT 1 FROM json_each(genre_ids) WHERE json_each.value = ?)');
            args.push(parseInt(genre_id, 10));
        }
        if (year) { conds.push('release_year = ?'); args.push(parseInt(year, 10)); }
        if (min_rating > 0) { conds.push('average_rating >= ?'); args.push(min_rating); }
        if (director) { conds.push('director LIKE ?'); args.push(`%${director}%`); }
        if (query) {
            const like = `%${query}%`;
            conds.push('(title LIKE ? OR synopsis LIKE ? OR cast LIKE ? OR director LIKE ?)');
            args.push(like, like, like, like);
        }
        const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';

        const orderMap = {
            rating: 'average_rating DESC, review_count DESC',
            year: 'release_year DESC',
            reviews: 'review_count DESC',
            title: 'title COLLATE NOCASE ASC'
        };
        const orderBy = orderMap[sort] || orderMap.title;

        const total = db.prepare(`SELECT COUNT(*) AS c FROM media${where}`).get(...args)?.c ?? 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const rows = db.prepare(`SELECT * FROM media${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
            .all(...args, limit, (page - 1) * limit);

        return ok(res, { data: rows.map(mapMedia), total, page, totalPages, limit });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/media\/([^/]+)\/reviews$/,
    handler: async (req, res, m) => {
        const rows = db.prepare(`
            SELECT r.id, r.user_id, r.media_id, r.rating, r.comment, r.created_at, u.username
            FROM reviews r JOIN users u ON u.id = r.user_id
            WHERE r.media_id = ? ORDER BY r.created_at DESC
        `).all(m[1]);
        return ok(res, { data: rows });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/media\/([^/]+)\/recommendations$/,
    handler: async (req, res, m) => {
        const media = db.prepare('SELECT * FROM media WHERE id = ?').get(m[1]);
        if (!media) return ok(res, { data: [] });
        const rows = db.prepare(`
            SELECT * FROM media
            WHERE id <> ?
              AND (director <> '' AND director = ?
                   OR EXISTS (SELECT 1 FROM json_each(genre_ids) WHERE json_each.value IN (SELECT value FROM json_each(?))))
            ORDER BY average_rating DESC
            LIMIT 8
        `).all(media.id, media.director || '', media.genre_ids || '[]');
        return ok(res, { data: rows.map(mapMedia) });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/media\/([^/]+)$/,
    handler: async (req, res, m) => {
        const row = db.prepare('SELECT * FROM media WHERE id = ?').get(m[1]);
        if (!row) return send(res, 404, { error: 'Contenido no encontrado.' });
        return ok(res, { data: mapMedia(row) });
    }
});

routes.push({
    method: 'POST', pattern: /^\/api\/media$/,
    handler: async (req, res, m, user, body) => {
        if (!requireUser(res, user)) return;
        if (!body.title) return send(res, 400, { error: 'El título es obligatorio.' });
        if (!body.release_year) return send(res, 400, { error: 'El año de estreno es obligatorio.' });
        const id = randomUUID();
        const ts = now();
        db.prepare(`
            INSERT INTO media (id, type, title, release_year, genre_ids, synopsis, director, cast, duration, age_rating, image, average_rating, review_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        `).run(
            id, body.type || 'movie', String(body.title), parseInt(body.release_year, 10) || new Date().getFullYear(),
            JSON.stringify(body.genre_ids || []), body.synopsis || '', body.director || '', body.cast || '',
            body.duration || '', body.age_rating || 'PG', body.image || '', ts, ts
        );
        const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
        return ok(res, { data: mapMedia(row) });
    }
});

routes.push({
    method: 'PUT', pattern: /^\/api\/media\/([^/]+)$/,
    handler: async (req, res, m, user, body) => {
        if (!requireAdmin(res, user)) return;
        const existing = db.prepare('SELECT * FROM media WHERE id = ?').get(m[1]);
        if (!existing) return send(res, 404, { error: 'Media no encontrada.' });

        const fields = ['type', 'title', 'release_year', 'synopsis', 'director', 'cast', 'duration', 'age_rating', 'image'];
        const sets = [];
        const args = [];
        for (const f of fields) {
            if (body[f] !== undefined) {
                sets.push(`${f} = ?`);
                args.push(f === 'release_year' ? (parseInt(body[f], 10) || existing.release_year) : String(body[f]));
            }
        }
        if (body.genre_ids !== undefined) {
            sets.push('genre_ids = ?');
            args.push(JSON.stringify(body.genre_ids || []));
        }
        sets.push('updated_at = ?');
        args.push(now());
        args.push(m[1]);
        db.prepare(`UPDATE media SET ${sets.join(', ')} WHERE id = ?`).run(...args);
        const row = db.prepare('SELECT * FROM media WHERE id = ?').get(m[1]);
        return ok(res, { data: mapMedia(row) });
    }
});

routes.push({
    method: 'DELETE', pattern: /^\/api\/media\/([^/]+)$/,
    handler: async (req, res, m, user) => {
        if (!requireAdmin(res, user)) return;
        db.prepare('DELETE FROM media WHERE id = ?').run(m[1]);
        db.prepare('DELETE FROM reviews WHERE media_id = ?').run(m[1]);
        db.prepare('DELETE FROM tier_states WHERE media_id = ?').run(m[1]);
        db.prepare('DELETE FROM watchlist WHERE media_id = ?').run(m[1]);
        db.prepare('DELETE FROM watch_status WHERE media_id = ?').run(m[1]);
        return ok(res, { success: true });
    }
});

// ---- GENRES / TOP / STATS ----
routes.push({
    method: 'GET', pattern: /^\/api\/genres$/,
    handler: async (req, res) => {
        const rows = db.prepare('SELECT * FROM genres ORDER BY id').all();
        return ok(res, { data: rows });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/top$/,
    handler: async (req, res) => {
        const movies = db.prepare(`
            SELECT * FROM media WHERE type = 'movie' AND review_count > 0
            ORDER BY average_rating DESC, review_count DESC LIMIT 10
        `).all().map(mapMedia);
        const series = db.prepare(`
            SELECT * FROM media WHERE type = 'series' AND review_count > 0
            ORDER BY average_rating DESC, review_count DESC LIMIT 10
        `).all().map(mapMedia);
        return ok(res, { movies, series });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/stats$/,
    handler: async (req, res) => {
        const totalMovies = db.prepare("SELECT COUNT(*) AS c FROM media WHERE type = 'movie'").get().c;
        const totalSeries = db.prepare("SELECT COUNT(*) AS c FROM media WHERE type = 'series'").get().c;
        const totalReviews = db.prepare('SELECT COUNT(*) AS c FROM reviews').get().c;
        const totalUsers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role <> 'admin'").get().c;
        const topByReviews = db.prepare('SELECT * FROM media ORDER BY review_count DESC LIMIT 5').all().map(mapMedia);
        const topByRating = db.prepare('SELECT * FROM media WHERE review_count > 0 ORDER BY average_rating DESC LIMIT 5').all().map(mapMedia);
        return ok(res, { totalMovies, totalSeries, totalReviews, totalUsers, topByReviews, topByRating });
    }
});

// ---- DATOS DEL USUARIO DE LA SESIÓN ----
routes.push({
    method: 'GET', pattern: /^\/api\/me\/lists$/,
    handler: async (req, res, m, user) => {
        if (!requireUser(res, user)) return;
        const watchlistIds = db.prepare('SELECT media_id FROM watchlist WHERE user_id = ?').all(user.id).map(r => r.media_id);
        const statuses = {};
        db.prepare('SELECT media_id, status FROM watch_status WHERE user_id = ?').all(user.id).forEach(r => { statuses[r.media_id] = r.status; });
        const reviews = {};
        db.prepare('SELECT id, media_id, rating, comment, created_at FROM reviews WHERE user_id = ?').all(user.id).forEach(r => { reviews[r.media_id] = r; });
        return ok(res, { watchlistIds, statuses, reviews });
    }
});

routes.push({
    method: 'POST', pattern: /^\/api\/watchlist\/([^/]+)$/,
    handler: async (req, res, m, user) => {
        if (!requireUser(res, user)) return;
        const mediaId = m[1];
        const existing = db.prepare('SELECT id FROM watchlist WHERE user_id = ? AND media_id = ?').get(user.id, mediaId);
        if (existing) {
            db.prepare('DELETE FROM watchlist WHERE id = ?').run(existing.id);
            return ok(res, { added: false });
        }
        db.prepare('INSERT INTO watchlist (id, user_id, media_id, created_at) VALUES (?, ?, ?, ?)')
            .run(randomUUID(), user.id, mediaId, now());
        return ok(res, { added: true });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/watchlist$/,
    handler: async (req, res, m, user) => {
        if (!requireUser(res, user)) return;
        const rows = db.prepare(`
            SELECT m.* FROM watchlist w JOIN media m ON m.id = w.media_id
            WHERE w.user_id = ? ORDER BY w.created_at DESC
        `).all(user.id).map(mapMedia);
        return ok(res, { data: rows });
    }
});

routes.push({
    method: 'POST', pattern: /^\/api\/watch-status\/([^/]+)$/,
    handler: async (req, res, m, user, body) => {
        if (!requireUser(res, user)) return;
        const valid = ['no_vista', 'en_proceso', 'vista'];
        const st = valid.includes(body.status) ? body.status : 'no_vista';
        db.prepare(`
            INSERT INTO watch_status (id, user_id, media_id, status, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id, media_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
        `).run(randomUUID(), user.id, m[1], st, now());
        return ok(res, { success: true, status: st });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/watch-status\/([^/]+)$/,
    handler: async (req, res, m, user) => {
        if (!requireUser(res, user)) return;
        const row = db.prepare('SELECT status FROM watch_status WHERE user_id = ? AND media_id = ?').get(user.id, m[1]);
        return ok(res, { status: row ? row.status : 'no_vista' });
    }
});

routes.push({
    method: 'POST', pattern: /^\/api\/tier$/,
    handler: async (req, res, m, user, body) => {
        if (!requireUser(res, user)) return;
        db.prepare(`
            INSERT INTO tier_states (id, user_id, media_id, tier)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id, media_id) DO UPDATE SET tier = excluded.tier
        `).run(randomUUID(), user.id, body.media_id, body.tier || 'pool');
        return ok(res, { success: true });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/tier$/,
    handler: async (req, res, m, user) => {
        if (!requireUser(res, user)) return;
        const rows = db.prepare('SELECT media_id, tier FROM tier_states WHERE user_id = ?').all(user.id);
        return ok(res, { data: rows });
    }
});

// ---- REVIEWS ----
routes.push({
    method: 'POST', pattern: /^\/api\/reviews$/,
    handler: async (req, res, m, user, body) => {
        if (!requireUser(res, user)) return;
        const rating = parseInt(body.rating, 10);
        if (!rating || rating < 1 || rating > 10) return send(res, 400, { error: 'La puntuación debe ser entre 1 y 10.' });
        if (!body.comment || String(body.comment).trim().length < 5) return send(res, 400, { error: 'La reseña debe tener al menos 5 caracteres.' });

        const existing = db.prepare('SELECT id, created_at FROM reviews WHERE user_id = ? AND media_id = ?').get(user.id, body.media_id);
        if (existing) {
            db.prepare('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?').run(rating, String(body.comment).trim(), existing.id);
        } else {
            db.prepare('INSERT INTO reviews (id, user_id, media_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(randomUUID(), user.id, body.media_id, rating, String(body.comment).trim(), now());
        }
        return ok(res, { success: true });
    }
});

routes.push({
    method: 'GET', pattern: /^\/api\/reviews\/mine$/,
    handler: async (req, res, m, user) => {
        if (!requireUser(res, user)) return;
        const mediaId = new URL(req.url, 'http://localhost').searchParams.get('media_id');
        const row = db.prepare('SELECT id, media_id, rating, comment, created_at FROM reviews WHERE user_id = ? AND media_id = ?').get(user.id, mediaId);
        return ok(res, { data: row || null });
    }
});

// =====================================================
// ESTÁTICOS (SPA)
// =====================================================
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
    '.map': 'application/json'
};

async function serveStatic(req, res) {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return send(res, 400, { error: 'URL inválida.' }); }
    if (pathname === '/') pathname = '/index.html';

    const filePath = resolve(join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + '\\') && !filePath.startsWith(ROOT + '/')) {
        return send(res, 403, { error: 'Acceso denegado.' });
    }

    try {
        const f = await stat(filePath);
        if (!f.isFile()) throw new Error('no-file');
        const data = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    } catch {
        send(res, 404, { error: 'No encontrado.' });
    }
}

// =====================================================
// SERVIDOR
// =====================================================
const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
        try {
            const user = getAuthUser(req);
            for (const route of routes) {
                const m = url.pathname.match(route.pattern);
                if (m && route.method === req.method) {
                    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
                    await route.handler(req, res, m, user, body);
                    return;
                }
            }
            return send(res, 404, { error: 'Endpoint no encontrado.' });
        } catch (e) {
            console.error('[API ERROR]', e);
            return send(res, 500, { error: 'Error interno del servidor.' });
        }
    }
    await serveStatic(req, res);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`El puerto ${PORT} ya está en uso.`);
        console.error(`  - Si hay otra instancia de CineClassify corriendo, ciérrala (o usa:  PORT=3001 npm start)`);
        console.error(`  - En Windows:  Get-NetTCPConnection -LocalPort ${PORT} -State Listen  ->  Stop-Process -Id <PID>`);
    } else {
        console.error(err);
    }
    process.exit(1);
});

server.listen(PORT, () => {
    console.log(`CineClassify Server: http://localhost:${PORT}`);
    console.log(`SQLite DB: ${DB_PATH}`);
    console.log('(node:sqlite experimental - usa el flag --experimental-sqlite al arrancar)');
});