/**
 * CineClassify Pro - Aplicación Web Completa
 * Arquitectura MVC en un único archivo JS (compatible con file://)
 * 
 * CAPAS:
 *  - DATABASE    : BD relacional simulada en localStorage (3FN, Triggers, Vistas Materializadas, Índices, SPs)
 *  - MODELS      : User, Media, Review (estructuras de datos)
 *  - CONTROLLERS : AuthController, MediaController (lógica de negocio)
 *  - VIEWS       : AuthView, LayoutView, HomeView, CatalogView, DetailView, TierView, StatsView, AdminView
 *  - ROUTER      : Enrutador SPA basado en hash
 */

'use strict';

// ============================================================
// ██████╗  █████╗ ████████╗ █████╗ ██████╗  █████╗ ███████╗███████╗
// ██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝
// ██║  ██║███████║   ██║   ███████║██████╔╝███████║███████╗█████╗  
// ██║  ██║██╔══██║   ██║   ██╔══██║██╔══██╗██╔══██║╚════██║██╔══╝  
// ██████╔╝██║  ██║   ██║   ██║  ██║██████╔╝██║  ██║███████║███████╗
// ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝
// ============================================================
const DB = {
    _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },
    _get(table) { return JSON.parse(localStorage.getItem('db_' + table) || '[]'); },
    _set(table, data) { localStorage.setItem('db_' + table, JSON.stringify(data)); },

    // ---- ÍNDICES EN MEMORIA (reconstruidos al iniciar) ----
    _idx: {},
    _buildIndexes() {
        ['users','media','reviews'].forEach(t => {
            const rows = this._get(t);
            this._idx[t] = {};
            if (t === 'users')   ['username','email'].forEach(c => { this._idx[t][c] = new Map(); rows.forEach(r => this._idx[t][c].set((r[c]||'').toLowerCase(), r)); });
            if (t === 'media')   ['id','type'].forEach(c => { this._idx[t][c] = new Map(); rows.forEach(r => { if(!this._idx[t][c].has(r[c])) this._idx[t][c].set(r[c],[]); this._idx[t][c].get(r[c]).push(r); }); });
            if (t === 'reviews') { this._idx[t]['media_id'] = new Map(); rows.forEach(r => { if(!this._idx[t]['media_id'].has(r.media_id)) this._idx[t]['media_id'].set(r.media_id,[]); this._idx[t]['media_id'].get(r.media_id).push(r); }); }
        });
    },

    // ---- TRIGGER: Recalcular puntuación media ----
    _trigger_updateRating(media_id) {
        const reviews = this._get('reviews').filter(r => r.media_id === media_id);
        const count = reviews.length;
        const avg   = count ? reviews.reduce((a, r) => a + r.rating, 0) / count : 0;
        const media = this._get('media');
        const idx   = media.findIndex(m => m.id === media_id);
        if (idx !== -1) {
            media[idx].average_rating = parseFloat(avg.toFixed(2));
            media[idx].review_count   = count;
            media[idx].updated_at     = new Date().toISOString();
            this._set('media', media);
        }
        this._mv_refreshTopMedia();
        this._buildIndexes();
    },

    // ---- VISTA MATERIALIZADA: Top 10 ----
    _mv_refreshTopMedia() {
        const media = this._get('media');
        const sort  = (arr) => [...arr].filter(m => m.review_count > 0).sort((a,b) => b.average_rating - a.average_rating || b.review_count - a.review_count).slice(0,10);
        localStorage.setItem('mv_top_movies', JSON.stringify(sort(media.filter(m => m.type==='movie'))));
        localStorage.setItem('mv_top_series',  JSON.stringify(sort(media.filter(m => m.type==='series'))));
    },
    getTopMovies() { return JSON.parse(localStorage.getItem('mv_top_movies') || '[]'); },
    getTopSeries()  { return JSON.parse(localStorage.getItem('mv_top_series')  || '[]'); },

    // ---- PROCEDIMIENTO ALMACENADO: Estadísticas globales ----
    sp_getStats() {
        const media   = this._get('media');
        const reviews = this._get('reviews');
        const users   = this._get('users');
        return {
            totalMovies:  media.filter(m=>m.type==='movie').length,
            totalSeries:  media.filter(m=>m.type==='series').length,
            totalReviews: reviews.length,
            totalUsers:   users.filter(u=>u.role!=='admin').length,
            topByReviews: [...media].sort((a,b)=>b.review_count-a.review_count).slice(0,5),
            topByRating:  [...media].filter(m=>m.review_count>0).sort((a,b)=>b.average_rating-a.average_rating).slice(0,5),
        };
    },

    // ---- USERS ----
    createUser({username, email, password_hash, role='user'}) {
        if (this._get('users').find(u=>u.username.toLowerCase()===username.toLowerCase())) return {error:'El usuario ya existe.'};
        if (this._get('users').find(u=>u.email.toLowerCase()===email.toLowerCase())) return {error:'El email ya está registrado.'};
        const user = {id:this._uuid(), username, email, password_hash, role, created_at:new Date().toISOString()};
        const t = this._get('users'); t.push(user); this._set('users',t);
        this._buildIndexes();
        return {data:user};
    },
    findUserByUsername(username) { return this._get('users').find(u=>u.username.toLowerCase()===username.toLowerCase())||null; },
    findUserById(id) { return this._get('users').find(u=>u.id===id)||null; },
    getAllUsers() { return this._get('users'); },
    updateUserRole(id, role) { const t=this._get('users'); const i=t.findIndex(u=>u.id===id); if(i!==-1){t[i].role=role; this._set('users',t);} },
    deleteUser(id) { this._set('users', this._get('users').filter(u=>u.id!==id)); },

    // ---- MEDIA ----
    createMedia(data) {
        const media = {id:this._uuid(), type:data.type||'movie', title:data.title, release_year:parseInt(data.release_year)||2024,
            genre_ids:data.genre_ids||[], synopsis:data.synopsis||'', director:data.director||'', cast:data.cast||'',
            duration:data.duration||'', age_rating:data.age_rating||'PG', image:data.image||'',
            average_rating:0, review_count:0, created_at:new Date().toISOString(), updated_at:new Date().toISOString()};
        const t = this._get('media'); t.push(media); this._set('media',t);
        this._buildIndexes();
        return {data:media};
    },
    getMediaById(id) { return this._get('media').find(m=>m.id===id)||null; },
    getAllMedia() { return this._get('media'); },
    updateMedia(id, updates) {
        const t=this._get('media'); const i=t.findIndex(m=>m.id===id);
        if(i!==-1){t[i]={...t[i],...updates,id,updated_at:new Date().toISOString()}; this._set('media',t); this._buildIndexes(); return {data:t[i]};}
        return {error:'No encontrado.'};
    },
    deleteMedia(id) {
        this._set('media', this._get('media').filter(m=>m.id!==id));
        this._set('reviews', this._get('reviews').filter(r=>r.media_id!==id));
        this._set('tier_states', this._get('tier_states').filter(t=>t.media_id!==id));
        this._mv_refreshTopMedia(); this._buildIndexes();
    },

    // ---- ESTADOS DE VISUALIZACIÓN (no vista, en proceso, vista) ----
    setWatchStatus(user_id, media_id, status) {
        if (!user_id || !media_id) return { error: 'Debes iniciar sesión.' };
        const validStatuses = ['no_vista', 'en_proceso', 'vista'];
        const st = validStatuses.includes(status) ? status : 'no_vista';
        const list = this._get('watch_status');
        const i = list.findIndex(w => w.user_id === user_id && w.media_id === media_id);
        if (i !== -1) {
            list[i].status = st;
            list[i].updated_at = new Date().toISOString();
        } else {
            list.push({ id: this._uuid(), user_id, media_id, status: st, updated_at: new Date().toISOString() });
        }
        this._set('watch_status', list);
        return { success: true, status: st };
    },
    getWatchStatus(user_id, media_id) {
        if (!user_id || !media_id) return 'no_vista';
        const list = this._get('watch_status');
        const item = list.find(w => w.user_id === user_id && w.media_id === media_id);
        return item ? item.status : 'no_vista';
    },

    // ---- BÚSQUEDA FULL-TEXT con paginación (UDF) ----
    searchMedia({query='',type='all',genre_id=null,year=null,director='',min_rating=0,sort='title',page=1,limit=18}={}) {
        let r = this._get('media');
        if (type!=='all') r=r.filter(m=>m.type===type);
        if (genre_id) r=r.filter(m=>m.genre_ids&&m.genre_ids.includes(parseInt(genre_id)));
        if (year) r=r.filter(m=>m.release_year===parseInt(year));
        if (parseFloat(min_rating)>0) r=r.filter(m=>m.average_rating>=parseFloat(min_rating));
        if (director) r=r.filter(m=>m.director&&m.director.toLowerCase().includes(director.toLowerCase()));
        if (query) { const q=query.toLowerCase(); r=r.filter(m=>[m.title,m.synopsis,m.cast,m.director].filter(Boolean).join(' ').toLowerCase().includes(q)); }
        r.sort((a,b)=>{
            if(sort==='rating') return b.average_rating-a.average_rating;
            if(sort==='year')   return b.release_year-a.release_year;
            if(sort==='reviews')return b.review_count-a.review_count;
            return a.title.localeCompare(b.title);
        });
        const total=r.length, totalPages=Math.ceil(total/limit)||1, offset=(page-1)*limit;
        return {data:r.slice(offset,offset+limit), total, page, totalPages, limit};
    },

    getRecommendations(mediaId, limit=8) {
        const media=this.getMediaById(mediaId); if(!media) return [];
        return this._get('media').filter(m=>m.id!==mediaId&&(
            (m.genre_ids&&m.genre_ids.some(g=>media.genre_ids&&media.genre_ids.includes(g)))||
            (m.director&&m.director===media.director)
        )).sort((a,b)=>b.average_rating-a.average_rating).slice(0,limit);
    },

    // ---- REVIEWS (con transacción simulada) ----
    createOrUpdateReview({user_id, media_id, rating, comment}) {
        try {
            const t=this._get('reviews');
            const i=t.findIndex(r=>r.user_id===user_id&&r.media_id===media_id);
            if(i!==-1){t[i].rating=parseInt(rating);t[i].comment=comment;t[i].updated_at=new Date().toISOString();}
            else t.push({id:this._uuid(),user_id,media_id,rating:parseInt(rating),comment,created_at:new Date().toISOString()});
            this._set('reviews',t);
            this._trigger_updateRating(media_id); // TRIGGER
            return {success:true};
        } catch(e) { return {error:'Error en la transacción.'}; }
    },
    getReviewsByMedia(media_id) {
        const reviews=this._get('reviews').filter(r=>r.media_id===media_id);
        const users=this._get('users');
        return reviews.map(r=>({...r, username:users.find(u=>u.id===r.user_id)?.username||'Anónimo'}))
            .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    },
    getUserReview(user_id, media_id) { return this._get('reviews').find(r=>r.user_id===user_id&&r.media_id===media_id)||null; },

    // ---- GENRES ----
    getAllGenres() { return this._get('genres'); },
    getGenreNames(ids=[]) { const g=this.getAllGenres(); return (ids||[]).map(id=>g.find(x=>x.id===id)?.name).filter(Boolean); },

    // ---- TIER STATES ----
    saveTierState(user_id, media_id, tier) {
        const t=this._get('tier_states');
        const i=t.findIndex(x=>x.user_id===user_id&&x.media_id===media_id);
        if(i!==-1) t[i].tier=tier; else t.push({id:this._uuid(),user_id,media_id,tier});
        this._set('tier_states',t);
    },
    getTierStates(user_id) { return this._get('tier_states').filter(t=>t.user_id===user_id); },

    // ---- WATCHLIST / FAVORITOS ----
    toggleWatchlist(user_id, media_id) {
        if(!user_id||!media_id) return {error:'Debes iniciar sesión.'};
        const list=this._get('watchlist');
        const i=list.findIndex(w=>w.user_id===user_id&&w.media_id===media_id);
        if(i!==-1) { list.splice(i,1); this._set('watchlist',list); return {added:false}; }
        else { list.push({id:this._uuid(),user_id,media_id,created_at:new Date().toISOString()}); this._set('watchlist',list); return {added:true}; }
    },
    getWatchlist(user_id) {
        if(!user_id) return [];
        const wl=this._get('watchlist').filter(w=>w.user_id===user_id);
        const m=this._get('media');
        return wl.map(w=>m.find(x=>x.id===w.media_id)).filter(Boolean);
    },
    isInWatchlist(user_id, media_id) {
        if(!user_id||!media_id) return false;
        return this._get('watchlist').some(w=>w.user_id===user_id&&w.media_id===media_id);
    },

    // ---- CONTRASEÑA ----
    hashPassword(p) { let h=5381; for(let i=0;i<p.length;i++){h=((h<<5)+h)+p.charCodeAt(i);h|=0;} return 'cc$'+Math.abs(h).toString(16)+'$'+btoa(p); },
    verifyPassword(p,h) { return this.hashPassword(p)===h; },

    // ---- SEED ----
    seed() {
        if (this._get('genres').length > 0) return;
        const genreNames = ['Sci-Fi','Drama','Acción','Thriller','Fantasía','Terror','Comedia','Romance','Animación','Documental'];
        this._set('genres', genreNames.map((name,i)=>({id:i+1,name})));
        this._set('tier_states',[]);

        this.createUser({username:'admin',email:'admin@cine.com',password_hash:this.hashPassword('admin123'),role:'admin'});
        this.createUser({username:'demo', email:'demo@cine.com', password_hash:this.hashPassword('demo123'), role:'user'});

        const movies = [
            {type:'movie',title:'La Quinta Ola',release_year:2016,genre_ids:[1,3],synopsis:'Cuatro oleadas de ataques extraterrestres devastan la Tierra. Cassie Sullivan lucha sola por encontrar a su hermano.',director:'J Blakeson',cast:'Chloë Grace Moretz, Nick Robinson, Liev Schreiber',duration:'112 min',age_rating:'PG-13',image:'https://images.unsplash.com/photo-1618666012174-83b441c0bc76?q=80&w=300&auto=format&fit=crop'},
            {type:'movie',title:'Interstellar',release_year:2014,genre_ids:[1,2],synopsis:'Un equipo de exploradores viaja a través de un agujero de gusano para asegurar la supervivencia de la humanidad.',director:'Christopher Nolan',cast:'Matthew McConaughey, Anne Hathaway, Jessica Chastain',duration:'169 min',age_rating:'PG-13',image:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=300&auto=format&fit=crop'},
            {type:'movie',title:'Inception',release_year:2010,genre_ids:[1,4],synopsis:'Un ladrón que roba secretos corporativos recibe la tarea de plantar una idea en la mente de un CEO.',director:'Christopher Nolan',cast:'Leonardo DiCaprio, Elliot Page, Tom Hardy',duration:'148 min',age_rating:'PG-13',image:'https://images.unsplash.com/photo-1518773553398-650c184e0bb3?q=80&w=300&auto=format&fit=crop'},
            {type:'movie',title:'The Matrix',release_year:1999,genre_ids:[1,3],synopsis:'Un hacker descubre que el mundo es una simulación diseñada por máquinas para controlar a la humanidad.',director:'Lana y Lilly Wachowski',cast:'Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss',duration:'136 min',age_rating:'R',image:'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=300&auto=format&fit=crop'},
            {type:'movie',title:'El Padrino',release_year:1972,genre_ids:[2,4],synopsis:'El patriarca de una dinastía del crimen transfiere su imperio a su hijo a regañadientes.',director:'Francis Ford Coppola',cast:'Marlon Brando, Al Pacino, James Caan',duration:'175 min',age_rating:'R',image:'https://images.unsplash.com/photo-1589315486255-80f49c06180a?q=80&w=300&auto=format&fit=crop'},
            {type:'movie',title:'Avengers: Endgame',release_year:2019,genre_ids:[3,5],synopsis:'Los Vengadores se reúnen para revertir las acciones de Thanos y restaurar el universo.',director:'Anthony y Joe Russo',cast:'Robert Downey Jr., Chris Evans, Scarlett Johansson',duration:'181 min',age_rating:'PG-13',image:'https://images.unsplash.com/photo-1608346128025-1896b97a6fa7?q=80&w=300&auto=format&fit=crop'},
        ];
        const series = [
            {type:'series',title:'Breaking Bad',release_year:2008,genre_ids:[2,4],synopsis:'Un profesor de química con cáncer se convierte en traficante de metanfetamina para asegurar el futuro de su familia.',director:'Vince Gilligan',cast:'Bryan Cranston, Aaron Paul, Anna Gunn',duration:'47 min/ep',age_rating:'TV-MA',image:'https://images.unsplash.com/photo-1546960814-7f287413a1fa?q=80&w=300&auto=format&fit=crop'},
            {type:'series',title:'Stranger Things',release_year:2016,genre_ids:[1,6,5],synopsis:'Cuando un niño desaparece, sus amigos y familia descubren misterios con experimentos secretos y fuerzas sobrenaturales.',director:'Hermanos Duffer',cast:'Millie Bobby Brown, Finn Wolfhard, Winona Ryder',duration:'50 min/ep',age_rating:'TV-14',image:'https://images.unsplash.com/photo-1618683525164-84c47b59616e?q=80&w=300&auto=format&fit=crop'},
            {type:'series',title:'Game of Thrones',release_year:2011,genre_ids:[5,2,3],synopsis:'Nueve familias nobles luchan por el control de Westeros mientras una antigua amenaza regresa del norte.',director:'David Benioff, D.B. Weiss',cast:'Emilia Clarke, Peter Dinklage, Kit Harington',duration:'60 min/ep',age_rating:'TV-MA',image:'https://images.unsplash.com/photo-1596781427506-4b68e7ec8930?q=80&w=300&auto=format&fit=crop'},
            {type:'series',title:'Dark',release_year:2017,genre_ids:[1,4,2],synopsis:'Niños desaparecidos en una pequeña ciudad alemana revelan bucles temporales de cuatro familias interconectadas.',director:'Baran bo Odar',cast:'Louis Hofmann, Oliver Masucci',duration:'52 min/ep',age_rating:'TV-MA',image:'https://images.unsplash.com/photo-1519097729895-c8e874052309?q=80&w=300&auto=format&fit=crop'},
        ];

        [...movies, ...series].forEach(m => this.createMedia(m));

        // Reseñas iniciales → dispara el TRIGGER automáticamente
        const allMedia = this._get('media');
        const admin    = this.findUserByUsername('admin');
        const demoU    = this.findUserByUsername('demo');
        const reviewsInit = [
            {ui:admin.id,mi:allMedia[0]?.id,r:8,c:'Excelente adaptación. La acción es increíble.'},
            {ui:demoU.id, mi:allMedia[0]?.id,r:7,c:'Buena película, aunque podría tener más profundidad.'},
            {ui:admin.id,mi:allMedia[1]?.id,r:10,c:'Obra maestra del cine moderno. Visualmente espectacular.'},
            {ui:demoU.id, mi:allMedia[1]?.id,r:9,c:'Una de las mejores del siglo, sin duda.'},
            {ui:admin.id,mi:allMedia[2]?.id,r:9,c:'Nolan en su máximo esplendor. Imprescindible.'},
            {ui:demoU.id, mi:allMedia[2]?.id,r:8,c:'Muy buena, aunque hay que verla dos veces.'},
            {ui:admin.id,mi:allMedia[4]?.id,r:10,c:'El mejor guión en la historia del cine.'},
            {ui:admin.id,mi:allMedia[6]?.id,r:10,c:'La mejor serie jamás hecha. Punto.'},
            {ui:demoU.id, mi:allMedia[6]?.id,r:10,c:'Bryan Cranston merece todos los Emmy.'},
            {ui:admin.id,mi:allMedia[7]?.id,r:9,c:'Perfecta mezcla de terror y nostalgia.'},
            {ui:admin.id,mi:allMedia[8]?.id,r:8,c:'Las primeras 6 temporadas son perfectas.'},
        ];
        reviewsInit.filter(x=>x.ui&&x.mi).forEach(x=>this.createOrUpdateReview({user_id:x.ui,media_id:x.mi,rating:x.r,comment:x.c}));
    },

    init() { this.seed(); this._buildIndexes(); }
};

