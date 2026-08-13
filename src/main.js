/**
 * main.js - Punto de entrada de CineClassify Pro (ES Modules)
 */
import { router } from './Router.js';
import { authController } from './controllers/AuthController.js';
import { AuthView } from './views/AuthView.js';
import { LayoutView } from './views/LayoutView.js';
import { HomeView, CatalogView, DetailView, StatsView, TierListView, WatchlistView, AdminMediaView, AdminUsersView } from './views/Views.js';

function initApp() {
    const root = document.getElementById('root');

    const renderAuth = () => {
        const authView = new AuthView(() => renderMain());
        authView.render(root);
    };

    const renderMain = () => {
        const layoutView = new LayoutView(() => renderAuth());
        layoutView.render(root);

        const container = layoutView.getContentContainer();

        const homeView       = new HomeView();
        const movieCatalog   = new CatalogView('movie');
        const seriesCatalog  = new CatalogView('series');
        const topView        = new CatalogView('all');
        const statsView      = new StatsView();
        const tierView       = new TierListView();
        const watchlistView  = new WatchlistView();
        const detailView     = new DetailView();
        const adminMediaView = new AdminMediaView();
        const adminUsersView = new AdminUsersView();

        router
            .on('/',          () => { layoutView.setActiveNav('/home'); homeView.render(container); })
            .on('/home',      () => { layoutView.setActiveNav('/home'); homeView.render(container); })
            .on('/movies',    () => {
                layoutView.setActiveNav('/movies');
                const q = new URLSearchParams(window.location.hash.split('?')[1] || '').get('q') || '';
                movieCatalog.render(container, q ? { query: q } : {});
            })
            .on('/series',    () => { layoutView.setActiveNav('/series'); seriesCatalog.render(container); })
            .on('/top',       () => { layoutView.setActiveNav('/top'); topView.render(container, { sort: 'rating' }); })
            .on('/stats',     () => { layoutView.setActiveNav('/stats'); statsView.render(container); })
            .on('/watchlist', () => { layoutView.setActiveNav('/watchlist'); watchlistView.render(container); })
            .on('/tierlist',  () => { layoutView.setActiveNav('/tierlist'); tierView.render(container); })
            .on('/detail',    (id) => { layoutView.setActiveNav(''); detailView.render(container, id); })
            .on('/admin/media', () => { layoutView.setActiveNav('/admin/media'); adminMediaView.render(container); })
            .on('/admin/users', () => { layoutView.setActiveNav('/admin/users'); adminUsersView.render(container); })
            .on('*',          () => { router.navigate('/home'); });

        router.start();
    };

    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 500); }
        if (authController.isAuthenticated()) renderMain();
        else renderAuth();
    }, 900);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
