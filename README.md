# homebridge-ergomotion-bed

Homebridge plugin for **Ergomotion** smart beds via Bluetooth LE.

> ⚠️ **Beta version.** The plugin is under active development. Some features may be unstable. Feedback and bug reports are welcome.

## Supported Features

- **Head** — position control (0–100%)
- **Foot** — position control (0–100%)
- **Head Massage** — on/off
- **Foot Massage** — on/off
- **LED Light** — on/off (toggle)
- **Zero G** — preset
- **Flat** — preset
- **Lounge** — preset
- **TV** — preset

## Dependencies

The plugin requires **Node.js 18+** and **Homebridge 1.3+**.

**System dependencies (Raspberry Pi OS / Debian):**

```bash
sudo apt-get update
sudo apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev libcap2-bin
 
npm dependencies (installed automatically):
• @stoprocent/noble — BLE library 
Installation
 
Via Homebridge UI (recommended)
1. Open Homebridge UI
2. Go to Plugins
3. Search for homebridge-ergomotion-bed
4. Click Install 
Via npm
npm install -g homebridge-ergomotion-bed
 
Bluetooth permissions
 
After installation, grant Node.js permissions for Bluetooth:
sudo setcap cap_net_raw+eip $(eval readlink -f $(which node))
 
HCI reset permission
 
Raspberry Pi has a known BlueZ bug. The plugin resets HCI before connecting. Allow the homebridge user to run hciconfig without a password:
echo "homebridge ALL=(ALL) NOPASSWD: /usr/bin/hciconfig" | sudo tee /etc/sudoers.d/hciconfig
sudo chmod 0440 /etc/sudoers.d/hciconfig
 
How the plugin finds the bed
 
The plugin searches for the bed by MAC address specified in config.json. The MAC address is a unique BLE device identifier that does not change.
 
Search logic:
1. The plugin starts scanning the BLE air.
2. For each discovered device, it checks the MAC address.
3. If the MAC matches the one in config.json, the plugin connects to the bed.
4. The device name (Ergo, base-i5, etc.) does not matter — the plugin relies only on the MAC. 
Benefits of MAC-based search:
• The bed is found always, as soon as it appears in the air.
• No false triggers on other BLE devices.
• The bed name can change — this does not affect the search. 
How to find the bed's MAC address
1. Install nRF Connect (Android/iOS) on your phone
2. Start scanning
3. Find the device named Ergo (or base-i5)
4. Copy the MAC address (e.g. D4:48:D7:7A:EA:F4) 
Configuration
 
Add to config.json:
{
  "platforms": [
    {
      "platform": "AskonaBed",
      "name": "Ergomotion Bed",
      "macAddress": "D4:48:D7:7A:EA:F4",
      "debug": false
    }
  ]
}
 
Parameters
Parameter Description Required
platform Always AskonaBed Yes
name Display name in HomeKit Yes
macAddress Bed MAC address Yes
debug Enable verbose logging (for troubleshooting) No

 
Testing
 
The plugin was tested on the following configuration:
• Host: Raspberry Pi 3
• Bed: Ergomotion with base-i5 module
• Controller: Keeson MC120PR‌💡 Note: The base-i5 module is an updated protocol version that is not supported by the original AlexxIT/Ergomotion integration (it only searches for base-i4). The commands for base-i5 were determined experimentally and may differ from other models. 
Important notes
 
Wi-Fi and Bluetooth conflict on Raspberry Pi
 
On Raspberry Pi, the built-in Wi-Fi and Bluetooth share one chip and one antenna on the 2.4 GHz band. This causes conflicts and BLE connection drops.
 
Solution:
1. Disable the built-in Wi-Fi (wlan0):
sudo ip link set wlan0 down
2. Use Ethernet or a USB Wi-Fi adapter for internet.
3. Configure a static IP for the USB adapter. 
On-demand connection
 
The plugin does not hold the connection permanently. It connects only before sending a command and disconnects after 2 minutes of inactivity. This is because the bed is not designed for long-term BLE connection retention.
 
Known limitations
• The bed supports only one BLE connection. While the plugin is connected, the official Ergomotion Sync app will not work.
• Connection takes 2–5 seconds.
• Positions are virtual. The bed has no physical position sensors — it calculates them from motor run time. Values may drift over time.
• Compatibility. The plugin was tested on the Keeson MC120PR controller. On other models, commands may differ. 
Troubleshooting
 
Bed not found
• Make sure the bed is on and near the Raspberry Pi.
• Verify that the MAC address in config.json matches the real one.
• Make sure the bed is not connected to the phone. 
Connection drops
• Disable the built-in Wi-Fi (wlan0).
• Use a USB Bluetooth adapter instead of the built-in one. 
Commands don't work
• Check the Homebridge log: sudo journalctl -u homebridge -f.
• Enable debug in the plugin settings for verbose logging.
• Submit the log as a GitHub issue. 
Credits
• AlexxIT — for the Ergomotion project, from which the commands and bed control logic were adapted.
• stoprocent — for the noble library, which provides stable BLE connectivity on Raspberry Pi.
• Homebridge — for the platform for integrating devices into HomeKit.
• The Homebridge community — for help and support. 
License
 
MIT
 
Author
 
staskop
 
Links
• GitHub Repository
• GitHub Issues
• Homebridge
• AlexxIT/Ergomotion
