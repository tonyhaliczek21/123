// IR Remote Control PWA Application
// WebSocket URL for ESP32 communication
const ESP_WS_URL = "wss://espprojekt.pl/ws/main/";

let socket;
let isLearningMode = false;
let currentLearningButton = null;

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});

function initializeApp() {
    console.log("Inicjalizacja aplikacji Pilot...");
    connectWebSocket();
    setupEventListeners();
}

function setupEventListeners() {
    // Tab switching functionality is handled by onclick in HTML
    // Additional event listeners can be added here if needed
}

// WebSocket Connection Management
function connectWebSocket() {
    console.log("Łączenie z WebSocket:", ESP_WS_URL);
    updateConnectionStatus("connecting", "Łączenie...");

    socket = new WebSocket(ESP_WS_URL);

    socket.onopen = () => {
        console.log("Połączono z WebSocket!");
        updateConnectionStatus("connected", "Połączono");
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error("Błąd parsowania danych JSON z WebSocket:", error, "Dane:", event.data);
        }
    };

    socket.onclose = () => {
        console.log("Rozłączono WebSocket. Próba ponownego połączenia za 3 sekundy...");
        updateConnectionStatus("disconnected", "Rozłączono");
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (error) => {
        console.error("Błąd WebSocket:", error);
        updateConnectionStatus("disconnected", "Błąd połączenia");
        socket.close();
    };
}

function handleWebSocketMessage(data) {
    console.log("Odebrano wiadomość:", data);
    
    // Handle learning mode responses
    if (data.action === "learning_complete" && isLearningMode && currentLearningButton) {
        onLearningComplete(data);
    }
    
    // Handle configuration responses
    if (data.action === "config_saved") {
        showNotification("Konfiguracja została zapisana", "success");
    }
    
    if (data.action === "config_loaded") {
        showNotification("Konfiguracja została wczytana", "success");
    }
    
    // Handle IR command confirmations
    if (data.action === "ir_sent") {
        onIRCommandSent(data.button);
    }
}

function updateConnectionStatus(status, message) {
    const statusElement = document.getElementById("connectionStatus");
    if (!statusElement) return;
    
    statusElement.className = `connection-status ${status}`;
    
    const icons = {
        connecting: "fa-circle-notch fa-spin",
        connected: "fa-circle-check",
        disconnected: "fa-circle-xmark"
    };
    
    statusElement.innerHTML = `<i class="fa-solid ${icons[status]}"></i> ${message}`;
}

function sendSocketMessage(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Wysyłanie wiadomości:", payload);
        socket.send(JSON.stringify(payload));
    } else {
        console.error("Nie można wysłać wiadomości, WebSocket nie jest połączony.");
        showNotification("Błąd połączenia z serwerem", "error");
    }
}

// Tab Management
function switchTab(tabName) {
    // Remove active class from all tabs and panels
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    
    // Add active class to selected tab and panel
    event.target.closest('.tab-btn').classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    // Reset learning mode when switching tabs
    if (tabName !== 'settings') {
        stopLearning();
    }
}

// IR Command Functions
function sendIRCommand(device, command) {
    const buttonId = `${device}_${command}`;
    const button = document.querySelector(`[data-button="${buttonId}"]`);
    
    if (button) {
        button.classList.add('sending');
        setTimeout(() => button.classList.remove('sending'), 500);
    }
    
    const payload = {
        action: "send_ir",
        device: device,
        command: command,
        button: buttonId
    };
    
    sendSocketMessage(payload);
}

function onIRCommandSent(buttonId) {
    console.log("Potwierdzenie wysłania komendy IR:", buttonId);
    // Visual feedback is already handled in sendIRCommand
    // Additional success handling can be added here
}