// ============================================================
// AUTH CONTROLLER  (JWT simulado con btoa/atob)
// ============================================================
const Auth = {
    _session: null,
    _secret: 'cc_jwt_2024',

    _sign(payload) {
        const h = btoa(JSON.stringify({alg:'HS256',typ:'JWT'}));
        const b = btoa(JSON.stringify({...payload,exp:Date.now()+86400000}));
        const s = btoa(h+'.'+b+'.'+this._secret);
        return h+'.'+b+'.'+s;
    },
    _verify(token) {
        try {
            if(!token) return null;
            const [h,b] = token.split('.');
            const payload = JSON.parse(atob(b));
            if (payload.exp < Date.now()) { this.logout(); return null; }
            return payload;
        } catch { return null; }
    },

    init() {
        const token = localStorage.getItem('cc_token');
        if (token) this._session = this._verify(token);
    },
    login(username, password) {
        if(!username||!password) return {error:'Completa todos los campos.'};
        const user = DB.findUserByUsername(username);
        if(!user) return {error:'Usuario no encontrado.'};
        if(!DB.verifyPassword(password, user.password_hash)) return {error:'Contraseña incorrecta.'};
        const payload = {id:user.id, username:user.username, role:user.role};
        const token = this._sign(payload);
        localStorage.setItem('cc_token', token);
        this._session = payload;
        return {data:{user:payload, token}};
    },
    register(username, email, password) {
        if(!username||username.length<3) return {error:'Usuario mínimo 3 caracteres.'};
        if(!email||!email.includes('@')) return {error:'Email inválido.'};
        if(!password||password.length<4) return {error:'Contraseña mínimo 4 caracteres.'};
        const result = DB.createUser({username,email,password_hash:DB.hashPassword(password),role:'user'});
        if(result.error) return result;
        return this.login(username, password);
    },
    logout() { localStorage.removeItem('cc_token'); this._session=null; },
    get session() { return this._session; },
    get isAuth()  { return !!this._session; },
    get isAdmin() { return this._session?.role==='admin'; },
    get userId()  { return this._session?.id||null; },
};

