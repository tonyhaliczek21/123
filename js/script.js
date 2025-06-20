const ESP_WS_URL = "ws://sterowanieesp12.duckdns.org:8081";

let ldrChart;
let socket;
let ledCountdownInterval = null;
let appInitialized = false;

document.addEventListener("DOMContentLoaded", () => {
    const ADMIN_PASSWORD = "2sap1.8394";
    const PWD_STORAGE_KEY = "inteligentneOswietlenie_Password";
    const DEFAULT_PASSWORD = "dom73";

    const loginScreen = document.getElementById("loginScreen");
    const mainPanel = document.getElementById("mainPanel");
    const loginForm = document.getElementById("loginForm");
    const passwordInput = document.getElementById("loginPassword");
    const loginError = document.getElementById("loginError");

    if (!localStorage.getItem(PWD_STORAGE_KEY)) {
        localStorage.setItem(PWD_STORAGE_KEY, DEFAULT_PASSWORD);
    }

    if (sessionStorage.getItem("isLoggedIn") === "true") {
        showMainPanel();
        initializeMainApp();
    } else {
        showLoginScreen();
    }

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const enteredPassword = passwordInput.value;
        const currentPassword = localStorage.getItem(PWD_STORAGE_KEY);

        if (enteredPassword === ADMIN_PASSWORD) {
            const newPassword = prompt("Tryb administratora. Wprowadź nowe hasło dostępowe:", "");
            if (newPassword && newPassword.trim() !== "") {
                localStorage.setItem(PWD_STORAGE_KEY, newPassword);
                alert(`Hasło dostępowe zostało zmienione na: "${newPassword}"`);
                passwordInput.value = "";
            } else if (newPassword !== null) {
                alert("Hasło nie może być puste.");
            }
            return;
        }

        if (enteredPassword === currentPassword) {
            sessionStorage.setItem("isLoggedIn", "true");
            showMainPanel();
            initializeMainApp();
        } else {
            loginError.textContent = "Błędne hasło!";
            passwordInput.value = "";
            const loginCard = document.querySelector(".login-card");
            loginCard.classList.add("shake-error");
            setTimeout(() => loginCard.classList.remove("shake-error"), 500);
        }
    });

    function showLoginScreen() {
        if(mainPanel) mainPanel.style.display = "none";
        if(loginScreen) {
            loginScreen.classList.remove("hidden");
            passwordInput.focus();
        }
    }

    function showMainPanel() {
        if(loginScreen) loginScreen.classList.add("hidden");
        if(mainPanel) {
            mainPanel.style.display = "flex";
            mainPanel.classList.add("fade-in");
        }
    }
});

function initializeMainApp() {
    if (appInitialized) return;
    appInitialized = true;
    
    initLdrChart();
    connectWebSocket();
}

function connectWebSocket() {
    console.log("Łączenie z WebSocket...");
    const ledStatus = document.getElementById("ledStatus");
    if (ledStatus) ledStatus.innerText = "Łączenie...";

    socket = new WebSocket(ESP_WS_URL);

    socket.onopen = () => {
        console.log("Połączono z WebSocket!");
        if (ledStatus) ledStatus.innerText = "Połączono";
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.action === "new_log" && data.message) {
                prependLog(data.message);
            } else if (data.action === "init_logs" && Array.isArray(data.logs)) {
                updateLogs(data.logs);
            } else {
                updateUI(data);
            }
        } catch (error) {
            console.error("Błąd parsowania danych JSON z WebSocket:", error, "Dane:", event.data);
        }
    };

    socket.onclose = () => {
        console.log("Rozłączono WebSocket. Próba ponownego połączenia za 3 sekundy...");
        if (ledStatus) ledStatus.innerText = "Błąd połączenia";
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (error) => {
        console.error("Błąd WebSocket:", error);
        if (ledStatus) ledStatus.innerText = "Błąd połączenia";
        socket.close();
    };
}

