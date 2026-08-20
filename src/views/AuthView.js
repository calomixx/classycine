/**
 * AuthView.js
 * 
 * VISTA DE AUTENTICACIÓN (MVC - View Layer)
 * Renderiza el formulario de login/registro.
 */

import { authController } from '../controllers/AuthController.js';
import { showToast } from '../helpers.js';
import { router } from '../Router.js';

export class AuthView {
    constructor(onLogin) {
        this._onLogin = onLogin;
    }

    render(container) {
        container.innerHTML = `
        <div id="auth-view">
            <div class="auth-card">
                <div class="auth-logo">
                    <h1>Cine<span class="highlight">Classify</span></h1>
                    <p>Tu plataforma personal de cine y series</p>
                </div>

                <div class="auth-tabs">
                    <button class="auth-tab active" id="tab-login">Iniciar sesión</button>
                    <button class="auth-tab" id="tab-register">Registrarse</button>
                </div>

                <!-- Login -->
                <form class="auth-form" id="login-form">
                    <div class="form-group">
                        <label>Usuario</label>
                        <input class="input-field" type="text" id="login-user" placeholder="ej: admin" autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label>Contraseña</label>
                        <input class="input-field" type="password" id="login-pass" placeholder="••••••••" autocomplete="current-password">
                    </div>
                    <p class="error-msg" id="login-error"></p>
                    <button type="submit" class="btn btn-primary">Entrar</button>
                    <p class="auth-demo">
                        Demo: usuario <strong>admin</strong> / contraseña <strong>admin123</strong>
                    </p>
                </form>

                <!-- Registro (oculto inicial) -->
                <form class="auth-form hidden" id="register-form">
                    <div class="form-group">
                        <label>Usuario</label>
                        <input class="input-field" type="text" id="reg-user" placeholder="Elige un nombre de usuario">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input class="input-field" type="email" id="reg-email" placeholder="tu@email.com">
                    </div>
                    <div class="form-group">
                        <label>Contraseña</label>
                        <input class="input-field" type="password" id="reg-pass" placeholder="Mínimo 4 caracteres">
                    </div>
                    <p class="error-msg" id="reg-error"></p>
                    <button type="submit" class="btn btn-primary">Crear cuenta</button>
                </form>

                <p style="text-align:center; margin-top:1.25rem; font-family:'Space Grotesk',monospace; font-size:0.78rem; color:#A0B0C0;">
                    <a href="#" id="auth-back-link" style="color:var(--neon-cyan); font-weight:600; text-decoration:none;">← Volver al inicio</a>
                </p>
            </div>
        </div>`;

        this._bindEvents();
    }

    _bindEvents() {
        const tabLogin    = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const loginForm   = document.getElementById('login-form');
        const regForm     = document.getElementById('register-form');

        document.getElementById('auth-back-link').addEventListener('click', (e) => {
            e.preventDefault();
            router.navigate('/');
        });

        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active'); tabRegister.classList.remove('active');
            loginForm.classList.remove('hidden'); regForm.classList.add('hidden');
        });
        tabRegister.addEventListener('click', () => {
            tabRegister.classList.add('active'); tabLogin.classList.remove('active');
            regForm.classList.remove('hidden'); loginForm.classList.add('hidden');
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user  = document.getElementById('login-user').value.trim();
            const pass  = document.getElementById('login-pass').value;
            const result = await authController.login(user, pass);
            if (result.error) {
                document.getElementById('login-error').textContent = result.error;
            } else {
                this._onLogin();
            }
        });

        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user  = document.getElementById('reg-user').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const pass  = document.getElementById('reg-pass').value;
            const result = await authController.register(user, email, pass);
            if (result.error) {
                document.getElementById('reg-error').textContent = result.error;
            } else {
                showToast(`¡Bienvenido, ${user}! Cuenta creada con éxito.`);
                this._onLogin();
            }
        });
    }
}