// ============================================================
// MEDIA CONTROLLER
// ============================================================
const MediaCtrl = {
    catalog(params={}) { return DB.searchMedia(params); },
    getById(id) {
        const media = DB.getMediaById(id);
        if(!media) return {error:'No encontrado.'};
        return {data:{...media, genres:DB.getGenreNames(media.genre_ids), reviews:DB.getReviewsByMedia(id), recommendations:DB.getRecommendations(id)}};
    },
    getGenres()    { return DB.getAllGenres(); },
    getTopRated()  { return {movies:DB.getTopMovies(), series:DB.getTopSeries()}; },
    getStats()     { return DB.sp_getStats(); },
    submitReview(media_id, rating, comment) {
        if(!Auth.isAuth) return {error:'Debes iniciar sesión.'};
        if(rating<1||rating>10) return {error:'Puntuación entre 1 y 10.'};
        if(!comment||comment.trim().length<5) return {error:'Reseña mínimo 5 caracteres.'};
        return DB.createOrUpdateReview({user_id:Auth.userId, media_id, rating:parseInt(rating), comment:comment.trim()});
    },
    getUserReview(media_id) { return Auth.userId ? DB.getUserReview(Auth.userId, media_id) : null; },
    saveTier(media_id, tier) { if(Auth.userId) DB.saveTierState(Auth.userId, media_id, tier); },
    getTiers() { return Auth.userId ? DB.getTierStates(Auth.userId) : []; },
    toggleWatchlist(media_id) { return Auth.isAuth ? DB.toggleWatchlist(Auth.userId, media_id) : {error:'Debes iniciar sesión.'}; },
    getWatchlist() { return Auth.userId ? DB.getWatchlist(Auth.userId) : []; },
    isInWatchlist(media_id) { return Auth.userId ? DB.isInWatchlist(Auth.userId, media_id) : false; },
    getWatchStatus(media_id) { return Auth.userId ? DB.getWatchStatus(Auth.userId, media_id) : 'no_vista'; },
    setWatchStatus(media_id, status) { return Auth.isAuth ? DB.setWatchStatus(Auth.userId, media_id, status) : {error:'Debes iniciar sesión.'}; },
    // CRUD (Acceso para usuarios autenticados al crear)
    create(data)       { return Auth.isAuth ? DB.createMedia(data) : {error:'Debes iniciar sesión para agregar contenido.'}; },
    update(id,data)    { return Auth.isAdmin ? DB.updateMedia(id,data)  : {error:'Sin permisos.'}; },
    remove(id)         { if(Auth.isAdmin) DB.deleteMedia(id); },
    getUsers()         { return Auth.isAdmin ? {data:DB.getAllUsers()} : {error:'Sin permisos.'}; },
    setUserRole(id,r)  { if(Auth.isAdmin) DB.updateUserRole(id,r); },
    removeUser(id)     { if(Auth.isAdmin) DB.deleteUser(id); },
};

// ============================================================
// HELPERS / UTILITIES
// ============================================================
const H = {
    esc(s) { const d=document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; },
    fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}) : ''; },
    initials(name) { return name?.charAt(0)?.toUpperCase()||'?'; },
    poster(img,alt='') {
        return img ? `<img src="${img}" alt="${this.esc(alt)}" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><span class="poster-fallback" style="display:none">🎬</span>`
                   : '<span class="poster-fallback">🎬</span>';
    },
    badge(text,cls) { return `<span class="badge ${cls}">${this.esc(text)}</span>`; },
    genreBadges(names=[]) { return names.map(n=>this.badge(n,'badge-genre')).join(''); },

    showToast(msg, type='success') {
        let t = document.getElementById('cc-toast');
        if (!t) { t=document.createElement('div'); t.id='cc-toast'; t.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:0.9rem;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.5);transform:translateY(100px);opacity:0;transition:all .3s cubic-bezier(.4,0,.2,1);max-width:320px;line-height:1.4;font-family:Outfit,sans-serif'; document.body.appendChild(t); }
        const c={success:'rgba(80,250,123,.15)|rgba(80,250,123,.4)|#50fa7b',error:'rgba(255,85,85,.15)|rgba(255,85,85,.4)|#ff5555',info:'rgba(139,233,253,.1)|rgba(139,233,253,.3)|#8be9fd'}[type].split('|');
        t.style.background=c[0]; t.style.border='1px solid '+c[1]; t.style.color=c[2]; t.textContent=msg;
        clearTimeout(H._tt);
        requestAnimationFrame(()=>{t.style.transform='translateY(0)';t.style.opacity='1';});
        H._tt=setTimeout(()=>{t.style.transform='translateY(100px)';t.style.opacity='0';},3500);
    },
};

// ============================================================
// ROUTER  (basado en hash, sin servidor)
// ============================================================
const Router = {
    _routes: {},
    on(route, fn) { this._routes[route]=fn; return this; },
    navigate(r) { window.location.hash=r; },
    resolve() {
        const hash  = window.location.hash.slice(1)||'/home';
        const [pathStr] = hash.split('?');
        const parts = pathStr.split('/').filter(Boolean);
        const base  = '/'+(parts[0]||'home');
        const param = parts[1]||null;
        (this._routes[base]||this._routes['*']||function(){})(param);
    },
    start() { window.addEventListener('hashchange',()=>this.resolve()); this.resolve(); },
};

// ============================================================
// MEDIA CARD (componente reutilizable)
// ============================================================
function mediaCardHTML(m, extraClass='') {
    const avg = m.average_rating>0 ? m.average_rating.toFixed(1) : null;
    const isFav = MediaCtrl.isInWatchlist(m.id);
    const watchStatus = MediaCtrl.getWatchStatus(m.id);
    const userRev = MediaCtrl.getUserReview(m.id);
    const hasReviewed = !!userRev;

    return `<article class="media-card ${extraClass}" data-id="${m.id}">
        <div class="card-poster">
            ${H.poster(m.image, m.title)}
            <button class="card-fav-btn ${isFav?'active':''}" data-id="${m.id}" title="${isFav?'Quitar de Mi Lista':'Guardar en Mi Lista'}">${isFav?'💖':'🤍'}</button>
            <div class="card-reviewed-badge ${hasReviewed?'is-reviewed':''}" title="${hasReviewed?'Has publicado una crítica sobre esta película':'Aún no has criticado esta película'}" onclick="event.stopPropagation()">
                <input type="checkbox" disabled ${hasReviewed?'checked':''} id="chk-card-${m.id}">
                <label for="chk-card-${m.id}">${hasReviewed?'✓ Criticada':'Sin criticar'}</label>
            </div>
        </div>
        ${avg?`<div class="card-badge">⭐ ${avg}</div>`:''}
        <div class="card-overlay"><button class="btn btn-primary btn-sm view-btn" data-id="${m.id}">Ver más</button></div>
        <div class="card-body">
            <div class="card-title">${H.esc(m.title)}</div>
            <div class="card-meta">
                <span class="card-rating">${avg?'⭐ '+avg:'Sin reseñas'}</span>
                <span class="card-year">${m.release_year}</span>
            </div>
            <div class="card-status-bar" onclick="event.stopPropagation()">
                <select class="card-status-select status-${watchStatus}" data-id="${m.id}">
                    <option value="no_vista" ${watchStatus==='no_vista'?'selected':''}>👁️ No vista</option>
                    <option value="en_proceso" ${watchStatus==='en_proceso'?'selected':''}>⏳ En proceso</option>
                    <option value="vista" ${watchStatus==='vista'?'selected':''}>✅ Vista</option>
                </select>
            </div>
        </div>
    </article>`;
}

// Delegar clicks en tarjetas al contenedor padre
function bindCardClicks(container) {
    container.querySelectorAll('.card-fav-btn').forEach(btn=>{
        btn.addEventListener('click', e=>{
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const res = MediaCtrl.toggleWatchlist(id);
            if(res.error) {
                H.showToast(res.error, 'error');
            } else {
                const added = res.added;
                btn.classList.toggle('active', added);
                btn.textContent = added ? '💖' : '🤍';
                btn.title = added ? 'Quitar de Mi Lista' : 'Guardar en Mi Lista';
                H.showToast(added ? 'Añadido a Mi Lista 💖' : 'Eliminado de Mi Lista');
            }
        });
    });

    container.querySelectorAll('.card-status-select').forEach(sel => {
        sel.addEventListener('change', e => {
            e.stopPropagation();
            const id = sel.getAttribute('data-id');
            const st = sel.value;
            const res = MediaCtrl.setWatchStatus(id, st);
            if(res?.error) {
                H.showToast(res.error, 'error');
            } else {
                sel.className = `card-status-select status-${st}`;
                const labelMap = { 'no_vista': 'No vista 👁️', 'en_proceso': 'En proceso ⏳', 'vista': 'Vista ✅' };
                H.showToast(`Estado actualizado: ${labelMap[st]||st}`);
            }
        });
        sel.addEventListener('click', e => e.stopPropagation());
    });

    container.querySelectorAll('.media-card, .view-btn').forEach(el=>{
        el.addEventListener('click', e=>{
            if(e.target.closest('.card-fav-btn') || e.target.closest('.card-status-bar') || e.target.closest('.card-reviewed-badge')) return;
            e.stopPropagation();
            const id = e.currentTarget.getAttribute('data-id') || e.currentTarget.closest('[data-id]')?.getAttribute('data-id');
            if(id) Router.navigate('/detail/'+id);
        });
    });
}

// ============================================================
// VISTAS
// ============================================================

// ---- AUTH VIEW ----
function renderAuth() {
    editorialCleanup?.();
    editorialCleanup = () => {};
    const root=document.getElementById('root');
    root.innerHTML=`
    <div id="auth-view">
        <div class="auth-card glass">
            <div class="auth-logo"><h1>Cine<span class="highlight">Classify</span></h1><p>Tu plataforma personal de cine y series</p></div>
            <div class="auth-tabs">
                <button class="auth-tab active" id="tab-login">Iniciar sesión</button>
                <button class="auth-tab" id="tab-register">Registrarse</button>
            </div>
            <form id="login-form" class="auth-form">
                <div class="form-group"><label>Usuario</label><input class="input-field" id="l-user" placeholder="ej: admin" autocomplete="username"></div>
                <div class="form-group"><label>Contraseña</label><input class="input-field" type="password" id="l-pass" placeholder="••••••••" autocomplete="current-password"></div>
                <p class="error-msg" id="l-err"></p>
                <button type="submit" class="btn btn-primary" style="width:100%">Entrar</button>
                <p style="text-align:center;font-size:.82rem;color:var(--text-3);margin-top:8px">Demo: <b style="color:var(--accent)">admin</b> / <b style="color:var(--accent)">admin123</b></p>
            </form>
            <form id="reg-form" class="auth-form hidden">
                <div class="form-group"><label>Usuario</label><input class="input-field" id="r-user" placeholder="Elige un nombre"></div>
                <div class="form-group"><label>Email</label><input class="input-field" type="email" id="r-email" placeholder="tu@email.com"></div>
                <div class="form-group"><label>Contraseña</label><input class="input-field" type="password" id="r-pass" placeholder="Mínimo 4 caracteres"></div>
                <p class="error-msg" id="r-err"></p>
                <button type="submit" class="btn btn-primary" style="width:100%">Crear cuenta</button>
            </form>
        </div>
    </div>`;

    document.getElementById('tab-login').onclick=()=>{ document.getElementById('tab-login').classList.add('active'); document.getElementById('tab-register').classList.remove('active'); document.getElementById('login-form').classList.remove('hidden'); document.getElementById('reg-form').classList.add('hidden'); };
    document.getElementById('tab-register').onclick=()=>{ document.getElementById('tab-register').classList.add('active'); document.getElementById('tab-login').classList.remove('active'); document.getElementById('reg-form').classList.remove('hidden'); document.getElementById('login-form').classList.add('hidden'); };

    document.getElementById('login-form').onsubmit=e=>{
        e.preventDefault();
        const res = Auth.login(document.getElementById('l-user').value.trim(), document.getElementById('l-pass').value);
        if(res.error) document.getElementById('l-err').textContent=res.error;
        else renderApp();
    };
    document.getElementById('reg-form').onsubmit=e=>{
        e.preventDefault();
        const res = Auth.register(document.getElementById('r-user').value.trim(), document.getElementById('r-email').value.trim(), document.getElementById('r-pass').value);
        if(res.error) document.getElementById('r-err').textContent=res.error;
        else { H.showToast('¡Bienvenido! Cuenta creada.'); renderApp(); }
    };
}

