/**
 * helpers.js
 * 
 * Utilidades de UI compartidas: renderizado de estrellas,
 * formateo de fechas, creación de elementos DOM, toast notifications.
 */

// ---- Generar estrellas según puntuación (1-10) ----
export function renderStars(rating, max = 10) {
    const filled  = Math.round(rating);
    const empty   = max - filled;
    return '★'.repeat(filled) + '☆'.repeat(empty);
}

// ---- Generar badges de géneros ----
export function renderGenreBadges(genres = []) {
    return genres.map(g => `<span class="badge badge-genre">${g}</span>`).join('');
}

// ---- Formatear fecha ----
export function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- Imagen del poster (con fallback emoji) ----
export function posterHTML(image, alt = '', cls = '') {
    if (image) {
        return `<img src="${image}" alt="${alt}" loading="lazy" onerror="this.parentElement.innerHTML='🎬'">`;
    }
    return '🎬';
}

// ---- Toast Notifications ----
let toastTimeout;
export function showToast(message, type = 'success') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:9999;
            padding:12px 20px; border-radius:10px;
            font-size:0.9rem; font-weight:600;
            box-shadow:0 8px 24px rgba(0,0,0,0.5);
            transform:translateY(100px); opacity:0;
            transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
            max-width:320px; line-height:1.4;
        `;
        document.body.appendChild(toast);
    }

    const colors = {
        success: { bg: 'rgba(80,250,123,0.15)', border: 'rgba(80,250,123,0.4)', color: '#50fa7b' },
        error:   { bg: 'rgba(255,85,85,0.15)',  border: 'rgba(255,85,85,0.4)',  color: '#ff5555' },
        info:    { bg: 'rgba(139,233,253,0.1)', border: 'rgba(139,233,253,0.3)', color: '#8be9fd' },
    };
    const c = colors[type] || colors.info;
    toast.style.background  = c.bg;
    toast.style.border      = `1px solid ${c.border}`;
    toast.style.color       = c.color;
    toast.textContent = message;

    clearTimeout(toastTimeout);
    requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity   = '1';
    });

    toastTimeout = setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity   = '0';
    }, 3500);
}

// ---- Crear elemento DOM desde HTML string ----
export function createElement(html) {
    const div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.firstChild;
}

// ---- Confirmar acción (reemplaza window.confirm) ----
export function confirmAction(message) {
    return window.confirm(message);
}

// ---- Avatar iniciales ----
export function getInitials(name) {
    return name?.charAt(0)?.toUpperCase() || '?';
}