function sendSocketMessage(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    } else {
        console.error("Nie można wysłać wiadomości, WebSocket nie jest połączony.");
    }
}

function updateUI(data) {
    updateStatusWeatherPanel(data);
    updateLedControl(data.ledState, data.ledSource, data.timeRemaining);
    updateLdrPanel(data.ldrValue, data.ldrThresholdLow, data.ldrThresholdHigh, data.controlMode);
}

function initLdrChart() {
    const ctx = document.getElementById("ldrChart")?.getContext("2d");
    if (!ctx) return;
    
    ldrChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            datasets: [{
                data: [0, 1023],
                backgroundColor: ["#316dff", "rgba(48, 54, 61, 0.5)"],
                borderColor: "transparent",
                borderWidth: 0,
                circumference: 270,
                rotation: 225,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            cutout: "80%",
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function updateStatusWeatherPanel(data) {
    const { temperature, weatherId, weatherDescription, sunriseTime, sunsetTime, isPirActive, locationName } = data;
    document.getElementById("temperature").innerText = temperature ? `${Math.round(temperature)}°C` : "--°C";
    document.getElementById("weatherDescription").innerText = weatherDescription || "Brak danych";
    document.getElementById("weatherIcon").className = getWeatherIconClass(weatherId);
    document.getElementById("sunrise").innerText = sunriseTime || "N/A";
    document.getElementById("sunset").innerText = sunsetTime || "N/A";
    document.getElementById("locationName").innerText = locationName || "Brak lokalizacji";

    const pirStatusEl = document.getElementById("pirStatus");
    if (isPirActive) {
        pirStatusEl.innerHTML = `<i class="fa-solid fa-person-rays"></i> PIR jest Aktywny`;
        pirStatusEl.className = "pir-status active";
    } else {
        pirStatusEl.innerHTML = `<i class="fa-solid fa-moon"></i> PIR jest Nieaktywny`;
        pirStatusEl.className = "pir-status inactive";
    }
}

function toggleLed() {
    const toggleButton = document.querySelector('.toggle-button');
    toggleButton.classList.add('loading');
    sendSocketMessage({ action: "toggle_www" });
}

function updateLedControl(state, source, timeRemaining) {
    const ledCard = document.getElementById("ledControlCard");
    const statusText = document.getElementById("ledStatus");
    const timerText = document.getElementById("ledTimer");
    const progressBg = document.getElementById("ledProgressBg");
    const progressBar = document.getElementById("ledProgressBar");
    const toggleButton = document.querySelector('.toggle-button');
    const ledStatusIcon = document.getElementById('ledStatusIcon');

    toggleButton.classList.remove('loading');

    if (ledCountdownInterval) {
        clearInterval(ledCountdownInterval);
        ledCountdownInterval = null;
    }

    if (state) {
        ledCard.classList.add("active");
        statusText.innerText = "Oświetlenie Włączone";
        ledStatusIcon.classList.add('on');
        ledStatusIcon.innerHTML = '<i class="fa-solid fa-lightbulb-on"></i>';

        if (timeRemaining > 0) {
            let remaining = timeRemaining;
            const totalDuration = (source === "WWW" ? 5 * 60 : (source === "Przycisk" ? 2 * 60 * 60 : (source === "PIR" ? 60 : timeRemaining)));
            
            function renderCountdown() {
                const minutes = Math.floor(remaining / 60);
                const seconds = String(remaining % 60).padStart(2, "0");
                timerText.innerText = `Wyłączy się za ${minutes}m ${seconds}s (Źródło: ${source})`;
                progressBar.style.width = `${Math.max(0, Math.min(100, (remaining / totalDuration) * 100))}%`;
                progressBg.style.visibility = "visible";
                progressBg.style.opacity = "1";
            }

            renderCountdown();
            ledCountdownInterval = setInterval(() => {
                remaining--;
                if (remaining < 0) {
                    clearInterval(ledCountdownInterval);
                } else {
                    renderCountdown();
                }
            }, 1000);
        } else {
            timerText.innerText = `Włączone manualnie (Źródło: ${source})`;
            progressBg.style.visibility = "hidden";
            progressBg.style.opacity = "0";
        }
    } else {
        ledCard.classList.remove("active");
        statusText.innerText = "Oświetlenie Wyłączone";
        ledStatusIcon.classList.remove('on');
        ledStatusIcon.innerHTML = '<i class="fa-solid fa-power-off"></i>';
        timerText.innerText = "Naciśnij przycisk, aby włączyć";
        progressBg.style.visibility = "hidden";
        progressBg.style.opacity = "0";
    }
}

function updateLdrPanel(ldrValue, low, high, controlMode) {
    if (ldrChart && typeof ldrValue !== 'undefined') {
        ldrChart.data.datasets[0].data = [ldrValue, 1023 - ldrValue];
        ldrChart.update("none");
    }
    
    if(typeof ldrValue !== 'undefined') document.getElementById("ldrValue").innerText = ldrValue;

    const ldrLowSlider = document.getElementById("ldrThresholdLowSlider");
    const ldrLowNum = document.getElementById("ldrThresholdLow");
    const ldrHighSlider = document.getElementById("ldrThresholdHighSlider");
    const ldrHighNum = document.getElementById("ldrThresholdHigh");

    if (document.activeElement !== ldrLowSlider) ldrLowSlider.value = low;
    if (document.activeElement !== ldrLowNum) ldrLowNum.value = low;
    if (document.activeElement !== ldrHighSlider) ldrHighSlider.value = high;
    if (document.activeElement !== ldrHighNum) ldrHighNum.value = high;
    
    document.getElementById("modeSelect").checked = (controlMode == 1);
}

const logTypeConfig = {
    PIR: { name: "PIR", icon: "fa-person-rays", type: "pir" },
    WWW: { name: "WWW", icon: "fa-globe", type: "www" },
    Przycisk: { name: "Przycisk", icon: "fa-hand-pointer", type: "btn" },
    LDR: { name: "LDR", icon: "fa-gauge-high", type: "ldr" },
    TRYB: { name: "Tryb", icon: "fa-gears", type: "mode" },
    ERR: { name: "Błąd", icon: "fa-triangle-exclamation", type: "error" },
    Błąd: { name: "Błąd", icon: "fa-triangle-exclamation", type: "error" },
    WiFi: { name: "System", icon: "fa-wifi", type: "sys" },
    NTP: { name: "System", icon: "fa-clock", type: "sys" },
    OTA: { name: "System", icon: "fa-upload", type: "sys" },
    WebSocket: { name: "System", icon: "fa-plug-circle-bolt", type: "sys" },
    DuckDNS: { name: "System", icon: "fa-network-wired", type: "sys" },
    Słońce: { name: "System", icon: "fa-sun", type: "sys" },
    EEPROM: { name: "System", icon: "fa-memory", type: "sys" },
    Pogoda: { name: "System", icon: "fa-cloud", type: "sys" }
};

function parseLogMessage(log) {
    const match = log.match(/\[(.*?)\]\s*(.*)/);
    const timestamp = match ? match[1] : "";
    let message = match ? match[2] : log;

    for (const key in logTypeConfig) {
        if (message.toUpperCase().startsWith(key.toUpperCase())) {
            const config = logTypeConfig[key];
            const remainingMessage = message.substring(key.length).replace(/^:/, '').trim();
            return {
                timestamp, source: config.name, message: remainingMessage,
                icon: config.icon, typeClass: `log-item--${config.type}`
            };
        }
    }
    
    return {
        timestamp, source: "System", message,
        icon: "fa-info-circle", typeClass: "log-item--sys"
    };
}


function createLogElement(log) {
    const data = parseLogMessage(log);
    const div = document.createElement("div");
    div.className = `log-item ${data.typeClass}`;

    div.innerHTML = `
        <div class="log-icon"><i class="fa-solid ${data.icon}"></i></div>
        <div class="log-details">
            <div class="log-header">
                <span class="log-source-badge">${data.source}</span>
                <span class="log-message">${data.message}</span>
            </div>
            <div class="log-timestamp">${data.timestamp}</div>
        </div>
    `;
    return div;
}

function prependLog(logMessage) {
    const logsList = document.getElementById("logsList");
    const MAX_UI_LOGS = 50;
    const placeholder = logsList.querySelector(".log-placeholder");
    if (placeholder) placeholder.remove();

    const newLogElement = createLogElement(logMessage);
    logsList.prepend(newLogElement);

    while (logsList.children.length > MAX_UI_LOGS) {
        logsList.lastChild.remove();
    }
}

function updateLogs(logs) {
    const logsList = document.getElementById("logsList");
    if (!logs || logs.length === 0) {
        logsList.innerHTML = `<div class="log-placeholder"><i class="fa-solid fa-inbox fa-2x"></i><p>Brak zdarzeń do wyświetlenia.</p></div>`;
        return;
    }
    logsList.innerHTML = logs.map(log => createLogElement(log).outerHTML).join("");
}

function getWeatherIconClass(weatherId) {
    if (!weatherId) return "fa-solid fa-question-circle weather-icon";
    if (weatherId >= 200 && weatherId < 300) return "fa-solid fa-cloud-bolt weather-icon";
    if (weatherId >= 300 && weatherId < 400) return "fa-solid fa-cloud-drizzle weather-icon";
    if (weatherId >= 500 && weatherId < 600) return "fa-solid fa-cloud-showers-heavy weather-icon";
    if (weatherId >= 600 && weatherId < 700) return "fa-solid fa-snowflake weather-icon";
    if (weatherId >= 700 && weatherId < 800) return "fa-solid fa-smog weather-icon";
    if (weatherId === 800) return "fa-solid fa-sun weather-icon";
    if (weatherId === 801) return "fa-solid fa-cloud-sun weather-icon";
    if (weatherId > 801) return "fa-solid fa-cloud weather-icon";
    return "fa-solid fa-question-circle weather-icon";
}

function resetLdrSettings() {
    if (confirm("Czy na pewno chcesz zresetować progi LDR do wartości domyślnych?"))
        sendSocketMessage({ action: "reset_ldr" });
}
function setControlMode(mode) { sendSocketMessage({ action: "set_control_mode", mode: mode }); }

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

const updateLdrRange = debounce(() => {
    let low = document.getElementById("ldrThresholdLow").value;
    let high = document.getElementById("ldrThresholdHigh").value;
    sendSocketMessage({ action: "set_ldr_threshold_range", low: parseInt(low), high: parseInt(high) });
}, 500);

function onRangeInputNum() {
    let low = parseInt(document.getElementById("ldrThresholdLow").value);
    let high = parseInt(document.getElementById("ldrThresholdHigh").value);
    if (low > high) [low, high] = [high, low];
    document.getElementById("ldrThresholdLowSlider").value = low;
    document.getElementById("ldrThresholdHighSlider").value = high;
    updateLdrRange();
}

function onRangeInputSliderLow() {
    let low = parseInt(document.getElementById("ldrThresholdLowSlider").value);
    let high = parseInt(document.getElementById("ldrThresholdHighSlider").value);
    if (low > high) {
        high = low;
        document.getElementById("ldrThresholdHighSlider").value = high;
    }
    document.getElementById("ldrThresholdLow").value = low;
    updateLdrRange();
}

function onRangeInputSliderHigh() {
    let low = parseInt(document.getElementById("ldrThresholdLowSlider").value);
    let high = parseInt(document.getElementById("ldrThresholdHighSlider").value);
    if (high < low) {
        low = high;
        document.getElementById("ldrThresholdLowSlider").value = low;
    }
    document.getElementById("ldrThresholdHigh").value = high;
    updateLdrRange();
}