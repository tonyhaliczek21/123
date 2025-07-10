// Pilot PWA - ESP32 Remote Control Application
// Professional PWA for controlling ESP32 lighting with IR remote functionality

// Configuration
const CONFIG = {
    websocketUrl: 'wss://espprojekt.pl/ws/main/',
    clientId: 'klaj886pwa',
    targetESP: 'klaj886',
    learningTimeout: 30000,
    reconnectInterval: 3000,
    hapticFeedback: true
};

// Global state
let socket = null;
let isConnected = false;
let currentTab = 'room';
let selectedPilot = 'ceiling';
let learningMode = false;
let learningTimer = null;
let learningButton = null;
let savedCodes = {};
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Pilot PWA Starting...');
    initializePWA();
    setupEventListeners();
    connectWebSocket();
    loadSavedCodes();
    updateLearningRemote();
});

// PWA Initialization
function initializePWA() {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('✅ Service Worker registered:', registration);
            })
            .catch(error => {
                console.error('❌ Service Worker registration failed:', error);
            });
    }

    // Handle install prompt
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallPrompt();
    });

    // Handle app installed
    window.addEventListener('appinstalled', () => {
        console.log('✅ PWA installed successfully');
        hideInstallPrompt();
    });
}

// Event Listeners Setup
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            switchTab(tab);
        });
    });

    // Pilot selection in learning mode
    document.querySelectorAll('.pilot-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pilot = e.currentTarget.dataset.pilot;
            selectPilot(pilot);
        });
    });

    // Handle visibility change for reconnection
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !isConnected) {
            connectWebSocket();
        }
    });

    // Handle online/offline events
    window.addEventListener('online', () => {
        console.log('📶 Back online, reconnecting...');
        connectWebSocket();
    });

    window.addEventListener('offline', () => {
        console.log('📵 Gone offline');
        updateConnectionStatus('offline');
    });
}

// WebSocket Connection
function connectWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        return;
    }

    updateConnectionStatus('connecting');
    console.log('🔌 Connecting to WebSocket...');

    try {
        socket = new WebSocket(CONFIG.websocketUrl);
        
        socket.onopen = () => {
            console.log('✅ WebSocket connected');
            isConnected = true;
            reconnectAttempts = 0;
            updateConnectionStatus('connected');
            
            // Send identification message
            sendMessage({
                action: 'identify',
                clientId: CONFIG.clientId,
                targetESP: CONFIG.targetESP
            });
            
            // Request initial data
            requestSavedCodes();
        };

        socket.onmessage = (event) => {
            handleWebSocketMessage(event);
        };

        socket.onclose = () => {
            console.log('❌ WebSocket disconnected');
            isConnected = false;
            updateConnectionStatus('disconnected');
            
            // Attempt to reconnect
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`🔄 Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
                setTimeout(connectWebSocket, CONFIG.reconnectInterval);
            }
        };

        socket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            updateConnectionStatus('error');
        };

    } catch (error) {
        console.error('❌ Failed to create WebSocket connection:', error);
        updateConnectionStatus('error');
    }
}

// Handle WebSocket Messages
function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('📨 Received message:', data);

        switch (data.action) {
            case 'irCodeLearned':
                handleCodeLearned(data);
                break;
            case 'irCodeSent':
                handleCodeSent(data);
                break;
            case 'codesData':
                handleCodesData(data);
                break;
            case 'learningTimeout':
                handleLearningTimeout();
                break;
            case 'error':
                handleError(data);
                break;
            case 'status':
                handleStatusUpdate(data);
                break;
            default:
                console.log('📨 Unknown message type:', data.action);
        }
    } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
    }
}

// Send WebSocket Message
function sendMessage(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('❌ WebSocket not connected');
        showNotification('Brak połączenia z ESP32', 'error');
        return false;
    }

    try {
        socket.send(JSON.stringify(payload));
        console.log('📤 Sent message:', payload);
        return true;
    } catch (error) {
        console.error('❌ Failed to send message:', error);
        return false;
    }
}

// Tab Management
function switchTab(tabName) {
    if (tabName === currentTab) return;

    // Stop learning mode when switching tabs
    if (learningMode) {
        stopLearning();
    }

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    currentTab = tabName;
    
    // Trigger haptic feedback
    triggerHapticFeedback();

    // Update content based on tab
    if (tabName === 'settings') {
        loadCodesTable();
    } else if (tabName === 'learning') {
        updateLearningRemote();
    }
}

// Pilot Selection
function selectPilot(pilot) {
    if (pilot === selectedPilot) return;

    selectedPilot = pilot;
    
    // Update pilot selection UI
    document.querySelectorAll('.pilot-select-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-pilot="${pilot}"]`).classList.add('active');
    
    // Update learning remote
    updateLearningRemote();
    
    // Trigger haptic feedback
    triggerHapticFeedback();
}

