// IR Remote Control PWA - Main Application Logic
const ESP_WS_URL = "ws://sterowanieesp12.duckdns.org:8081";

class IRRemoteApp {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentTab = 'rgb-remote';
        this.learningMode = false;
        this.learningTimeout = null;
        this.learningCommand = null;
        this.irCodes = this.loadIRCodes();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectWebSocket();
        this.updateUI();
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.closest('.tab-btn').dataset.tab;
                this.switchTab(tabId);
            });
        });

        // IR buttons
        document.querySelectorAll('.ir-btn[data-cmd]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = e.target.closest('.ir-btn').dataset.cmd;
                this.sendIRCommand(command);
            });
        });

        // Learning buttons
        document.querySelectorAll('.learn-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = e.target.closest('.learn-btn').dataset.learn;
                this.startLearning(command);
            });
        });

        // Settings buttons
        document.getElementById('saveCodesBtn')?.addEventListener('click', () => this.saveIRCodes());
        document.getElementById('loadCodesBtn')?.addEventListener('click', () => this.loadIRCodesFromFile());
        document.getElementById('resetCodesBtn')?.addEventListener('click', () => this.resetIRCodes());
        document.getElementById('exportCodesBtn')?.addEventListener('click', () => this.exportIRCodes());

        // Color buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = e.target.closest('.color-btn').dataset.cmd;
                this.sendIRCommand(command);
            });
        });
    }

    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');

        this.currentTab = tabId;
    }

    connectWebSocket() {
        this.updateConnectionStatus('connecting', 'Connecting to device...');
        
        this.socket = new WebSocket(ESP_WS_URL);

        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.updateConnectionStatus('connected', 'Connected to device');
            this.showNotification('Connected to ESP32 successfully!', 'success');
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.socket.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected from device');
            this.showNotification('Connection lost. Reconnecting...', 'warning');
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connectWebSocket();
                }
            }, 3000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Connection error');
            this.showNotification('Connection error occurred', 'error');
        };
    }

    handleWebSocketMessage(data) {
        console.log('Received WebSocket message:', data);
        
        if (data.action === 'ir_command_sent') {
            this.showNotification(`IR command sent: ${data.command}`, 'success');
            this.animateButton(data.command);
        } else if (data.action === 'learning_started') {
            this.showNotification('Learning mode activated', 'info');
        } else if (data.action === 'learning_success') {
            this.handleLearningSuccess(data);
        } else if (data.action === 'learning_failed') {
            this.handleLearningFailed(data);
        } else if (data.action === 'learning_timeout') {
            this.handleLearningTimeout();
        }
    }

    sendIRCommand(command) {
        if (!this.isConnected) {
            this.showNotification('Device not connected', 'error');
            return;
        }

        if (this.learningMode) {
            this.showNotification('Exit learning mode first', 'warning');
            return;
        }

        const irCode = this.irCodes[command];
        if (!irCode) {
            this.showNotification(`IR code not learned for: ${command}`, 'warning');
            return;
        }

        const message = {
            action: 'send_ir_command',
            command: command,
            code: irCode
        };

        this.socket.send(JSON.stringify(message));
        this.animateButton(command);
    }

    startLearning(command) {
        if (!this.isConnected) {
            this.showNotification('Device not connected', 'error');
            return;
        }

        if (this.learningMode) {
            this.stopLearning();
        }

        this.learningMode = true;
        this.learningCommand = command;
        
        const message = {
            action: 'start_learning',
            command: command
        };

        this.socket.send(JSON.stringify(message));
        this.updateLearningUI(true);
        this.startLearningCountdown();
    }

    stopLearning() {
        this.learningMode = false;
        this.learningCommand = null;
        
        if (this.learningTimeout) {
            clearInterval(this.learningTimeout);
            this.learningTimeout = null;
        }

        if (this.isConnected) {
            const message = { action: 'stop_learning' };
            this.socket.send(JSON.stringify(message));
        }

        this.updateLearningUI(false);
    }

    startLearningCountdown() {
        let timeLeft = 30;
        const progressBar = document.querySelector('.progress-bar-circle');
        const progressText = document.getElementById('progressTime');
        
        this.learningTimeout = setInterval(() => {
            timeLeft--;
            progressText.textContent = timeLeft;
            
            // Update progress circle
            const circumference = 2 * Math.PI * 50; // radius = 50
            const offset = circumference - (timeLeft / 30) * circumference;
            progressBar.style.strokeDashoffset = offset;
            
            if (timeLeft <= 0) {
                this.handleLearningTimeout();
            }
        }, 1000);
    }

    handleLearningSuccess(data) {
        this.stopLearning();
        this.irCodes[data.command] = data.code;
        this.saveIRCodes();
        this.showNotification(`Successfully learned: ${data.command}`, 'success');
    }

    handleLearningFailed(data) {
        this.stopLearning();
        this.showNotification(`Learning failed: ${data.message || 'Unknown error'}`, 'error');
    }

    handleLearningTimeout() {
        this.stopLearning();
        this.showNotification('Learning timeout - no IR signal received', 'warning');
    }

    updateLearningUI(isLearning) {
        const statusDiv = document.getElementById('learningStatus');
        const progressDiv = document.getElementById('learningProgress');
        
        if (isLearning) {
            statusDiv.style.display = 'none';
            progressDiv.style.display = 'block';
            
            // Reset progress circle
            const progressBar = document.querySelector('.progress-bar-circle');
            const circumference = 2 * Math.PI * 50;
            progressBar.style.strokeDasharray = circumference;
            progressBar.style.strokeDashoffset = 0;
            
            document.getElementById('progressTime').textContent = '30';
        } else {
            statusDiv.style.display = 'block';
            progressDiv.style.display = 'none';
        }
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connectionStatus');
        const deviceStatusElement = document.getElementById('deviceStatus');
        const wsStatusElement = document.getElementById('wsStatus');
        const lastUpdateElement = document.getElementById('lastUpdate');
        
        // Update header connection status
        statusElement.className = `connection-status ${status}`;
        statusElement.innerHTML = `
            <i class="fa-solid fa-${status === 'connected' ? 'wifi' : status === 'connecting' ? 'spinner fa-spin' : 'wifi-slash'}"></i>
            <span>${message}</span>
        `;
        
        // Update settings page status
        if (deviceStatusElement) {
            deviceStatusElement.className = `status-indicator ${status}`;
            deviceStatusElement.innerHTML = `
                <i class="fa-solid fa-${status === 'connected' ? 'check-circle' : status === 'connecting' ? 'spinner fa-spin' : 'times-circle'}"></i>
                <span>${message}</span>
            `;
        }
        
        if (wsStatusElement) {
            wsStatusElement.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
        }
        
        if (lastUpdateElement) {
            lastUpdateElement.textContent = new Date().toLocaleTimeString();
        }
    }

    animateButton(command) {
        const button = document.querySelector(`[data-cmd="${command}"]`);
        if (button) {
            button.style.transform = 'scale(0.95)';
            button.style.boxShadow = '0 0 20px rgba(30, 144, 255, 0.8)';
            
            setTimeout(() => {
                button.style.transform = '';
                button.style.boxShadow = '';
            }, 200);
        }
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        // Remove notification after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    loadIRCodes() {
        const saved = localStorage.getItem('ir_codes');
        return saved ? JSON.parse(saved) : {};
    }

    saveIRCodes() {
        localStorage.setItem('ir_codes', JSON.stringify(this.irCodes));
        this.showNotification('IR codes saved successfully', 'success');
    }

    loadIRCodesFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const codes = JSON.parse(e.target.result);
                        this.irCodes = codes;
                        this.saveIRCodes();
                        this.showNotification('IR codes loaded successfully', 'success');
                    } catch (error) {
                        this.showNotification('Error loading IR codes file', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    resetIRCodes() {
        if (confirm('Are you sure you want to reset all IR codes? This action cannot be undone.')) {
            this.irCodes = {};
            this.saveIRCodes();
            this.showNotification('All IR codes have been reset', 'info');
        }
    }

    exportIRCodes() {
        const dataStr = JSON.stringify(this.irCodes, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = 'ir_codes.json';
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showNotification('IR codes exported successfully', 'success');
    }

    updateUI() {
        // Update WebSocket URL in settings
        const wsUrlElement = document.getElementById('wsUrl');
        if (wsUrlElement) {
            wsUrlElement.textContent = ESP_WS_URL;
        }
        
        // Initial connection status
        this.updateConnectionStatus('disconnected', 'Not connected');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.irRemoteApp = new IRRemoteApp();
});

// Handle visibility change for better performance
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, reduce activity
        console.log('Page hidden, reducing activity');
    } else {
        // Page is visible, resume full activity
        console.log('Page visible, resuming full activity');
        if (window.irRemoteApp && !window.irRemoteApp.isConnected) {
            window.irRemoteApp.connectWebSocket();
        }
    }
});