// ---- LAYOUT ----
let _layoutSetup = false;
function renderApp() {
    const root=document.getElementById('root');
    const s=Auth.session;
    const savedCount = Auth.isAuth ? MediaCtrl.getWatchlist().length : 0;
    root.innerHTML=`
    <div id="app-layout" class="editorial-app">
        <header class="topbar">
            <button class="menu-toggle" id="btn-menu" type="button" aria-label="Abrir menú" aria-controls="sidenav" aria-expanded="false"><i class="shell-icon" data-lucide="menu" aria-hidden="true"></i></button>
            <div class="topbar-brand" aria-label="CineClassify">
                <span class="topbar-brand-mark" aria-hidden="true">CC</span>
                <span class="topbar-logo">Cine<span>Classify</span></span>
            </div>
            <label class="topbar-search" aria-label="Buscar en CineClassify">
                <i class="shell-icon search-icon" data-lucide="search" aria-hidden="true"></i>
                <input class="input-field" id="global-search" type="search" placeholder="Buscar título, actor o director..." autocomplete="off">
            </label>
            <div class="topbar-spacer"></div>
            <div class="topbar-actions">
                <button class="topbar-btn-add" id="btn-add-media" type="button">
                    <span style="font-size:1.1rem;font-weight:800">+</span> <span>Agregar Película</span>
                </button>
                <button class="topbar-link" id="btn-updates" type="button"><i class="shell-icon-sm" data-lucide="sparkles" aria-hidden="true"></i><span>Novedades</span></button>
                <button class="topbar-notification" id="btn-notifications" type="button" aria-label="Ver notificaciones"><i class="shell-icon" data-lucide="bell" aria-hidden="true"></i></button>
                <div class="user-menu">
                    <div class="user-avatar">${H.initials(s?.username)}</div>
                    <div class="user-copy"><div class="user-name">${H.esc(s?.username||'')}</div><div class="user-role">${Auth.isAdmin?'Administrador':'Usuario'}</div></div>
                </div>
                <button class="topbar-logout" id="btn-logout" type="button">Salir</button>
            </div>
        </header>
        <div class="mobile-backdrop" id="mobile-backdrop"></div>
        <div class="main-area">
            <nav class="sidenav" id="sidenav" aria-label="Navegación principal">
                <span class="sidenav-section">Explorar</span>
                <button class="sidenav-item" data-route="/home"><i class="nav-icon" data-lucide="house" aria-hidden="true"></i><span>Inicio</span></button>
                <button class="sidenav-item" data-route="/movies"><i class="nav-icon" data-lucide="film" aria-hidden="true"></i><span>Películas</span></button>
                <button class="sidenav-item" data-route="/series"><i class="nav-icon" data-lucide="tv" aria-hidden="true"></i><span>Series</span></button>
                <button class="sidenav-item" data-route="/top"><i class="nav-icon" data-lucide="trophy" aria-hidden="true"></i><span>Mejores Calificadas</span></button>
                <button class="sidenav-item" data-route="/stats"><i class="nav-icon" data-lucide="chart-column" aria-hidden="true"></i><span>Estadísticas</span></button>
                <span class="sidenav-section">Mi cuenta</span>
                <button class="sidenav-item" data-route="/watchlist"><i class="nav-icon" data-lucide="heart" aria-hidden="true"></i><span>Mi Lista</span><span class="nav-count">${savedCount || ''}</span></button>
                <button class="sidenav-item" data-route="/tierlist"><i class="nav-icon" data-lucide="list" aria-hidden="true"></i><span>Mi Tier List</span></button>
                <button class="sidenav-item btn-side-add-item" id="btn-side-add-media" type="button"><i class="nav-icon" data-lucide="plus-circle" aria-hidden="true"></i><span>+ Agregar Película</span></button>
                ${Auth.isAdmin?`<span class="sidenav-section">Administración</span>
                <button class="sidenav-item" data-route="/admin/media"><i class="nav-icon" data-lucide="clapperboard" aria-hidden="true"></i><span>Gestionar Contenido</span></button>
                <button class="sidenav-item" data-route="/admin/users"><i class="nav-icon" data-lucide="users" aria-hidden="true"></i><span>Gestionar Usuarios</span></button>`:''}
                <div class="sidenav-note"><div class="sidenav-note-head"><i class="shell-icon-sm" data-lucide="shield-check" aria-hidden="true"></i><span>Modo Pro</span></div><p>Tu biblioteca, tus criterios. Cada puntuación alimenta tu mapa de cine.</p></div>
            </nav>
            <main class="content" id="main-content"></main>
        </div>
    </div>`;

    const sidenav = document.getElementById('sidenav');
    const backdrop = document.getElementById('mobile-backdrop');
    const btnMenu = document.getElementById('btn-menu');
    const setMenuState = open => {
        sidenav?.classList.toggle('open', open);
        backdrop?.classList.toggle('active', open);
        btnMenu?.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    const closeMenu = () => setMenuState(false);

    if (btnMenu) btnMenu.onclick = () => setMenuState(!sidenav?.classList.contains('open'));
    if (backdrop) backdrop.onclick = closeMenu;

    document.getElementById('btn-logout').onclick=()=>{ Auth.logout(); _layoutSetup=false; renderAuth(); };
    document.getElementById('btn-add-media')?.addEventListener('click', () => renderUserAddMediaModal());
    document.getElementById('btn-side-add-media')?.addEventListener('click', () => { closeMenu(); renderUserAddMediaModal(); });
    document.getElementById('btn-updates')?.addEventListener('click', () => H.showToast('Novedades editoriales listas para explorar.', 'info'));
    document.getElementById('btn-notifications')?.addEventListener('click', () => H.showToast('No tienes nuevas notificaciones.', 'info'));
    document.querySelectorAll('.sidenav-item[data-route]').forEach(b=>b.onclick=()=>{ closeMenu(); Router.navigate(b.dataset.route); });
    if (window.lucide?.createIcons) window.lucide.createIcons();

    let searchT;
    document.getElementById('global-search').oninput=e=>{ clearTimeout(searchT); searchT=setTimeout(()=>{ const q=e.target.value.trim(); if(q) Router.navigate('/movies?q='+encodeURIComponent(q)); },400); };

    setupRoutes();
    Router.start();
}

let editorialCleanup = () => {};

function setContent(html) {
    editorialCleanup();
    editorialCleanup = () => {};
    document.getElementById('app-layout')?.classList.remove('editorial-layout');

    const c=document.getElementById('main-content');
    if(!c) return;
    c.innerHTML=`<div style="animation:slideUp .25s ease-out">${html}</div>`;
}
function setActiveNav(route) {
    document.querySelectorAll('.sidenav-item').forEach(b=>{
        const isActive = b.dataset.route === route;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
}

// ============================================================
// EDITORIAL SPLIT DASHBOARD
// ============================================================
function uniqueEditorialMedia(items, limit=6) {
    const seen = new Set();
    return items.filter(media => {
        if (!media || seen.has(media.id)) return false;
        seen.add(media.id);
        return true;
    }).slice(0, limit);
}

function editorialGenreText(media) {
    const names = DB.getGenreNames(media?.genre_ids || []);
    return names.slice(0, 2).join(' · ') || (media?.type === 'series' ? 'Serie' : 'Película');
}

function editorialRatingText(media) {
    return media?.review_count > 0 ? media.average_rating.toFixed(1) : '—';
}

function editorialMovieOrder(movies) {
    const preferredTitles = ['Interstellar', 'Inception', 'The Matrix', 'El Padrino', 'Avengers: Endgame', 'La Quinta Ola'];
    const byTitle = new Map(movies.map(media => [media.title.toLowerCase(), media]));
    const preferred = preferredTitles.map(title => byTitle.get(title.toLowerCase())).filter(Boolean);
    return uniqueEditorialMedia([...preferred, ...movies], 6);
}

function updateEditorialWatchlistButton(button, mediaId) {
    if (!button || !mediaId) return;
    const saved = MediaCtrl.isInWatchlist(mediaId);
    button.dataset.id = mediaId;
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-label', saved ? 'Quitar de Mi Lista' : 'Añadir a Mi Lista');
    button.innerHTML = `<span aria-hidden="true">${saved ? '♥' : '♡'}</span><span>${saved ? 'Quitar de Mi Lista' : 'Añadir a Mi Lista'}</span>`;
}

function updateEditorialCardHeart(button, mediaId) {
    if (!button || !mediaId) return;
    const saved = MediaCtrl.isInWatchlist(mediaId);
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-label', saved ? 'Quitar de Mi Lista' : 'Guardar en Mi Lista');
    button.innerHTML = `<span aria-hidden="true">${saved ? '♥' : '♡'}</span>`;
}

function setEditorialHeroSlide(index, slides) {
    if (!slides.length) return 0;
    const activeIndex = ((index % slides.length) + slides.length) % slides.length;
    const media = slides[activeIndex];
    const image = document.getElementById('editorial-hero-image');
    const title = document.getElementById('editorial-hero-title');
    const copy = document.getElementById('editorial-hero-copy');
    const meta = document.getElementById('editorial-hero-meta');
    const current = document.getElementById('editorial-hero-current');
    const reviewButton = document.getElementById('editorial-hero-review');
    const watchlistButton = document.getElementById('editorial-hero-watchlist');

    if (image) {
        image.hidden = !media.image;
        if (media.image) image.src = media.image;
        image.alt = `${media.title} — selección editorial`;
    }
    if (title) title.textContent = media.title;
    if (copy) copy.textContent = media.synopsis || 'Una historia lista para descubrir y conversar.';
    if (meta) {
        meta.innerHTML = `
            <span>${H.esc(String(media.release_year))}</span>
            <span class="editorial-meta-dot" aria-hidden="true"></span>
            <span>${H.esc(editorialGenreText(media))}</span>
            ${media.duration ? `<span class="editorial-meta-dot" aria-hidden="true"></span><span>${H.esc(media.duration)}</span>` : ''}
            <span class="editorial-rating">★ ${H.esc(editorialRatingText(media))}</span>`;
    }
    if (current) current.textContent = String(activeIndex + 1).padStart(2, '0');
    if (reviewButton) reviewButton.dataset.id = media.id;
    updateEditorialWatchlistButton(watchlistButton, media.id);

    document.querySelectorAll('.editorial-explore-item').forEach(item => {
        item.setAttribute('aria-current', item.dataset.index === String(activeIndex) ? 'true' : 'false');
    });

    return activeIndex;
}

function renderEditorialHome() {
    const allMedia = MediaCtrl.catalog({ sort: 'reviews', limit: 100 }).data;
    const movies = allMedia.filter(media => media.type === 'movie');
    const series = allMedia.filter(media => media.type === 'series');
    const recentMovies = MediaCtrl.catalog({ type: 'movie', sort: 'year', limit: 100 }).data;
    const exploreMedia = editorialMovieOrder(movies.length ? movies : allMedia);
    const editorialSlides = (exploreMedia.length ? exploreMedia : uniqueEditorialMedia([...series, ...allMedia], 6)).slice(0, 3);
    const cartelera = uniqueEditorialMedia([...exploreMedia, ...recentMovies, ...movies], 6);
    const commented = [...allMedia].sort((a, b) => b.review_count - a.review_count || b.average_rating - a.average_rating).slice(0, 3);
    const initial = editorialSlides[0];
    const watchlistCount = MediaCtrl.getWatchlist().length;
    const dateLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()).toUpperCase();

    setContent(`
    <div class="editorial-dashboard">
        <div class="editorial-main-inner">
            <header class="editorial-page-head" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px">
                <div>
                    <div class="editorial-page-kicker">${H.esc(dateLabel)}</div>
                    <h1>Descubre algo que <em>merezca tu tiempo.</em></h1>
                </div>
                <button type="button" class="btn btn-primary btn-add-media" id="editorial-home-add-btn" style="font-weight:700;padding:10px 20px;font-size:0.95rem;border-radius:8px">
                    <span style="font-size:1.2rem;font-weight:800">+</span> <span>Agregar Película</span>
                </button>
            </header>

            <section class="editorial-first-fold" aria-label="Selección editorial">
                <article class="editorial-hero-carousel" id="editorial-hero-carousel" tabindex="0" role="region" aria-roledescription="carrusel" aria-label="Selección editorial">
                    <img class="editorial-hero-image" id="editorial-hero-image" src="${H.esc(initial?.image || '')}" alt="${H.esc(initial?.title || 'Película destacada')} — selección editorial" decoding="async">
                    <div class="editorial-hero-copy" aria-live="polite">
                        <div class="editorial-eyebrow"><span aria-hidden="true">◌</span> Selección editorial</div>
                        <h2 id="editorial-hero-title">${H.esc(initial?.title || 'Sin títulos disponibles')}</h2>
                        <p class="editorial-hero-lede" id="editorial-hero-copy">${H.esc(initial?.synopsis || 'Una historia lista para descubrir y conversar.')}</p>
                        <div class="editorial-meta-row" id="editorial-hero-meta"></div>
                        <div class="editorial-hero-actions">
                            <button type="button" class="editorial-btn editorial-btn-primary" id="editorial-hero-review">◌ <span>Leer reseñas</span></button>
                            <button type="button" class="editorial-btn editorial-btn-quiet" id="editorial-hero-watchlist"><span aria-hidden="true">♡</span><span>Añadir a Mi Lista</span></button>
                        </div>
                    </div>
                    <div class="editorial-hero-navigation" aria-label="Navegación de selección editorial">
                        <span class="editorial-hero-status"><strong id="editorial-hero-current">01</strong> / ${String(editorialSlides.length).padStart(2, '0')}</span>
                        <div class="editorial-hero-buttons">
                            <button type="button" class="editorial-round-button editorial-hero-prev" aria-label="Película anterior">←</button>
                            <button type="button" class="editorial-round-button editorial-hero-next" aria-label="Película siguiente">→</button>
                        </div>
                    </div>
                </article>

                <aside class="editorial-right-stack">
                    <section class="editorial-panel editorial-activity-panel" aria-labelledby="editorial-activity-title">
                        <div class="editorial-panel-head"><h2 class="editorial-panel-title" id="editorial-activity-title">Tu actividad</h2><button type="button" class="editorial-panel-link" id="editorial-history-link">Ver historial ↗</button></div>
                        <div class="editorial-activity-row" id="editorial-add-activity-row" style="cursor:pointer;background:rgba(139,233,253,0.08);border:1px solid rgba(139,233,253,0.25);border-radius:8px">
                            <span class="editorial-activity-icon" aria-hidden="true" style="color:var(--accent);font-weight:800">+</span>
                            <div class="editorial-activity-copy"><span style="color:var(--accent);font-weight:700">Agregar película</span><strong>Publicar contenido nuevo</strong></div>
                            <small style="color:var(--accent);font-weight:700">Crear</small>
                        </div>
                        <div class="editorial-activity-row"><span class="editorial-activity-icon" aria-hidden="true">♡</span><div class="editorial-activity-copy"><span>En tu lista</span><strong>${watchlistCount} títulos guardados</strong></div><small>Personal</small></div>
                        <div class="editorial-activity-row"><span class="editorial-activity-icon" aria-hidden="true">≡</span><div class="editorial-activity-copy"><span>Último movimiento</span><strong>${H.esc(initial?.title || 'Explora el catálogo')}</strong></div><small>Hoy</small></div>
                        <div class="editorial-activity-row"><span class="editorial-activity-icon" aria-hidden="true">★</span><div class="editorial-activity-copy"><span>Tu última reseña</span><strong>${H.esc(initial?.title || 'Aún sin reseñas')}</strong></div><small class="is-rating">${initial?.review_count ? `${H.esc(editorialRatingText(initial))}/10` : '—'}</small></div>
                    </section>

                    <section class="editorial-panel editorial-explore-panel" aria-labelledby="editorial-explore-title">
                        <div class="editorial-panel-head"><h2 class="editorial-panel-title" id="editorial-explore-title">Continuar explorando</h2><button type="button" class="editorial-panel-link" id="editorial-catalog-link">Catálogo ↗</button></div>
                        <div class="editorial-explore-list">
                            ${editorialSlides.map((media, index) => `
                            <button type="button" class="editorial-explore-item" data-index="${index}" aria-current="${index === 0 ? 'true' : 'false'}">
                                <span class="editorial-explore-poster">${H.poster(media.image, media.title)}</span>
                                <span class="editorial-explore-copy"><span class="editorial-explore-title">${H.esc(media.title)}</span><span class="editorial-explore-meta"><span>${H.esc(String(media.release_year))}</span><span class="editorial-rating">★ ${H.esc(editorialRatingText(media))}</span></span></span>
                                <span class="editorial-explore-arrow" aria-hidden="true">›</span>
                            </button>`).join('') || '<p class="editorial-empty">No hay películas para mostrar.</p>'}
                        </div>
                    </section>
                </aside>
            </section>

            <section class="editorial-section editorial-carousel-section" aria-labelledby="editorial-carousel-title" aria-roledescription="carrusel">
                <div class="editorial-section-head">
                    <div><h2 class="editorial-section-title" id="editorial-carousel-title">Películas en cartelera</h2><p class="editorial-section-subtitle">Elige una historia para leer opiniones y dejar la tuya</p></div>
                    <button type="button" class="editorial-section-action" id="editorial-movies-link">Ver catálogo ↗</button>
                </div>
                <div class="editorial-carousel-shell">
                    <div class="editorial-carousel-scene" id="editorial-carousel-scene">
                        <div class="editorial-carousel-ring">
                            ${cartelera.map((media, index) => `
                            <article class="editorial-poster-card" data-index="${index}" data-id="${media.id}" role="button" tabindex="0" aria-label="Seleccionar ${H.esc(media.title)}" aria-current="${index === 0 ? 'true' : 'false'}">
                                <div class="editorial-poster-wrap">
                                    ${H.poster(media.image, media.title)}
                                    <button type="button" class="editorial-card-heart" data-id="${media.id}" aria-label="${MediaCtrl.isInWatchlist(media.id) ? 'Quitar de Mi Lista' : 'Guardar en Mi Lista'}"><span aria-hidden="true">${MediaCtrl.isInWatchlist(media.id) ? '♥' : '♡'}</span></button>
                                </div>
                                <div class="editorial-poster-info"><div class="editorial-poster-title">${H.esc(media.title)}</div><div class="editorial-poster-meta"><span>${H.esc(String(media.release_year))} · ${H.esc(editorialGenreText(media))}</span><span class="editorial-rating">★ ${H.esc(editorialRatingText(media))}</span></div><button type="button" class="editorial-card-review" data-id="${media.id}">Leer reseñas →</button></div>
                            </article>`).join('') || '<p class="editorial-empty">No hay películas para mostrar.</p>'}
                        </div>
                    </div>
                    <div class="editorial-carousel-nav">
                        <span class="editorial-carousel-status" aria-live="polite"><strong id="editorial-carousel-current">01</strong> / ${String(cartelera.length).padStart(2, '0')} · selecciona para comentar</span>
                        <div class="editorial-carousel-buttons"><button type="button" class="editorial-round-button editorial-carousel-prev" aria-label="Película anterior">←</button><button type="button" class="editorial-round-button editorial-carousel-next" aria-label="Película siguiente">→</button></div>
                    </div>
                </div>
            </section>

            <section class="editorial-section editorial-bottom-grid" aria-label="Actividad editorial">
                <div class="editorial-panel editorial-commented-panel"><div class="editorial-panel-head"><h2 class="editorial-panel-title">Más comentadas</h2><button type="button" class="editorial-panel-link" id="editorial-ranking-link">Ver ranking ↗</button></div><div class="editorial-commented-list">
                    ${commented.map((media, index) => `<article class="editorial-commented-item" data-id="${media.id}" role="button" tabindex="0"><span class="editorial-rank ${index === 0 ? 'is-first' : ''}">${String(index + 1).padStart(2, '0')}</span><span class="editorial-mini-poster">${H.poster(media.image, media.title)}</span><span class="editorial-commented-copy"><strong>${H.esc(media.title)}</strong><small>${media.review_count} reseñas · ${H.esc(editorialGenreText(media))}</small></span><span class="editorial-commented-score">${H.esc(editorialRatingText(media))}</span></article>`).join('') || '<p class="editorial-empty">Aún no hay reseñas.</p>'}
                </div></div>
                <aside class="editorial-panel editorial-curation-panel"><div class="editorial-curation-label">Nota de la casa</div><h3>El cine también se ordena por sensaciones.</h3><p>Guarda lo que te mueve, clasifica lo que repetirías y deja que tus propias puntuaciones construyan una colección con criterio.</p><div class="editorial-curation-rule"></div><div class="editorial-curation-foot"><span>Tu colección personal</span><strong>${allMedia.filter(media => media.review_count > 0).length} títulos valorados</strong></div></aside>
            </section>
        </div>
    </div>`);

    document.getElementById('app-layout')?.classList.add('editorial-layout');
    const dashboard = document.querySelector('.editorial-dashboard');
    if (!dashboard) return;

    let activeHeroIndex = setEditorialHeroSlide(0, editorialSlides);
    const updateHero = index => { activeHeroIndex = setEditorialHeroSlide(index, editorialSlides); };
    const heroPrev = dashboard.querySelector('.editorial-hero-prev');
    const heroNext = dashboard.querySelector('.editorial-hero-next');
    heroPrev?.addEventListener('click', () => updateHero(activeHeroIndex - 1));
    heroNext?.addEventListener('click', () => updateHero(activeHeroIndex + 1));
    dashboard.querySelector('#editorial-hero-carousel')?.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); updateHero(activeHeroIndex - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); updateHero(activeHeroIndex + 1); }
    });
    dashboard.querySelectorAll('.editorial-explore-item').forEach(item => {
        const select = () => updateHero(parseInt(item.dataset.index, 10));
        item.addEventListener('click', select);
        item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    });

    dashboard.querySelector('#editorial-hero-review')?.addEventListener('click', event => {
        const id = event.currentTarget.dataset.id;
        if (id) Router.navigate('/detail/' + id);
    });
    dashboard.querySelector('#editorial-hero-watchlist')?.addEventListener('click', event => {
        const button = event.currentTarget;
        const res = MediaCtrl.toggleWatchlist(button.dataset.id);
        if (res.error) { H.showToast(res.error, 'error'); return; }
        updateEditorialWatchlistButton(button, button.dataset.id);
        H.showToast(res.added ? 'Añadido a Mi Lista ♥' : 'Eliminado de Mi Lista');
    });
    dashboard.querySelector('#editorial-history-link')?.addEventListener('click', () => Router.navigate('/watchlist'));
    dashboard.querySelector('#editorial-home-add-btn')?.addEventListener('click', () => renderUserAddMediaModal());
    dashboard.querySelector('#editorial-add-activity-row')?.addEventListener('click', () => renderUserAddMediaModal());
    dashboard.querySelector('#editorial-catalog-link')?.addEventListener('click', () => Router.navigate('/movies'));
    dashboard.querySelector('#editorial-movies-link')?.addEventListener('click', () => Router.navigate('/movies'));
    dashboard.querySelector('#editorial-ranking-link')?.addEventListener('click', () => Router.navigate('/top'));

    dashboard.querySelectorAll('.editorial-card-heart').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            const res = MediaCtrl.toggleWatchlist(button.dataset.id);
            if (res.error) { H.showToast(res.error, 'error'); return; }
            updateEditorialCardHeart(button, button.dataset.id);
            H.showToast(res.added ? 'Añadido a Mi Lista ♥' : 'Eliminado de Mi Lista');
        });
    });
    dashboard.querySelectorAll('.editorial-card-review').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            Router.navigate('/detail/' + button.dataset.id);
        });
    });

    dashboard.querySelectorAll('.editorial-poster-card').forEach(card => {
        const openDetail = () => Router.navigate('/detail/' + card.dataset.id);
        card.addEventListener('click', event => {
            if (event.target.closest('.editorial-card-heart')) return;
            if (card.classList.contains('is-active')) openDetail();
        });
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(); }
        });
    });

    dashboard.querySelectorAll('.editorial-commented-item').forEach(item => {
        const openDetail = () => Router.navigate('/detail/' + item.dataset.id);
        item.addEventListener('click', openDetail);
        item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(); } });
    });

    const posterCards = [...dashboard.querySelectorAll('.editorial-poster-card')];
    const posterCurrent = dashboard.querySelector('#editorial-carousel-current');
    const posterPrev = dashboard.querySelector('.editorial-carousel-prev');
    const posterNext = dashboard.querySelector('.editorial-carousel-next');
    let activePosterIndex = 0;

    const stateForPoster = (offset, halfWidth) => {
        const abs = Math.abs(offset);
        if (abs === 0) return { tx: 0, sc: 1, op: 1, zi: 10 };
        const angle = abs * ((2 * Math.PI) / posterCards.length);
        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);
        if (abs === 1 || cosA >= 0) {
            const scale = Math.max(0.28, 0.28 + 0.72 * cosA);
            return { tx: sinA * halfWidth * 2.5, sc: scale, op: 0.7 + 0.3 * Math.max(0, cosA), zi: 10 - abs };
        }
        return { tx: halfWidth * 0.9, sc: 0.25, op: sinA > 0.05 ? 0.65 : 0, zi: 10 - abs };
    };
    const setEditorialPosterPositions = () => {
        if (!posterCards.length) return;
        const halfWidth = (posterCards[0].offsetWidth || 180) / 2;
        posterCards.forEach((card, index) => {
            let offset = index - activePosterIndex;
            if (offset > posterCards.length / 2) offset -= posterCards.length;
            if (offset < -posterCards.length / 2) offset += posterCards.length;
            const sign = Math.sign(offset) || 1;
            const state = stateForPoster(offset, halfWidth);
            card.style.transform = `translateX(${sign * state.tx}px) scale(${state.sc})`;
            card.style.opacity = state.op;
            card.style.zIndex = state.zi;
            card.classList.toggle('is-active', offset === 0);
            card.setAttribute('aria-current', offset === 0 ? 'true' : 'false');
        });
        if (posterCurrent) posterCurrent.textContent = String(activePosterIndex + 1).padStart(2, '0');
    };
    const rotatePosterTo = target => {
        if (!posterCards.length) return;
        activePosterIndex = ((target % posterCards.length) + posterCards.length) % posterCards.length;
        setEditorialPosterPositions();
    };
    posterPrev?.addEventListener('click', () => rotatePosterTo(activePosterIndex - 1));
    posterNext?.addEventListener('click', () => rotatePosterTo(activePosterIndex + 1));
    posterCards.forEach((card, index) => {
        const focusCard = () => { if (index !== activePosterIndex) rotatePosterTo(index); };
        card.addEventListener('click', event => { if (!event.target.closest('.editorial-card-heart') && !card.classList.contains('is-active')) focusCard(); });
        card.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); rotatePosterTo(activePosterIndex - 1); } else if (event.key === 'ArrowRight') { event.preventDefault(); rotatePosterTo(activePosterIndex + 1); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusCard(); } });
    });
    const onEditorialResize = () => setEditorialPosterPositions();
    window.addEventListener('resize', onEditorialResize, { passive: true });
    editorialCleanup = () => window.removeEventListener('resize', onEditorialResize);
    setEditorialPosterPositions();
}