// Update Learning Remote
function updateLearningRemote() {
    const learningRemote = document.getElementById('learningRemote');
    if (!learningRemote) return;

    const buttons = selectedPilot === 'ceiling' ? getCeilingButtons() : getTVButtons();
    
    learningRemote.innerHTML = `
        <div class="remote-grid">
            ${buttons.map(btn => `
                <button class="remote-btn ${savedCodes[btn.code] ? 'learned' : ''}" 
                        onclick="startLearning('${btn.code}')" 
                        data-code="${btn.code}">
                    <span>${btn.label}</span>
                </button>
            `).join('')}
        </div>
    `;
}

// Get Button Definitions
function getCeilingButtons() {
    return [
        { code: 'ceiling_on', label: 'ON' },
        { code: 'ceiling_off', label: 'OFF' },
        { code: 'ceiling_mem', label: 'MEM' },
        { code: 'ceiling_50', label: '50%' },
        { code: 'ceiling_plus', label: '+' },
        { code: 'ceiling_minus', label: '-' },
        { code: 'ceiling_cct', label: 'CCT' },
        { code: 'ceiling_night', label: 'Night' }
    ];
}

function getTVButtons() {
    return [
        { code: 'tv_bright_up', label: '+' },
        { code: 'tv_bright_down', label: '-' },
        { code: 'tv_play', label: '▶' },
        { code: 'tv_pause', label: '⏸' },
        { code: 'tv_red', label: '🔴' },
        { code: 'tv_green', label: '🟢' },
        { code: 'tv_blue', label: '🔵' },
        { code: 'tv_white', label: '⚪' }
    ];
}

// IR Code Management
function sendIRCode(code) {
    if (!savedCodes[code]) {
        showNotification('Kod nie jest zaprogramowany', 'warning');
        return;
    }

    const success = sendMessage({
        action: 'send',
        code: code,
        data: savedCodes[code]
    });

    if (success) {
        // Visual feedback
        const button = document.querySelector(`[data-code="${code}"]`);
        if (button) {
            button.classList.add('haptic-feedback');
            setTimeout(() => button.classList.remove('haptic-feedback'), 100);
        }
        
        // Trigger haptic feedback
        triggerHapticFeedback();
        
        showNotification('Kod wysłany', 'success');
    }
}

// Learning Mode
function startLearning(code) {
    if (learningMode) {
        stopLearning();
        return;
    }

    learningMode = true;
    learningButton = code;
    
    // Update button visual state
    const button = document.querySelector(`[data-code="${code}"]`);
    if (button) {
        button.classList.add('learning');
    }
    
    // Show learning status
    showLearningStatus();
    
    // Start learning timer
    startLearningTimer();
    
    // Send learning command
    const success = sendMessage({
        action: 'startLearning',
        code: code
    });
    
    if (!success) {
        stopLearning();
        return;
    }
    
    // Trigger haptic feedback
    triggerHapticFeedback();
    
    console.log(`🎓 Started learning for code: ${code}`);
}

function stopLearning() {
    if (!learningMode) return;

    learningMode = false;
    
    // Clear timer
    if (learningTimer) {
        clearInterval(learningTimer);
        learningTimer = null;
    }
    
    // Update button visual state
    if (learningButton) {
        const button = document.querySelector(`[data-code="${learningButton}"]`);
        if (button) {
            button.classList.remove('learning');
        }
        learningButton = null;
    }
    
    // Hide learning status
    hideLearningStatus();
    
    // Send stop learning command
    sendMessage({
        action: 'stopLearning'
    });
    
    console.log('🛑 Stopped learning');
}

