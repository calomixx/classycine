/**
 * AuthController.js
 * 
 * CONTROLADOR DE AUTENTICACIÓN (MVC - Controller Layer)
 * Gestiona: Login, Registro, Sesión JWT simulada, Roles.
 * 
 * JWT simulado: header.payload.signature usando btoa/atob.
 */

import { db } from '../db/database.js';

const JWT_SECRET = 'cineclassify_jwt_secret_2024';

// =====================================================
// JWT UTILITIES (Simulado con btoa/atob)
// =====================================================
function signToken(payload) {
    const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body    = btoa(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })); // 24h
    const signature = btoa(`${header}.${body}.${JWT_SECRET}`);
    return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
    try {
        if (!token) return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp < Date.now()) return null; // Expirado
        return payload;
    } catch {
        return null;
    }
}

// =====================================================
// CLASE AuthController
// =====================================================
export class AuthController {
    constructor() {
        this._session = null;
        this._loadSession();
    }

    // Cargar sesión desde localStorage
    _loadSession() {
        const token = localStorage.getItem('auth_token');
        if (token) {
            const payload = verifyToken(token);
            if (payload) {
                this._session = payload;
            } else {
                this.logout(); // Token expirado
            }
        }
    }

    // Registrar usuario
    register(username, email, password) {
        // Validación de entradas
        if (!username || username.length < 3) return { error: 'El usuario debe tener al menos 3 caracteres.' };
        if (!email || !email.includes('@')) return { error: 'Email inválido.' };
        if (!password || password.length < 4) return { error: 'La contraseña debe tener al menos 4 caracteres.' };

        const hash = db._simpleHash(password);
        const result = db.createUser({ username, email, password_hash: hash, role: 'user' });
        if (result.error) return result;

        // Auto-login tras registro
        return this.login(username, password);
    }

    // Iniciar sesión
    login(username, password) {
        if (!username || !password) return { error: 'Completa todos los campos.' };

        const user = db.findUserByUsername(username);
        if (!user) return { error: 'Usuario no encontrado.' };
        if (!db.verifyPassword(password, user.password_hash)) return { error: 'Contraseña incorrecta.' };

        const payload = { id: user.id, username: user.username, role: user.role };
        const token = signToken(payload);

        localStorage.setItem('auth_token', token);
        this._session = payload;

        return { data: { user: payload, token } };
    }

    // Cerrar sesión
    logout() {
        localStorage.removeItem('auth_token');
        this._session = null;
    }

    // Obtener sesión actual
    getSession() { return this._session; }
    isAuthenticated() { return this._session !== null; }
    isAdmin() { return this._session?.role === 'admin'; }
    getUserId() { return this._session?.id || null; }

    // Middleware: requiere autenticación
    requireAuth(callback) {
        if (!this.isAuthenticated()) {
            return { error: 'Debes iniciar sesión para realizar esta acción.', redirect: 'login' };
        }
        return callback();
    }

    // Middleware: requiere rol admin
    requireAdmin(callback) {
        if (!this.isAdmin()) {
            return { error: 'No tienes permisos para realizar esta acción.', code: 403 };
        }
        return callback();
    }
}

export const authController = new AuthController();
