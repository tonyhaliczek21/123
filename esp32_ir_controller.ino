#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <SunPosition.h>
#include <EEPROM.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

// --- KONFIGURACJA ---
const char* ssid = "Orange_Swiatlowod_FF20";
const char* password = "qwertyui73";
const char* ota_password = "dom73";
const char* weather_api_key = "92908d49e8711defa26beca0a53e30ae";
const char* weather_location_query = "32-015,PL";
const char* duckdns_domain = "sterowanieesp12.duckdns.org";
const char* duckdns_token = "8eb419fa-a05e-4620-a430-dd04bf1f58e9";

const unsigned long WEATHER_UPDATE_INTERVAL = 30UL * 60 * 1000;
const unsigned long DUCKDNS_UPDATE_INTERVAL = 12UL * 60 * 60 * 1000;
const unsigned long BUTTON_ON_DURATION = 2UL * 60 * 60 * 1000;
const unsigned long WWW_ON_DURATION = 5UL * 60 * 1000;
const unsigned long PIR_AFTER_MOTION_DELAY = 60UL * 1000;
const int LED_PIN = D8;
const int PIR_PIN = D2;
const int BUTTON_PIN = D3;
const int LDR_PIN = A0;
const int IR_SEND_PIN = D4;
const int IR_RECV_PIN = D5;
const int LDR_READINGS_COUNT = 10;
const int MAX_LOG_ENTRIES = 50;
const float LATITUDE = 50.0647;
const float LONGITUDE = 19.9450;
const float GMT_OFFSET_HOURS = 2.0;
const unsigned long PIR_INHIBIT_DURATION = 3000;
const unsigned long LDR_BROADCAST_INTERVAL = 2000;
const int LDR_DEFAULT_LOW = 500;
const int LDR_DEFAULT_HIGH = 1023;
const int CONTROL_MODE_DEFAULT = 1;
const int EEPROM_SIZE = 256;
const unsigned long IR_LEARNING_TIMEOUT = 30000;

// EEPROM Memory Map
#define EEPROM_MAGIC_ADDR 0
#define EEPROM_LDR_LOW_ADDR 2
#define EEPROM_LDR_HIGH_ADDR 6
#define EEPROM_MODE_ADDR 10
#define EEPROM_IR_CODES_ADDR 14
#define EEPROM_MAGIC_VALUE 0xDA

const unsigned long PIR_DEBOUNCE_MS = 300;

// IR Configuration
IRsend irSend(IR_SEND_PIN);
IRrecv irRecv(IR_RECV_PIN);
decode_results results;

// --- Zmienne ---
float currentTemperature = -99.0;
int weatherId = 0;
String weatherDescription = "Brak danych";
String currentCityName = "Ładowanie...";
volatile bool pirInterruptFlag = false;
unsigned long pirLastInterruptTime = 0;
bool ledState = false;
int ledBrightness = 1023;
unsigned long ledOffTime = 0;
String ledSource = "Manualnie";
unsigned long pirInhibitEndTime = 0;
unsigned long lastWeatherUpdateTime = 0;
unsigned long lastDuckDNSTime = 0;
unsigned long lastLdrBroadcastTime = 0;
unsigned long lastDebounceTime = 0;
int buttonState = HIGH;
int lastButtonStateRaw = HIGH;
int ldrReadings[LDR_READINGS_COUNT];
int ldrReadingsIndex = 0;
long ldrTotal = 0;
int ldrValue = 0;
String sunriseTimeStr = "N/A";
String sunsetTimeStr = "N/A";
bool isPirActiveByDaylight = false;
int ldrThresholdLow = LDR_DEFAULT_LOW;
int ldrThresholdHigh = LDR_DEFAULT_HIGH;
int controlMode = CONTROL_MODE_DEFAULT;
String logs[MAX_LOG_ENTRIES];
int logCount = 0;

// IR Learning variables
bool isLearningMode = false;
String learningCommand = "";
unsigned long learningStartTime = 0;
struct IRCode {
  String command;
  uint16_t type;
  uint32_t value;
  uint16_t bits;
};
IRCode irCodes[20]; // Store up to 20 IR codes
int irCodeCount = 0;

