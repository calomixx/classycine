/**
 * Router.js
 * 
 * ENRUTADOR SPA (basado en hash para funcionar sin servidor)
 * Gestiona la navegación entre vistas sin recargar la página.
 */

export class Router {
    constructor() {
        this._routes = {};
        this._currentRoute = null;
        window.addEventListener('hashchange', () => this._resolve());
    }

    on(route, handler) {
        this._routes[route] = handler;
        return this;
    }

    navigate(route) {
        window.location.hash = route;
    }

    _resolve() {
        const hash = window.location.hash.slice(1) || '/';
        const [pathStr] = hash.split('?');

        // Direct match for nested paths like /admin/media
        if (this._routes[pathStr]) {
            this._currentRoute = { route: pathStr, param: null };
            this._routes[pathStr]();
            return;
        }

        // Base path matching with param (e.g. /detail/:id)
        const parts = pathStr.split('/').filter(Boolean);
        const base  = '/' + (parts[0] || '');
        const param = parts.slice(1).join('/') || null;

        if (this._routes[base]) {
            this._currentRoute = { route: base, param };
            this._routes[base](param);
        } else if (this._routes['*']) {
            this._routes['*']();
        }
    }

    start() {
        this._resolve();
    }

    getCurrentRoute() { return this._currentRoute; }
}

export const router = new Router();