// ============================================================
// CONFIGURACIÓN DE RUTAS
// ============================================================
function setupRoutes() {
    Router
    // HOME
    .on('/home', ()=>{
        setActiveNav('/home');
        renderEditorialHome();
    })

    // PELÍCULAS
    .on('/movies', ()=>{
        setActiveNav('/movies');
        const q = new URLSearchParams(window.location.hash.split('?')[1]||'').get('q')||'';
        renderCatalog('movie', q);
    })

    // SERIES
    .on('/series', ()=>{ setActiveNav('/series'); renderCatalog('series',''); })

    // TOP RATED
    .on('/top', ()=>{
        setActiveNav('/top');
        const {movies,series}=MediaCtrl.getTopRated();
        const rankCls=i=>i===0?'gold':i===1?'silver':i===2?'bronze':'';
        const topList=arr=>arr.length?arr.map((m,i)=>`<div class="top-item" data-id="${m.id}">
            <div class="top-rank ${rankCls(i)}">#${i+1}</div>
            <div class="top-poster">${H.poster(m.image,m.title)}</div>
            <div class="top-info"><div class="top-title">${H.esc(m.title)}</div><div class="top-meta">${m.release_year} · ${m.review_count} reseñas</div></div>
            <div class="top-score">⭐ ${m.average_rating.toFixed(1)}</div>
        </div>`).join(''):`<p style="color:var(--text-3)">Sin calificaciones aún.</p>`;
        setContent(`<div class="section-header"><h2 class="section-title">🏆 Mejores Calificadas</h2></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;flex-wrap:wrap">
            <div><h3 style="margin-bottom:1rem;color:var(--tier-s)">🎬 Top Películas</h3><div class="top-list">${topList(movies)}</div></div>
            <div><h3 style="margin-bottom:1rem;color:var(--accent)">📺 Top Series</h3><div class="top-list">${topList(series)}</div></div>
        </div>`);
        document.querySelectorAll('.top-item[data-id]').forEach(el=>el.addEventListener('click',()=>Router.navigate('/detail/'+el.dataset.id)));
    })

    // ESTADÍSTICAS
    .on('/stats', ()=>{
        setActiveNav('/stats');
        const s=MediaCtrl.getStats();
        const topListHTML=arr=>arr.map((m,i)=>`<div class="top-item" data-id="${m.id}" style="cursor:pointer">
            <div class="top-rank">${i+1}</div>
            <div class="top-poster">${H.poster(m.image,m.title)}</div>
            <div class="top-info"><div class="top-title">${H.esc(m.title)}</div><div class="top-meta">${m.review_count} reseñas · ${m.average_rating>0?'⭐ '+m.average_rating.toFixed(1):'—'}</div></div>
        </div>`).join('');
        setContent(`<div class="section-header"><h2 class="section-title">📊 Estadísticas de la Plataforma</h2></div>
        <div class="stats-grid">
            <div class="stat-card glass"><div class="stat-value" style="color:var(--tier-s)">${s.totalMovies}</div><div class="stat-label">Películas</div></div>
            <div class="stat-card glass"><div class="stat-value" style="color:var(--accent)">${s.totalSeries}</div><div class="stat-label">Series</div></div>
            <div class="stat-card glass"><div class="stat-value" style="color:var(--gold)">${s.totalReviews}</div><div class="stat-label">Reseñas Totales</div></div>
            <div class="stat-card glass"><div class="stat-value" style="color:var(--success)">${s.totalUsers}</div><div class="stat-label">Usuarios Registrados</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem">
            <div><h3 style="margin-bottom:1rem">🔥 Más Comentadas</h3><div class="top-list">${topListHTML(s.topByReviews)}</div></div>
            <div><h3 style="margin-bottom:1rem">⭐ Mejor Puntuadas</h3><div class="top-list">${topListHTML(s.topByRating)}</div></div>
        </div>`);
        document.querySelectorAll('.top-item[data-id]').forEach(el=>el.addEventListener('click',()=>Router.navigate('/detail/'+el.dataset.id)));
    })

    // DETALLE
    .on('/detail', mediaId=>{
        setActiveNav('');
        if(!mediaId) { Router.navigate('/home'); return; }
        renderDetail(mediaId);
    })

    // WATCHLIST
    .on('/watchlist', ()=>{
        setActiveNav('/watchlist');
        renderWatchlist();
    })

    // TIER LIST
    .on('/tierlist', ()=>{
        setActiveNav('/tierlist');
        renderTierList();
    })

    // ADMIN
    .on('/admin', sub=>{
        const mode=sub||'media';
        setActiveNav('/admin/'+mode);
        if(!Auth.isAdmin){ setContent('<div style="text-align:center;padding:4rem"><div style="font-size:3rem">🔒</div><h2 style="margin-top:1rem">Acceso Denegado</h2></div>'); return; }
        mode==='users' ? renderAdminUsers() : renderAdminMedia();
    })

    .on('*', ()=>Router.navigate('/home'));
}