// --- Sieć i serwisy ---
WebSocketsServer webSocket(81);
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 7200, 60000);

// --- Deklaracje funkcji ---
void broadcastStatus();
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
String getStatusJson();
void addLog(String message);
void saveSettingsToEEPROM();
void loadSettingsFromEEPROM();
void turnLedOn(unsigned long duration, String source);
void resetLedOnByPir(unsigned long duration);
void turnLedOff(String source);
void fetchWeatherData();
void IRAM_ATTR pirISR();
void reconnectWiFi();
void updateDuckDNS();
void updateSunriseSunset();
void sendLastLogsToClient(uint8_t num);
void handleIRCommand(String command);
void startLearningMode(String command);
void stopLearningMode();
void handleLearningTimeout();
void saveIRCode(String command, uint16_t type, uint32_t value, uint16_t bits);
void loadIRCodes();
void saveIRCodes();
int findIRCodeIndex(String command);

void setup() {
  Serial.begin(115200);
  delay(100);

  EEPROM.begin(EEPROM_SIZE);
  
  // Initialize IR
  irSend.begin();
  irRecv.enableIRIn();
  addLog("IR Transmitter and Receiver initialized");

  pinMode(LED_PIN, OUTPUT);
  analogWrite(LED_PIN, 0); 
  
  pinMode(PIR_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIR_PIN), pirISR, RISING);

  int initialLdr = analogRead(LDR_PIN);
  for (int i = 0; i < LDR_READINGS_COUNT; i++) ldrReadings[i] = initialLdr;
  ldrTotal = initialLdr * LDR_READINGS_COUNT;
  ldrValue = initialLdr;

  loadSettingsFromEEPROM();
  loadIRCodes();

  buttonState = digitalRead(BUTTON_PIN);
  lastButtonStateRaw = buttonState;

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 40) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    addLog("WiFi OK. IP: " + WiFi.localIP().toString());
  } else {
    addLog("WiFi ERR. Restarting...");
    delay(1000);
    ESP.restart();
  }

  timeClient.begin();
  addLog("Synchronizacja czasu NTP...");

  ArduinoOTA.setHostname("pilot-ir-remote");
  ArduinoOTA.setPassword(ota_password);
  ArduinoOTA.begin();
  addLog("OTA OK");

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  addLog("WebSocket API OK na porcie 81");

  lastDuckDNSTime = 0;
  
  addLog("Pilot IR Remote Controller Ready");
}

