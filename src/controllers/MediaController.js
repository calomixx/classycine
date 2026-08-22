/**
 * MediaController.js
 *
 * CONTROLADOR DE MEDIOS (MVC - Controller Layer)
 * Gestiona: CRUD completo, búsqueda, filtros, paginación,
 * recomendaciones y el Tier List.
 *
 * Todas las operaciones son ASYNC (la base de datos vive en el servidor).
 */

import { db } from '../db/database.js';
import { authController } from './AuthController.js';

export class MediaController {
    // ---- CATÁLOGO ----
    async getCatalog(params = {}) {
        return db.searchMedia(params);
    }

    async getMediaById(id) {
        const media = await db.getMediaById(id);
        if (!media) return { error: 'Contenido no encontrado.' };
        const [genres, reviews, recommendations] = await Promise.all([
            db.getGenreNames(media.genre_ids),
            db.getReviewsByMedia(id),
            db.getRecommendations(id)
        ]);
        return { data: { ...media, genres, reviews, recommendations } };
    }

    async getGenres() { return db.getAllGenres(); }

    async getTopRated() {
        return db.getTopRated();
    }

    async getStatistics() { return db.sp_get_statistics(); }

    // ---- RESEÑAS ----
    async submitReview(media_id, rating, comment) {
        return authController.requireAuth(async () => {
            if (rating < 1 || rating > 10) return { error: 'La puntuación debe ser entre 1 y 10.' };
            if (!comment || comment.trim().length < 5) return { error: 'La reseña debe tener al menos 5 caracteres.' };

            return db.createOrUpdateReview({
                media_id, rating: parseInt(rating), comment: comment.trim()
            });
        });
    }

    async getUserReview(media_id) {
        const userId = authController.getUserId();
        if (!userId) return null;
        return db.getUserReview(userId, media_id);
    }

    // ---- TIER LIST ----
    async saveTierState(media_id, tier) {
        return authController.requireAuth(async () => {
            await db.saveTierState(authController.getUserId(), media_id, tier);
            return { success: true };
        });
    }

    async getTierStates() {
        const userId = authController.getUserId();
        if (!userId) return [];
        return db.getTierStates(userId);
    }

    // ---- WATCHLIST / FAVORITOS ----
    async toggleWatchlist(media_id) {
        return authController.requireAuth(async () => {
            return db.toggleWatchlist(authController.getUserId(), media_id);
        });
    }

    async getWatchlist() {
        const userId = authController.getUserId();
        if (!userId) return [];
        return db.getUserWatchlist(userId);
    }

    async isInWatchlist(media_id) {
        const userId = authController.getUserId();
        if (!userId) return false;
        return db.isInWatchlist(userId, media_id);
    }

    // ---- ESTADO DE VISUALIZACIÓN (no vista, en proceso, vista) ----
    async getWatchStatus(media_id) {
        const userId = authController.getUserId();
        if (!userId) return 'no_vista';
        return db.getWatchStatus(userId, media_id);
    }

    async setWatchStatus(media_id, status) {
        return authController.requireAuth(async () => {
            return db.setWatchStatus(authController.getUserId(), media_id, status);
        });
    }

    // ---- ESTADO COMPLETO DEL USUARIO (para renderizar tarjetas) ----
    async getUserMediaUI() {
        const userId = authController.getUserId();
        if (!userId) return { watchlistIds: [], statuses: {}, reviews: {} };
        return db.getUserMediaUI();
    }

    // ---- CRUD (Creación libre para usuarios autenticados) ----
    async createMedia(data) {
        return authController.requireAuth(async () => {
            if (!data.title) return { error: 'El título es obligatorio.' };
            if (!data.release_year) return { error: 'El año de estreno es obligatorio.' };
            return db.createMedia(data);
        });
    }

    async updateMedia(id, data) {
        return authController.requireAdmin(async () => {
            return db.updateMedia(id, data);
        });
    }

    async deleteMedia(id) {
        return authController.requireAdmin(async () => {
            await db.deleteMedia(id);
            return { success: true };
        });
    }

    // ---- ADMIN: USUARIOS ----
    async getAllUsers() {
        return authController.requireAdmin(async () => ({ data: await db.getAllUsers() }));
    }

    async updateUserRole(userId, role) {
        return authController.requireAdmin(async () => {
            await db.updateUserRole(userId, role);
            return { success: true };
        });
    }

    async deleteUser(userId) {
        return authController.requireAdmin(async () => {
            await db.deleteUser(userId);
            return { success: true };
        });
    }
}

export const mediaController = new MediaController();