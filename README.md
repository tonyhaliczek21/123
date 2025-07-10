# Pilot - Professional IR Remote Control PWA

A modern Progressive Web Application for controlling room lighting via IR signals sent by an ESP32 controller. Features a beautiful, responsive interface with smurf blue theming and Comic Sans-like typography.

![RGB LED Remote](https://github.com/user-attachments/assets/5dcd504f-0ade-4ec4-a182-bf7c4b00f4da)

## Features

### 🎨 Two Main Remote Interfaces

#### 1. RGB LED Remote Control (Behind TV Lighting)
- **Power Controls**: ON/OFF buttons with smooth animations
- **Color Selection**: 12-color grid with vibrant color options
- **Brightness Controls**: Increase/decrease brightness
- **Animation & Effects**: Flash, Strobe, Fade, and Smooth transitions

![Ceiling Light Remote](https://github.com/user-attachments/assets/7702c334-69e4-4857-b6fb-2f611a86a0bd)

#### 2. Ceiling Light Remote (Main Room Lighting)
- **Power Controls**: ON/OFF functionality
- **Brightness Controls**: Adjustable brightness levels
- **Color Temperature**: CCT+/CCT- controls for warm/cool lighting
- **Special Functions**: Night Light mode, Memory presets, and Delay timer

### 🎓 Learning Mode
![Learning Mode](https://github.com/user-attachments/assets/e02bd1c0-a3b9-44cd-a24a-01644087b2b6)

- **Interactive Learning**: 30-second timeout with visual countdown
- **Button Selection**: Choose any remote button to learn
- **Visual Feedback**: Animated progress circle and status updates
- **Success/Error Messages**: Clear feedback for learning results

### ⚙️ Settings & Configuration
![Settings](https://github.com/user-attachments/assets/634301b2-6a35-4fb4-9df5-1914820ed756)

- **Connection Status**: Real-time WebSocket connection monitoring
- **Device Information**: ESP32 controller details and capabilities
- **IR Code Management**: Save, load, reset, and export IR codes
- **Local Storage**: Persistent IR code storage in browser

### 📱 Mobile Responsive Design
![Mobile View](https://github.com/user-attachments/assets/88bc6273-5ea4-452e-be9c-81d2f37d7a3d)

- **Responsive Layout**: Optimized for all screen sizes
- **Touch-Friendly**: Large buttons perfect for mobile interaction
- **Adaptive Navigation**: Tab layout adjusts to mobile constraints

## Technical Specifications

### Frontend (PWA)
- **HTML5**: Semantic markup with accessibility features
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **JavaScript ES6+**: Modular architecture with WebSocket communication
- **Service Worker**: Offline capability and caching
- **Web App Manifest**: Full PWA compliance

### Backend (ESP32)
- **Platform**: ESP8266/ESP32 microcontroller
- **Connectivity**: WiFi with WebSocket server
- **IR Communication**: IRremoteESP8266 library for send/receive
- **Storage**: EEPROM for persistent IR code storage
- **Additional Features**: Weather data, NTP sync, OTA updates

### Key Technologies
- **WebSocket**: Real-time bidirectional communication
- **Progressive Web App**: Installable with offline support
- **IR Learning**: 30-second timeout with automatic code detection
- **Local Storage**: Browser-based IR code persistence
- **Responsive Design**: Mobile-first approach

## Installation & Setup

### 1. ESP32 Controller Setup
1. Install the Arduino IDE with ESP32 support
2. Install required libraries:
   - `IRremoteESP8266`
   - `ArduinoJson`
   - `WebSocketsServer`
   - `SunPosition`
3. Upload `esp32_ir_controller.ino` to your ESP32
4. Connect IR LED to pin D4 and IR receiver to pin D5

### 2. PWA Deployment
1. Copy all files to your web server
2. Ensure HTTPS is enabled for full PWA functionality
3. Access the app via web browser
4. Install as PWA using browser's "Add to Home Screen" option

### 3. Configuration
1. Update WiFi credentials in the ESP32 code
2. Modify WebSocket URL in `app.js` if needed
3. Configure IR pins according to your hardware setup

## Usage Guide

### Learning IR Commands
1. Navigate to the **Learning** tab
2. Select the button you want to learn
3. Point your original remote at the ESP32 IR receiver
4. Press the corresponding button on your original remote within 30 seconds
5. Confirmation message will appear when learning is successful

### Sending IR Commands
1. Switch to **RGB LED** or **Ceiling Light** tab
2. Tap any button to send the corresponding IR command
3. Visual feedback confirms command transmission
4. Ensure the target device is within IR range

### Managing IR Codes
1. Go to **Settings** tab
2. Use **Save All Codes** to backup to local storage
3. **Export Codes** downloads a JSON file
4. **Load Codes** imports from a JSON file
5. **Reset All Codes** clears all learned commands

## Architecture

### Communication Flow
```
PWA Interface → WebSocket → ESP32 → IR Signal → Target Device
```

### Data Structure
```javascript
{
  action: "send_ir_command",
  command: "rgb_power_on",
  code: {
    type: "NEC",
    value: "0xFF629D",
    bits: 32
  }
}
```

### Learning Process
```
User Selects Button → ESP32 Enters Learning Mode → 
IR Signal Detected → Code Stored → Confirmation Sent
```

## Color Scheme

- **Primary Color**: Smurf Blue (`#1e90ff`)
- **Background**: Dark Theme (`#0D1117`)
- **Cards**: Dark Gray (`#161B22`)
- **Typography**: Comic Neue (Comic Sans-like)
- **Accent Colors**: 
  - Power: Red (`#ff4757`)
  - Brightness: Orange (`#ffa502`)
  - Effects: Blue (`#3742fa`)
  - Temperature: Light Blue (`#70a1ff`)
  - Special: Purple (`#5f27cd`)

## Browser Support

- **Chrome/Edge**: Full PWA support
- **Firefox**: Full functionality, limited PWA features
- **Safari**: iOS 11.3+ for PWA support
- **Mobile Browsers**: Optimized for all major mobile browsers

## Hardware Requirements

### ESP32 Setup
- ESP32 or ESP8266 development board
- IR LED (940nm) with appropriate resistor
- IR receiver module (38kHz)
- Optional: LED for status indication
- Power supply (USB or external)

### Connection Diagram
```
ESP32 Pin D4 → IR LED (+ resistor)
ESP32 Pin D5 → IR Receiver Signal Pin
ESP32 GND → IR Receiver GND
ESP32 3.3V → IR Receiver VCC
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Test thoroughly on both desktop and mobile
5. Submit a pull request with detailed description

## License

This project is open source and available under the MIT License.

## Support

For issues and questions:
1. Check the GitHub Issues section
2. Verify hardware connections
3. Ensure WebSocket connectivity
4. Test with known working IR remote first

---

**Pilot IR Remote Control** - Making smart home control beautiful and accessible! 🏠✨