void loop() {
  ArduinoOTA.handle();
  webSocket.loop();

  // Handle IR Learning
  if (isLearningMode) {
    if (millis() - learningStartTime > IR_LEARNING_TIMEOUT) {
      handleLearningTimeout();
    } else if (irRecv.decode(&results)) {
      // IR signal received during learning
      String command = learningCommand;
      saveIRCode(command, results.decode_type, results.value, results.bits);
      
      // Send success message
      StaticJsonDocument<256> doc;
      doc["action"] = "learning_success";
      doc["command"] = command;
      doc["type"] = results.decode_type;
      doc["value"] = String(results.value, HEX);
      doc["bits"] = results.bits;
      String message;
      serializeJson(doc, message);
      webSocket.broadcastTXT(message);
      
      addLog("IR Code learned for: " + command);
      stopLearningMode();
      irRecv.resume();
    }
  } else {
    // Normal IR receiving (not in learning mode)
    if (irRecv.decode(&results)) {
      irRecv.resume();
    }
  }

  static unsigned long lastWeatherCheck = 0;
  if (millis() - lastWeatherCheck > WEATHER_UPDATE_INTERVAL || lastWeatherCheck == 0) {
    fetchWeatherData();
    lastWeatherCheck = millis();
  }

  static unsigned long lastSunriseSunsetUpdateTime = 0;
  if (!timeClient.isTimeSet() || millis() - lastSunriseSunsetUpdateTime >= 3600000UL) {
    updateSunriseSunset();
    lastSunriseSunsetUpdateTime = millis();
  }

  // LDR wygładzanie
  int rawLdrValue = analogRead(LDR_PIN);
  ldrTotal -= ldrReadings[ldrReadingsIndex];
  ldrReadings[ldrReadingsIndex] = rawLdrValue;
  ldrTotal += ldrReadings[ldrReadingsIndex];
  ldrReadingsIndex = (ldrReadingsIndex + 1) % LDR_READINGS_COUNT;
  int newSmoothedValue = ldrTotal / LDR_READINGS_COUNT;
  ldrValue = min(newSmoothedValue, 1023);
  if (millis() - lastLdrBroadcastTime > LDR_BROADCAST_INTERVAL) {
    lastLdrBroadcastTime = millis();
    broadcastStatus();
  }

  // Warunek, który musi być spełniony, aby PIR mógł włączyć światło (gdy jest zgaszone)
  bool pirCanTrigger = (controlMode == 0)
    ? isPirActiveByDaylight
    : (ldrValue >= ldrThresholdLow && ldrValue <= ldrThresholdHigh);

  // PIR handling
  if (pirInterruptFlag && millis() >= pirInhibitEndTime) {
    pirInterruptFlag = false;
    
    delay(50);
    if (digitalRead(PIR_PIN) == HIGH) {
      if (ledState && ledSource == "PIR") {
        resetLedOnByPir(PIR_AFTER_MOTION_DELAY);
      } else if (!ledState && pirCanTrigger) {
        turnLedOn(PIR_AFTER_MOTION_DELAY, "PIR");
      }
    }
  }

  if (ledState && ledOffTime != 0 && millis() >= ledOffTime) {
    turnLedOff("Automatyczne");
  }

  // Przycisk z debouncingiem
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonStateRaw) lastDebounceTime = millis();
  if ((millis() - lastDebounceTime) > 50) {
    if (reading != buttonState) {
      buttonState = reading;
      if (buttonState == LOW) {
        if (ledState) turnLedOff("Przycisk");
        else turnLedOn(BUTTON_ON_DURATION, "Przycisk");
      }
    }
  }
  lastButtonStateRaw = reading;

  static unsigned long lastWiFiCheck = 0;
  if (millis() - lastWiFiCheck > 10000) {
    lastWiFiCheck = millis();
    reconnectWiFi();
    updateDuckDNS();
  }
  delay(10);
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_DISCONNECTED) {
    Serial.printf("[%u] Odłączono!\n", num);
  } else if (type == WStype_CONNECTED) {
    IPAddress ip = webSocket.remoteIP(num);
    Serial.printf("[%u] Połączono z %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
    String statusJson = getStatusJson();
    webSocket.sendTXT(num, statusJson);
    sendLastLogsToClient(num);
  } else if (type == WStype_TEXT) {
    Serial.printf("[%u] Odebrano tekst: %s\n", num, payload);
    StaticJsonDocument<512> doc;
    deserializeJson(doc, payload);
    
    if (doc.containsKey("action")) {
        const char* action = doc["action"];

        if (strcmp(action, "toggle_www") == 0) {
          ledState ? turnLedOff("WWW") : turnLedOn(WWW_ON_DURATION, "WWW");
        }
        else if (strcmp(action, "send_ir_command") == 0) {
          String command = doc["command"];
          handleIRCommand(command);
        }
        else if (strcmp(action, "start_learning") == 0) {
          String command = doc["command"];
          startLearningMode(command);
        }
        else if (strcmp(action, "stop_learning") == 0) {
          stopLearningMode();
        }
        else if (strcmp(action, "reset_ldr") == 0) {
          ldrThresholdLow = LDR_DEFAULT_LOW;
          ldrThresholdHigh = LDR_DEFAULT_HIGH;
          addLog("LDR Reset do domyślnych.");
          saveSettingsToEEPROM();
        }
        else if (strcmp(action, "set_ldr_threshold_range") == 0) {
          ldrThresholdLow = doc["low"];
          ldrThresholdHigh = doc["high"];
          addLog("LDR prog: " + String(ldrThresholdLow) + "-" + String(ldrThresholdHigh));
          saveSettingsToEEPROM();
        }
        else if (strcmp(action, "set_control_mode") == 0) {
          int mode = doc["mode"];
          if (mode == 0 || mode == 1) {
            controlMode = mode;
            addLog(mode == 0 ? "TRYB: Słońce" : "TRYB: LDR");
            saveSettingsToEEPROM();
          }
        }
        else if (strcmp(action, "set_brightness") == 0) {
            if (doc.containsKey("value")) {
                ledBrightness = doc["value"];
                ledBrightness = max(50, min(1023, ledBrightness));
                if (ledState) {
                    analogWrite(LED_PIN, ledBrightness);
                }
                broadcastStatus();
            }
        }
    }
  }
}

