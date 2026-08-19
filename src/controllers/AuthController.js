/**
 * AuthController.js
 *
 * CONTROLADOR DE AUTENTICACIÓN (MVC - Controller Layer)
 * Gestiona: Login, Registro, Sesión por token, Roles.
 *
 * La verificación de credenciales ocurre en el SERVIDOR (SQLite).
 * En el navegador solo se conserva { token, user } (como una cookie).
 */

import { db } from '../db/database.js';

const SESSION_KEY = 'auth_session';

export class AuthController {
    constructor() {
        this._session = null;
        this._token = null;
        this._loadSession();
    }

    // Cargar sesión cacheada desde localStorage
    _loadSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (raw) {
                const { token, user } = JSON.parse(raw);
                if (token && user) {
                    this._token = token;
                    this._session = user;
                } else {
                    this.logout();
                }
            }
        } catch {
            this.logout();
        }
    }

    _persist(token, user) {
        this._token = token;
        this._session = user;
        localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
    }

    // Validar la sesión contra el servidor (al arrancar la app)
    async validateSession() {
        if (!this.isAuthenticated()) return true;
        const r = await db.getMe();
        if (r.error) return false;
        return true;
    }

    // Registrar usuario (async: el servidor valida y hashea)
    async register(username, email, password) {
        if (!username || username.length < 3) return { error: 'El usuario debe tener al menos 3 caracteres.' };
        if (!email || !email.includes('@')) return { error: 'Email inválido.' };
        if (!password || password.length < 4) return { error: 'La contraseña debe tener al menos 4 caracteres.' };

        const result = await db.register({ username, email, password });
        if (result.error) return result;
        this._persist(result.data.token, result.data.user);
        return result;
    }

    // Iniciar sesión (async)
    async login(username, password) {
        if (!username || !password) return { error: 'Completa todos los campos.' };

        const result = await db.login({ username, password });
        if (result.error) return result;
        this._persist(result.data.token, result.data.user);
        return result;
    }

    // Cerrar sesión
    logout() {
        if (this._token) db.logout(this._token);
        this._token = null;
        this._session = null;
        localStorage.removeItem(SESSION_KEY);
    }

    // Obtener sesión actual
    getSession() { return this._session; }
    isAuthenticated() { return this._session !== null; }
    isAdmin() { return this._session?.role === 'admin'; }
    getUserId() { return this._session?.id || null; }

    // Middleware: requiere autenticación
    async requireAuth(callback) {
        if (!this.isAuthenticated()) {
            return { error: 'Debes iniciar sesión para realizar esta acción.', redirect: 'login' };
        }
        return callback();
    }

    // Middleware: requiere rol admin
    async requireAdmin(callback) {
        if (!this.isAdmin()) {
            return { error: 'No tienes permisos para realizar esta acción.', code: 403 };
        }
        return callback();
    }
}

export const authController = new AuthController();