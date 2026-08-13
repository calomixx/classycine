/**
 * DATABASE.js
 * 
 * MODELO RELACIONAL SIMULADO (3FN) en localStorage.
 * Incluye: Índices, Triggers (JS), Vistas Materializadas,
 * Transacciones y Procedimientos Almacenados simulados.
 * 
 * TABLAS: users, media, genres, media_genres, reviews, tier_states
 */

// =====================================================
// DEFINICIÓN DEL ESQUEMA (simulado en memoria)
// =====================================================
const SCHEMA = {
    users: {
        columns: ['id','username','email','password_hash','role','created_at'],
        pk: 'id',
        // ÍNDICES: username y email son únicos (búsqueda O(1) con Map)
        indexes: ['username','email']
    },
    media: {
        columns: ['id','type','title','release_year','genre_ids','synopsis','director','cast','duration','age_rating','image','average_rating','review_count','created_at','updated_at'],
        pk: 'id',
        indexes: ['title','type','release_year','director']
    },
    genres: {
        columns: ['id','name'],
        pk: 'id'
    },
    reviews: {
        columns: ['id','user_id','media_id','rating','comment','created_at'],
        pk: 'id',
        unique: 'user_id+media_id'
    },
    tier_states: {
        columns: ['id','user_id','media_id','tier'],
        pk: 'id',
        unique: 'user_id+media_id'
    },
    watchlist: {
        columns: ['id','user_id','media_id','created_at'],
        pk: 'id',
        unique: 'user_id+media_id'
    },
    watch_status: {
        columns: ['id','user_id','media_id','status','updated_at'],
        pk: 'id',
        unique: 'user_id+media_id'
    }
};

// =====================================================
// CLASE DATABASE (ORM ligero)
// =====================================================
export class Database {
    constructor() {
        this._initTables();
        this._seedIfEmpty();
        this._rebuildIndexes();
    }

    // ----- TABLES INIT -----
    _initTables() {
        Object.keys(SCHEMA).forEach(table => {
            if (!localStorage.getItem(`db_${table}`)) {
                localStorage.setItem(`db_${table}`, JSON.stringify([]));
            }
        });
    }

    _getTable(table) {
        return JSON.parse(localStorage.getItem(`db_${table}`) || '[]');
    }

    _setTable(table, data) {
        localStorage.setItem(`db_${table}`, JSON.stringify(data));
        // Trigger: Reconstruir índices al modificar tabla
        this._rebuildIndexes();
    }

    // ----- INDEXES (Estructuras en RAM para búsqueda eficiente) -----
    _indexes = {}; // { table_column: Map<value, row[]> }

    _rebuildIndexes() {
        ['users', 'media', 'reviews'].forEach(table => {
            const data = this._getTable(table);
            const schema = SCHEMA[table];
            if (!schema?.indexes) return;
            schema.indexes.forEach(col => {
                const key = `${table}_${col}`;
                const map = new Map();
                data.forEach(row => {
                    const val = row[col]?.toLowerCase?.() ?? row[col];
                    if (!map.has(val)) map.set(val, []);
                    map.get(val).push(row);
                });
                this._indexes[key] = map;
            });
        });
    }

    // Búsqueda por índice (O(1) para igualdad)
    _findByIndex(table, column, value) {
        const key = `${table}_${column}`;
        if (this._indexes[key]) {
            const val = value?.toLowerCase?.() ?? value;
            return this._indexes[key].get(val) || [];
        }
        return this._getTable(table).filter(r => r[column] === value);
    }

    // ----- UUID GENERATOR -----
    _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // =====================================================
    // TRIGGER: update_media_rating
    // Se ejecuta automáticamente al insertar/actualizar una review.
    // Recalcula average_rating y review_count en la tabla media.
    // =====================================================
    _trigger_update_media_rating(media_id) {
        const allReviews = this._getTable('reviews').filter(r => r.media_id === media_id);
        const count = allReviews.length;
        const avg = count > 0
            ? (allReviews.reduce((a, r) => a + r.rating, 0) / count)
            : 0;

        const mediaTable = this._getTable('media');
        const idx = mediaTable.findIndex(m => m.id === media_id);
        if (idx !== -1) {
            mediaTable[idx].average_rating = parseFloat(avg.toFixed(2));
            mediaTable[idx].review_count = count;
            mediaTable[idx].updated_at = new Date().toISOString();
            this._setTable('media', mediaTable);
        }

        // También invalida la vista materializada
        this._refreshMaterializedView_TopMedia();
    }

