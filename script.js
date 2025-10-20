// Sistema de votaciones con sincronización REAL entre dispositivos
const appState = {
    students: [],
    candidates: [],
    votes: {},
    votedStudents: new Set(),
    votingConfig: {
        startTime: null,
        endTime: null,
        isActive: false,
        isEnded: false
    },
    currentStudent: null,
    selectedCandidate: null,
    lastSync: null
};

// Variables para los gráficos
let barChart = null;
let pieChart = null;
let syncInterval = null;

// Configuración de sincronización
const SYNC_CONFIG = {
    INTERVAL: 5000, // 5 segundos
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyJZhiRbB9FNe9rKpUkrCLAPZHwv9FjMcfewqzxt9YndqWmRMLOKbg1LNPGzlAYcypeEQ/exec'
};

// Funciones de navegación
function showHomePage() {
    hideAllPages();
    document.getElementById('home-page').classList.add('active');
    resetVoting();
}

function showVotingPanel() {
    hideAllPages();
    document.getElementById('voting-page').classList.add('active');
    showVotingStep('student-login');
}

function showAdminLogin() {
    hideAllPages();
    document.getElementById('admin-page').classList.add('active');
    showAdminStep('admin-login');
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
}

function showVotingStep(stepId) {
    document.querySelectorAll('.voting-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(stepId).classList.add('active');
}

function showAdminStep(stepId) {
    document.querySelectorAll('.admin-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(stepId).classList.add('active');
}

// Funciones de sincronización con Google Sheets
async function fetchFromGoogleSheets(action, params = {}) {
    const url = new URL(SYNC_CONFIG.APPS_SCRIPT_URL);
    url.searchParams.append('action', action);
    
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

async function syncAllData() {
    try {
        console.log('🔄 Sincronizando todos los datos...');
        
        // Obtener todos los datos
        const [studentsData, candidatesData, configData, votesData] = await Promise.all([
            fetchFromGoogleSheets('getStudents'),
            fetchFromGoogleSheets('getCandidates'),
            fetchFromGoogleSheets('getConfig'),
            fetchFromGoogleSheets('getVotes')
        ]);
        
        // Actualizar estado
        appState.students = studentsData;
        appState.candidates = candidatesData;
        appState.votingConfig = configData;
        appState.votes = votesData.votes || {};
        appState.votedStudents = new Set(votesData.votedStudents || []);
        appState.lastSync = new Date();
        
        // Actualizar UI si estamos en el dashboard
        if (document.getElementById('admin-dashboard') && 
            document.getElementById('admin-dashboard').classList.contains('active')) {
            updateAdminDashboard();
        }
        
        console.log('✅ Sincronización completada');
        return true;
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
        return false;
    }
}

function startAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    syncInterval = setInterval(async () => {
        await syncAllData();
    }, SYNC_CONFIG.INTERVAL);
    
    console.log('🔄 Sincronización automática iniciada cada', SYNC_CONFIG.INTERVAL / 1000, 'segundos');
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('⏹️ Sincronización automática detenida');
    }
}

// Funciones de votación
async function loginStudent() {
    const carnet = document.getElementById('carnet-input').value.trim();
    const errorDiv = document.getElementById('login-error');
    
    errorDiv.style.display = 'none';
    
    if (!carnet) {
        showError('login-error', 'Por favor ingresa tu número de carnet');
        return;
    }
    
    // Sincronizar datos antes de validar
    showSyncIndicator('Verificando datos...', 'syncing');
    await syncAllData();
    hideSyncIndicator();
    
    if (!isVotingActive()) {
        showError('login-error', 'La votación no está activa en este momento');
        return;
    }
    
    const student = appState.students.find(s => s.carnet === carnet);
    
    if (!student) {
        showError('login-error', 'Carnet no válido. No estás habilitado para votar.');
        return;
    }
    
    if (appState.votedStudents.has(carnet)) {
        showError('login-error', 'Ya has votado. No puedes votar nuevamente.');
        return;
    }
    
    appState.currentStudent = student;
    document.getElementById('student-name').textContent = student.nombre;
    document.getElementById('student-course').textContent = student.curso;
    
    renderCandidates();
    showVotingStep('candidate-selection');
}

function renderCandidates() {
    const candidatesList = document.getElementById('candidates-list');
    candidatesList.innerHTML = '';
    
    appState.candidates.forEach(candidate => {
        const candidateDiv = document.createElement('div');
        candidateDiv.className = 'candidate-card';
        candidateDiv.onclick = () => selectCandidate(candidate.id);
        
        candidateDiv.innerHTML = `
            <div class="candidate-photo placeholder">
                ${candidate.sigla}
            </div>
            <div class="candidate-info">
                <h3>${candidate.nombre}</h3>
                <p><strong>Sigla:</strong> ${candidate.sigla}</p>
                <p><strong>Propuesta:</strong> ${candidate.propuestas}</p>
            </div>
        `;
        
        candidatesList.appendChild(candidateDiv);
    });
}

function selectCandidate(candidateId) {
    appState.selectedCandidate = candidateId;
    
    // Actualizar UI
    document.querySelectorAll('.candidate-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    event.currentTarget.classList.add('selected');
    
    const confirmBtn = document.getElementById('confirm-vote-btn');
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
}

async function confirmVote() {
    if (!appState.selectedCandidate) {
        showError('voting-error', 'Debes seleccionar un candidato');
        return;
    }
    
    try {
        showSyncIndicator('Registrando voto...', 'syncing');
        
        // Registrar voto en Google Sheets
        await fetchFromGoogleSheets('addVote', {
            carnet: appState.currentStudent.carnet,
            candidateId: appState.selectedCandidate
        });
        
        // Actualizar estado local inmediatamente
        appState.votes[appState.selectedCandidate] = (appState.votes[appState.selectedCandidate] || 0) + 1;
        appState.votedStudents.add(appState.currentStudent.carnet);
        
        // Mostrar confirmación
        const successMsg = `¡Gracias por votar, ${appState.currentStudent.nombre}! Tu voto ha sido registrado correctamente.`;
        document.getElementById('success-message').textContent = successMsg;
        
        showSyncIndicator('✅ Voto registrado', 'success');
        setTimeout(hideSyncIndicator, 2000);
        
        showVotingStep('vote-confirmation');
        
        // Sincronizar datos después del voto
        setTimeout(() => syncAllData(), 1000);
        
    } catch (error) {
        console.error('Error al confirmar voto:', error);
        showError('voting-error', 'Error al registrar el voto: ' + error.message);
        showSyncIndicator('❌ Error al votar', 'error');
        setTimeout(hideSyncIndicator, 3000);
    }
}

function resetVoting() {
    appState.currentStudent = null;
    appState.selectedCandidate = null;
    document.getElementById('carnet-input').value = '';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('voting-error').style.display = 'none';
    showVotingStep('student-login');
}

// Funciones de administración
async function loginAdmin() {
    const password = document.getElementById('admin-password').value;
    const errorDiv = document.getElementById('admin-error');
    
    errorDiv.style.display = 'none';
    
    if (password === '12345') {
        showAdminStep('admin-dashboard');
        
        // Sincronizar datos al entrar al dashboard
        showSyncIndicator('Cargando dashboard...', 'syncing');
        await syncAllData();
        hideSyncIndicator();
        
        updateAdminDashboard();
        
        // Iniciar sincronización automática más frecuente en el dashboard
        startAutoSync();
    } else {
        showError('admin-error', 'Contraseña incorrecta');
    }
}

function updateAdminDashboard() {
    // Actualizar estadísticas
    const totalVotes = Object.values(appState.votes).reduce((sum, count) => sum + count, 0);
    const remainingVoters = appState.students.length - appState.votedStudents.size;
    const votingStatus = isVotingActive() ? 'ACTIVA' : 'INACTIVA';
    
    document.getElementById('total-votes').textContent = totalVotes;
    document.getElementById('remaining-voters').textContent = remainingVoters;
    document.getElementById('voting-status').textContent = votingStatus;
    document.getElementById('voting-status').className = isVotingActive() ? 'voting-active' : 'voting-inactive';
    
    // Actualizar tabla de resultados
    updateResultsTable();
    
    // Actualizar gráficos
    updateCharts();
    
    // Actualizar estado de configuración
    updateConfigStatus();
}

function updateResultsTable() {
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    
    const results = getResults();
    
    results.forEach((candidate, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}. ${candidate.nombre}</td>
            <td>${candidate.sigla}</td>
            <td>${candidate.votes}</td>
            <td>${candidate.percentage}%</td>
        `;
        tbody.appendChild(row);
    });
}

function updateCharts() {
    const results = getResults();
    const totalVotes = Object.values(appState.votes).reduce((sum, count) => sum + count, 0);
    
    const colors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(118, 75, 162, 0.8)',
        'rgba(81, 207, 102, 0.8)',
        'rgba(255, 107, 107, 0.8)',
        'rgba(255, 195, 18, 0.8)',
    ];
    
    const borderColors = [
        'rgba(102, 126, 234, 1)',
        'rgba(118, 75, 162, 1)',
        'rgba(81, 207, 102, 1)',
        'rgba(255, 107, 107, 1)',
        'rgba(255, 195, 18, 1)',
    ];
    
    // Gráfico de barras
    const barCtx = document.getElementById('barChart').getContext('2d');
    
    if (barChart) {
        barChart.destroy();
    }
    
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: results.map(c => c.sigla),
            datasets: [{
                label: 'Votos',
                data: results.map(c => c.votes),
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Resultados de Votación - Total: ${totalVotes} votos`
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
    
    // Gráfico circular
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    
    if (pieChart) {
        pieChart.destroy();
    }
    
    if (totalVotes > 0) {
        pieChart = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: results.map(c => `${c.nombre} (${c.sigla})`),
                datasets: [{
                    data: results.map(c => c.votes),
                    backgroundColor: colors,
                    borderColor: borderColors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribución de Votos'
                    },
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }
}

async function startVoting() {
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    
    try {
        showSyncIndicator('Iniciando votación...', 'syncing');
        
        const updatedConfig = await fetchFromGoogleSheets('setConfig', {
            isActive: 'true',
            startTime: startTime || new Date().toISOString(),
            endTime: endTime || ''
        });
        
        appState.votingConfig = updatedConfig;
        
        showSyncIndicator('✅ Votación iniciada', 'success');
        setTimeout(hideSyncIndicator, 2000);
        
        updateAdminDashboard();
        alert('Votación iniciada correctamente. Todos los dispositivos verán el cambio automáticamente.');
        
    } catch (error) {
        console.error('Error al iniciar votación:', error);
        showSyncIndicator('❌ Error al iniciar', 'error');
        setTimeout(hideSyncIndicator, 3000);
        alert('Error al iniciar la votación: ' + error.message);
    }
}

async function endVoting() {
    try {
        showSyncIndicator('Terminando votación...', 'syncing');
        
        const updatedConfig = await fetchFromGoogleSheets('setConfig', {
            isActive: 'false'
        });
        
        appState.votingConfig = updatedConfig;
        appState.votingConfig.isEnded = true;
        
        showSyncIndicator('✅ Votación terminada', 'success');
        setTimeout(hideSyncIndicator, 2000);
        
        updateAdminDashboard();
        alert('Votación terminada. Todos los dispositivos verán el cambio automáticamente.');
        
    } catch (error) {
        console.error('Error al terminar votación:', error);
        showSyncIndicator('❌ Error al terminar', 'error');
        setTimeout(hideSyncIndicator, 3000);
        alert('Error al terminar la votación: ' + error.message);
    }
}

async function clearAllVotes() {
    if (confirm('¿Estás seguro de que quieres borrar todos los votos? Esta acción no se puede deshacer.')) {
        try {
            showSyncIndicator('Borrando votos...', 'syncing');
            
            await fetchFromGoogleSheets('clearVotes');
            
            // Limpiar estado local
            appState.candidates.forEach(candidate => {
                appState.votes[candidate.id] = 0;
            });
            appState.votedStudents.clear();
            
            showSyncIndicator('✅ Votos borrados', 'success');
            setTimeout(hideSyncIndicator, 2000);
            
            updateAdminDashboard();
            alert('Todos los votos han sido borrados en todos los dispositivos.');
            
        } catch (error) {
            console.error('Error al borrar votos:', error);
            showSyncIndicator('❌ Error al borrar', 'error');
            setTimeout(hideSyncIndicator, 3000);
            alert('Error al borrar votos: ' + error.message);
        }
    }
}

// Funciones de UI
function showSyncIndicator(message, type = '') {
    let indicator = document.getElementById('sync-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'sync-indicator';
        indicator.className = 'sync-indicator';
        document.body.appendChild(indicator);
    }
    
    indicator.textContent = message;
    indicator.className = `sync-indicator ${type}`;
    indicator.style.display = 'block';
}

function hideSyncIndicator() {
    const indicator = document.getElementById('sync-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function showConfigInstructions() {
    const instructions = `
✅ SISTEMA COMPLETAMENTE SINCRONIZADO

Tu sistema ahora tiene sincronización REAL entre dispositivos:

🔄 SINCRONIZACIÓN EN TIEMPO REAL:
• Estado de votación se sincroniza automáticamente
• Votos se guardan en Google Sheets inmediatamente
• Prevención real de votos duplicados
• Todos los dispositivos ven los mismos datos

📊 DATOS EN GOOGLE SHEETS:
• Hoja "Estudiantes" - Lista de votantes
• Hoja "Candidatos" - Lista de candidatos  
• Hoja "Configuracion" - Estado de votación
• Hoja "Votos" - Registro de todos los votos

⚡ FUNCIONALIDADES:
• Administrador inicia votación → Se activa en TODOS los dispositivos
• Estudiante vota → Se registra inmediatamente en Google Sheets
• Resultados en tiempo real en todos los dispositivos
• Sincronización automática cada 5 segundos

¡Tu sistema está completamente funcional y sincronizado!
    `;
    
    alert(instructions);
}

async function testConnection() {
    showSyncIndicator('Probando conexión...', 'syncing');
    
    try {
        await syncAllData();
        
        const totalVotes = Object.values(appState.votes).reduce((sum, count) => sum + count, 0);
        
        showSyncIndicator('✅ Conexión exitosa', 'success');
        
        alert(`✅ Conexión exitosa y datos sincronizados!\n\n📚 Estudiantes habilitados: ${appState.students.length}\n🗳️ Candidatos: ${appState.candidates.length}\n📊 Votos registrados: ${totalVotes}\n🔄 Estado: ${appState.votingConfig.isActive ? 'VOTACIÓN ACTIVA' : 'VOTACIÓN INACTIVA'}\n\nSincronización automática cada 5 segundos.`);
        
        setTimeout(hideSyncIndicator, 3000);
        
    } catch (error) {
        showSyncIndicator('❌ Error de conexión', 'error');
        console.error('❌ Error completo:', error);
        alert(`❌ Error de conexión:\n\n${error.message}\n\nVerifica que el Google Apps Script esté configurado correctamente.`);
        setTimeout(hideSyncIndicator, 3000);
    }
}

async function syncDataManually() {
    const success = await syncAllData();
    if (success) {
        updateAdminDashboard();
        alert('✅ Datos sincronizados correctamente desde Google Sheets');
    } else {
        alert('❌ Error al sincronizar datos');
    }
}

function updateConfigStatus() {
    const statusDiv = document.getElementById('config-status');
    if (!statusDiv) return;
    
    const lastSync = appState.lastSync ? appState.lastSync.toLocaleString() : 'Nunca';
    
    statusDiv.innerHTML = `
        <div class="config-step">
            ✅ <strong>Sistema completamente sincronizado</strong><br>
            📅 Última sincronización: ${lastSync}<br>
            🌐 Estado: ${navigator.onLine ? 'En línea' : 'Sin conexión'}<br>
            🔄 Sincronización automática: Cada 5 segundos<br>
            📊 Estado votación: ${appState.votingConfig.isActive ? '🟢 ACTIVA' : '🔴 INACTIVA'}<br>
            💾 Votos guardados en Google Sheets
        </div>
    `;
}

// Funciones de exportación PDF (sin cambios)
function exportPDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    
    const results = getResults();
    const totalVotes = Object.values(appState.votes).reduce((sum, count) => sum + count, 0);
    const remainingVoters = appState.students.length - appState.votedStudents.size;
    const totalStudents = appState.students.length;
    
    // Título
    pdf.setFontSize(20);
    pdf.text('REPORTE DE VOTACIÓN ESTUDIANTIL', 20, 30);
    
    // Fecha y hora
    const now = new Date();
    pdf.setFontSize(12);
    pdf.text(`Fecha: ${now.toLocaleDateString()}`, 20, 45);
    pdf.text(`Hora: ${now.toLocaleTimeString()}`, 20, 55);
    
    // Estadísticas generales
    pdf.setFontSize(16);
    pdf.text('ESTADÍSTICAS GENERALES', 20, 75);
    
    pdf.setFontSize(12);
    pdf.text(`Total de estudiantes habilitados: ${totalStudents}`, 20, 90);
    pdf.text(`Total de votos emitidos: ${totalVotes}`, 20, 100);
    pdf.text(`Estudiantes que faltan por votar: ${remainingVoters}`, 20, 110);
    pdf.text(`Porcentaje de participación: ${totalStudents > 0 ? ((totalVotes / totalStudents) * 100).toFixed(1) : 0}%`, 20, 120);
    
    // Estado de la votación
    let status = 'Inactiva';
    if (appState.votingConfig.isActive && !appState.votingConfig.isEnded) {
        status = 'Activa';
    } else if (appState.votingConfig.isEnded) {
        status = 'Finalizada';
    }
    pdf.text(`Estado de la votación: ${status}`, 20, 130);
    
    // Resultados por candidato
    pdf.setFontSize(16);
    pdf.text('RESULTADOS POR CANDIDATO', 20, 150);
    
    let yPosition = 165;
    pdf.setFontSize(12);
    
    results.forEach((candidate, index) => {
        const position = index + 1;
        const line1 = `${position}. ${candidate.nombre} (${candidate.sigla})`;
        const line2 = `   Votos: ${candidate.votes} - Porcentaje: ${candidate.percentage}%`;
        
        pdf.text(line1, 20, yPosition);
        pdf.text(line2, 20, yPosition + 10);
        yPosition += 25;
    });
    
    // Información adicional
    pdf.setFontSize(16);
    pdf.text('INFORMACIÓN ADICIONAL', 20, yPosition + 20);
    yPosition += 40;
    
    pdf.setFontSize(12);
    if (appState.votingConfig.startTime) {
        pdf.text(`Inicio programado: ${new Date(appState.votingConfig.startTime).toLocaleString()}`, 20, yPosition);
        yPosition += 10;
    }
    if (appState.votingConfig.endTime) {
        pdf.text(`Fin programado: ${new Date(appState.votingConfig.endTime).toLocaleString()}`, 20, yPosition);
        yPosition += 10;
    }
    
    yPosition += 10;
    pdf.text('Este reporte fue generado automáticamente por el', 20, yPosition);
    pdf.text('Sistema de Votaciones Sincronizado del Colegio', 20, yPosition + 10);
    
    // Guardar el PDF
    const fileName = `reporte_votacion_${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.pdf`;
    pdf.save(fileName);
}

function exportChartPDF() {
    const canvas = document.getElementById('barChart');
    
    if (!canvas) {
        alert('No se encontró el gráfico para exportar');
        return;
    }
    
    html2canvas(canvas).then(canvas => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        
        pdf.setFontSize(20);
        pdf.text('GRÁFICO DE RESULTADOS', 20, 30);
        
        const now = new Date();
        pdf.setFontSize(12);
        pdf.text(`Generado: ${now.toLocaleString()}`, 20, 45);
        
        // Agregar la imagen del gráfico
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 170;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 20, 60, imgWidth, imgHeight);
        
        // Agregar tabla de resultados debajo
        const results = getResults();
        let yPos = 60 + imgHeight + 20;
        
        pdf.setFontSize(14);
        pdf.text('Resultados Detallados:', 20, yPos);
        yPos += 15;
        
        pdf.setFontSize(12);
        results.forEach((candidate, index) => {
            pdf.text(`${index + 1}. ${candidate.nombre} (${candidate.sigla}): ${candidate.votes} votos (${candidate.percentage}%)`, 20, yPos);
            yPos += 10;
        });
        
        pdf.save(`grafico_resultados_${now.getTime()}.pdf`);
    }).catch(error => {
        console.error('Error al exportar gráfico:', error);
        alert('Error al generar el PDF del gráfico');
    });
}

// Funciones auxiliares
function isVotingActive() {
    if (!appState.votingConfig.isActive || appState.votingConfig.isEnded) return false;
    
    const now = new Date();
    if (appState.votingConfig.startTime && now < new Date(appState.votingConfig.startTime)) return false;
    if (appState.votingConfig.endTime && now > new Date(appState.votingConfig.endTime)) return false;
    
    return true;
}

function getResults() {
    return appState.candidates.map(candidate => {
        const votes = appState.votes[candidate.id] || 0;
        const totalVotes = Object.values(appState.votes).reduce((sum, count) => sum + count, 0);
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
        
        return {
            ...candidate,
            votes,
            percentage
        };
    }).sort((a, b) => b.votes - a.votes);
}

function showError(elementId, message) {
    const errorDiv = document.getElementById(elementId);
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Eventos del teclado
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        if (activeElement.id === 'carnet-input') {
            loginStudent();
        } else if (activeElement.id === 'admin-password') {
            loginAdmin();
        }
    }
});

// Manejo de visibilidad de página
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        // Sincronizar cuando la página vuelve a ser visible
        syncAllData();
    }
});

// Inicialización
document.addEventListener('DOMContentLoaded', async function() {
    showHomePage();
    
    // Sincronización inicial
    showSyncIndicator('Cargando sistema...', 'syncing');
    await syncAllData();
    hideSyncIndicator();
    
    // Actualizar estado de configuración
    updateConfigStatus();
    
    console.log('🚀 Sistema de votaciones sincronizado iniciado');
});

// Limpiar al salir de la página
window.addEventListener('beforeunload', function() {
    stopAutoSync();
});