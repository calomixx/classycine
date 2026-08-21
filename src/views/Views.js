/**
 * HomeView.js + CatalogView.js + DetailView.js + TierView.js + StatsView.js + AdminView.js
 * 
 * VISTAS DE CONTENIDO (MVC - View Layer)
 * Todas las páginas de la SPA en un solo archivo de vistas.
 */

import { mediaController } from '../controllers/MediaController.js';
import { authController }  from '../controllers/AuthController.js';
import { router }          from '../Router.js';
import { showToast, renderStars, renderGenreBadges, posterHTML, formatDate, confirmAction } from '../helpers.js';

// =====================================================
// MEDIA CARD HTML
// =====================================================
function mediaCardHTML(media, ui = {}) {
    const avg = media.average_rating > 0 ? media.average_rating.toFixed(1) : null;
    const isFav = !!ui.isFav;
    const watchStatus = ui.watchStatus || 'no_vista';
    const hasReviewed = !!ui.hasReviewed;

    return `
    <article class="media-card" data-id="${media.id}" title="${media.title}">
        <div class="card-poster">
            ${media.image ? `<img src="${media.image}" alt="${media.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="poster-fallback" style="display:none">🎬</span>` : '<span class="poster-fallback">🎬</span>'}
            <button class="card-fav-btn ${isFav ? 'active' : ''}" data-id="${media.id}" title="${isFav ? 'Quitar de Mi Lista' : 'Guardar en Mi Lista'}">${isFav ? '💖' : '🤍'}</button>
            <div class="card-reviewed-badge ${hasReviewed?'is-reviewed':''}" title="${hasReviewed?'Has publicado una crítica sobre esta película':'Aún no has criticado esta película'}" onclick="event.stopPropagation()">
                <input type="checkbox" disabled ${hasReviewed?'checked':''} id="chk-card-m-${media.id}">
                <label for="chk-card-m-${media.id}">${hasReviewed?'✓ Criticada':'Sin criticar'}</label>
            </div>
        </div>
        ${avg ? `<div class="card-badge">⭐ ${avg}</div>` : ''}
        <div class="card-overlay">
            <button class="btn btn-primary btn-sm view-detail-btn" data-id="${media.id}">Ver más</button>
        </div>
        <div class="card-body">
            <div class="card-title">${media.title}</div>
            <div class="card-meta">
                <span class="card-rating">${avg ? `⭐ ${avg}` : 'Sin reseñas'}</span>
                <span class="card-year">${media.release_year}</span>
            </div>
            <div class="card-status-bar" onclick="event.stopPropagation()">
                <select class="card-status-select status-${watchStatus}" data-id="${media.id}">
                    <option value="no_vista" ${watchStatus==='no_vista'?'selected':''}>👁️ No vista</option>
                    <option value="en_proceso" ${watchStatus==='en_proceso'?'selected':''}>⏳ En proceso</option>
                    <option value="vista" ${watchStatus==='vista'?'selected':''}>✅ Vista</option>
                </select>
            </div>
        </div>
    </article>`;
}

function bindCardClicks(container) {
    container.querySelectorAll('.card-fav-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const res = await mediaController.toggleWatchlist(id);
            if (res.error) {
                showToast(res.error, 'error');
            } else {
                const added = res.added;
                btn.classList.toggle('active', added);
                btn.textContent = added ? '💖' : '🤍';
                btn.title = added ? 'Quitar de Mi Lista' : 'Guardar en Mi Lista';
                showToast(added ? 'Añadido a Mi Lista 💖' : 'Eliminado de Mi Lista');
            }
        });
    });

    container.querySelectorAll('.card-status-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            e.stopPropagation();
            const id = sel.getAttribute('data-id');
            const st = sel.value;
            const res = await mediaController.setWatchStatus(id, st);
            if (res?.error) {
                showToast(res.error, 'error');
            } else {
                sel.className = `card-status-select status-${st}`;
                const labelMap = { 'no_vista': 'No vista 👁️', 'en_proceso': 'En proceso ⏳', 'vista': 'Vista ✅' };
                showToast(`Estado actualizado: ${labelMap[st]||st}`);
            }
        });
        sel.addEventListener('click', e => e.stopPropagation());
    });

    container.querySelectorAll('.view-detail-btn, .media-card').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.card-fav-btn') || e.target.closest('.card-status-bar') || e.target.closest('.card-reviewed-badge')) return;
            const id = e.currentTarget.getAttribute('data-id') || e.currentTarget.closest('[data-id]')?.getAttribute('data-id');
            if (id) router.navigate(`/detail/${id}`);
        });
    });
}

// =====================================================
// UTILIDADES DE RENDERIZADO ASYNC
// =====================================================
const EMPTY_UI = Object.freeze({ favs: new Set(), statuses: {}, reviews: {} });

// Estado del usuario de la sesión (favoritos, estado y reseñas) en un solo fetch
async function loadUserUI() {
    if (!authController.isAuthenticated()) return EMPTY_UI;
    const ui = await mediaController.getUserMediaUI();
    return {
        favs: new Set(ui.watchlistIds || []),
        statuses: ui.statuses || {},
        reviews: ui.reviews || {}
    };
}

function cardUI(userUI, mediaId) {
    return {
        isFav: userUI.favs.has(mediaId),
        watchStatus: userUI.statuses[mediaId] || 'no_vista',
        hasReviewed: !!userUI.reviews[mediaId]
    };
}

// =====================================================
// HOME VIEW
// =====================================================
export class HomeView {
    async render(container) {
        const [top, catalog, userUI] = await Promise.all([
            mediaController.getTopRated(),
            mediaController.getCatalog({ sort: 'reviews', limit: 8 }),
            loadUserUI()
        ]);
        const { movies: topMovies, series: topSeries } = top;
        const allMedia = catalog.data || [];

        container.innerHTML = `
        <div>
            <!-- HERO -->
            <div class="hero-banner" style="background:linear-gradient(135deg,#1a1b2e,#0f1220)">
                <div class="hero-content">
                    <h2>🎬 Bienvenido a <span class="highlight">CineClassify</span></h2>
                    <p>Clasifica, valora y descubre las mejores películas y series. Construye tu Tier List personal.</p>
                    <div style="display:flex;gap:10px;margin-top:1.25rem;flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="window.location.hash='/movies'">Explorar Películas</button>
                        <button class="btn btn-secondary" onclick="window.location.hash='/tierlist'">📋 Mi Tier List</button>
                    </div>
                </div>
            </div>

            <!-- TOP PELÍCULAS -->
            ${topMovies.length > 0 ? `
            <div class="section-header">
                <h2 class="section-title">🏆 Top Películas <span>(Vista Materializada)</span></h2>
                <button class="btn btn-secondary btn-sm" onclick="window.location.hash='/top'">Ver todo</button>
            </div>
            <div class="media-grid" id="top-movies-grid">
                ${topMovies.slice(0,6).map(m => mediaCardHTML(m, cardUI(userUI, m.id))).join('')}
            </div>` : ''}

            <!-- TOP SERIES -->
            ${topSeries.length > 0 ? `
            <div class="section-header" style="margin-top:2rem">
                <h2 class="section-title">🏆 Top Series <span>(Vista Materializada)</span></h2>
                <button class="btn btn-secondary btn-sm" onclick="window.location.hash='/top'">Ver todo</button>
            </div>
            <div class="media-grid">
                ${topSeries.slice(0,6).map(m => mediaCardHTML(m, cardUI(userUI, m.id))).join('')}
            </div>` : ''}

            <!-- RECIENTES -->
            <div class="section-header" style="margin-top:2rem">
                <h2 class="section-title">🔥 Más Comentados</h2>
                <button class="btn btn-secondary btn-sm" onclick="window.location.hash='/movies'">Ver catálogo</button>
            </div>
            <div class="media-grid">
                ${allMedia.map(m => mediaCardHTML(m, cardUI(userUI, m.id))).join('')}
            </div>
        </div>`;

        bindCardClicks(container);
    }
}

// =====================================================
// CATALOG VIEW (Películas / Series con filtros)
// =====================================================
export class CatalogView {
    constructor(type = 'all') {
        this._type = type;
        this._page = 1;
        this._params = {};
    }

    async render(container, extraParams = {}) {
        this._container = container;
        this._params = { type: this._type, page: 1, limit: 18, ...extraParams };

        const genres = await mediaController.getGenres();
        const typeLabel = this._type === 'movie' ? 'Películas' : this._type === 'series' ? 'Series' : 'Catálogo';

        container.innerHTML = `
        <div>
            <div class="section-header">
                <h2 class="section-title">${this._type === 'movie' ? '🎬' : this._type === 'series' ? '📺' : '🎞️'} ${typeLabel}</h2>
            </div>

            <!-- FILTROS -->
            <div class="filters-bar glass">
                <span class="filter-label">Filtrar:</span>
                <input class="input-field" type="text" id="f-query" placeholder="Título, actor, director..." value="${extraParams.q || ''}">
                <select class="input-field" id="f-genre">
                    <option value="">Todos los géneros</option>
                    ${genres.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                </select>
                <input class="input-field" type="number" id="f-year" placeholder="Año" min="1900" max="2030" style="max-width:100px">
                <input class="input-field" type="text" id="f-director" placeholder="Director">
                <select class="input-field" id="f-sort">
                    <option value="title">A-Z</option>
                    <option value="rating">Mejor calificados</option>
                    <option value="year">Más recientes</option>
                    <option value="reviews">Más comentados</option>
                </select>
                <select class="input-field" id="f-min-rating">
                    <option value="0">Cualquier puntuación</option>
                    <option value="7">7+</option>
                    <option value="8">8+</option>
                    <option value="9">9+</option>
                </select>
                <button class="btn btn-primary btn-sm" id="apply-filters">Buscar</button>
                <button class="btn btn-secondary btn-sm" id="clear-filters">Limpiar</button>
            </div>

            <div id="catalog-results"></div>
            <div id="catalog-pagination" class="pagination"></div>
        </div>`;

        // Pre-llenar query si viene de búsqueda global
        if (extraParams.q) document.getElementById('f-query').value = extraParams.q;

        this._loadResults();
        this._bindFilters(container);
    }

    async _loadResults(params = {}) {
        const merged = { ...this._params, ...params };
        const [result, userUI] = await Promise.all([
            mediaController.getCatalog(merged),
            loadUserUI()
        ]);

        const grid = document.getElementById('catalog-results');
        if (!grid) return;

        if (!result.data || result.data.length === 0) {
            grid.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-3)">
                <div style="font-size:3rem">🎬</div>
                <p style="margin-top:1rem">No se encontraron resultados.</p>
            </div>`;
        } else {
            grid.innerHTML = `<div class="media-grid">${result.data.map(m => mediaCardHTML(m, cardUI(userUI, m.id))).join('')}</div>`;
        }

        this._renderPagination(result);
        bindCardClicks(this._container);
    }

    _renderPagination({ page, totalPages }) {
        const el = document.getElementById('catalog-pagination');
        if (!el || totalPages <= 1) { if(el) el.innerHTML = ''; return; }

        const btns = [];
        for (let i = 1; i <= totalPages; i++) {
            btns.push(`<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`);
        }
        el.innerHTML = btns.join('');
        el.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.getAttribute('data-page'));
                this._params.page = p;
                this._loadResults();
            });
        });
    }

    _buildCurrentParams() {
        return {
            ...this._params,
            query: document.getElementById('f-query')?.value || '',
            genre_id: document.getElementById('f-genre')?.value || null,
            year: document.getElementById('f-year')?.value || null,
            director: document.getElementById('f-director')?.value || '',
            sort: document.getElementById('f-sort')?.value || 'title',
            min_rating: document.getElementById('f-min-rating')?.value || 0,
            page: 1,
        };
    }

    _bindFilters(container) {
        document.getElementById('apply-filters')?.addEventListener('click', () => {
            this._params = this._buildCurrentParams();
            this._loadResults();
        });
        document.getElementById('clear-filters')?.addEventListener('click', () => {
            container.querySelectorAll('input').forEach(i => i.value = '');
            container.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
            this._params = { type: this._type, page: 1, limit: 18 };
            this._loadResults();
        });
        // Buscar al presionar Enter
        document.getElementById('f-query')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('apply-filters')?.click();
        });
    }
}

