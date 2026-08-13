/**
 * MediaController.js
 * 
 * CONTROLADOR DE MEDIOS (MVC - Controller Layer)
 * Gestiona: CRUD completo, búsqueda, filtros, paginación,
 * recomendaciones y el Tier List.
 */

import { db } from '../db/database.js';
import { authController } from './AuthController.js';

export class MediaController {
    // ---- CATÁLOGO ----
    getCatalog(params = {}) {
        return db.searchMedia(params);
    }

    getMediaById(id) {
        const media = db.getMediaById(id);
        if (!media) return { error: 'Contenido no encontrado.' };
        const genres = db.getGenreNames(media.genre_ids);
        const reviews = db.getReviewsByMedia(id);
        const recommendations = db.getRecommendations(id);
        return { data: { ...media, genres, reviews, recommendations } };
    }

    getGenres() { return db.getAllGenres(); }

    getTopRated() {
        return {
            movies: db.getTopMovies(),
            series: db.getTopSeries()
        };
    }

    getStatistics() { return db.sp_get_statistics(); }

    // ---- RESEÑAS ----
    submitReview(media_id, rating, comment) {
        return authController.requireAuth(() => {
            if (rating < 1 || rating > 10) return { error: 'La puntuación debe ser entre 1 y 10.' };
            if (!comment || comment.trim().length < 5) return { error: 'La reseña debe tener al menos 5 caracteres.' };

            return db.createOrUpdateReview({
                user_id: authController.getUserId(),
                media_id, rating: parseInt(rating), comment: comment.trim()
            });
        });
    }

    getUserReview(media_id) {
        const userId = authController.getUserId();
        if (!userId) return null;
        return db.getUserReview(userId, media_id);
    }

    // ---- TIER LIST ----
    saveTierState(media_id, tier) {
        return authController.requireAuth(() => {
            db.saveTierState(authController.getUserId(), media_id, tier);
            return { success: true };
        });
    }

    getTierStates() {
        const userId = authController.getUserId();
        if (!userId) return [];
        return db.getTierStates(userId);
    }

    // ---- WATCHLIST / FAVORITOS ----
    toggleWatchlist(media_id) {
        return authController.requireAuth(() => {
            return db.toggleWatchlist(authController.getUserId(), media_id);
        });
    }

    getWatchlist() {
        const userId = authController.getUserId();
        if (!userId) return [];
        return db.getUserWatchlist(userId);
    }

    isInWatchlist(media_id) {
        const userId = authController.getUserId();
        if (!userId) return false;
        return db.isInWatchlist(userId, media_id);
    }

    // ---- ESTADO DE VISUALIZACIÓN (no vista, en proceso, vista) ----
    getWatchStatus(media_id) {
        const userId = authController.getUserId();
        if (!userId) return 'no_vista';
        return db.getWatchStatus(userId, media_id);
    }

    setWatchStatus(media_id, status) {
        return authController.requireAuth(() => {
            return db.setWatchStatus(authController.getUserId(), media_id, status);
        });
    }

    // ---- CRUD (Creación libre para usuarios autenticados) ----
    createMedia(data) {
        return authController.requireAuth(() => {
            if (!data.title) return { error: 'El título es obligatorio.' };
            if (!data.release_year) return { error: 'El año de estreno es obligatorio.' };
            return db.createMedia(data);
        });
    }

    updateMedia(id, data) {
        return authController.requireAdmin(() => {
            return db.updateMedia(id, data);
        });
    }

    deleteMedia(id) {
        return authController.requireAdmin(() => {
            db.deleteMedia(id);
            return { success: true };
        });
    }

    // ---- ADMIN: USUARIOS ----
    getAllUsers() {
        return authController.requireAdmin(() => ({ data: db.getAllUsers() }));
    }

    updateUserRole(userId, role) {
        return authController.requireAdmin(() => {
            db.updateUserRole(userId, role);
            return { success: true };
        });
    }

    deleteUser(userId) {
        return authController.requireAdmin(() => {
            db.deleteUser(userId);
            return { success: true };
        });
    }
}

export const mediaController = new MediaController();