void handleIRCommand(String command) {
  int index = findIRCodeIndex(command);
  if (index >= 0) {
    IRCode code = irCodes[index];
    irSend.send(code.type, code.value, code.bits);
    addLog("IR: " + command + " sent");
    
    // Send confirmation to client
    StaticJsonDocument<256> doc;
    doc["action"] = "ir_command_sent";
    doc["command"] = command;
    String message;
    serializeJson(doc, message);
    webSocket.broadcastTXT(message);
  } else {
    addLog("IR: Code not found for " + command);
  }
}

void startLearningMode(String command) {
  if (isLearningMode) {
    stopLearningMode();
  }
  
  isLearningMode = true;
  learningCommand = command;
  learningStartTime = millis();
  
  addLog("IR Learning started for: " + command);
  
  // Send learning started message
  StaticJsonDocument<256> doc;
  doc["action"] = "learning_started";
  doc["command"] = command;
  String message;
  serializeJson(doc, message);
  webSocket.broadcastTXT(message);
}

void stopLearningMode() {
  if (!isLearningMode) return;
  
  isLearningMode = false;
  learningCommand = "";
  learningStartTime = 0;
  
  addLog("IR Learning stopped");
}

void handleLearningTimeout() {
  stopLearningMode();
  
  StaticJsonDocument<256> doc;
  doc["action"] = "learning_timeout";
  String message;
  serializeJson(doc, message);
  webSocket.broadcastTXT(message);
  
  addLog("IR Learning timeout");
}

void saveIRCode(String command, uint16_t type, uint32_t value, uint16_t bits) {
  int index = findIRCodeIndex(command);
  if (index == -1) {
    // Add new code
    if (irCodeCount < 20) {
      index = irCodeCount;
      irCodeCount++;
    } else {
      addLog("IR: Code storage full!");
      return;
    }
  }
  
  irCodes[index].command = command;
  irCodes[index].type = type;
  irCodes[index].value = value;
  irCodes[index].bits = bits;
  
  saveIRCodes();
  addLog("IR: Code saved for " + command);
}

int findIRCodeIndex(String command) {
  for (int i = 0; i < irCodeCount; i++) {
    if (irCodes[i].command == command) {
      return i;
    }
  }
  return -1;
}

void loadIRCodes() {
  // Load IR codes from EEPROM
  int addr = EEPROM_IR_CODES_ADDR;
  EEPROM.get(addr, irCodeCount);
  addr += sizeof(int);
  
  if (irCodeCount > 20) irCodeCount = 0; // Sanity check
  
  for (int i = 0; i < irCodeCount; i++) {
    int cmdLen;
    EEPROM.get(addr, cmdLen);
    addr += sizeof(int);
    
    char cmdBuffer[50];
    for (int j = 0; j < cmdLen && j < 49; j++) {
      cmdBuffer[j] = EEPROM.read(addr + j);
    }
    cmdBuffer[cmdLen] = '\0';
    addr += cmdLen;
    
    irCodes[i].command = String(cmdBuffer);
    EEPROM.get(addr, irCodes[i].type);
    addr += sizeof(uint16_t);
    EEPROM.get(addr, irCodes[i].value);
    addr += sizeof(uint32_t);
    EEPROM.get(addr, irCodes[i].bits);
    addr += sizeof(uint16_t);
  }
  
  addLog("IR: Loaded " + String(irCodeCount) + " codes from EEPROM");
}

