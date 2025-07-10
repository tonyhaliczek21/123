/**
 * ESP32 IR Pilot PWA
 * WebSocket-based remote control application
 */

class ESP32IRPilot {
    constructor() {
        this.websocket = null;
        this.reconnectInterval = null;
        this.reconnectDelay = 3000;
        this.maxReconnectAttempts = 10;
        this.reconnectAttempts = 0;
        
        // ESP32 Configuration
        this.config = {
            wsUrl: 'wss://espprojekt.pl:443/ws/main/',
            espId: 'klaj886',
            reconnectOnClose: true
        };
        
        // Application state
        this.state = {
            connected: false,
            learningMode: false,
            currentLearningButton: null,
            irCodes: new Map(),
            espStatus: {
                ip: '---.--.---.---',
                rssi: '-- dBm',
                uptime: '--h --m',
                freeRAM: '---KB wolne',
                irStats: {
                    sent: 0,
                    received: 0,
                    valid: 0
                }
            }
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadStoredData();
        this.connectWebSocket();
        this.showToast('Inicjalizacja aplikacji...', 'info');
    }
    
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.closest('.tab-button').dataset.tab);
            });
        });
        
        // Control buttons (Pilot tab)
        document.querySelectorAll('.control-button[data-button-id]').forEach(button => {
            button.addEventListener('click', (e) => {
                this.sendIRCommand(e.target.dataset.buttonId);
            });
        });
        
        // Learn buttons (Nauka tab)
        document.querySelectorAll('.learn-button[data-learn-id]').forEach(button => {
            button.addEventListener('click', (e) => {
                this.startLearning(e.target.dataset.learnId);
            });
        });
        
        // Action buttons (Kody tab)
        document.getElementById('backupVPS')?.addEventListener('click', () => this.backupToVPS());
        document.getElementById('backupLocal')?.addEventListener('click', () => this.backupToLocal());
        document.getElementById('refreshCodes')?.addEventListener('click', () => this.refreshCodes());
        document.getElementById('clearCodes')?.addEventListener('click', () => this.clearCodes());
        
        // Restart button (Status tab)
        document.getElementById('restartESP')?.addEventListener('click', () => this.restartESP());
        
        // Handle app visibility changes for reconnection
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.state.connected) {
                this.connectWebSocket();
            }
        });
        
        // Handle online/offline events
        window.addEventListener('online', () => {
            if (!this.state.connected) {
                this.connectWebSocket();
            }
        });
        
        window.addEventListener('offline', () => {
            this.updateConnectionStatus(false, 'Brak połączenia z internetem');
        });
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Refresh data when switching to specific tabs
        if (tabName === 'kody') {
            this.refreshCodes();
        } else if (tabName === 'status') {
            this.requestStatusUpdate();
        }
    }
    
    connectWebSocket() {
        if (this.websocket?.readyState === WebSocket.CONNECTING) {
            return;
        }
        
        try {
            this.updateConnectionStatus(false, 'Łączenie z ESP32...');
            this.websocket = new WebSocket(this.config.wsUrl);
            
            this.websocket.onopen = () => {
                console.log('WebSocket połączony');
                this.reconnectAttempts = 0;
                this.updateConnectionStatus(true, `Połączono z ESP32 ${this.config.espId}`);
                this.showToast('Połączono z ESP32!', 'success');
                
                // Request initial status and codes
                this.requestStatusUpdate();
                this.refreshCodes();
                
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            };
            
            this.websocket.onmessage = (event) => {
                this.handleWebSocketMessage(event.data);
            };
            
            this.websocket.onclose = (event) => {
                console.log('WebSocket zamknięty:', event.code, event.reason);
                this.updateConnectionStatus(false, 'Rozłączono z ESP32');
                
                if (this.config.reconnectOnClose && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.scheduleReconnect();
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('Błąd WebSocket:', error);
                this.updateConnectionStatus(false, 'Błąd połączenia WebSocket');
                this.showToast('Błąd połączenia WebSocket', 'error');
            };
            
        } catch (error) {
            console.error('Nie można utworzyć WebSocket:', error);
            this.updateConnectionStatus(false, 'Nie można połączyć z ESP32');
            this.showToast('Nie można połączyć z ESP32', 'error');
        }
    }
    
    scheduleReconnect() {
        if (this.reconnectInterval) {
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000);
        
        this.updateConnectionStatus(false, `Ponowne łączenie za ${Math.ceil(delay/1000)}s (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.reconnectInterval = setTimeout(() => {
            this.reconnectInterval = null;
            this.connectWebSocket();
        }, delay);
    }
    
    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('Otrzymano wiadomość:', message);
            
            switch (message.type || message.action) {
                case 'status':
                case 'statusUpdate':
                    this.updateESPStatus(message.data || message);
                    break;
                    
                case 'irCodes':
                case 'getIRCodes':
                    this.updateIRCodes(message.codes || message.data || message);
                    break;
                    
                case 'learningStarted':
                    this.onLearningStarted(message.buttonId);
                    break;
                    
                case 'learningCompleted':
                    this.onLearningCompleted(message.buttonId, message.code);
                    break;
                    
                case 'learningStopped':
                    this.onLearningStopped();
                    break;
                    
                case 'irSent':
                    this.onIRSent(message.buttonId);
                    break;
                    
                case 'error':
                    this.showToast(message.message || 'Błąd ESP32', 'error');
                    break;
                    
                default:
                    console.log('Nieznany typ wiadomości:', message);
            }
        } catch (error) {
            console.error('Błąd parsowania wiadomości JSON:', error, data);
        }
    }
    
    sendWebSocketMessage(message) {
        if (this.websocket?.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
            return true;
        } else {
            this.showToast('Brak połączenia z ESP32', 'error');
            return false;
        }
    }
    
    sendIRCommand(buttonId) {
        const button = document.querySelector(`[data-button-id="${buttonId}"]`);
        if (button) {
            button.disabled = true;
            setTimeout(() => button.disabled = false, 1000);
        }
        
        const message = {
            action: 'send',
            buttonId: buttonId,
            targetESP: this.config.espId
        };
        
        if (this.sendWebSocketMessage(message)) {
            this.showToast(`Wysłano kod: ${buttonId}`, 'success');
            
            // Haptic feedback if supported
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }
    }
    
    startLearning(buttonId) {
        if (this.state.learningMode) {
            this.stopLearning();
            return;
        }
        
        const message = {
            action: 'startLearning',
            buttonId: buttonId,
            targetESP: this.config.espId
        };
        
        if (this.sendWebSocketMessage(message)) {
            this.state.learningMode = true;
            this.state.currentLearningButton = buttonId;
            this.updateLearningUI(buttonId);
            this.showToast(`Rozpoczęto naukę: ${buttonId}`, 'warning');
        }
    }
    
    stopLearning() {
        const message = {
            action: 'stopLearning',
            targetESP: this.config.espId
        };
        
        this.sendWebSocketMessage(message);
        this.resetLearningUI();
        this.state.learningMode = false;
        this.state.currentLearningButton = null;
    }
    
    onLearningStarted(buttonId) {
        this.state.learningMode = true;
        this.state.currentLearningButton = buttonId;
        this.updateLearningUI(buttonId);
        this.showToast(`Tryb nauki aktywny: ${buttonId}`, 'warning');
    }
    
    onLearningCompleted(buttonId, code) {
        this.resetLearningUI();
        this.state.learningMode = false;
        this.state.currentLearningButton = null;
        
        if (code) {
            this.state.irCodes.set(buttonId, code);
            this.saveStoredData();
            this.showToast(`Nauczono kod: ${buttonId}`, 'success');
        } else {
            this.showToast(`Nie udało się nauczyć: ${buttonId}`, 'error');
        }
        
        this.refreshCodesDisplay();
    }
    
    onLearningStopped() {
        this.resetLearningUI();
        this.state.learningMode = false;
        this.state.currentLearningButton = null;
        this.showToast('Zatrzymano tryb nauki', 'info');
    }
    
    onIRSent(buttonId) {
        this.state.espStatus.irStats.sent++;
        this.updateStatusDisplay();
    }
    
    updateLearningUI(buttonId) {
        // Update status indicator
        const statusIndicator = document.getElementById('learnModeStatus');
        if (statusIndicator) {
            statusIndicator.textContent = `AKTYWNY (${buttonId})`;
            statusIndicator.classList.add('active');
        }
        
        // Update status dot
        const statusDot = document.querySelector('.status-dot');
        if (statusDot) {
            statusDot.classList.add('learning');
        }
        
        // Highlight learning button
        document.querySelectorAll('.learn-button').forEach(btn => {
            btn.classList.remove('learning');
        });
        
        const learningButton = document.querySelector(`[data-learn-id="${buttonId}"]`);
        if (learningButton) {
            learningButton.classList.add('learning');
            learningButton.textContent = 'Zatrzymaj';
        }
    }
    
    resetLearningUI() {
        // Reset status indicator
        const statusIndicator = document.getElementById('learnModeStatus');
        if (statusIndicator) {
            statusIndicator.textContent = 'NIEAKTYWNY';
            statusIndicator.classList.remove('active');
        }
        
        // Reset status dot
        const statusDot = document.querySelector('.status-dot');
        if (statusDot) {
            statusDot.classList.remove('learning');
        }
        
        // Reset all learning buttons
        document.querySelectorAll('.learn-button').forEach(btn => {
            btn.classList.remove('learning');
            const buttonId = btn.dataset.learnId;
            btn.textContent = `Naucz ${this.getButtonDisplayName(buttonId)}`;
        });
    }
    
    getButtonDisplayName(buttonId) {
        const names = {
            'ceiling_on': 'ON', 'ceiling_off': 'OFF',
            'ceiling_bright_up': '🔆+', 'ceiling_bright_down': '🔅-',
            'ceiling_warm': '🌡️', 'ceiling_cool': '❄️',
            'tv_red': '🔴', 'tv_green': '🟢', 'tv_blue': '🔵', 'tv_white': '⚪',
            'tv_orange': '🟠', 'tv_yellow': '🟡', 'tv_purple': '🟣', 'tv_rgb': '🌈',
            'tv_fade': '✨', 'tv_strobe': '⚡'
        };
        return names[buttonId] || buttonId;
    }
    
    refreshCodes() {
        const message = {
            action: 'getIRCodes',
            targetESP: this.config.espId
        };
        
        this.sendWebSocketMessage(message);
    }
    
    updateIRCodes(codes) {
        if (codes && typeof codes === 'object') {
            this.state.irCodes.clear();
            Object.entries(codes).forEach(([key, value]) => {
                this.state.irCodes.set(key, value);
            });
            this.saveStoredData();
            this.refreshCodesDisplay();
        }
    }
    
    refreshCodesDisplay() {
        const container = document.getElementById('codesContainer');
        if (!container) return;
        
        if (this.state.irCodes.size === 0) {
            container.innerHTML = '<div class="codes-loading">Brak zapisanych kodów IR</div>';
            return;
        }
        
        const html = Array.from(this.state.irCodes.entries())
            .map(([buttonId, code]) => `
                <div class="code-item">
                    <span class="code-name">${buttonId}</span>
                    <span class="code-value">${code}</span>
                    <button class="code-delete" onclick="pilot.deleteCode('${buttonId}')">🗑️</button>
                </div>
            `).join('');
        
        container.innerHTML = html;
    }
    
    deleteCode(buttonId) {
        if (confirm(`Czy na pewno chcesz usunąć kod dla: ${buttonId}?`)) {
            this.state.irCodes.delete(buttonId);
            this.saveStoredData();
            this.refreshCodesDisplay();
            this.showToast(`Usunięto kod: ${buttonId}`, 'info');
        }
    }
    
    clearCodes() {
        if (confirm('Czy na pewno chcesz usunąć wszystkie kody IR?')) {
            this.state.irCodes.clear();
            this.saveStoredData();
            this.refreshCodesDisplay();
            this.showToast('Usunięto wszystkie kody IR', 'info');
        }
    }
    
    backupToLocal() {
        const data = {
            timestamp: new Date().toISOString(),
            espId: this.config.espId,
            codes: Object.fromEntries(this.state.irCodes)
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `esp32-ir-codes-${this.config.espId}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('Backup zapisany lokalnie', 'success');
    }
    
    backupToVPS() {
        // This would require a backend endpoint
        this.showToast('Funkcja backup VPS nie jest jeszcze dostępna', 'warning');
    }
    
    requestStatusUpdate() {
        const message = {
            action: 'getStatus',
            targetESP: this.config.espId
        };
        
        this.sendWebSocketMessage(message);
    }
    
    updateESPStatus(statusData) {
        if (statusData) {
            Object.assign(this.state.espStatus, statusData);
            this.updateStatusDisplay();
        }
    }
    
    updateStatusDisplay() {
        const status = this.state.espStatus;
        
        // Update status values
        document.getElementById('espIP').textContent = status.ip || '---.--.---.---';
        document.getElementById('wifiRSSI').textContent = status.rssi || '-- dBm';
        document.getElementById('uptime').textContent = status.uptime || '--h --m';
        document.getElementById('freeRAM').textContent = status.freeRAM || '---KB wolne';
        
        // Update IR stats
        document.getElementById('irSent').textContent = status.irStats?.sent || 0;
        document.getElementById('irReceived').textContent = status.irStats?.received || 0;
        document.getElementById('irValid').textContent = status.irStats?.valid || 0;
    }
    
    restartESP() {
        if (confirm('Czy na pewno chcesz zrestartować ESP32?')) {
            const message = {
                action: 'restart',
                targetESP: this.config.espId
            };
            
            if (this.sendWebSocketMessage(message)) {
                this.showToast('Wysłano komendę restartu', 'info');
            }
        }
    }
    
    updateConnectionStatus(connected, message) {
        this.state.connected = connected;
        
        const statusText = document.getElementById('statusText');
        const statusDot = document.querySelector('.status-dot');
        const wsStatus = document.getElementById('wsStatus');
        
        if (statusText) statusText.textContent = message;
        if (wsStatus) {
            wsStatus.textContent = connected ? 'POŁĄCZONY' : 'ROZŁĄCZONY';
            wsStatus.classList.toggle('connected', connected);
        }
        
        if (statusDot) {
            statusDot.classList.toggle('connected', connected);
        }
        
        // Disable/enable control buttons based on connection
        document.querySelectorAll('.control-button').forEach(btn => {
            btn.disabled = !connected;
        });
        
        document.querySelectorAll('.learn-button').forEach(btn => {
            btn.disabled = !connected;
        });
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
    
    saveStoredData() {
        try {
            const data = {
                irCodes: Object.fromEntries(this.state.irCodes),
                espStatus: this.state.espStatus
            };
            localStorage.setItem('esp32-pilot-data', JSON.stringify(data));
        } catch (error) {
            console.error('Błąd zapisu do localStorage:', error);
        }
    }
    
    loadStoredData() {
        try {
            const stored = localStorage.getItem('esp32-pilot-data');
            if (stored) {
                const data = JSON.parse(stored);
                if (data.irCodes) {
                    this.state.irCodes = new Map(Object.entries(data.irCodes));
                    this.refreshCodesDisplay();
                }
                if (data.espStatus) {
                    Object.assign(this.state.espStatus, data.espStatus);
                    this.updateStatusDisplay();
                }
            }
        } catch (error) {
            console.error('Błąd odczytu z localStorage:', error);
        }
    }
}

// Initialize application when DOM is loaded
let pilot;
document.addEventListener('DOMContentLoaded', () => {
    pilot = new ESP32IRPilot();
});

// Make pilot available globally for debugging
window.pilot = pilot;