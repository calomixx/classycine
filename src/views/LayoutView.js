/**
 * LayoutView.js
 * 
 * VISTA DEL LAYOUT PRINCIPAL (Topbar + Sidenav + Content area)
 */

import { authController } from '../controllers/AuthController.js';
import { router } from '../Router.js';
import { getInitials } from '../helpers.js';

export class LayoutView {
    constructor(onLogout) {
        this._onLogout = onLogout;
    }

    render(container) {
        const session = authController.getSession();
        const isAdmin = authController.isAdmin();

        container.innerHTML = `
        <div id="app-layout">
            <!-- TOPBAR -->
            <header class="topbar">
                <button class="menu-toggle" id="btn-menu" aria-label="Menú">☰</button>
                <div class="topbar-logo">
                    Cine<span class="highlight">Classify</span>
                </div>
                <div class="topbar-search">
                    <span class="search-icon">🔍</span>
                    <input class="input-field" type="text" id="global-search" placeholder="Buscar por título, actor, director...">
                </div>
                <div class="topbar-actions">
                    <button class="topbar-btn-add" id="btn-add-media">+ Agregar Película</button>
                    <div class="user-menu">
                        <div class="user-avatar">${getInitials(session?.username)}</div>
                        <div>
                            <div class="user-name">${session?.username || 'Usuario'}</div>
                            <div class="user-role">${isAdmin ? '⚙️ Admin' : '👤 Usuario'}</div>
                        </div>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-logout">Salir</button>
                </div>
            </header>

            <div class="mobile-backdrop" id="mobile-backdrop"></div>

            <div class="main-area">
                <!-- SIDEBAR -->
                <nav class="sidenav" id="sidenav">
                    <span class="sidenav-section">Explorar</span>
                    <button class="sidenav-item" data-route="/home">
                        <span class="nav-icon">🏠</span> Inicio
                    </button>
                    <button class="sidenav-item" data-route="/movies">
                        <span class="nav-icon">🎬</span> Películas
                    </button>
                    <button class="sidenav-item" data-route="/series">
                        <span class="nav-icon">📺</span> Series
                    </button>
                    <button class="sidenav-item" data-route="/top">
                        <span class="nav-icon">🏆</span> Mejores Calificadas
                    </button>
                    <button class="sidenav-item" data-route="/stats">
                        <span class="nav-icon">📊</span> Estadísticas
                    </button>
                    
                    <span class="sidenav-section">Mi Cuenta</span>
                    <button class="sidenav-item" data-route="/watchlist">
                        <span class="nav-icon">💖</span> Mi Lista
                    </button>
                    <button class="sidenav-item" data-route="/tierlist">
                        <span class="nav-icon">📋</span> Mi Tier List
                    </button>
                    <button class="sidenav-item btn-side-add-item" id="btn-side-add-media">
                        <span class="nav-icon">➕</span> + Agregar Película
                    </button>

                    ${isAdmin ? `
                    <span class="sidenav-section">Administración</span>
                    <button class="sidenav-item" data-route="/admin/media">
                        <span class="nav-icon">🎞️</span> Gestionar Contenido
                    </button>
                    <button class="sidenav-item" data-route="/admin/users">
                        <span class="nav-icon">👥</span> Gestionar Usuarios
                    </button>
                    ` : ''}
                </nav>

                <!-- CONTENIDO PRINCIPAL -->
                <main class="content" id="main-content">
                    <!-- Las vistas se inyectan aquí -->
                </main>
            </div>
        </div>`;

        this._bindEvents();
    }

    _bindEvents() {
        const sidenav = document.getElementById('sidenav');
        const backdrop = document.getElementById('mobile-backdrop');
        const btnMenu = document.getElementById('btn-menu');

        const closeMenu = () => {
            if (sidenav) sidenav.classList.remove('open');
            if (backdrop) backdrop.classList.remove('active');
        };

        if (btnMenu) {
            btnMenu.addEventListener('click', () => {
                sidenav?.classList.toggle('open');
                backdrop?.classList.toggle('active');
            });
        }
        if (backdrop) backdrop.addEventListener('click', closeMenu);

        // Navegación sidebar
        document.querySelectorAll('.sidenav-item[data-route]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                closeMenu();
                router.navigate(e.currentTarget.getAttribute('data-route'));
            });
        });

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            authController.logout();
            this._onLogout();
        });

        // Búsqueda global -> navegar a /movies con query
        let searchTimeout;
        document.getElementById('global-search').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const q = e.target.value.trim();
                if (q) router.navigate(`/movies?q=${encodeURIComponent(q)}`);
            }, 400);
        });
    }

    setActiveNav(route) {
        document.querySelectorAll('.sidenav-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-route') === route);
        });
    }

    getContentContainer() {
        return document.getElementById('main-content');
    }
}
