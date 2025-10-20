// Configuración para Google Sheets con sincronización completa
const GOOGLE_SHEETS_CONFIG = {
    // URL de tu Google Apps Script
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyJZhiRbB9FNe9rKpUkrCLAPZHwv9FjMcfewqzxt9YndqWmRMLOKbg1LNPGzlAYcypeEQ/exec',
    
    // Configuración
    USE_APPS_SCRIPT: true,
    SYNC_INTERVAL: 10000, // 10 segundos para sincronización más frecuente
    
    // Nombres de las hojas (pestañas) en tu Google Sheets
    SHEETS: {
        STUDENTS: 'Estudiantes',
        CANDIDATES: 'Candidatos',
        CONFIG: 'Configuracion',
        VOTES: 'Votos'
    }
};

// Clase para manejar la integración completa con Google Sheets
class GoogleSheetsIntegration {
    constructor() {
        this.isOnline = navigator.onLine;
        this.lastSync = localStorage.getItem('lastSync');
        this.syncInterval = null;
        
        // Escuchar cambios de conectividad
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.startAutoSync();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.stopAutoSync();
        });
        
        // Iniciar sincronización automática
        this.startAutoSync();
    }
    
    // Iniciar sincronización automática
    startAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        if (this.isOnline) {
            this.syncInterval = setInterval(() => {
                this.syncAllData();
            }, GOOGLE_SHEETS_CONFIG.SYNC_INTERVAL);
        }
    }
    
    // Detener sincronización automática
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    
    // Realizar petición al Apps Script
    async fetchFromAppsScript(action, params = {}) {
        const url = new URL(GOOGLE_SHEETS_CONFIG.APPS_SCRIPT_URL);
        url.searchParams.append('action', action);
        
        // Agregar parámetros adicionales
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });
        
        const response = await fetch(url.toString());
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Error desconocido');
        }
        
        return result.data;
    }
    
    // Obtener todos los datos (estudiantes, candidatos, configuración, votos)
    async getAllData() {
        try {
            if (!this.isOnline) {
                return this.getOfflineData();
            }
            
            console.log('🌐 Obteniendo todos los datos desde Google Sheets...');
            const data = await this.fetchFromAppsScript('getBoth');
            
            console.log('📊 Datos recibidos:', data);
            
            // Validar estructura
            if (!data.students || !data.candidates || !data.config) {
                throw new Error('Estructura de datos inválida');
            }
            
            // Guardar en caché
            localStorage.setItem('cachedStudents', JSON.stringify(data.students));
            localStorage.setItem('cachedCandidates', JSON.stringify(data.candidates));
            localStorage.setItem('cachedConfig', JSON.stringify(data.config));
            localStorage.setItem('cachedVotes', JSON.stringify(data.votes || { votes: {}, votedStudents: [] }));
            localStorage.setItem('lastSync', new Date().toISOString());
            
            console.log(`✅ Datos sincronizados - Estudiantes: ${data.students.length}, Candidatos: ${data.candidates.length}, Votación: ${data.config.isActive ? 'ACTIVA' : 'INACTIVA'}`);
            
            return data;
            
        } catch (error) {
            console.error('❌ Error al obtener datos:', error);
            
            // Usar datos en caché
            const cachedData = this.getOfflineData();
            if (cachedData.students.length > 0 || cachedData.candidates.length > 0) {
                console.log('📱 Usando datos en caché debido al error');
                this.showOfflineWarning();
                return cachedData;
            }
            
            // Si no hay caché, usar datos por defecto
            console.log('🔄 Usando datos por defecto');
            return this.getDefaultData();
        }
    }
    
    // Obtener configuración de votación
    async getVotingConfig() {
        try {
            if (!this.isOnline) {
                return this.getOfflineConfig();
            }
            
            const config = await this.fetchFromAppsScript('getConfig');
            localStorage.setItem('cachedConfig', JSON.stringify(config));
            return config;
            
        } catch (error) {
            console.error('❌ Error al obtener configuración:', error);
            return this.getOfflineConfig();
        }
    }
    
    // Actualizar configuración de votación
    async setVotingConfig(config) {
        try {
            if (!this.isOnline) {
                throw new Error('Sin conexión a internet');
            }
            
            console.log('🔧 Actualizando configuración de votación...', config);
            const updatedConfig = await this.fetchFromAppsScript('setConfig', config);
            
            // Actualizar caché
            localStorage.setItem('cachedConfig', JSON.stringify(updatedConfig));
            
            console.log('✅ Configuración actualizada');
            return updatedConfig;
            
        } catch (error) {
            console.error('❌ Error al actualizar configuración:', error);
            throw error;
        }
    }
    
    // Registrar voto
    async castVote(carnet, candidateId) {
        try {
            if (!this.isOnline) {
                throw new Error('Sin conexión a internet para votar');
            }
            
            console.log('🗳️ Registrando voto...', { carnet, candidateId });
            const result = await this.fetchFromAppsScript('addVote', { 
                carnet: carnet, 
                candidateId: candidateId 
            });
            
            console.log('✅ Voto registrado correctamente');
            
            // Sincronizar datos inmediatamente después del voto
            setTimeout(() => this.syncAllData(), 1000);
            
            return result;
            
        } catch (error) {
            console.error('❌ Error al registrar voto:', error);
            throw error;
        }
    }
    
    // Obtener votos actuales
    async getVotes() {
        try {
            if (!this.isOnline) {
                return this.getOfflineVotes();
            }
            
            const votes = await this.fetchFromAppsScript('getVotes');
            localStorage.setItem('cachedVotes', JSON.stringify(votes));
            return votes;
            
        } catch (error) {
            console.error('❌ Error al obtener votos:', error);
            return this.getOfflineVotes();
        }
    }
    
    // Borrar todos los votos
    async clearAllVotes() {
        try {
            if (!this.isOnline) {
                throw new Error('Sin conexión a internet');
            }
            
            console.log('🗑️ Borrando todos los votos...');
            const result = await this.fetchFromAppsScript('clearVotes');
            
            // Limpiar caché
            localStorage.setItem('cachedVotes', JSON.stringify({ votes: {}, votedStudents: [] }));
            
            console.log('✅ Votos borrados');
            return result;
            
        } catch (error) {
            console.error('❌ Error al borrar votos:', error);
            throw error;
        }
    }
    
    // Sincronizar todos los datos
    async syncAllData() {
        try {
            const data = await this.getAllData();
            
            // Actualizar estado global de la aplicación
            if (window.appState) {
                window.appState.students = data.students;
                window.appState.candidates = data.candidates;
                window.appState.votingConfig = data.config;
                
                // Actualizar votos
                if (data.votes) {
                    window.appState.votes = data.votes.votes || {};
                    window.appState.votedStudents = new Set(data.votes.votedStudents || []);
                }
                
                // Actualizar UI si estamos en el dashboard
                if (typeof updateAdminDashboard === 'function' && 
                    document.getElementById('admin-dashboard') && 
                    document.getElementById('admin-dashboard').classList.contains('active')) {
                    updateAdminDashboard();
                }
                
                // Actualizar estado de configuración
                if (typeof updateConfigStatus === 'function') {
                    updateConfigStatus();
                }
            }
            
            this.hideOfflineWarning();
            return true;
            
        } catch (error) {
            console.error('❌ Error en sincronización automática:', error);
            return false;
        }
    }
    
    // Obtener datos desde caché (modo offline)
    getOfflineData() {
        return {
            students: this.getOfflineStudents(),
            candidates: this.getOfflineCandidates(),
            config: this.getOfflineConfig(),
            votes: this.getOfflineVotes()
        };
    }
    
    getOfflineStudents() {
        const cached = localStorage.getItem('cachedStudents');
        return cached ? JSON.parse(cached) : this.getDefaultStudents();
    }
    
    getOfflineCandidates() {
        const cached = localStorage.getItem('cachedCandidates');
        return cached ? JSON.parse(cached) : this.getDefaultCandidates();
    }
    
    getOfflineConfig() {
        const cached = localStorage.getItem('cachedConfig');
        return cached ? JSON.parse(cached) : this.getDefaultConfig();
    }
    
    getOfflineVotes() {
        const cached = localStorage.getItem('cachedVotes');
        return cached ? JSON.parse(cached) : { votes: {}, votedStudents: [] };
    }
    
    // Datos por defecto
    getDefaultData() {
        return {
            students: this.getDefaultStudents(),
            candidates: this.getDefaultCandidates(),
            config: this.getDefaultConfig(),
            votes: { votes: {}, votedStudents: [] }
        };
    }
    
    getDefaultStudents() {
        return [
            { carnet: '2023001', nombre: 'Juan Pérez', curso: '11-A', habilitado: true },
            { carnet: '2023002', nombre: 'María García', curso: '11-B', habilitado: true },
            { carnet: '2023003', nombre: 'Carlos López', curso: '10-A', habilitado: true },
            { carnet: '2023004', nombre: 'Ana Martínez', curso: '10-B', habilitado: true },
            { carnet: '2023005', nombre: 'Luis Rodríguez', curso: '9-A', habilitado: true }
        ];
    }
    
    getDefaultCandidates() {
        return [
            {
                id: 1,
                nombre: 'Sofía Hernández',
                sigla: 'SH',
                foto: 'https://via.placeholder.com/150/667eea/ffffff?text=SH',
                propuestas: 'Mejores espacios recreativos y deportivos'
            },
            {
                id: 2,
                nombre: 'Diego Morales',
                sigla: 'DM',
                foto: 'https://via.placeholder.com/150/764ba2/ffffff?text=DM',
                propuestas: 'Tecnología en aulas y laboratorios modernos'
            },
            {
                id: 3,
                nombre: 'Camila Torres',
                sigla: 'CT',
                foto: 'https://via.placeholder.com/150/51cf66/ffffff?text=CT',
                propuestas: 'Actividades culturales y artísticas'
            }
        ];
    }
    
    getDefaultConfig() {
        return {
            isActive: false,
            isEnded: false,
            startTime: null,
            endTime: null
        };
    }
    
    // Mostrar/ocultar advertencia offline
    showOfflineWarning() {
        let warning = document.getElementById('offline-warning');
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'offline-warning';
            warning.className = 'offline-warning';
            warning.innerHTML = `
                <div class="offline-content">
                    <span>⚠️ Modo offline - Datos pueden no estar actualizados</span>
                    <button onclick="googleSheets.syncAllData()" class="btn-small">Sincronizar</button>
                </div>
            `;
            document.body.appendChild(warning);
        }
        warning.style.display = 'block';
    }
    
    hideOfflineWarning() {
        const warning = document.getElementById('offline-warning');
        if (warning) {
            warning.style.display = 'none';
        }
    }
    
    // Verificar configuración
    isConfigured() {
        return GOOGLE_SHEETS_CONFIG.USE_APPS_SCRIPT && 
               GOOGLE_SHEETS_CONFIG.APPS_SCRIPT_URL && 
               GOOGLE_SHEETS_CONFIG.APPS_SCRIPT_URL !== '';
    }
    
    // Mostrar estado de configuración
    showConfigStatus() {
        if (!this.isConfigured()) {
            console.warn('Google Sheets no configurado. Usando datos por defecto.');
            return false;
        }
        
        console.log('Google Sheets configurado correctamente.');
        return true;
    }
}

// Instancia global
const googleSheets = new GoogleSheetsIntegration();