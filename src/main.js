/**
 * main.js - Punto de entrada de CineClassify Pro (ES Modules)
 */
import { router } from './Router.js';
import { authController } from './controllers/AuthController.js';
import { AuthView } from './views/AuthView.js';
import { LayoutView } from './views/LayoutView.js';
import { LandingView } from './views/LandingView.js';
import { HomeView, CatalogView, DetailView, StatsView, TierListView, WatchlistView, AdminView } from './views/Views.js';

function initApp() {
    const root = document.getElementById('root');
    const landingView = new LandingView();

    const renderLanding = () => {
        landingView.render(root);
    };

    const renderAuth = (isRegister = false) => {
        const authView = new AuthView(() => {
            router.navigate('/home');
            renderMain();
        });
        authView.render(root);
        // Pequeño hack para simular click en el tab correspondiente si es registro
        if (isRegister) {
            setTimeout(() => {
                const regTab = document.getElementById('tab-register');
                if (regTab) regTab.click();
            }, 50);
        }
    };

    let layoutViewInstance = null;

    const renderMain = () => {
        if (!layoutViewInstance) {
            layoutViewInstance = new LayoutView(() => {
                authController.logout();
                router.navigate('/');
                renderLanding();
            });
            layoutViewInstance.render(root);
        } else if (!document.getElementById('app-layout')) {
            layoutViewInstance.render(root);
        }
    };

    // Vistas hijas
    const homeView       = new HomeView();
    const movieCatalog   = new CatalogView('movie');
    const seriesCatalog  = new CatalogView('series');
    const topView        = new CatalogView('all');
    const statsView      = new StatsView();
    const tierView       = new TierListView();
    const watchlistView  = new WatchlistView();
    const detailView     = new DetailView();
    const adminMediaView = new AdminView('media');
    const adminUsersView = new AdminView('users');

    const requireAuth = (callback) => {
        return (...args) => {
            if (!authController.isAuthenticated()) {
                router.navigate('/login');
            } else {
                renderMain();
                const container = layoutViewInstance.getContentContainer();
                callback(container, ...args);
            }
        };
    };

    router
        .on('/', () => {
            if (authController.isAuthenticated()) router.navigate('/home');
            else renderLanding();
        })
        .on('/login', () => {
            if (authController.isAuthenticated()) router.navigate('/home');
            else renderAuth(false);
        })
        .on('/register', () => {
            if (authController.isAuthenticated()) router.navigate('/home');
            else renderAuth(true);
        })
        .on('/home',      requireAuth((c) => { layoutViewInstance.setActiveNav('/home'); homeView.render(c); }))
        .on('/movies',    requireAuth((c) => {
            layoutViewInstance.setActiveNav('/movies');
            const q = new URLSearchParams(window.location.hash.split('?')[1] || '').get('q') || '';
            movieCatalog.render(c, q ? { query: q } : {});
        }))
        .on('/series',    requireAuth((c) => { layoutViewInstance.setActiveNav('/series'); seriesCatalog.render(c); }))
        .on('/top',       requireAuth((c) => { layoutViewInstance.setActiveNav('/top'); topView.render(c, { sort: 'rating' }); }))
        .on('/stats',     requireAuth((c) => { layoutViewInstance.setActiveNav('/stats'); statsView.render(c); }))
        .on('/watchlist', requireAuth((c) => { layoutViewInstance.setActiveNav('/watchlist'); watchlistView.render(c); }))
        .on('/tierlist',  requireAuth((c) => { layoutViewInstance.setActiveNav('/tierlist'); tierView.render(c); }))
        .on('/detail',    requireAuth((c, id) => { layoutViewInstance.setActiveNav(''); detailView.render(c, id); }))
        .on('/admin/media', requireAuth((c) => { layoutViewInstance.setActiveNav('/admin/media'); adminMediaView.render(c); }))
        .on('/admin/users', requireAuth((c) => { layoutViewInstance.setActiveNav('/admin/users'); adminUsersView.render(c); }))
        .on('*',          () => { router.navigate('/'); });

    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 500); }
        router.start();
    }, 900);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
