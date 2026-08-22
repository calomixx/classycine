/**
 * LayoutView.js
 * 
 * VISTA DEL LAYOUT PRINCIPAL (Topbar + Sidenav + Content area)
 */

import { authController } from '../controllers/AuthController.js';
import { mediaController } from '../controllers/MediaController.js';
import { router } from '../Router.js';
import { getInitials, showToast } from '../helpers.js';

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

        // Modal Agregar Película
        const openAddModal = () => {
            closeMenu();
            this._openAddMediaModal().catch(() => showToast('No se pudo conectar con el servidor.', 'error'));
        };
        document.getElementById('btn-add-media')?.addEventListener('click', openAddModal);
        document.getElementById('btn-side-add-media')?.addEventListener('click', openAddModal);
    }

    setActiveNav(route) {
        document.querySelectorAll('.sidenav-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-route') === route);
        });
    }

    getContentContainer() {
        return document.getElementById('main-content');
    }

    async _openAddMediaModal() {
        const genres = await mediaController.getGenres();
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-header">
                <h2 class="modal-title">Añadir Película / Serie</h2>
                <button class="btn btn-icon close-modal">✕</button>
            </div>
            <form class="modal-form" id="user-add-media-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Título *</label>
                        <input class="input-field" name="title" required placeholder="Ej: Matrix">
                    </div>
                    <div class="form-group">
                        <label>Tipo *</label>
                        <select class="input-field" name="type">
                            <option value="movie">🎬 Película</option>
                            <option value="series">📺 Serie</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Año de estreno *</label>
                        <input class="input-field" name="release_year" type="number" min="1900" max="2030" required>
                    </div>
                    <div class="form-group">
                        <label>URL Imagen (Opcional)</label>
                        <input class="input-field" name="image" type="url" placeholder="https://...">
                    </div>
                </div>
                <div class="form-group">
                    <label>Géneros</label>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">
                        ${genres.map(g => `<label style="display:flex;align-items:center;gap:5px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" name="genre_ids" value="${g.id}"> ${g.name}
                        </label>`).join('')}
                    </div>
                </div>
                <p class="error-msg" id="add-modal-error"></p>
                <div style="display:flex;gap:10px;justify-content:flex-end">
                    <button type="button" class="btn btn-secondary close-modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Añadir</button>
                </div>
            </form>
        </div>`;

        document.body.appendChild(overlay);
        
        const close = () => overlay.remove();
        overlay.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', close));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        document.getElementById('user-add-media-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const genre_ids = [...e.target.querySelectorAll('[name=genre_ids]:checked')].map(c => parseInt(c.value));
            const data = {
                title: fd.get('title'), type: fd.get('type'),
                release_year: fd.get('release_year'), image: fd.get('image'), genre_ids
            };

            const result = await mediaController.createMedia(data);
            if (result.error) {
                document.getElementById('add-modal-error').textContent = result.error;
            } else {
                close();
                showToast('Contenido añadido exitosamente.');
                const targetRoute = data.type === 'movie' ? '/movies' : '/series';
                router.navigate(targetRoute);
                if (router.getCurrentRoute()?.route === targetRoute) {
                    router.start(); // Refresh current route
                }
            }
        });
    }
}