void saveIRCodes() {
  // Save IR codes to EEPROM
  int addr = EEPROM_IR_CODES_ADDR;
  EEPROM.put(addr, irCodeCount);
  addr += sizeof(int);
  
  for (int i = 0; i < irCodeCount; i++) {
    int cmdLen = irCodes[i].command.length();
    EEPROM.put(addr, cmdLen);
    addr += sizeof(int);
    
    for (int j = 0; j < cmdLen; j++) {
      EEPROM.write(addr + j, irCodes[i].command.charAt(j));
    }
    addr += cmdLen;
    
    EEPROM.put(addr, irCodes[i].type);
    addr += sizeof(uint16_t);
    EEPROM.put(addr, irCodes[i].value);
    addr += sizeof(uint32_t);
    EEPROM.put(addr, irCodes[i].bits);
    addr += sizeof(uint16_t);
  }
  
  EEPROM.commit();
  addLog("IR: Saved " + String(irCodeCount) + " codes to EEPROM");
}

// Rest of the functions remain the same as in the original code...
// (broadcastStatus, getStatusJson, addLog, saveSettingsToEEPROM, etc.)

void broadcastStatus() {
  String statusJson = getStatusJson();
  webSocket.broadcastTXT(statusJson);
}

String getStatusJson() {
  StaticJsonDocument<3072> doc;
  doc["ledState"] = ledState;
  doc["ledSource"] = ledSource;
  long timeRemainingSeconds = 0;
  if (ledState && ledOffTime != 0 && ledOffTime > millis()) {
    timeRemainingSeconds = (ledOffTime - millis() + 500) / 1000;
  }
  doc["timeRemaining"] = timeRemainingSeconds;
  doc["sunriseTime"] = sunriseTimeStr;
  doc["sunsetTime"] = sunsetTimeStr;
  doc["ldrValue"] = ldrValue;
  doc["ldrThresholdLow"] = ldrThresholdLow;
  doc["ldrThresholdHigh"] = ldrThresholdHigh;
  doc["controlMode"] = controlMode;
  bool currentPirActivationStatus = (controlMode == 0) ? isPirActiveByDaylight : (ldrValue >= ldrThresholdLow && ldrValue <= ldrThresholdHigh);
  doc["isPirActive"] = currentPirActivationStatus;
  doc["temperature"] = currentTemperature;
  doc["weatherId"] = weatherId;
  doc["weatherDescription"] = weatherDescription;
  doc["locationName"] = currentCityName;
  doc["maxBrightness"] = ledBrightness;
  doc["learningMode"] = isLearningMode;
  doc["learningCommand"] = learningCommand;
  doc["irCodeCount"] = irCodeCount;
  JsonArray logArray = doc.createNestedArray("logs");
  for (int i = 0; i < logCount; i++) logArray.add(logs[i]);
  String output;
  serializeJson(doc, output);
  return output;
}

void addLog(String message) {
  if (logCount < MAX_LOG_ENTRIES) {
    for (int i = logCount; i > 0; i--) logs[i] = logs[i - 1];
    logCount++;
  } else {
    for (int i = MAX_LOG_ENTRIES - 1; i > 0; i--) logs[i] = logs[i - 1];
  }

  char finalLogBuffer[256];
  
  if (timeClient.isTimeSet()) {
    time_t epoch = timeClient.getEpochTime();
    struct tm* t = localtime(&epoch);
    char timeBuffer[22];
    sprintf(timeBuffer, "[%04d-%02d-%02d %02d:%02d:%02d] ", t->tm_year + 1900, t->tm_mon + 1, t->tm_mday, t->tm_hour, t->tm_min, t->tm_sec);
    snprintf(finalLogBuffer, sizeof(finalLogBuffer), "%s%s", timeBuffer, message.c_str());
  } else {
    snprintf(finalLogBuffer, sizeof(finalLogBuffer), "[Brak Czasu] %s", message.c_str());
  }
  
  logs[0] = String(finalLogBuffer);
  Serial.println(logs[0]);

  StaticJsonDocument<256> logDoc;
  logDoc["action"] = "new_log";
  logDoc["message"] = logs[0];
  String logMsg;
  serializeJson(logDoc, logMsg);
  webSocket.broadcastTXT(logMsg);
}