function startLearningTimer() {
    let remainingTime = CONFIG.learningTimeout / 1000;
    const timerElement = document.getElementById('learningTimer');
    
    learningTimer = setInterval(() => {
        remainingTime--;
        if (timerElement) {
            timerElement.textContent = `${remainingTime}s pozostało`;
        }
        
        if (remainingTime <= 0) {
            handleLearningTimeout();
        }
    }, 1000);
}

function showLearningStatus() {
    const statusElement = document.getElementById('learningStatus');
    if (statusElement) {
        statusElement.style.display = 'block';
        statusElement.classList.add('slide-up');
    }
}

function hideLearningStatus() {
    const statusElement = document.getElementById('learningStatus');
    if (statusElement) {
        statusElement.style.display = 'none';
        statusElement.classList.remove('slide-up');
    }
}

// Handle Learning Events
function handleCodeLearned(data) {
    if (!learningMode || data.code !== learningButton) return;

    // Save the learned code
    savedCodes[data.code] = data.irData;
    
    // Update button state
    const button = document.querySelector(`[data-code="${data.code}"]`);
    if (button) {
        button.classList.remove('learning');
        button.classList.add('learned');
    }
    
    // Stop learning
    stopLearning();
    
    // Update learning remote
    updateLearningRemote();
    
    // Save to localStorage
    saveCodesToStorage();
    
    // Show success notification
    showNotification('Kod zaprogramowany pomyślnie!', 'success');
    
    // Trigger haptic feedback
    triggerHapticFeedback();
    
    console.log('✅ Code learned:', data.code);
}

function handleCodeSent(data) {
    console.log('📡 Code sent:', data.code);
}

function handleLearningTimeout() {
    if (learningMode) {
        stopLearning();
        showNotification('Czas nauki upłynął', 'warning');
    }
}

// Connection Status Management
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connectionStatus');
    const iconElement = document.getElementById('connectionIcon');
    const textElement = document.getElementById('connectionText');
    
    if (!statusElement || !iconElement || !textElement) return;

    // Remove all status classes
    statusElement.classList.remove('connected', 'disconnected', 'connecting', 'error');
    
    switch (status) {
        case 'connected':
            statusElement.classList.add('connected');
            iconElement.className = 'fa-solid fa-wifi';
            textElement.textContent = 'Połączono';
            break;
        case 'disconnected':
            statusElement.classList.add('disconnected');
            iconElement.className = 'fa-solid fa-wifi-slash';
            textElement.textContent = 'Rozłączono';
            break;
        case 'connecting':
            statusElement.classList.add('connecting');
            iconElement.className = 'fa-solid fa-spinner fa-spin';
            textElement.textContent = 'Łączenie...';
            break;
        case 'error':
            statusElement.classList.add('error');
            iconElement.className = 'fa-solid fa-triangle-exclamation';
            textElement.textContent = 'Błąd';
            break;
        case 'offline':
            statusElement.classList.add('disconnected');
            iconElement.className = 'fa-solid fa-wifi-slash';
            textElement.textContent = 'Offline';
            break;
    }
    
    // Update ESP status in settings
    const espStatus = document.getElementById('espStatus');
    if (espStatus) {
        espStatus.textContent = status === 'connected' ? 'Połączony' : 'Rozłączony';
    }
}

// Code Management
function loadSavedCodes() {
    const stored = localStorage.getItem('pilotCodes');
    if (stored) {
        try {
            savedCodes = JSON.parse(stored);
            console.log('📥 Loaded saved codes:', Object.keys(savedCodes));
        } catch (error) {
            console.error('❌ Failed to parse saved codes:', error);
            savedCodes = {};
        }
    }
}

function saveCodesToStorage() {
    try {
        localStorage.setItem('pilotCodes', JSON.stringify(savedCodes));
        console.log('💾 Saved codes to localStorage');
    } catch (error) {
        console.error('❌ Failed to save codes:', error);
    }
}

function requestSavedCodes() {
    sendMessage({
        action: 'getIRCodes'
    });
}