// =====================================================
// TOP RATED VIEW
// =====================================================
export class TopRatedView {
    async render(container) {
        const { movies, series } = await mediaController.getTopRated();

        const rankClass = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

        const listHTML = (items) => items.map((m, i) => `
        <div class="top-item" data-id="${m.id}">
            <div class="top-rank ${rankClass(i)}">#${i + 1}</div>
            <div class="top-poster">
                ${m.image ? `<img src="${m.image}" alt="${m.title}" onerror="this.parentElement.innerHTML='🎬'">` : '🎬'}
            </div>
            <div class="top-info">
                <div class="top-title">${m.title}</div>
                <div class="top-meta">${m.release_year} • ${m.review_count} reseñas</div>
            </div>
            <div class="top-score">⭐ ${m.average_rating?.toFixed(1)}</div>
        </div>`).join('');

        container.innerHTML = `
        <div>
            <div class="section-header">
                <h2 class="section-title">🏆 Mejores Calificadas <span style="font-size:0.8rem;color:var(--text-3)">(Vista Materializada)</span></h2>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;flex-wrap:wrap;">
                <div>
                    <h3 style="margin-bottom:1rem;color:var(--tier-s)">🎬 Top Películas</h3>
                    <div class="top-list">${movies.length ? listHTML(movies) : '<p style="color:var(--text-3)">Aún no hay películas calificadas.</p>'}</div>
                </div>
                <div>
                    <h3 style="margin-bottom:1rem;color:var(--accent)">📺 Top Series</h3>
                    <div class="top-list">${series.length ? listHTML(series) : '<p style="color:var(--text-3)">Aún no hay series calificadas.</p>'}</div>
                </div>
            </div>
        </div>`;

        container.querySelectorAll('.top-item').forEach(el => {
            el.addEventListener('click', () => router.navigate(`/detail/${el.getAttribute('data-id')}`));
        });
    }
}