void saveSettingsToEEPROM() {
  EEPROM.put(EEPROM_MAGIC_ADDR, (uint16_t)EEPROM_MAGIC_VALUE);
  EEPROM.put(EEPROM_LDR_LOW_ADDR, ldrThresholdLow);
  EEPROM.put(EEPROM_LDR_HIGH_ADDR, ldrThresholdHigh);
  EEPROM.put(EEPROM_MODE_ADDR, controlMode);
  if (EEPROM.commit()) addLog("Zapisano ustawienia w EEPROM.");
  else addLog("Błąd zapisu do EEPROM!");
  broadcastStatus();
}

void loadSettingsFromEEPROM() {
  uint16_t magicValue;
  EEPROM.get(EEPROM_MAGIC_ADDR, magicValue);
  if (magicValue == EEPROM_MAGIC_VALUE) {
    addLog("Odczytano ustawienia z EEPROM.");
    EEPROM.get(EEPROM_LDR_LOW_ADDR, ldrThresholdLow);
    EEPROM.get(EEPROM_LDR_HIGH_ADDR, ldrThresholdHigh);
    EEPROM.get(EEPROM_MODE_ADDR, controlMode);
  } else {
    addLog("EEPROM pusty. Zapisywanie domyślnych.");
    ldrThresholdLow = LDR_DEFAULT_LOW;
    ldrThresholdHigh = LDR_DEFAULT_HIGH;
    controlMode = CONTROL_MODE_DEFAULT;
    saveSettingsToEEPROM();
  }
}

void turnLedOn(unsigned long duration, String source) {
  if (ledState) return;
  
  ledState = true;
  ledOffTime = millis() + duration;
  ledSource = source;

  for (int i = 0; i <= ledBrightness; i++) {
    analogWrite(LED_PIN, i);
    delay(2);
  }
  
  addLog(source + " ON");
  broadcastStatus();
}

void resetLedOnByPir(unsigned long duration) {
  if (ledState && ledSource == "PIR") {
    ledOffTime = millis() + duration;
    addLog("PIR: Reset czasu świecenia");
    broadcastStatus();
  }
}

void turnLedOff(String source) {
  if (!ledState) return;

  for (int i = ledBrightness; i >= 0; i--) {
    analogWrite(LED_PIN, i);
    delay(2);
  }
  
  digitalWrite(LED_PIN, LOW);

  ledState = false;
  ledOffTime = 0;
  addLog(source + " OFF");
  if (source == "Przycisk" || source == "WWW") {
    pirInhibitEndTime = millis() + PIR_INHIBIT_DURATION;
  }
  broadcastStatus();
}

void fetchWeatherData() {
  detachInterrupt(digitalPinToInterrupt(PIR_PIN));
  WiFiClient client;
  HTTPClient http;
  String url = "http://api.openweathermap.org/data/2.5/weather?zip=";
  url += weather_location_query;
  url += "&appid=";
  url += weather_api_key;
  url += "&units=metric&lang=pl";
  if(http.begin(client, url)) {
    addLog("Pobieram pogodę dla Twojej lokalizacji...");
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      DynamicJsonDocument doc(2048);
      deserializeJson(doc, payload);
      currentTemperature = doc["main"]["temp"];
      weatherId = doc["weather"][0]["id"];
      weatherDescription = doc["weather"][0]["description"].as<String>();
      currentCityName = doc["name"].as<String>();
      addLog("Pogoda OK: " + currentCityName + ", " + String(currentTemperature, 1) + "C, " + weatherDescription);
    } else {
      addLog("Błąd pogody, HTTP: " + String(httpCode));
      currentCityName = "Błąd Lokalizacji";
    }
    http.end();
  } else {
    addLog("Błąd połączenia z serwerem pogody.");
  }
  attachInterrupt(digitalPinToInterrupt(PIR_PIN), pirISR, RISING);
  broadcastStatus();
}

void IRAM_ATTR pirISR() {
  unsigned long now = millis();
  if (now - pirLastInterruptTime > PIR_DEBOUNCE_MS) {
    pirInterruptFlag = true;
    pirLastInterruptTime = now;
  }
}

void reconnectWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    addLog("WiFi reconnect...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
  }
}