    // =====================================================
    // VISTA MATERIALIZADA: mv_top_media
    // Precalcula el TOP 10 global para respuesta instantánea.
    // Se refresca tras cada cambio en reviews.
    // =====================================================
    _refreshMaterializedView_TopMedia() {
        const media = this._getTable('media');
        const topMovies = [...media]
            .filter(m => m.type === 'movie' && m.review_count > 0)
            .sort((a, b) => b.average_rating - a.average_rating || b.review_count - a.review_count)
            .slice(0, 10);
        const topSeries = [...media]
            .filter(m => m.type === 'series' && m.review_count > 0)
            .sort((a, b) => b.average_rating - a.average_rating || b.review_count - a.review_count)
            .slice(0, 10);

        localStorage.setItem('mv_top_movies', JSON.stringify(topMovies));
        localStorage.setItem('mv_top_series', JSON.stringify(topSeries));
    }

    getTopMovies() { return JSON.parse(localStorage.getItem('mv_top_movies') || '[]'); }
    getTopSeries()  { return JSON.parse(localStorage.getItem('mv_top_series') || '[]'); }

    // =====================================================
    // PROCEDIMIENTO ALMACENADO: sp_get_statistics
    // Compila estadísticas globales de la plataforma.
    // =====================================================
    sp_get_statistics() {
        const media   = this._getTable('media');
        const reviews = this._getTable('reviews');
        const users   = this._getTable('users');

        const totalMovies  = media.filter(m => m.type === 'movie').length;
        const totalSeries  = media.filter(m => m.type === 'series').length;
        const totalReviews = reviews.length;
        const totalUsers   = users.filter(u => u.role !== 'admin').length;

        const topByReviews = [...media]
            .sort((a, b) => b.review_count - a.review_count)
            .slice(0, 5);
        const topByRating  = [...media]
            .filter(m => m.review_count > 0)
            .sort((a, b) => b.average_rating - a.average_rating)
            .slice(0, 5);

        return { totalMovies, totalSeries, totalReviews, totalUsers, topByReviews, topByRating };
    }

    // =====================================================
    // USERS
    // =====================================================
    createUser({ username, email, password_hash, role = 'user' }) {
        // Validar unicidad (índice único)
        const byUser  = this._findByIndex('users', 'username', username);
        const byEmail = this._findByIndex('users', 'email', email);
        if (byUser.length)  return { error: 'El nombre de usuario ya existe.' };
        if (byEmail.length) return { error: 'El email ya está registrado.' };

        const user = { id: this._uuid(), username, email, password_hash, role, created_at: new Date().toISOString() };
        const table = this._getTable('users');
        table.push(user);
        this._setTable('users', table);
        return { data: user };
    }

    findUserByUsername(username) {
        const rows = this._findByIndex('users', 'username', username.toLowerCase());
        return rows.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
    }

    findUserById(id) {
        return this._getTable('users').find(u => u.id === id) || null;
    }

    getAllUsers() {
        return this._getTable('users');
    }

    updateUserRole(userId, role) {
        const table = this._getTable('users');
        const idx = table.findIndex(u => u.id === userId);
        if (idx !== -1) { table[idx].role = role; this._setTable('users', table); }
    }

    deleteUser(userId) {
        const table = this._getTable('users').filter(u => u.id !== userId);
        this._setTable('users', table);
    }

