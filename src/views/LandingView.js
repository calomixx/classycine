/**
 * src/views/LandingView.js
 * Vista Pública - Landing Page
 */
export class LandingView {
    constructor() {
        this.render = this.render.bind(this);
    }

    _getPreviewData() {
        // Obtenemos los datos del LocalStorage simulando acceso global a DB
        // En una app real, usaríamos MediaController
        try {
            const mediaStr = localStorage.getItem('db_media');
            if (mediaStr) {
                const media = JSON.parse(mediaStr);
                return media.filter(m => m.type === 'movie').sort((a,b) => b.average_rating - a.average_rating).slice(0, 3);
            }
        } catch (e) {
            console.warn("No se pudieron cargar los datos de preview", e);
        }
        return [];
    }

    render(container) {
        const topMedia = this._getPreviewData();

        container.innerHTML = `
            <div class="landing-page">
                
                <!-- HEADER NAV -->
                <header class="landing-header">
                    <div class="landing-brand">
                        Cine<span class="highlight">Classify</span>
                    </div>
                    <nav class="landing-nav">
                        <a href="#/" class="nav-link">Inicio</a>
                        <a href="#/preview" class="nav-link" id="nav-preview-link">Catálogo</a>
                        <a href="#/contact" class="nav-link" id="nav-contact-link">Contacto</a>
                    </nav>
                    <div class="landing-actions">
                        <button class="btn btn-secondary" id="btn-landing-login">Iniciar Sesión</button>
                        <button class="btn btn-primary" id="btn-landing-register">Registrarse</button>
                    </div>
                </header>

                <!-- HERO SECTION -->
                <section class="landing-hero">
                    <div class="hero-content">
                        <h1 class="hero-title">Tu universo cinematográfico, <span class="highlight">organizado.</span></h1>
                        <p class="hero-subtitle">Descubre, clasifica y gestiona tus películas y series favoritas en una plataforma diseñada exclusivamente para auténticos cinéfilos.</p>
                        <button class="btn btn-primary btn-lg" id="btn-hero-explore">Explorar ahora</button>
                    </div>
                </section>

                <!-- DASHBOARD PREVIEW -->
                <section class="landing-preview" id="preview-section">
                    <div class="section-header">
                        <h2 class="section-title">Un vistazo al <span>Catálogo</span></h2>
                    </div>
                    <div class="media-grid">
                        ${topMedia.length > 0 ? topMedia.map(m => `
                            <article class="media-card">
                                <div class="card-poster">
                                    <img src="${m.image}" alt="${m.title}" loading="lazy">
                                </div>
                                <div class="card-body">
                                    <div class="card-title">${m.title}</div>
                                    <div class="card-meta">
                                        <span class="card-rating">⭐ ${m.average_rating > 0 ? m.average_rating.toFixed(1) : 'S/N'}</span>
                                        <span class="card-year">${m.release_year}</span>
                                    </div>
                                </div>
                            </article>
                        `).join('') : '<p style="color:var(--text-3)">Catálogo no disponible en este momento.</p>'}
                    </div>
                </section>

                <!-- CONTACTO -->
                <section class="landing-contact" id="contact-section">
                    <div class="contact-box glass">
                        <h2 style="text-align: center; margin-bottom: 2rem;">Contáctanos</h2>
                        <form id="landing-contact-form" class="auth-form">
                            <div class="form-group">
                                <label>Nombre</label>
                                <input type="text" class="input-field" placeholder="Ej. John Doe" required>
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" class="input-field" placeholder="tu@email.com" required>
                            </div>
                            <div class="form-group">
                                <label>Mensaje</label>
                                <textarea class="input-field review-textarea" placeholder="¿En qué podemos ayudarte?" required></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary" style="margin-top: 1rem;">Enviar Mensaje</button>
                        </form>
                    </div>
                </section>

                <!-- FOOTER -->
                <footer class="landing-footer">
                    <div class="footer-socials">
                        <a href="#" aria-label="GitHub"><i class="shell-icon" data-lucide="github"></i></a>
                        <a href="#" aria-label="Twitter"><i class="shell-icon" data-lucide="twitter"></i></a>
                        <a href="#" aria-label="LinkedIn"><i class="shell-icon" data-lucide="linkedin"></i></a>
                    </div>
                    <p class="footer-credits">Desarrollado por [Tu Nombre] - Estudiante de Informática</p>
                </footer>

            </div>
        `;

        this._bindEvents(container);

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    _bindEvents(container) {
        container.querySelector('#btn-landing-login').addEventListener('click', () => { window.location.hash = '/login'; });
        container.querySelector('#btn-landing-register').addEventListener('click', () => { window.location.hash = '/register'; });
        container.querySelector('#btn-hero-explore').addEventListener('click', () => { window.location.hash = '/login'; });

        // Scroll suave a secciones
        container.querySelector('#nav-preview-link').addEventListener('click', (e) => {
            e.preventDefault();
            container.querySelector('#preview-section').scrollIntoView({ behavior: 'smooth' });
        });
        
        container.querySelector('#nav-contact-link').addEventListener('click', (e) => {
            e.preventDefault();
            container.querySelector('#contact-section').scrollIntoView({ behavior: 'smooth' });
        });

        // Simular envío de formulario
        container.querySelector('#landing-contact-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const toast = document.createElement('div');
            toast.textContent = '¡Mensaje enviado con éxito!';
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#50fa7b;color:#0b0c10;padding:12px 20px;border-radius:10px;z-index:9999;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.5);animation:slideUp 0.3s ease-out;';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
            e.target.reset();
        });
    }
}