function handleCodesData(data) {
    if (data.codes) {
        savedCodes = { ...savedCodes, ...data.codes };
        saveCodesToStorage();
        updateLearningRemote();
        loadCodesTable();
        console.log('📥 Received codes from ESP32:', Object.keys(data.codes));
    }
}

function loadCodesTable() {
    const tableElement = document.getElementById('codesTable');
    if (!tableElement) return;

    const codeEntries = Object.entries(savedCodes);
    
    if (codeEntries.length === 0) {
        tableElement.innerHTML = '<div class="table-placeholder">Brak zapisanych kodów</div>';
        return;
    }

    tableElement.innerHTML = `
        <div class="codes-list">
            ${codeEntries.map(([code, data]) => `
                <div class="code-item">
                    <div class="code-info">
                        <span class="code-name">${code}</span>
                        <span class="code-data">${data.length || 0} bytes</span>
                    </div>
                    <button class="delete-btn" onclick="deleteCode('${code}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

function deleteCode(code) {
    if (confirm(`Czy na pewno chcesz usunąć kod "${code}"?`)) {
        delete savedCodes[code];
        saveCodesToStorage();
        updateLearningRemote();
        loadCodesTable();
        
        // Send delete command to ESP32
        sendMessage({
            action: 'deleteCode',
            code: code
        });
        
        showNotification('Kod usunięty', 'success');
        triggerHapticFeedback();
    }
}

// Settings Functions
function reconnectESP() {
    if (socket) {
        socket.close();
    }
    reconnectAttempts = 0;
    connectWebSocket();
    showNotification('Ponowne łączenie...', 'info');
}

function loadCodes() {
    requestSavedCodes();
    showNotification('Pobieranie kodów...', 'info');
}

function exportConfig() {
    const config = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        codes: savedCodes
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pilot-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Konfiguracja wyeksportowana', 'success');
}

function importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                if (config.codes) {
                    savedCodes = { ...savedCodes, ...config.codes };
                    saveCodesToStorage();
                    updateLearningRemote();
                    loadCodesTable();
                    showNotification('Konfiguracja zaimportowana', 'success');
                } else {
                    showNotification('Nieprawidłowy format pliku', 'error');
                }
            } catch (error) {
                showNotification('Błąd importu konfiguracji', 'error');
                console.error('❌ Import error:', error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Utility Functions
function triggerHapticFeedback() {
    if (CONFIG.hapticFeedback && navigator.vibrate) {
        navigator.vibrate(50);
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fa-solid fa-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
    
    console.log(`📢 ${type.toUpperCase()}: ${message}`);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-triangle';
        case 'warning': return 'exclamation-circle';
        case 'info': return 'info-circle';
        default: return 'info-circle';
    }
}

function handleError(data) {
    console.error('❌ ESP32 Error:', data.message);
    showNotification(data.message || 'Wystąpił błąd', 'error');
}

function handleStatusUpdate(data) {
    console.log('📊 Status update:', data);
    // Handle any status updates from ESP32
}

// PWA Install Prompt
function showInstallPrompt() {
    // Implementation for install prompt UI
    console.log('📱 PWA can be installed');
}

function hideInstallPrompt() {
    // Implementation for hiding install prompt
    console.log('📱 PWA install prompt hidden');
}

// Add notification styles
const notificationStyles = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .notification.success {
        background: #10B981;
    }
    
    .notification.error {
        background: #EF4444;
    }
    
    .notification.warning {
        background: #F59E0B;
    }
    
    .notification.info {
        background: #0EA5E9;
    }
    
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    .code-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color);
    }
    
    .code-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .code-name {
        font-weight: 600;
        color: var(--text-strong);
    }
    
    .code-data {
        font-size: 0.875rem;
        color: var(--text-muted);
    }
    
    .delete-btn {
        background: transparent;
        border: 1px solid var(--error-color);
        color: var(--error-color);
        border-radius: 4px;
        padding: 0.5rem;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .delete-btn:hover {
        background: var(--error-color);
        color: white;
    }
`;

// Add styles to document
const style = document.createElement('style');
style.textContent = notificationStyles;
document.head.appendChild(style);

console.log('🎮 Pilot PWA Initialized');