// ============================================================
// RENDERIZADO DE VISTAS COMPLEJAS
// ============================================================

// ---- MODAL AGREGAR PELÍCULA PARA USUARIOS ----
function renderUserAddMediaModal() {
    if (!Auth.isAuth) {
        H.showToast('Debes iniciar sesión para agregar contenido.', 'error');
        return;
    }
    const genres = MediaCtrl.getGenres();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-box glass" style="max-width:600px;width:90%">
        <div class="modal-header"><h3>🎬 Agregar Nueva Película o Serie</h3><button class="btn-icon" id="cls-user-modal">✕</button></div>
        <form id="user-m-form" style="display:flex;flex-direction:column;gap:1rem;margin-top:1rem">
            <div class="form-group"><label>Título *</label><input class="input-field" name="title" required placeholder="ej: Matrix, Oppenheimer..."></div>
            <div class="form-row">
                <div class="form-group"><label>Tipo *</label><select class="input-field" name="type"><option value="movie">🎬 Película</option><option value="series">📺 Serie</option></select></div>
                <div class="form-group"><label>Año de estreno *</label><input class="input-field" name="release_year" type="number" required value="2024"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Clasificación de Edad</label><select class="input-field" name="age_rating">${['G','PG','PG-13','R','NC-17','TV-G','TV-PG','TV-14','TV-MA'].map(r=>`<option>${r}</option>`).join('')}</select></div>
                <div class="form-group"><label>Duración</label><input class="input-field" name="duration" placeholder="ej: 120 min, 45 min/ep"></div>
            </div>
            <div class="form-group"><label>Géneros</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${genres.map(g=>`<label style="display:flex;align-items:center;gap:5px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="gids" value="${g.id}"> ${g.name}</label>`).join('')}</div></div>
            <div class="form-group"><label>Sinopsis</label><textarea class="input-field" name="synopsis" placeholder="Resumen del contenido..." style="min-height:80px;resize:vertical"></textarea></div>
            <div class="form-row">
                <div class="form-group"><label>Director</label><input class="input-field" name="director" placeholder="ej: Christopher Nolan"></div>
                <div class="form-group"><label>Reparto</label><input class="input-field" name="cast" placeholder="ej: Leonardo DiCaprio, Anne Hathaway"></div>
            </div>
            <div class="form-group"><label>URL Imagen de portada</label><input class="input-field" name="image" type="url" placeholder="https://ejemplo.com/poster.jpg"></div>
            <p class="error-msg" id="user-m-err"></p>
            <div style="display:flex;gap:10px;justify-content:flex-end">
                <button type="button" id="cancel-user-modal" class="btn btn-secondary">Cancelar</button>
                <button type="submit" class="btn btn-primary">✨ Guardar Película</button>
            </div>
        </form>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#cls-user-modal').onclick = ov.querySelector('#cancel-user-modal').onclick = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector('#user-m-form').onsubmit = e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const genre_ids = [...e.target.querySelectorAll('[name=gids]:checked')].map(c => parseInt(c.value));
        const data = {
            title: fd.get('title'),
            type: fd.get('type'),
            release_year: fd.get('release_year'),
            synopsis: fd.get('synopsis'),
            director: fd.get('director'),
            cast: fd.get('cast'),
            duration: fd.get('duration'),
            age_rating: fd.get('age_rating'),
            image: fd.get('image'),
            genre_ids
        };
        const res = MediaCtrl.create(data);
        if (res?.error) {
            ov.querySelector('#user-m-err').textContent = res.error;
            return;
        }
        ov.remove();
        H.showToast('¡Película agregada con éxito! 🎉');
        Router.resolve();
    };
}