void updateDuckDNS() {
  if (millis() - lastDuckDNSTime >= DUCKDNS_UPDATE_INTERVAL || lastDuckDNSTime == 0) {
    detachInterrupt(digitalPinToInterrupt(PIR_PIN));
    addLog("DuckDNS update...");
    WiFiClient client;
    HTTPClient http;
    String url = "http://www.duckdns.org/update?domains=";
    url += duckdns_domain;
    url += "&token=";
    url += duckdns_token;
    url += "&ip=";
    http.begin(client, url);
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      if (payload.indexOf("OK") != -1) addLog("DuckDNS OK");
      else addLog("DuckDNS ERR: " + payload);
    } else {
      addLog("DuckDNS ERR: HTTP " + String(httpCode));
    }
    http.end();
    lastDuckDNSTime = millis();
    attachInterrupt(digitalPinToInterrupt(PIR_PIN), pirISR, RISING);
  }
}

void updateSunriseSunset() {
  detachInterrupt(digitalPinToInterrupt(PIR_PIN));
  timeClient.update();
  if (!timeClient.isTimeSet()) {
    addLog("Nie można obliczyć wschodu/zachodu - brak czasu NTP.");
    sunriseTimeStr = "Brak NTP";
    sunsetTimeStr = "Brak NTP";
    isPirActiveByDaylight = false;
    attachInterrupt(digitalPinToInterrupt(PIR_PIN), pirISR, RISING);
    return;
  }

  static time_t lastCalcDay = 0;
  time_t nowEpoch = timeClient.getEpochTime();
  if (gmtime(&nowEpoch)->tm_yday != lastCalcDay || sunriseTimeStr == "N/A" || sunriseTimeStr == "Brak NTP") {
    SunPosition currentSun(LATITUDE, LONGITUDE, nowEpoch, GMT_OFFSET_HOURS * 60);
    double sunriseMinutesLocal = currentSun.sunrise();
    double sunsetMinutesLocal = currentSun.sunset();

    if (!isnan(sunriseMinutesLocal) && !isnan(sunsetMinutesLocal)) {
      int sr_h = floor(sunriseMinutesLocal / 60.0);
      int sr_m = round(fmod(sunriseMinutesLocal, 60.0));
      int ss_h = floor(sunsetMinutesLocal / 60.0);
      int ss_m = round(fmod(sunsetMinutesLocal, 60.0));
      char buffer[6];
      sprintf(buffer, "%02d:%02d", sr_h, sr_m);
      sunriseTimeStr = String(buffer);
      sprintf(buffer, "%02d:%02d", ss_h, ss_m);
      sunsetTimeStr = String(buffer);
      addLog("Słońce: W:" + sunriseTimeStr + ", Z:" + sunsetTimeStr);
    } else {
      sunriseTimeStr = "Błąd Oblicz.";
      sunsetTimeStr = "Błąd Oblicz.";
    }
    lastCalcDay = gmtime(&nowEpoch)->tm_yday;
  }

  long currentDaySeconds = timeClient.getHours() * 3600L + timeClient.getMinutes() * 60L;
  SunPosition currentSunNow(LATITUDE, LONGITUDE, nowEpoch, GMT_OFFSET_HOURS * 60);
  long sunriseSecLocal = (long)(currentSunNow.sunrise() * 60);
  long sunsetSecLocal = (long)(currentSunNow.sunset() * 60);
  long startPirActiveSec = sunsetSecLocal - 1800L;
  long endPirActiveSec = sunriseSecLocal + 1800L;
  if (startPirActiveSec < endPirActiveSec) {
    isPirActiveByDaylight = (currentDaySeconds >= startPirActiveSec && currentDaySeconds < endPirActiveSec);
  } else {
    isPirActiveByDaylight = (currentDaySeconds >= startPirActiveSec || currentDaySeconds < endPirActiveSec);
  }
  attachInterrupt(digitalPinToInterrupt(PIR_PIN), pirISR, RISING);
  broadcastStatus();
}

void sendLastLogsToClient(uint8_t num) {
  StaticJsonDocument<2048> doc;
  doc["action"] = "init_logs";
  JsonArray logArray = doc.createNestedArray("logs");
  for (int i = 0; i < logCount; i++) logArray.add(logs[i]);
  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(num, out);
}