// =====================================================
// DETAIL VIEW (Película/Serie individual)
// =====================================================
export class DetailView {
    async render(container, mediaId) {
        const isAuth = authController.isAuthenticated();
        const [result, userUI] = await Promise.all([
            mediaController.getMediaById(mediaId),
            isAuth ? loadUserUI() : Promise.resolve(EMPTY_UI)
        ]);
        if (result.error) { container.innerHTML = `<p class="error-msg">${result.error}</p>`; return; }

        const media = result.data;
        const userReview = userUI.reviews[mediaId] || null;
        const watchStatus = userUI.statuses[mediaId] || 'no_vista';
        const hasReviewed = !!userReview;
        const avg = media.average_rating?.toFixed(1) || '0.0';

        container.innerHTML = `
        <div>
            <button class="btn btn-secondary btn-sm" onclick="history.back()">← Volver</button>
            <div class="detail-hero" style="margin-top:1.5rem">
                <div class="detail-poster">
                    ${media.image ? `<img src="${media.image}" alt="${media.title}" onerror="this.parentElement.innerHTML='🎬'">` : '🎬'}
                </div>
                <div class="detail-info">
                    <h1 class="detail-title">${media.title}</h1>
                    <div class="detail-meta">
                        <span class="badge ${media.type === 'movie' ? 'badge-type-movie' : 'badge-type-series'}">${media.type === 'movie' ? '🎬 Película' : '📺 Serie'}</span>
                        <span class="badge badge-year">${media.release_year}</span>
                        ${renderGenreBadges(media.genres)}
                        ${media.age_rating ? `<span class="badge" style="background:rgba(255,85,85,0.15);color:var(--danger)">${media.age_rating}</span>` : ''}
                    </div>

                    <div class="detail-rating-big">
                        ${media.review_count > 0 ? `⭐ ${avg} <span style="font-size:1rem;color:var(--text-2);font-weight:400">(${media.review_count} reseña${media.review_count !== 1 ? 's' : ''})</span>` : '<span style="font-size:1rem;color:var(--text-3)">Sin calificaciones aún</span>'}
                    </div>

                    <p class="detail-synopsis">${media.synopsis || 'Sin sinopsis disponible.'}</p>

                    <div class="detail-cast">
                        ${media.director ? `<div class="detail-cast-item"><strong>Director:</strong> ${media.director}</div>` : ''}
                        ${media.cast ? `<div class="detail-cast-item"><strong>Reparto:</strong> ${media.cast}</div>` : ''}
                        ${media.duration ? `<div class="detail-cast-item"><strong>Duración:</strong> ${media.duration}</div>` : ''}
                    </div>
                </div>
            </div>

            <!-- ESTADO DE REPRODUCCIÓN -->
            <div class="detail-watch-status-box glass">
                <div class="status-box-header">
                    <strong>👁️ Estado de reproducción (Tu Sesión):</strong>
                    <span class="status-current-label status-${watchStatus}" id="detail-status-badge">
                        ${watchStatus==='vista'?'✅ Vista':(watchStatus==='en_proceso'?'⏳ En proceso':'👁️ No vista')}
                    </span>
                </div>
                <div class="status-btn-group">
                    <button type="button" class="status-btn ${watchStatus==='no_vista'?'active':''}" data-status="no_vista">👁️ No vista</button>
                    <button type="button" class="status-btn ${watchStatus==='en_proceso'?'active':''}" data-status="en_proceso">⏳ En proceso</button>
                    <button type="button" class="status-btn ${watchStatus==='vista'?'active':''}" data-status="vista">✅ Vista</button>
                </div>
            </div>

            <!-- CASILLA DE CRÍTICA DEL USUARIO DE LA SESIÓN -->
            <div class="session-critique-card glass">
                <label class="session-critique-label" for="detail-session-critique-chk">
                    <input type="checkbox" id="detail-session-critique-chk" ${hasReviewed?'checked':''}>
                    <div class="critique-text-wrap">
                        <span class="critique-title">${hasReviewed ? '✓ Película criticada por ti (Usuario de la sesión)' : 'Casilla de Crítica (Sin criticar)'}</span>
                        <span class="critique-desc">${hasReviewed ? `Tu reseña fue registrada con ⭐ ${userReview.rating}/10.` : 'Haz clic para redactar tu opinión y marcar esta casilla.'}</span>
                    </div>
                </label>
            </div>

            <!-- RESEÑAS -->
            <div class="reviews-section">
                <h3>💬 Reseñas de la comunidad</h3>

                ${isAuth ? `
                <div class="review-form glass" id="review-form-section">
                    <h4>${userReview ? '✏️ Actualizar tu reseña' : '✍️ Escribe una reseña'}</h4>
                    <div style="display:flex;flex-direction:column;gap:1rem">
                        <div>
                            <label style="font-size:0.82rem;color:var(--text-2);font-weight:600;display:block;margin-bottom:8px">Puntuación (1-10)</label>
                            <div class="rating-stars" id="star-picker">
                                ${[...Array(10)].map((_, i) => `
                                    <button type="button" class="star-btn ${userReview && (i+1) <= userReview.rating ? 'active' : ''}" data-val="${i+1}">★</button>
                                `).join('')}
                            </div>
                            <input type="hidden" id="review-rating" value="${userReview?.rating || 0}">
                        </div>
                        <textarea class="input-field review-textarea" id="review-comment" placeholder="Comparte tu opinión (mín. 5 caracteres)...">${userReview?.comment || ''}</textarea>
                        <button class="btn btn-primary" id="submit-review-btn" style="align-self:flex-start">
                            ${userReview ? 'Actualizar Reseña' : 'Publicar Reseña'}
                        </button>
                    </div>
                </div>` : `<p style="color:var(--text-3);margin-bottom:1.5rem">
                    <a href="#/home" onclick="window.location.hash='/home'" style="color:var(--accent)">Inicia sesión</a> para dejar tu reseña.
                </p>`}

                <div class="reviews-list" id="reviews-list">
                    ${this._renderReviewsList(media.reviews)}
                </div>
            </div>

            <!-- RECOMENDACIONES -->
            ${media.recommendations.length > 0 ? `
            <div class="recs-section">
                <h3 style="margin-bottom:1rem">✨ Recomendaciones similares</h3>
                <div class="recs-scroll">
                    ${media.recommendations.map(r => `
                    <div class="rec-card" data-id="${r.id}">
                        <div class="rec-poster">
                            ${r.image ? `<img src="${r.image}" alt="${r.title}" onerror="this.parentElement.innerHTML='🎬'">` : '🎬'}
                        </div>
                        <div class="rec-body">
                            <div class="rec-title">${r.title}</div>
                            <div style="font-size:0.72rem;color:var(--text-3)">${r.release_year}</div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>` : ''}
        </div>`;

        this._bindEvents(mediaId);
    }

    _renderReviewsList(reviews) {
        if (!reviews || reviews.length === 0) {
            return `<p style="color:var(--text-3);text-align:center;padding:2rem">No hay reseñas todavía. ¡Sé el primero!</p>`;
        }
        return reviews.map(r => `
        <div class="review-card glass">
            <div class="review-header">
                <div class="review-user">
                    <div class="review-avatar">${r.username?.charAt(0)?.toUpperCase()}</div>
                    <div>
                        <div class="review-username">${r.username}</div>
                        <div class="review-date">${formatDate(r.created_at)}</div>
                    </div>
                </div>
                <div class="review-score">
                    ${[...Array(r.rating)].map(() => '<span class="score-star">★</span>').join('')}
                    <span style="color:var(--text-3);font-size:0.8rem;margin-left:4px">${r.rating}/10</span>
                </div>
            </div>
            <p class="review-text">${r.comment}</p>
        </div>`).join('');
    }

    _bindEvents(mediaId) {
        // Star picker
        const stars = document.querySelectorAll('.star-btn');
        const ratingInput = document.getElementById('review-rating');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.getAttribute('data-val'));
                ratingInput.value = val;
                stars.forEach((s, i) => s.classList.toggle('active', i < val));
            });
        });

        // Watch status buttons
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const st = btn.getAttribute('data-status');
                const res = await mediaController.setWatchStatus(mediaId, st);
                if (res?.error) {
                    showToast(res.error, 'error');
                } else {
                    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const badge = document.getElementById('detail-status-badge');
                    if (badge) {
                        badge.className = `status-current-label status-${st}`;
                        const labelMap = { 'no_vista': '👁️ No vista', 'en_proceso': '⏳ En proceso', 'vista': '✅ Vista' };
                        badge.textContent = labelMap[st] || st;
                    }
                    showToast(`Estado actualizado: ${btn.textContent.trim()}`);
                }
            });
        });

        // Critique checkbox
        const critiqueChk = document.getElementById('detail-session-critique-chk');
        if (critiqueChk) {
            critiqueChk.addEventListener('change', () => {
                const formSec = document.getElementById('review-form-section');
                if (formSec) {
                    formSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    document.getElementById('review-comment')?.focus();
                }
            });
        }

        // Submit review
        document.getElementById('submit-review-btn')?.addEventListener('click', async () => {
            const rating  = parseInt(document.getElementById('review-rating').value);
            const comment = document.getElementById('review-comment').value;

            if (!rating) { showToast('Selecciona una puntuación.', 'error'); return; }

            const result = await mediaController.submitReview(mediaId, rating, comment);
            if (result.error) {
                showToast(result.error, 'error');
            } else {
                showToast('¡Reseña publicada!');
                // Refrescar reseñas
                const mediaResult = await mediaController.getMediaById(mediaId);
                if (mediaResult.error) return;
                const list = document.getElementById('reviews-list');
                if (list) list.innerHTML = this._renderReviewsList(mediaResult.data.reviews);
                // Actualizar puntuación visible
                const media = mediaResult.data;
                const avg = media.average_rating?.toFixed(1) || '0.0';
                const bigRating = document.querySelector('.detail-rating-big');
                if (bigRating) bigRating.innerHTML = `⭐ ${avg} <span style="font-size:1rem;color:var(--text-2);font-weight:400">(${media.review_count} reseñas)</span>`;
            }
        });

        // Recomendaciones click
        document.querySelectorAll('.rec-card').forEach(card => {
            card.addEventListener('click', () => router.navigate(`/detail/${card.getAttribute('data-id')}`));
        });
    }
}

// =====================================================
// STATS VIEW
// =====================================================
export class StatsView {
    async render(container) {
        const stats = await mediaController.getStatistics();

        container.innerHTML = `
        <div>
            <div class="section-header">
                <h2 class="section-title">📊 Estadísticas de la Plataforma</h2>
            </div>

            <div class="stats-grid">
                <div class="stat-card glass">
                    <div class="stat-value" style="color:var(--tier-s)">${stats.totalMovies}</div>
                    <div class="stat-label">Películas</div>
                </div>
                <div class="stat-card glass">
                    <div class="stat-value" style="color:var(--accent)">${stats.totalSeries}</div>
                    <div class="stat-label">Series</div>
                </div>
                <div class="stat-card glass">
                    <div class="stat-value" style="color:var(--gold)">${stats.totalReviews}</div>
                    <div class="stat-label">Reseñas Totales</div>
                </div>
                <div class="stat-card glass">
                    <div class="stat-value" style="color:var(--success)">${stats.totalUsers}</div>
                    <div class="stat-label">Usuarios Registrados</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem">
                <div>
                    <h3 style="margin-bottom:1rem">🔥 Más Comentadas</h3>
                    <div class="top-list">
                        ${stats.topByReviews.map((m, i) => `
                        <div class="top-item" data-id="${m.id}" style="cursor:pointer">
                            <div class="top-rank">${i + 1}</div>
                            <div class="top-poster">${m.image ? `<img src="${m.image}" onerror="this.parentElement.innerHTML='🎬'">` : '🎬'}</div>
                            <div class="top-info"><div class="top-title">${m.title}</div><div class="top-meta">${m.review_count} reseñas</div></div>
                        </div>`).join('')}
                    </div>
                </div>
                <div>
                    <h3 style="margin-bottom:1rem">⭐ Mejor Puntuadas</h3>
                    <div class="top-list">
                        ${stats.topByRating.map((m, i) => `
                        <div class="top-item" data-id="${m.id}" style="cursor:pointer">
                            <div class="top-rank">${i + 1}</div>
                            <div class="top-poster">${m.image ? `<img src="${m.image}" onerror="this.parentElement.innerHTML='🎬'">` : '🎬'}</div>
                            <div class="top-info"><div class="top-title">${m.title}</div><div class="top-meta">⭐ ${m.average_rating?.toFixed(1)}</div></div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>`;

        container.querySelectorAll('.top-item[data-id]').forEach(el => {
            el.addEventListener('click', () => router.navigate(`/detail/${el.getAttribute('data-id')}`));
        });
    }
}

// =====================================================
// WATCHLIST VIEW (Mi Lista)
// =====================================================
export class WatchlistView {
    async render(container) {
        const [list, userUI] = await Promise.all([
            mediaController.getWatchlist(),
            loadUserUI()
        ]);
        container.innerHTML = `
        <div>
            <div class="section-header">
                <h2 class="section-title">💖 Mi Lista de Favoritos</h2>
                <span style="font-size:0.85rem;color:var(--text-3)">${list.length} contenidos guardados</span>
            </div>
            ${list.length > 0 ? `
                <div class="media-grid">
                    ${list.map(m => mediaCardHTML(m, cardUI(userUI, m.id))).join('')}
                </div>
            ` : `
                <div style="text-align:center;padding:4rem 1rem;color:var(--text-3)">
                    <div style="font-size:3.5rem;margin-bottom:1rem">💖</div>
                    <h3 style="color:var(--text-1);margin-bottom:0.5rem">Tu lista está vacía</h3>
                    <p style="max-width:400px;margin:0 auto 1.5rem">Guarda tus películas y series favoritas haciendo clic en el corazón 🤍 de cualquier tarjeta.</p>
                    <button class="btn btn-primary" onclick="window.location.hash='/movies'">Explorar Catálogo</button>
                </div>
            `}
        </div>`;
        bindCardClicks(container);
    }
}

// =====================================================
// TIER LIST VIEW (Drag & Drop con SortableJS CDN)
// =====================================================
export class TierListView {
    async render(container) {
        const [catalog, tierStates] = await Promise.all([
            mediaController.getCatalog({ limit: 100 }),
            mediaController.getTierStates()
        ]);
        const allMedia = catalog.data || [];

        // Agrupar por tier
        const tiers = { S: [], A: [], B: [], C: [], D: [], pool: [] };
        allMedia.forEach(media => {
            const tierEntry = tierStates.find(t => t.media_id === media.id);
            const tier = tierEntry?.tier || 'pool';
            if (tiers[tier]) tiers[tier].push(media);
            else tiers.pool.push(media);
        });

        const tierCard = (media) => `
        <div class="tier-media-card" data-id="${media.id}" title="${media.title}">
            ${media.image ? `<img src="${media.image}" alt="${media.title}" onerror="this.parentElement.innerHTML='🎬'" loading="lazy">` : '🎬'}
            <div class="tier-title">${media.title}</div>
        </div>`;

        container.innerHTML = `
        <div>
            <div class="section-header">
                <h2 class="section-title">📋 Mi Tier List Personal</h2>
                <div style="display:flex;gap:10px;align-items:center">
                    <button class="btn btn-secondary btn-sm" id="btn-export-tier">📋 Exportar Tier List</button>
                    <span style="font-size:0.82rem;color:var(--text-3)">Arrastra las tarjetas entre los niveles</span>
                </div>
            </div>

            <div class="tier-list">
                ${['S','A','B','C','D'].map(t => `
                <div class="tier-row">
                    <div class="tier-label tier-label-${t.toLowerCase()}">${t}</div>
                    <div class="tier-drop" id="tier-${t}">
                        ${tiers[t].map(m => tierCard(m)).join('')}
                    </div>
                </div>`).join('')}
            </div>

            <div class="tier-pool-container">
                <h3>Sin clasificar</h3>
                <div class="tier-pool" id="tier-pool">
                    ${tiers.pool.map(m => tierCard(m)).join('')}
                </div>
            </div>
        </div>`;

        document.getElementById('btn-export-tier')?.addEventListener('click', () => {
            let text = "🏆 MI TIER LIST - CINECLASSIFY PRO 🏆\n\n";
            ['S','A','B','C','D'].forEach(t => {
                const names = tiers[t].map(m => m.title);
                text += `Tier ${t}: ${names.length ? names.join(', ') : '(Ninguno)'}\n`;
            });
            navigator.clipboard.writeText(text).then(() => {
                showToast('¡Tier List copiada al portapapeles! 📋');
            }).catch(() => {
                alert(text);
            });
        });

        this._initDragDrop();
    }

    _initDragDrop() {
        // Cargar SortableJS dinámicamente
        if (typeof Sortable === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js';
            script.onload = () => this._setupSortable();
            document.head.appendChild(script);
        } else {
            this._setupSortable();
        }
    }

    _setupSortable() {
        const containers = document.querySelectorAll('.tier-drop, .tier-pool');
        containers.forEach(el => {
            new Sortable(el, {
                group: 'tierlist',
                animation: 180,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                onEnd: (evt) => {
                    const mediaId = evt.item.getAttribute('data-id');
                    const newTier = evt.to.id.replace('tier-', ''); // 'S', 'A', etc. or 'pool'
                    mediaController.saveTierState(mediaId, newTier).then(res => {
                        if (res?.error) showToast(res.error, 'error');
                    });
                }
            });
        });
    }
}

// =====================================================
// ADMIN VIEW (Panel de Administración)
// =====================================================
export class AdminView {
    constructor(mode = 'media') {
        this._mode = mode;
    }

    async render(container) {
        if (this._mode === 'media') await this._renderMediaAdmin(container);
        else await this._renderUsersAdmin(container);
    }

    async _renderMediaAdmin(container) {
        const [result, genres] = await Promise.all([
            mediaController.getCatalog({ limit: 100 }),
            mediaController.getGenres()
        ]);

        container.innerHTML = `
        <div>
            <div class="section-header">
                <h2 class="section-title">⚙️ Gestionar Contenido</h2>
                <button class="btn btn-primary btn-sm" id="add-media-btn">+ Añadir</button>
            </div>

            <div class="admin-table-wrapper">
                <table class="admin-table">
                    <thead><tr>
                        <th>Título</th><th>Tipo</th><th>Año</th><th>Géneros</th><th>⭐ Puntuación</th><th>Reseñas</th><th>Acciones</th>
                    </tr></thead>
                    <tbody>
                        ${result.data.map(m => `
                        <tr>
                            <td><strong>${m.title}</strong></td>
                            <td><span class="badge ${m.type === 'movie' ? 'badge-type-movie' : 'badge-type-series'}">${m.type === 'movie' ? 'Película' : 'Serie'}</span></td>
                            <td>${m.release_year}</td>
                            <td>${genres.filter(g => m.genre_ids?.includes(g.id)).map(g => g.name).join(', ') || '—'}</td>
                            <td>${m.average_rating > 0 ? '⭐ ' + m.average_rating?.toFixed(1) : '—'}</td>
                            <td>${m.review_count}</td>
                            <td>
                                <div class="admin-actions">
                                    <button class="btn btn-secondary btn-sm edit-btn" data-id="${m.id}">✏️ Editar</button>
                                    <button class="btn btn-danger btn-sm delete-btn" data-id="${m.id}">🗑️ Eliminar</button>
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;

        document.getElementById('add-media-btn')?.addEventListener('click', () => this._openModal(null, genres, container));
        container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const media = (await mediaController.getMediaById(btn.getAttribute('data-id')))?.data;
                if (media) this._openModal(media, genres, container);
            });
        });
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirmAction('¿Seguro que deseas eliminar este contenido? Esta acción no se puede deshacer.')) {
                    await mediaController.deleteMedia(btn.getAttribute('data-id'));
                    showToast('Contenido eliminado.');
                    await this._renderMediaAdmin(container);
                }
            });
        });
    }

    _openModal(media, genres, container) {
        const isEdit = !!media;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-header">
                <h2 class="modal-title">${isEdit ? 'Editar' : 'Añadir'} Contenido</h2>
                <button class="btn btn-icon close-modal">✕</button>
            </div>
            <form class="modal-form" id="media-modal-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Título *</label>
                        <input class="input-field" name="title" required value="${media?.title || ''}">
                    </div>
                    <div class="form-group">
                        <label>Tipo *</label>
                        <select class="input-field" name="type">
                            <option value="movie" ${media?.type === 'movie' ? 'selected' : ''}>🎬 Película</option>
                            <option value="series" ${media?.type === 'series' ? 'selected' : ''}>📺 Serie</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Año de estreno *</label>
                        <input class="input-field" name="release_year" type="number" min="1900" max="2030" required value="${media?.release_year || ''}">
                    </div>
                    <div class="form-group">
                        <label>Clasificación por edades</label>
                        <select class="input-field" name="age_rating">
                            ${['G','PG','PG-13','R','NC-17','TV-G','TV-PG','TV-14','TV-MA'].map(r => `<option ${media?.age_rating === r ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Géneros</label>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">
                        ${genres.map(g => `<label style="display:flex;align-items:center;gap:5px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" name="genre_ids" value="${g.id}" ${media?.genre_ids?.includes(g.id) ? 'checked' : ''}> ${g.name}
                        </label>`).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Sinopsis</label>
                    <textarea class="input-field" name="synopsis" style="min-height:80px;resize:vertical">${media?.synopsis || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Director</label>
                        <input class="input-field" name="director" value="${media?.director || ''}">
                    </div>
                    <div class="form-group">
                        <label>Duración</label>
                        <input class="input-field" name="duration" placeholder="ej: 120 min" value="${media?.duration || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Reparto principal</label>
                    <input class="input-field" name="cast" value="${media?.cast || ''}">
                </div>
                <div class="form-group">
                    <label>URL de la carátula (imagen)</label>
                    <input class="input-field" name="image" type="url" value="${media?.image || ''}">
                </div>
                <p class="error-msg" id="modal-error"></p>
                <div style="display:flex;gap:10px;justify-content:flex-end">
                    <button type="button" class="btn btn-secondary close-modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear'}</button>
                </div>
            </form>
        </div>`;

        document.body.appendChild(overlay);
        overlay.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => overlay.remove()));
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        document.getElementById('media-modal-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const genre_ids = [...e.target.querySelectorAll('[name=genre_ids]:checked')].map(c => parseInt(c.value));
            const data = {
                title: fd.get('title'), type: fd.get('type'),
                release_year: fd.get('release_year'), synopsis: fd.get('synopsis'),
                director: fd.get('director'), cast: fd.get('cast'),
                duration: fd.get('duration'), age_rating: fd.get('age_rating'),
                image: fd.get('image'), genre_ids
            };

            const result = isEdit ? await mediaController.updateMedia(media.id, data) : await mediaController.createMedia(data);
            if (result.error) { document.getElementById('modal-error').textContent = result.error; return; }
            overlay.remove();
            showToast(isEdit ? 'Contenido actualizado.' : 'Contenido creado correctamente.');
            await this._renderMediaAdmin(container);
        });
    }

    async _renderUsersAdmin(container) {
        const result = await mediaController.getAllUsers();
        if (result.error) { container.innerHTML = `<p class="error-msg">${result.error}</p>`; return; }

        const currentId = authController.getUserId();

        container.innerHTML = `
        <div>
            <div class="section-header">
                <h2 class="section-title">👥 Gestionar Usuarios</h2>
            </div>
            <div class="admin-table-wrapper">
                <table class="admin-table">
                    <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Registrado</th><th>Acciones</th></tr></thead>
                    <tbody>
                        ${result.data.map(u => `
                        <tr>
                            <td><strong>${u.username}</strong></td>
                            <td style="color:var(--text-2)">${u.email}</td>
                            <td><span class="badge ${u.role === 'admin' ? 'badge-type-movie' : 'badge-genre'}">${u.role}</span></td>
                            <td style="color:var(--text-3)">${formatDate(u.created_at)}</td>
                            <td>
                                ${u.id !== currentId ? `
                                <div class="admin-actions">
                                    <button class="btn btn-secondary btn-sm toggle-role-btn" data-id="${u.id}" data-role="${u.role}">
                                        ${u.role === 'admin' ? 'Quitar Admin' : 'Hacer Admin'}
                                    </button>
                                    <button class="btn btn-danger btn-sm delete-user-btn" data-id="${u.id}">🗑️</button>
                                </div>` : '<span style="color:var(--text-3);font-size:0.8rem">Tú</span>'}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;

        container.querySelectorAll('.toggle-role-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newRole = btn.getAttribute('data-role') === 'admin' ? 'user' : 'admin';
                await mediaController.updateUserRole(btn.getAttribute('data-id'), newRole);
                showToast('Rol actualizado.');
                await this._renderUsersAdmin(container);
            });
        });
        container.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirmAction('¿Eliminar este usuario?')) {
                    await mediaController.deleteUser(btn.getAttribute('data-id'));
                    showToast('Usuario eliminado.');
                    await this._renderUsersAdmin(container);
                }
            });
        });
    }
}