// ---- CATÁLOGO ----
function renderCatalog(type, queryParam='') {
    const genres=MediaCtrl.getGenres();
    const label=type==='movie'?'🎬 Películas':'📺 Series';
    setContent(`<div class="section-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <h2 class="section-title">${label}</h2>
        <button class="btn btn-primary btn-sm btn-add-media" id="btn-cat-add-media">+ Agregar Película</button>
    </div>
    <div class="filters-bar glass">
        <span class="filter-label">Filtrar:</span>
        <input class="input-field" id="f-q" placeholder="Título, actor, director..." value="${H.esc(queryParam)}">
        <select class="input-field" id="f-genre"><option value="">Todos los géneros</option>${genres.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select>
        <input class="input-field" id="f-year" type="number" placeholder="Año" style="max-width:100px">
        <input class="input-field" id="f-dir" placeholder="Director">
        <select class="input-field" id="f-sort"><option value="title">A-Z</option><option value="rating">Mejor calificados</option><option value="year">Más recientes</option><option value="reviews">Más comentados</option></select>
        <select class="input-field" id="f-minr"><option value="0">Cualquier puntuación</option><option value="7">7+</option><option value="8">8+</option><option value="9">9+</option></select>
        <button class="btn btn-primary btn-sm" id="apply-f">Buscar</button>
        <button class="btn btn-secondary btn-sm" id="clear-f">Limpiar</button>
    </div>
    <div id="cat-results"></div>
    <div id="cat-pages" class="pagination"></div>`);

    document.getElementById('btn-cat-add-media')?.addEventListener('click', () => renderUserAddMediaModal());

    const load=(page=1)=>{
        const params={type,page,limit:18,query:document.getElementById('f-q')?.value||'',genre_id:document.getElementById('f-genre')?.value||null,year:document.getElementById('f-year')?.value||null,director:document.getElementById('f-dir')?.value||'',sort:document.getElementById('f-sort')?.value||'title',min_rating:document.getElementById('f-minr')?.value||0};
        const {data,totalPages}=MediaCtrl.catalog(params);
        const res=document.getElementById('cat-results');
        if(!res) return;
        res.innerHTML=data.length?`<div class="media-grid">${data.map(m=>mediaCardHTML(m)).join('')}</div>`:`<div style="text-align:center;padding:3rem;color:var(--text-3)"><div style="font-size:3rem">🎬</div><p style="margin-top:1rem">No se encontraron resultados.</p></div>`;
        const pag=document.getElementById('cat-pages');
        if(pag&&totalPages>1){pag.innerHTML=[...Array(totalPages)].map((_,i)=>`<button class="page-btn ${i+1===page?'active':''}" data-p="${i+1}">${i+1}</button>`).join('');pag.querySelectorAll('.page-btn').forEach(b=>b.onclick=()=>load(parseInt(b.dataset.p)));}else if(pag)pag.innerHTML='';
        bindCardClicks(document.getElementById('main-content'));
    };

    document.getElementById('apply-f')?.addEventListener('click',()=>load(1));
    document.getElementById('clear-f')?.addEventListener('click',()=>{document.querySelectorAll('#f-q,#f-year,#f-dir').forEach(i=>i.value='');document.querySelectorAll('#f-genre,#f-sort,#f-minr').forEach(s=>s.selectedIndex=0);load(1);});
    document.getElementById('f-q')?.addEventListener('keydown',e=>{if(e.key==='Enter')load(1);});
    load(1);
    if(queryParam){setTimeout(()=>load(1),50);}
}

// ---- DETALLE ----
function renderDetail(mediaId) {
    const res = MediaCtrl.getById(mediaId);
    if(res.error) { setContent(`<p class="error-msg">${res.error}</p>`); return; }
    const m=res.data;
    const avg=m.average_rating>0?m.average_rating.toFixed(1):null;
    const userRev=MediaCtrl.getUserReview(mediaId);
    const watchStatus=MediaCtrl.getWatchStatus(mediaId);
    const hasReviewed=!!userRev;

    const reviewsHTML=revs=>{
        if(!revs||!revs.length) return `<p style="color:var(--text-3);text-align:center;padding:2rem">No hay reseñas aún. ¡Sé el primero!</p>`;
        return revs.map(r=>`<div class="review-card glass">
            <div class="review-header">
                <div class="review-user"><div class="review-avatar">${r.username?.charAt(0)?.toUpperCase()}</div><div><div class="review-username">${H.esc(r.username)}</div><div class="review-date">${H.fmtDate(r.created_at)}</div></div></div>
                <div class="review-score">${[...Array(r.rating)].map(()=>'<span class="score-star">★</span>').join('')}<span style="color:var(--text-3);font-size:.8rem;margin-left:4px">${r.rating}/10</span></div>
            </div>
            <p class="review-text">${H.esc(r.comment)}</p>
        </div>`).join('');
    };

    const recsHTML = m.recommendations.map(r=>`<div class="rec-card" data-id="${r.id}"><div class="rec-poster">${H.poster(r.image,r.title)}</div><div class="rec-body"><div class="rec-title">${H.esc(r.title)}</div><div style="font-size:.72rem;color:var(--text-3)">${r.release_year}</div></div></div>`).join('');

    setContent(`
    <button class="btn btn-secondary btn-sm" onclick="history.back()">← Volver</button>
    <div class="detail-hero" style="margin-top:1.5rem">
        <div class="detail-poster">${H.poster(m.image,m.title)}</div>
        <div class="detail-info">
            <h1 class="detail-title">${H.esc(m.title)}</h1>
            <div class="detail-meta">
                ${H.badge(m.type==='movie'?'🎬 Película':'📺 Serie', m.type==='movie'?'badge-type-movie':'badge-type-series')}
                ${H.badge(m.release_year,'badge-year')}
                ${H.genreBadges(m.genres)}
                ${m.age_rating?H.badge(m.age_rating,''):''}
            </div>
            <div class="detail-rating-big">${avg?`⭐ ${avg} <span style="font-size:1rem;color:var(--text-2);font-weight:400">(${m.review_count} reseñas)</span>`:'<span style="font-size:1rem;color:var(--text-3)">Sin calificaciones aún</span>'}</div>
            <p class="detail-synopsis">${H.esc(m.synopsis||'Sin sinopsis disponible.')}</p>
            <div class="detail-cast">
                ${m.director?`<div class="detail-cast-item"><strong>Director:</strong> ${H.esc(m.director)}</div>`:''}
                ${m.cast?`<div class="detail-cast-item"><strong>Reparto:</strong> ${H.esc(m.cast)}</div>`:''}
                ${m.duration?`<div class="detail-cast-item"><strong>Duración:</strong> ${H.esc(m.duration)}</div>`:''}
            </div>
        </div>
    </div>

    <!-- ESTADO DE REPRODUCCIÓN (SESIÓN) -->
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
                <span class="critique-desc">${hasReviewed ? `Tu reseña fue registrada el ${H.fmtDate(userRev.created_at)} con una calificación de ⭐ ${userRev.rating}/10.` : 'Haz clic para redactar tu opinión y marcar esta casilla.'}</span>
            </div>
        </label>
    </div>

    <div class="reviews-section">
        <h3>💬 Reseñas de la comunidad</h3>
        ${Auth.isAuth?`
        <div class="review-form glass" style="margin-bottom:1.5rem">
            <h4>${userRev?'✏️ Actualizar tu reseña':'✍️ Escribe una reseña'}</h4>
            <div style="margin:1rem 0">
                <label style="font-size:.82rem;color:var(--text-2);font-weight:600;display:block;margin-bottom:8px">Puntuación (1-10)</label>
                <div class="rating-stars" id="star-row">
                    ${[...Array(10)].map((_,i)=>`<button type="button" class="star-btn${userRev&&(i+1)<=userRev.rating?' active':''}" data-v="${i+1}">★</button>`).join('')}
                </div>
                <input type="hidden" id="rev-rating" value="${userRev?.rating||0}">
            </div>
            <textarea class="input-field review-textarea" id="rev-comment" placeholder="Comparte tu opinión (mín. 5 caracteres)...">${userRev?.comment||''}</textarea>
            <button class="btn btn-primary" id="submit-rev" style="margin-top:.75rem;align-self:flex-start">${userRev?'Actualizar':'Publicar Reseña'}</button>
        </div>`:`<p style="color:var(--text-3);margin-bottom:1.5rem">Inicia sesión para dejar una reseña.</p>`}
        <div class="reviews-list" id="rev-list">${reviewsHTML(m.reviews)}</div>
    </div>

    ${m.recommendations.length?`<div class="recs-section"><h3 style="margin-bottom:1rem">✨ Similares</h3><div class="recs-scroll">${recsHTML}</div></div>`:''}`);

    // Manejador de estado de reproducción en detalle
    document.querySelectorAll('.detail-watch-status-box .status-btn').forEach(btn => {
        btn.onclick = () => {
            const st = btn.dataset.status;
            const res = MediaCtrl.setWatchStatus(mediaId, st);
            if (res?.error) { H.showToast(res.error, 'error'); return; }
            document.querySelectorAll('.detail-watch-status-box .status-btn').forEach(b => b.classList.toggle('active', b === btn));
            const badge = document.getElementById('detail-status-badge');
            if (badge) {
                badge.className = `status-current-label status-${st}`;
                badge.textContent = st==='vista'?'✅ Vista':(st==='en_proceso'?'⏳ En proceso':'👁️ No vista');
            }
            const labelMap = { 'no_vista': 'No vista 👁️', 'en_proceso': 'En proceso ⏳', 'vista': 'Vista ✅' };
            H.showToast(`Estado guardado: ${labelMap[st]||st}`);
        };
    });

    // Manejador de casilla de crítica de sesión
    const critiqueChk = document.getElementById('detail-session-critique-chk');
    critiqueChk?.addEventListener('change', () => {
        if (!hasReviewed && critiqueChk.checked) {
            const form = document.querySelector('.review-form');
            if (form) {
                form.scrollIntoView({ behavior: 'smooth' });
                document.getElementById('rev-comment')?.focus();
            } else {
                H.showToast('Inicia sesión para escribir tu crítica.', 'info');
            }
        }
    });

    // Estrellas interactivas
    document.querySelectorAll('.star-btn').forEach(btn=>{
        btn.onclick=()=>{
            const v=parseInt(btn.dataset.v);
            document.getElementById('rev-rating').value=v;
            document.querySelectorAll('.star-btn').forEach((s,i)=>s.classList.toggle('active',i<v));
        };
    });

    document.getElementById('submit-rev')?.addEventListener('click',()=>{
        const rating=parseInt(document.getElementById('rev-rating').value);
        const comment=document.getElementById('rev-comment').value;
        const res=MediaCtrl.submitReview(mediaId, rating, comment);
        if(res.error){H.showToast(res.error,'error');return;}
        H.showToast('¡Reseña publicada!');
        renderDetail(mediaId);
    });

    document.querySelectorAll('.rec-card').forEach(c=>c.onclick=()=>Router.navigate('/detail/'+c.dataset.id));
}