    // =====================================================
    // MEDIA
    // =====================================================
    createMedia(data) {
        const media = {
            id: this._uuid(),
            type: data.type || 'movie',
            title: data.title,
            release_year: parseInt(data.release_year) || new Date().getFullYear(),
            genre_ids: data.genre_ids || [],
            synopsis: data.synopsis || '',
            director: data.director || '',
            cast: data.cast || '',
            duration: data.duration || '',
            age_rating: data.age_rating || 'PG',
            image: data.image || '',
            average_rating: 0,
            review_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const table = this._getTable('media');
        table.push(media);
        this._setTable('media', table);
        return { data: media };
    }

    getAllMedia() { return this._getTable('media'); }

    getMediaById(id) {
        return this._getTable('media').find(m => m.id === id) || null;
    }

    updateMedia(id, updates) {
        const table = this._getTable('media');
        const idx = table.findIndex(m => m.id === id);
        if (idx !== -1) {
            table[idx] = { ...table[idx], ...updates, id, updated_at: new Date().toISOString() };
            this._setTable('media', table);
            return { data: table[idx] };
        }
        return { error: 'Media no encontrada.' };
    }

    deleteMedia(id) {
        this._setTable('media', this._getTable('media').filter(m => m.id !== id));
        this._setTable('reviews', this._getTable('reviews').filter(r => r.media_id !== id));
        this._setTable('tier_states', this._getTable('tier_states').filter(t => t.media_id !== id));
        this._refreshMaterializedView_TopMedia();
    }

    /**
     * BÚSQUEDA FULL-TEXT con filtros avanzados y paginación.
     * Función definida por el usuario (UDF).
     */
    searchMedia({ query = '', type = 'all', genre_id = null, year = null, director = '', min_rating = 0, sort = 'title', page = 1, limit = 20 }) {
        let results = this._getTable('media');

        // Filtros
        if (type !== 'all') results = results.filter(m => m.type === type);
        if (genre_id) results = results.filter(m => m.genre_ids?.includes(parseInt(genre_id)));
        if (year) results = results.filter(m => m.release_year === parseInt(year));
        if (min_rating > 0) results = results.filter(m => m.average_rating >= parseFloat(min_rating));
        if (director) results = results.filter(m => m.director.toLowerCase().includes(director.toLowerCase()));

        // Búsqueda full-text (título, sinopsis, reparto, director)
        if (query) {
            const q = query.toLowerCase();
            results = results.filter(m =>
                m.title.toLowerCase().includes(q) ||
                m.synopsis?.toLowerCase().includes(q) ||
                m.cast?.toLowerCase().includes(q) ||
                m.director?.toLowerCase().includes(q)
            );
        }

        // Ordenación
        results.sort((a, b) => {
            switch (sort) {
                case 'rating': return b.average_rating - a.average_rating;
                case 'year':   return b.release_year - a.release_year;
                case 'reviews':return b.review_count - a.review_count;
                default:       return a.title.localeCompare(b.title);
            }
        });

        // Paginación eficiente con offset
        const total = results.length;
        const totalPages = Math.ceil(total / limit);
        const offset = (page - 1) * limit;
        const data = results.slice(offset, offset + limit);

        return { data, total, page, totalPages, limit };
    }

    // Recomendaciones por género o director
    getRecommendations(mediaId, limit = 8) {
        const media = this.getMediaById(mediaId);
        if (!media) return [];
        return this._getTable('media')
            .filter(m => m.id !== mediaId && (
                m.genre_ids?.some(g => media.genre_ids?.includes(g)) ||
                (m.director && m.director === media.director)
            ))
            .sort((a, b) => b.average_rating - a.average_rating)
            .slice(0, limit);
    }

    // =====================================================
    // REVIEWS (Con transacción simulada)
    // =====================================================
    createOrUpdateReview({ user_id, media_id, rating, comment }) {
        // TRANSACCIÓN: validar y escribir atómicamente
        try {
            const reviews = this._getTable('reviews');
            const existing = reviews.findIndex(r => r.user_id === user_id && r.media_id === media_id);

            if (existing !== -1) {
                reviews[existing].rating = parseInt(rating);
                reviews[existing].comment = comment;
                reviews[existing].updated_at = new Date().toISOString();
            } else {
                reviews.push({
                    id: this._uuid(), user_id, media_id,
                    rating: parseInt(rating), comment,
                    created_at: new Date().toISOString()
                });
            }

            this._setTable('reviews', reviews);
            // TRIGGER: Recalcular rating de la película automáticamente
            this._trigger_update_media_rating(media_id);

            return { success: true };
        } catch (e) {
            return { error: 'Error en la transacción de reseña.' };
        }
    }

    getReviewsByMedia(media_id) {
        const reviews = this._getTable('reviews').filter(r => r.media_id === media_id);
        const users = this._getTable('users');
        return reviews.map(r => ({
            ...r,
            username: users.find(u => u.id === r.user_id)?.username || 'Anónimo'
        })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    getUserReview(user_id, media_id) {
        return this._getTable('reviews').find(r => r.user_id === user_id && r.media_id === media_id) || null;
    }

    // =====================================================
    // GENRES
    // =====================================================
    getAllGenres() { return this._getTable('genres'); }
    getGenreNames(ids = []) {
        const genres = this.getAllGenres();
        return ids.map(id => genres.find(g => g.id === id)?.name).filter(Boolean);
    }

    // =====================================================
    // TIER STATES
    // =====================================================
    saveTierState(user_id, media_id, tier) {
        const table = this._getTable('tier_states');
        const existing = table.findIndex(t => t.user_id === user_id && t.media_id === media_id);
        if (existing !== -1) { table[existing].tier = tier; }
        else { table.push({ id: this._uuid(), user_id, media_id, tier }); }
        this._setTable('tier_states', table);
    }

    getTierStates(user_id) {
        return this._getTable('tier_states').filter(t => t.user_id === user_id);
    }

    // =====================================================
    // WATCHLIST / FAVORITOS
    // =====================================================
    toggleWatchlist(user_id, media_id) {
        if (!user_id || !media_id) return { error: 'Debes iniciar sesión.' };
        const list = this._getTable('watchlist');
        const idx = list.findIndex(w => w.user_id === user_id && w.media_id === media_id);
        if (idx !== -1) {
            list.splice(idx, 1);
            this._setTable('watchlist', list);
            return { added: false };
        } else {
            list.push({ id: this._uuid(), user_id, media_id, created_at: new Date().toISOString() });
            this._setTable('watchlist', list);
            return { added: true };
        }
    }

    getUserWatchlist(user_id) {
        if (!user_id) return [];
        const watchlist = this._getTable('watchlist').filter(w => w.user_id === user_id);
        const media = this._getTable('media');
        return watchlist.map(w => media.find(m => m.id === w.media_id)).filter(Boolean);
    }

    isInWatchlist(user_id, media_id) {
        if (!user_id || !media_id) return false;
        return this._getTable('watchlist').some(w => w.user_id === user_id && w.media_id === media_id);
    }

    // ----- ESTADOS DE VISUALIZACIÓN (no vista, en proceso, vista) -----
    setWatchStatus(user_id, media_id, status) {
        if (!user_id || !media_id) return { error: 'Debes iniciar sesión.' };
        const validStatuses = ['no_vista', 'en_proceso', 'vista'];
        const st = validStatuses.includes(status) ? status : 'no_vista';
        const list = this._getTable('watch_status');
        const i = list.findIndex(w => w.user_id === user_id && w.media_id === media_id);
        if (i !== -1) {
            list[i].status = st;
            list[i].updated_at = new Date().toISOString();
        } else {
            list.push({ id: this._uuid(), user_id, media_id, status: st, updated_at: new Date().toISOString() });
        }
        this._setTable('watch_status', list);
        return { success: true, status: st };
    }

    getWatchStatus(user_id, media_id) {
        if (!user_id || !media_id) return 'no_vista';
        const list = this._getTable('watch_status');
        const item = list.find(w => w.user_id === user_id && w.media_id === media_id);
        return item ? item.status : 'no_vista';
    }

    // =====================================================
    // SEED DATA (datos de prueba)
    // =====================================================
    _seedIfEmpty() {
        const genres = this._getTable('genres');
        if (genres.length > 0) return;

        // Géneros
        const genreList = ['Sci-Fi', 'Drama', 'Acción', 'Thriller', 'Fantasía', 'Terror', 'Comedia', 'Romance', 'Animación', 'Documental'];
        const genresData = genreList.map((name, i) => ({ id: i + 1, name }));
        this._setTable('genres', genresData);

        // Usuario admin
        this.createUser({ username: 'admin', email: 'admin@cineclassify.com', password_hash: this._simpleHash('admin123'), role: 'admin' });
        this.createUser({ username: 'demo', email: 'demo@cineclassify.com', password_hash: this._simpleHash('demo123'), role: 'user' });

        // Películas
        const moviesData = [
            { type:'movie', title:'La Quinta Ola', release_year:2016, genre_ids:[1,3], synopsis:'Cuatro oleadas de devastadores ataques extraterrestres han diezmado la Tierra. Cassie Sullivan lleva una lucha solitaria por encontrar a su hermano pequeño.', director:'J Blakeson', cast:'Chloë Grace Moretz, Nick Robinson, Liev Schreiber', duration:'112 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1618666012174-83b441c0bc76?q=80&w=300&auto=format&fit=crop' },
            { type:'movie', title:'Interstellar', release_year:2014, genre_ids:[1,2], synopsis:'Un equipo de exploradores viaja a través de un agujero de gusano en el espacio interestelar para asegurar la supervivencia de la humanidad.', director:'Christopher Nolan', cast:'Matthew McConaughey, Anne Hathaway, Jessica Chastain', duration:'169 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=300&auto=format&fit=crop' },
            { type:'movie', title:'Inception', release_year:2010, genre_ids:[1,4], synopsis:'Un ladrón que roba secretos corporativos a través del uso de la tecnología de compartir sueños recibe la tarea inversa de plantar una idea en la mente de un CEO.', director:'Christopher Nolan', cast:'Leonardo DiCaprio, Elliot Page, Tom Hardy', duration:'148 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1518773553398-650c184e0bb3?q=80&w=300&auto=format&fit=crop' },
            { type:'movie', title:'The Matrix', release_year:1999, genre_ids:[1,3], synopsis:'Un hacker descubre que el mundo entero es una simulación diseñada por máquinas para controlar a la humanidad.', director:'Lana y Lilly Wachowski', cast:'Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss', duration:'136 min', age_rating:'R', image:'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=300&auto=format&fit=crop' },
            { type:'movie', title:'El Padrino', release_year:1972, genre_ids:[2,4], synopsis:'El patriarca envejecido de una dinastía del crimen organizado transfiere el control de su imperio clandestino a su hijo a regañadientes.', director:'Francis Ford Coppola', cast:'Marlon Brando, Al Pacino, James Caan', duration:'175 min', age_rating:'R', image:'https://images.unsplash.com/photo-1589315486255-80f49c06180a?q=80&w=300&auto=format&fit=crop' },
            { type:'movie', title:'Avengers: Endgame', release_year:2019, genre_ids:[3,5], synopsis:'Tras los devastadores eventos de Infinity War, los Vengadores se reúnen para revertir las acciones de Thanos.', director:'Anthony y Joe Russo', cast:'Robert Downey Jr., Chris Evans, Scarlett Johansson', duration:'181 min', age_rating:'PG-13', image:'https://images.unsplash.com/photo-1608346128025-1896b97a6fa7?q=80&w=300&auto=format&fit=crop' },
        ];

        moviesData.forEach(m => this.createMedia(m));

        // Series
        const seriesData = [
            { type:'series', title:'Breaking Bad', release_year:2008, genre_ids:[2,4], synopsis:'Un profesor de química con cáncer se une a un ex alumno para fabricar y vender metanfetamina con el fin de asegurar el futuro de su familia.', director:'Vince Gilligan', cast:'Bryan Cranston, Aaron Paul, Anna Gunn', duration:'45-47 min/ep', age_rating:'TV-MA', image:'https://images.unsplash.com/photo-1546960814-7f287413a1fa?q=80&w=300&auto=format&fit=crop' },
            { type:'series', title:'Stranger Things', release_year:2016, genre_ids:[1,6,5], synopsis:'Cuando un niño desaparece, sus amigos, su familia y la policía descubren un misterio con experimentos secretos, fuerzas sobrenaturales y una niña.', director:'Hermanos Duffer', cast:'Millie Bobby Brown, Finn Wolfhard, Winona Ryder', duration:'42-77 min/ep', age_rating:'TV-14', image:'https://images.unsplash.com/photo-1618683525164-84c47b59616e?q=80&w=300&auto=format&fit=crop' },
            { type:'series', title:'Game of Thrones', release_year:2011, genre_ids:[5,2,3], synopsis:'Nueve familias nobles luchan por el control de las tierras míticas de Westeros mientras una antigua amenaza regresa del norte.', director:'David Benioff, D.B. Weiss', cast:'Emilia Clarke, Peter Dinklage, Kit Harington', duration:'50-80 min/ep', age_rating:'TV-MA', image:'https://images.unsplash.com/photo-1596781427506-4b68e7ec8930?q=80&w=300&auto=format&fit=crop' },
            { type:'series', title:'Dark', release_year:2017, genre_ids:[1,4,2], synopsis:'Un misterio de niños desaparecidos expone una doble vida de adultos y los bucles temporales de cuatro familias interconectadas en una ciudad alemana.', director:'Baran bo Odar', cast:'Louis Hofmann, Oliver Masucci, Karoline Eichhorn', duration:'45-60 min/ep', age_rating:'TV-MA', image:'https://images.unsplash.com/photo-1519097729895-c8e874052309?q=80&w=300&auto=format&fit=crop' },
        ];

        seriesData.forEach(s => this.createMedia(s));

        // Reseñas de prueba (disparan el trigger automáticamente)
        const allMedia = this._getTable('media');
        const adminUser = this.findUserByUsername('admin');
        const demoUser  = this.findUserByUsername('demo');

        if (adminUser && demoUser && allMedia.length > 0) {
            const reviewsData = [
                { user_id: adminUser.id, media_id: allMedia[0].id, rating: 8, comment: 'Excelente adaptación del libro. La acción es increíble.' },
                { user_id: demoUser.id,  media_id: allMedia[0].id, rating: 7, comment: 'Buena película, aunque podría tener más profundidad.' },
                { user_id: adminUser.id, media_id: allMedia[1].id, rating: 10, comment: 'Obra maestra del cine moderno. Visualmente espectacular.' },
                { user_id: demoUser.id,  media_id: allMedia[1].id, rating: 9, comment: 'Una de las mejores del siglo, sin duda.' },
                { user_id: adminUser.id, media_id: allMedia[2].id, rating: 9, comment: 'Nolan en su máximo esplendor. Imprescindible.' },
                { user_id: adminUser.id, media_id: allMedia[6].id, rating: 10, comment: 'La mejor serie de televisión jamás hecha. Punto.' },
                { user_id: demoUser.id,  media_id: allMedia[6].id, rating: 10, comment: 'Bryan Cranston merecía todos los Emmy.' },
                { user_id: adminUser.id, media_id: allMedia[7].id, rating: 9, comment: 'Perfecta mezcla de terror y nostalgia de los 80.' },
                { user_id: adminUser.id, media_id: allMedia[8].id, rating: 8, comment: 'Las primeras 6 temporadas son perfectas.' },
            ];
            reviewsData.forEach(r => this.createOrUpdateReview(r));
        }
    }

    // Contraseña simple (en producción real: bcrypt)
    _simpleHash(password) {
        // Simulación de hash de contraseña (representativo de bcrypt)
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            hash = ((hash << 5) - hash) + password.charCodeAt(i);
            hash |= 0;
        }
        return `$simhash$${Math.abs(hash).toString(16)}$${btoa(password)}`;
    }

    verifyPassword(password, hash) {
        return this._simpleHash(password) === hash;
    }
}

export const db = new Database();
