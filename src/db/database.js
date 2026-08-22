/**
 * database.js
 *
 * CLIENTE HTTP DE LA BASE DE DATOS (CineClassify Pro)
 *
 * La persistencia real vive en SQLite del lado del servidor (server.js,
 * archivo data/cineclassify.db). Este módulo reemplaza el antiguo ORM de
 * localStorage por llamadas fetch al API REST /api/*.
 *
 * Todas las operaciones son ASYNC. En el navegador solo se conserva el
 * token de sesión (como una cookie), nunca los datos.
 */

const BASE = '/api';

export class Database {
    constructor() {
        this._genres = null;
    }

    // Token de sesión (el único dato que permanece en el navegador)
    _token() {
        try {
            const raw = localStorage.getItem('auth_session');
            return raw ? (JSON.parse(raw).token || null) : null;
        } catch {
            return null;
        }
    }

    async _request(method, path, body) {
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const token = this._token();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let res;
        try {
            res = await fetch(BASE + path, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
        } catch {
            return { error: 'No se pudo conectar con el servidor.' };
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { error: data.error || `Error de servidor (${res.status})` };
        return data;
    }

    // =====================================================
    // AUTENTICACIÓN
    // =====================================================
    async login({ username, password }) {
        return this._request('POST', '/auth/login', { username, password });
    }

    async register({ username, email, password }) {
        return this._request('POST', '/auth/register', { username, email, password });
    }

    async logout(token) {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch(BASE + '/auth/logout', { method: 'POST', headers }).catch(() => {});
    }

    async getMe() {
        return this._request('GET', '/auth/me');
    }

    async getAllUsers() {
        const r = await this._request('GET', '/auth/users');
        return r.error ? [] : r.data;
    }

    async updateUserRole(userId, role) {
        return this._request('PATCH', `/auth/users/${encodeURIComponent(userId)}/role`, { role });
    }

    async deleteUser(userId) {
        return this._request('DELETE', `/auth/users/${encodeURIComponent(userId)}`);
    }

    // =====================================================
    // CATÁLOGO / MEDIA
    // =====================================================
    async searchMedia(params = {}) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '') qs.set(k, v);
        }
        const r = await this._request('GET', `/media?${qs.toString()}`);
        if (r.error) return { data: [], total: 0, page: 1, totalPages: 1, limit: params.limit || 20, error: r.error };
        return r;
    }

    async getMediaById(id) {
        const r = await this._request('GET', `/media/${encodeURIComponent(id)}`);
        return r.error ? null : r.data;
    }

    async getReviewsByMedia(media_id) {
        const r = await this._request('GET', `/media/${encodeURIComponent(media_id)}/reviews`);
        return r.error ? [] : r.data;
    }

    async getRecommendations(id) {
        const r = await this._request('GET', `/media/${encodeURIComponent(id)}/recommendations`);
        return r.error ? [] : r.data;
    }

    async createMedia(data) {
        return this._request('POST', '/media', data);
    }

    async updateMedia(id, data) {
        return this._request('PUT', `/media/${encodeURIComponent(id)}`, data);
    }

    async deleteMedia(id) {
        return this._request('DELETE', `/media/${encodeURIComponent(id)}`);
    }

    // =====================================================
    // GENRES / TOP / STATS
    // =====================================================
    async getAllGenres() {
        if (this._genres) return this._genres;
        const r = await this._request('GET', '/genres');
        this._genres = r.error ? [] : r.data;
        return this._genres;
    }

    async getGenreNames(ids = []) {
        const genres = await this.getAllGenres();
        const genreMap = {};
        for (let i = 0; i < genres.length; i++) {
            genreMap[genres[i].id] = genres[i].name;
        }
        return ids.map(id => genreMap[id]).filter(Boolean);
    }

    async getTopMovies() {
        const r = await this._request('GET', '/top');
        return r.error ? [] : (r.movies || []);
    }

    async getTopSeries() {
        const r = await this._request('GET', '/top');
        return r.error ? [] : (r.series || []);
    }

    async sp_get_statistics() {
        const r = await this._request('GET', '/stats');
        return r.error ? {} : r;
    }

    // =====================================================
    // REVIEWS
    // =====================================================
    async createOrUpdateReview({ media_id, rating, comment }) {
        return this._request('POST', '/reviews', { media_id, rating, comment });
    }

    async getUserReview(user_id, media_id) {
        const r = await this._request('GET', `/reviews/mine?media_id=${encodeURIComponent(media_id)}`);
        return r.error ? null : r.data;
    }

    // =====================================================
    // TIER LIST
    // =====================================================
    async saveTierState(user_id, media_id, tier) {
        return this._request('POST', '/tier', { media_id, tier });
    }

    async getTierStates(user_id) {
        const r = await this._request('GET', '/tier');
        return r.error ? [] : r.data;
    }

    // =====================================================
    // WATCHLIST / ESTADO DE VISUALIZACIÓN
    // =====================================================
    async toggleWatchlist(user_id, media_id) {
        return this._request('POST', `/watchlist/${encodeURIComponent(media_id)}`);
    }

    async getUserWatchlist(user_id) {
        const r = await this._request('GET', '/watchlist');
        return r.error ? [] : r.data;
    }

    async isInWatchlist(user_id, media_id) {
        const r = await this._request('GET', '/me/lists');
        return r.error ? false : (r.watchlistIds || []).includes(media_id);
    }

    async setWatchStatus(user_id, media_id, status) {
        return this._request('POST', `/watch-status/${encodeURIComponent(media_id)}`, { status });
    }

    async getWatchStatus(user_id, media_id) {
        const r = await this._request('GET', `/watch-status/${encodeURIComponent(media_id)}`);
        return r.error ? 'no_vista' : (r.status || 'no_vista');
    }

    // Estado completo del usuario de la sesión para renderizar tarjetas
    async getUserMediaUI() {
        const r = await this._request('GET', '/me/lists');
        return r.error ? { watchlistIds: [], statuses: {}, reviews: {} } : r;
    }
}

export const db = new Database();