// ---- WATCHLIST ----
function renderWatchlist() {
    const list = MediaCtrl.getWatchlist();
    setContent(`<div class="section-header">
        <h2 class="section-title">💖 Mi Lista de Favoritos</h2>
        <span style="font-size:0.85rem;color:var(--text-3)">${list.length} contenidos guardados</span>
    </div>
    ${list.length > 0 ? `<div class="media-grid">${list.map(m => mediaCardHTML(m)).join('')}</div>` : `
        <div style="text-align:center;padding:4rem 1rem;color:var(--text-3)">
            <div style="font-size:3.5rem;margin-bottom:1rem">💖</div>
            <h3 style="color:var(--text-1);margin-bottom:0.5rem">Tu lista está vacía</h3>
            <p style="max-width:400px;margin:0 auto 1.5rem">Guarda tus películas y series favoritas haciendo clic en el corazón 🤍 de cualquier tarjeta.</p>
            <button class="btn btn-primary" onclick="Router.navigate('/movies')">Explorar Catálogo</button>
        </div>
    `}`);
    bindCardClicks(document.getElementById('main-content'));
}

// ---- TIER LIST ----
function renderTierList() {
    const allMedia = MediaCtrl.catalog({limit:200}).data;
    const tierStates = MediaCtrl.getTiers();
    const tiers={S:[],A:[],B:[],C:[],D:[],pool:[]};
    allMedia.forEach(m=>{ const te=tierStates.find(t=>t.media_id===m.id); const tier=te?.tier||'pool'; if(tiers[tier]) tiers[tier].push(m); else tiers.pool.push(m); });

    const tc=m=>`<div class="tier-media-card" data-id="${m.id}" title="${H.esc(m.title)}">${m.image?`<img src="${m.image}" alt="${H.esc(m.title)}" loading="lazy" onerror="this.style.display='none'">`:'<span style="font-size:1.5rem">🎬</span>'}<div class="tier-title">${H.esc(m.title)}</div></div>`;

    setContent(`<div class="section-header">
        <h2 class="section-title">📋 Mi Tier List Personal</h2>
        <div style="display:flex;gap:10px;align-items:center">
            <button class="btn btn-secondary btn-sm" id="btn-export-tier">📋 Exportar Tier List</button>
            <span style="font-size:.82rem;color:var(--text-3)">Arrastra las tarjetas entre los niveles</span>
        </div>
    </div>
    <div class="tier-list">
        ${['S','A','B','C','D'].map(t=>`<div class="tier-row"><div class="tier-label tier-label-${t.toLowerCase()}">${t}</div><div class="tier-drop" id="tier-${t}">${tiers[t].map(tc).join('')}</div></div>`).join('')}
    </div>
    <div class="tier-pool-container"><h3>Sin clasificar</h3><div class="tier-pool" id="tier-pool">${tiers.pool.map(tc).join('')}</div></div>`);

    document.getElementById('btn-export-tier')?.addEventListener('click', () => {
        let text = "🏆 MI TIER LIST - CINECLASSIFY PRO 🏆\n\n";
        ['S','A','B','C','D'].forEach(t => {
            const names = tiers[t].map(m => m.title);
            text += `Tier ${t}: ${names.length ? names.join(', ') : '(Ninguno)'}\n`;
        });
        navigator.clipboard.writeText(text).then(() => {
            H.showToast('¡Tier List copiada al portapapeles! 📋');
        }).catch(() => {
            alert(text);
        });
    });

    if(typeof Sortable !== 'undefined') {
        document.querySelectorAll('.tier-drop,.tier-pool').forEach(el=>{
            new Sortable(el,{group:'tl',animation:180,ghostClass:'sortable-ghost',dragClass:'sortable-drag',
                onEnd:evt=>{ MediaCtrl.saveTier(evt.item.dataset.id, evt.to.id.replace('tier-','')); }
            });
        });
    }
}

// ---- ADMIN MEDIA ----
function renderAdminMedia() {
    const all=MediaCtrl.catalog({limit:200}).data;
    const genres=MediaCtrl.getGenres();
    setContent(`<div class="section-header"><h2 class="section-title">⚙️ Gestionar Contenido</h2><button class="btn btn-primary btn-sm" id="add-btn">+ Añadir</button></div>
    <div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Título</th><th>Tipo</th><th>Año</th><th>⭐</th><th>Reseñas</th><th>Acciones</th></tr></thead><tbody>
    ${all.map(m=>`<tr><td><strong>${H.esc(m.title)}</strong></td><td>${H.badge(m.type==='movie'?'Película':'Serie',m.type==='movie'?'badge-type-movie':'badge-type-series')}</td><td>${m.release_year}</td><td>${m.average_rating>0?'⭐ '+m.average_rating.toFixed(1):'—'}</td><td>${m.review_count}</td>
    <td><div class="admin-actions"><button class="btn btn-secondary btn-sm edit-btn" data-id="${m.id}">✏️</button><button class="btn btn-danger btn-sm del-btn" data-id="${m.id}">🗑️</button></div></td></tr>`).join('')}
    </tbody></table></div>`);

    const addBtn = document.getElementById('add-btn');
    if (addBtn) addBtn.onclick = () => openMediaModal(null, genres);
    document.querySelectorAll('.edit-btn').forEach(b=>b.onclick=()=>openMediaModal(MediaCtrl.getById(b.dataset.id)?.data,genres));
    document.querySelectorAll('.del-btn').forEach(b=>b.onclick=()=>{ if(confirm('¿Eliminar este contenido?')){MediaCtrl.remove(b.dataset.id);H.showToast('Eliminado.');renderAdminMedia();} });
}

function openMediaModal(media, genres) {
    const isEdit=!!media;
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.innerHTML=`<div class="modal-box"><div class="modal-header"><h2 class="modal-title">${isEdit?'Editar':'Añadir'} Contenido</h2><button class="btn btn-icon" id="cls-modal">✕</button></div>
    <form id="m-form" class="modal-form">
        <div class="form-row">
            <div class="form-group"><label>Título *</label><input class="input-field" name="title" required value="${H.esc(media?.title||'')}"></div>
            <div class="form-group"><label>Tipo *</label><select class="input-field" name="type"><option value="movie"${media?.type==='movie'?' selected':''}>🎬 Película</option><option value="series"${media?.type==='series'?' selected':''}>📺 Serie</option></select></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Año *</label><input class="input-field" name="release_year" type="number" required value="${media?.release_year||''}"></div>
            <div class="form-group"><label>Clasificación</label><select class="input-field" name="age_rating">${['G','PG','PG-13','R','NC-17','TV-G','TV-PG','TV-14','TV-MA'].map(r=>`<option${media?.age_rating===r?' selected':''}>${r}</option>`).join('')}</select></div>
        </div>
        <div class="form-group"><label>Géneros</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${genres.map(g=>`<label style="display:flex;align-items:center;gap:5px;font-size:.85rem;cursor:pointer"><input type="checkbox" name="gids" value="${g.id}"${media?.genre_ids?.includes(g.id)?' checked':''}> ${g.name}</label>`).join('')}</div></div>
        <div class="form-group"><label>Sinopsis</label><textarea class="input-field" name="synopsis" style="min-height:80px;resize:vertical">${H.esc(media?.synopsis||'')}</textarea></div>
        <div class="form-row">
            <div class="form-group"><label>Director</label><input class="input-field" name="director" value="${H.esc(media?.director||'')}"></div>
            <div class="form-group"><label>Duración</label><input class="input-field" name="duration" value="${H.esc(media?.duration||'')}"></div>
        </div>
        <div class="form-group"><label>Reparto</label><input class="input-field" name="cast" value="${H.esc(media?.cast||'')}"></div>
        <div class="form-group"><label>URL Imagen</label><input class="input-field" name="image" type="url" value="${H.esc(media?.image||'')}"></div>
        <p class="error-msg" id="m-err"></p>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" id="cancel-modal" class="btn btn-secondary">Cancelar</button><button type="submit" class="btn btn-primary">${isEdit?'Guardar':'Crear'}</button></div>
    </form></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#cls-modal').onclick=ov.querySelector('#cancel-modal').onclick=()=>ov.remove();
    ov.onclick=e=>{if(e.target===ov)ov.remove();};
    ov.querySelector('#m-form').onsubmit=e=>{
        e.preventDefault();
        const fd=new FormData(e.target);
        const genre_ids=[...e.target.querySelectorAll('[name=gids]:checked')].map(c=>parseInt(c.value));
        const data={title:fd.get('title'),type:fd.get('type'),release_year:fd.get('release_year'),synopsis:fd.get('synopsis'),director:fd.get('director'),cast:fd.get('cast'),duration:fd.get('duration'),age_rating:fd.get('age_rating'),image:fd.get('image'),genre_ids};
        const res=isEdit?MediaCtrl.update(media.id,data):MediaCtrl.create(data);
        if(res?.error){ov.querySelector('#m-err').textContent=res.error;return;}
        ov.remove(); H.showToast(isEdit?'Actualizado.':'Creado correctamente.'); renderAdminMedia();
    };
}

// ---- ADMIN USUARIOS ----
function renderAdminUsers() {
    const res=MediaCtrl.getUsers();
    if(res.error){setContent(`<p class="error-msg">${res.error}</p>`);return;}
    setContent(`<div class="section-header"><h2 class="section-title">👥 Gestionar Usuarios</h2></div>
    <div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Registrado</th><th>Acciones</th></tr></thead><tbody>
    ${res.data.map(u=>`<tr><td><strong>${H.esc(u.username)}</strong></td><td style="color:var(--text-2)">${H.esc(u.email)}</td>
    <td>${H.badge(u.role,u.role==='admin'?'badge-type-movie':'badge-genre')}</td>
    <td style="color:var(--text-3)">${H.fmtDate(u.created_at)}</td>
    <td>${u.id!==Auth.userId?`<div class="admin-actions"><button class="btn btn-secondary btn-sm role-btn" data-id="${u.id}" data-role="${u.role}">${u.role==='admin'?'Quitar Admin':'Hacer Admin'}</button><button class="btn btn-danger btn-sm del-user-btn" data-id="${u.id}">🗑️</button></div>`:'<span style="color:var(--text-3);font-size:.8rem">Tú</span>'}</td>
    </tr>`).join('')}
    </tbody></table></div>`);
    document.querySelectorAll('.role-btn').forEach(b=>b.onclick=()=>{MediaCtrl.setUserRole(b.dataset.id,b.dataset.role==='admin'?'user':'admin');H.showToast('Rol actualizado.');renderAdminUsers();});
    document.querySelectorAll('.del-user-btn').forEach(b=>b.onclick=()=>{if(confirm('¿Eliminar usuario?')){MediaCtrl.removeUser(b.dataset.id);H.showToast('Usuario eliminado.');renderAdminUsers();}});
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
(function init() {
    DB.init();
    Auth.init();

    setTimeout(()=>{
        const splash=document.getElementById('splash');
        if(splash){splash.style.opacity='0';setTimeout(()=>splash.remove(),500);}
        if(Auth.isAuth) renderApp();
        else renderAuth();
    }, 900);
})();
