// PWA Pilot Application for Lighting Control
// WebSocket URL as specified in requirements
const WS_URL = "wss://espprojekt.pl/ws/main/";
const TARGET_ESP = "klaj886";

// Application state
let socket = null;
let currentLearningButton = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// DOM elements
const connectionStatus = document.getElementById('connectionStatus');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const remoteButtons = document.querySelectorAll('.remote-btn:not(.learning-btn)');
const learningButtons = document.querySelectorAll('.learning-btn');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const loadConfigBtn = document.getElementById('loadConfigBtn');

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    console.log('Initializing Pilot App...');
    
    // Set up tab switching
    setupTabNavigation();
    
    // Set up button event listeners
    setupButtonListeners();
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Register service worker for PWA
    registerServiceWorker();
}

function setupTabNavigation() {
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            switchTab(targetTab);
        });
    });
}

function switchTab(targetTab) {
    // Update tab buttons
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === targetTab);
    });
    
    // Update tab content
    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${targetTab}-tab`);
    });
}

function setupButtonListeners() {
    // Remote control buttons (Pilot tab)
    remoteButtons.forEach(button => {
        button.addEventListener('click', () => {
            const buttonId = button.dataset.button;
            sendControlCommand(buttonId);
            
            // Visual feedback
            button.style.transform = 'scale(0.95)';
            setTimeout(() => {
                button.style.transform = '';
            }, 150);
        });
    });
    
    // Learning mode buttons (Settings tab)
    learningButtons.forEach(button => {
        button.addEventListener('click', () => {
            const buttonId = button.dataset.button;
            startLearning(buttonId, button);
        });
    });
    
    // Configuration buttons
    saveConfigBtn.addEventListener('click', () => {
        sendConfigCommand('saveConfig');
    });
    
    loadConfigBtn.addEventListener('click', () => {
        sendConfigCommand('getIRCodes');
    });
}

function connectWebSocket() {
    updateConnectionStatus('connecting', 'Łączenie...');
    
    try {
        socket = new WebSocket(WS_URL);
        
        socket.onopen = handleWebSocketOpen;
        socket.onmessage = handleWebSocketMessage;
        socket.onclose = handleWebSocketClose;
        socket.onerror = handleWebSocketError;
        
    } catch (error) {
        console.error('WebSocket connection error:', error);
        updateConnectionStatus('disconnected', 'Błąd połączenia');
        scheduleReconnect();
    }
}

function handleWebSocketOpen() {
    console.log('WebSocket connected successfully');
    updateConnectionStatus('connected', 'Połączono');
    reconnectAttempts = 0;
}

function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        // Handle different message types
        switch (data.action) {
            case 'learningComplete':
                handleLearningComplete(data);
                break;
            case 'learningStarted':
                handleLearningStarted(data);
                break;
            case 'configSaved':
                showNotification('Konfiguracja została zapisana na ESP', 'success');
                break;
            case 'configLoaded':
                showNotification('Konfiguracja została wczytana z ESP', 'success');
                break;
            case 'error':
                showNotification(`Błąd: ${data.message}`, 'error');
                break;
            default:
                console.log('Unhandled message type:', data.action);
        }
    } catch (error) {
        console.error('Error parsing WebSocket message:', error);
    }
}

function handleWebSocketClose() {
    console.log('WebSocket connection closed');
    updateConnectionStatus('disconnected', 'Rozłączono');
    
    // Clear any active learning state
    if (currentLearningButton) {
        currentLearningButton.classList.remove('learning-active');
        currentLearningButton = null;
    }
    
    scheduleReconnect();
}

function handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    updateConnectionStatus('disconnected', 'Błąd połączenia');
}

function scheduleReconnect() {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
        
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
        updateConnectionStatus('connecting', `Ponowne łączenie... (${reconnectAttempts}/${maxReconnectAttempts})`);
        
        setTimeout(() => {
            connectWebSocket();
        }, delay);
    } else {
        updateConnectionStatus('disconnected', 'Nie można połączyć');
        showNotification('Nie można połączyć się z serwerem. Sprawdź połączenie internetowe.', 'error');
    }
}

function updateConnectionStatus(status, message) {
    connectionStatus.className = `connection-status ${status}`;
    
    const icon = connectionStatus.querySelector('i');
    const text = connectionStatus.querySelector('span');
    
    switch (status) {
        case 'connected':
            icon.className = 'fa-solid fa-wifi';
            break;
        case 'connecting':
            icon.className = 'fa-solid fa-circle-notch fa-spin';
            break;
        case 'disconnected':
            icon.className = 'fa-solid fa-wifi-slash';
            break;
    }
    
    text.textContent = message;
}

function sendControlCommand(buttonId) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showNotification('Brak połączenia z serwerem', 'error');
        return;
    }
    
    const message = {
        action: "send",
        buttonId: buttonId,
        targetESP: TARGET_ESP
    };
    
    console.log('Sending control command:', message);
    socket.send(JSON.stringify(message));
    
    showNotification(`Wysłano komendę: ${buttonId}`, 'info');
}

function startLearning(buttonId, buttonElement) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showNotification('Brak połączenia z serwerem', 'error');
        return;
    }
    
    // Clear any previous learning state
    if (currentLearningButton) {
        currentLearningButton.classList.remove('learning-active');
    }
    
    // Set new learning state
    currentLearningButton = buttonElement;
    buttonElement.classList.add('learning-active');
    
    const message = {
        action: "startLearning",
        buttonId: buttonId,
        targetESP: TARGET_ESP
    };
    
    console.log('Starting learning for button:', message);
    socket.send(JSON.stringify(message));
    
    showNotification(`Tryb nauki aktywny dla: ${buttonId}. Naciśnij przycisk na pilocie.`, 'info');
}

function handleLearningStarted(data) {
    showNotification(`Tryb nauki rozpoczęty dla: ${data.buttonId}`, 'info');
}

function handleLearningComplete(data) {
    if (currentLearningButton) {
        currentLearningButton.classList.remove('learning-active');
        currentLearningButton = null;
    }
    
    showNotification(`Nauka zakończona dla: ${data.buttonId}`, 'success');
}

function sendConfigCommand(action) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showNotification('Brak połączenia z serwerem', 'error');
        return;
    }
    
    const message = {
        action: action,
        targetESP: TARGET_ESP
    };
    
    console.log('Sending config command:', message);
    socket.send(JSON.stringify(message));
    
    const actionText = action === 'saveConfig' ? 'zapisywanie' : 'wczytywanie';
    showNotification(`Rozpoczęto ${actionText} konfiguracji...`, 'info');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add styles
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '14px',
        fontFamily: 'var(--font-family)',
        zIndex: '1000',
        minWidth: '200px',
        maxWidth: '400px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease'
    });
    
    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #f44336, #da190b)';
            break;
        case 'info':
        default:
            notification.style.background = 'linear-gradient(135deg, #3a7fdd, #2c6bc4)';
            break;
    }
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
}

// Prevent context menu on long press for mobile
document.addEventListener('contextmenu', (e) => {
    if (e.target.classList.contains('remote-btn') || e.target.classList.contains('learning-btn')) {
        e.preventDefault();
    }
});

// Add visual feedback for touch devices
document.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('remote-btn') || e.target.classList.contains('learning-btn')) {
        e.target.style.transform = 'scale(0.95)';
    }
});

document.addEventListener('touchend', (e) => {
    if (e.target.classList.contains('remote-btn') || e.target.classList.contains('learning-btn')) {
        setTimeout(() => {
            e.target.style.transform = '';
        }, 150);
    }
});