// Learning Mode Functions
function startLearning() {
    const selectElement = document.getElementById('learningButton');
    const selectedButton = selectElement.value;
    
    if (!selectedButton) {
        showNotification("Wybierz przycisk do nauki", "warning");
        return;
    }
    
    if (socket.readyState !== WebSocket.OPEN) {
        showNotification("Brak połączenia z serwerem", "error");
        return;
    }
    
    currentLearningButton = selectedButton;
    isLearningMode = true;
    
    // Update UI
    document.getElementById('learnBtn').disabled = true;
    document.getElementById('learningStatus').classList.remove('hidden');
    selectElement.disabled = true;
    
    // Send learning command to ESP32
    const payload = {
        action: "start_learning",
        button: selectedButton
    };
    
    sendSocketMessage(payload);
    
    console.log("Rozpoczęto tryb nauki dla przycisku:", selectedButton);
}

function stopLearning() {
    if (!isLearningMode) return;
    
    isLearningMode = false;
    currentLearningButton = null;
    
    // Update UI
    document.getElementById('learnBtn').disabled = false;
    document.getElementById('learningStatus').classList.add('hidden');
    document.getElementById('learningButton').disabled = false;
    
    // Send stop learning command to ESP32
    const payload = {
        action: "stop_learning"
    };
    
    sendSocketMessage(payload);
    
    console.log("Zatrzymano tryb nauki");
}

function onLearningComplete(data) {
    if (!isLearningMode || !currentLearningButton) return;
    
    console.log("Nauka zakończona dla przycisku:", currentLearningButton);
    
    if (data.success) {
        showNotification(`Kod IR został przypisany do przycisku: ${getButtonDisplayName(currentLearningButton)}`, "success");
    } else {
        showNotification("Nie udało się odczytać kodu IR. Spróbuj ponownie.", "error");
    }
    
    stopLearning();
}

function getButtonDisplayName(buttonId) {
    const select = document.getElementById('learningButton');
    const option = select.querySelector(`option[value="${buttonId}"]`);
    return option ? option.textContent : buttonId;
}

// Configuration Management
function saveConfiguration() {
    if (socket.readyState !== WebSocket.OPEN) {
        showNotification("Brak połączenia z serwerem", "error");
        return;
    }
    
    const payload = {
        action: "save_config"
    };
    
    sendSocketMessage(payload);
    showNotification("Zapisywanie konfiguracji...", "info");
}

function loadConfiguration() {
    if (socket.readyState !== WebSocket.OPEN) {
        showNotification("Brak połączenia z serwerem", "error");
        return;
    }
    
    if (confirm("Czy na pewno chcesz wczytać konfigurację? To zastąpi obecne ustawienia.")) {
        const payload = {
            action: "load_config"
        };
        
        sendSocketMessage(payload);
        showNotification("Wczytywanie konfiguracji...", "info");
    }
}

// Notification System
function showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fa-solid ${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove after delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
    
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function getNotificationIcon(type) {
    const icons = {
        success: "fa-circle-check",
        error: "fa-circle-exclamation",
        warning: "fa-triangle-exclamation",
        info: "fa-circle-info"
    };
    return icons[type] || icons.info;
}

// CSS for notifications (will be added dynamically)
const notificationCSS = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--card-color);
    border: 2px solid;
    border-radius: var(--border-radius);
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 600;
    z-index: 1000;
    transform: translateX(400px);
    transition: transform 0.3s ease;
    min-width: 300px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.3);
}

.notification.show {
    transform: translateX(0);
}

.notification-success {
    border-color: var(--success-color);
    color: var(--success-color);
}

.notification-error {
    border-color: var(--error-color);
    color: var(--error-color);
}

.notification-warning {
    border-color: var(--warning-color);
    color: var(--warning-color);
}

.notification-info {
    border-color: var(--primary-color);
    color: var(--primary-color);
}

@media (max-width: 480px) {
    .notification {
        right: 10px;
        left: 10px;
        min-width: auto;
        transform: translateY(-100px);
    }
    
    .notification.show {
        transform: translateY(0);
    }
}
`;

// Add notification CSS to page
const style = document.createElement('style');
style.textContent = notificationCSS;
document.head.appendChild(style);