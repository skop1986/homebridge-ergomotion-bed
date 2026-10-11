# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.1] - 2026-10-11

### Added
- `config.schema.json` — settings form in Homebridge UI
- `LICENSE` — MIT license file
- `CHANGELOG.md` — version history
- `repository`, `bugs`, `homepage` fields in `package.json`
- `peerDependencies` for Homebridge
- `debug` option for verbose logging
- `connection` sensor
- State persistence in `accessory.context`
- Error handling for `writeAsync` with auto-reconnect

### Fixed
- README encoding (UTF-8)
- Plugin folder name: `homebridge-askona-bed` → `homebridge-ergomotion-bed`
- Plugin registration name in `platform.ts`

## [1.0.0] - 2026-10-11

### Added
- First public release
- Support for Ergomotion smart beds with `base-i5` module
- Head and foot position control (0–100%)
- Head and foot massage (on/off)
- LED light (toggle)
- Presets: Zero G, Flat, Lounge, TV
- MAC-based bed discovery
- On-demand connection with 2-minute idle timeout
- Bed notification handling

### Known limitations
- Beta version
- Tested only on Raspberry Pi 3 + `base-i5` module
- The bed supports only one BLE connection
