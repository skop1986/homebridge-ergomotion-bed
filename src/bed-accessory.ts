import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Peripheral, Characteristic as NobleCharacteristic } from '@stoprocent/noble';
import { AskonaBedPlatform } from './platform';

const CHAR_WRITE_UUID  = '0000ffe9-0000-1000-8000-00805f9b34fb';
const CHAR_NOTIFY_UUID = '0000ffe4-0000-1000-8000-00805f9b34fb';

const CMD_INIT = Buffer.from('E780017E090A0E2C15B7', 'hex');
const CMD_PING = Buffer.from('E5FE160000000006', 'hex');
const CMD_STOP = Buffer.from('E5FE160000000006', 'hex');
const CMD_HEAD_UP   = Buffer.from('E5FE160100000005', 'hex');
const CMD_HEAD_DOWN = Buffer.from('E5FE160200000004', 'hex');
const CMD_FEET_UP   = Buffer.from('E5FE160400000002', 'hex');
const CMD_FEET_DOWN = Buffer.from('E5FE1608000000FE', 'hex');
const CMD_MASSAGE_HEAD     = Buffer.from('E5FE1600080000FE', 'hex');
const CMD_MASSAGE_HEAD_OFF = Buffer.from('E5FE160000800086', 'hex');
const CMD_MASSAGE_FOOT     = Buffer.from('E5FE160004000002', 'hex');
const CMD_MASSAGE_FOOT_OFF = Buffer.from('E5FE160000000105', 'hex');
const CMD_LIGHT_TOGGLE = Buffer.from('E5FE160002000003', 'hex');
const CMD_ZERO_G = Buffer.from('E5FE1600100000F6', 'hex');
const CMD_FLAT   = Buffer.from('E5FE1600000008FE', 'hex');
const CMD_LOUNGE = Buffer.from('E5FE1600200000E6', 'hex');
const CMD_TV     = Buffer.from('E5FE1600400000C6', 'hex');

// Idle timeout: 2 minutes
const IDLE_TIMEOUT_MS = 120000;
// Ping every 100 seconds (updates timeout)
const PING_INTERVAL_MS = 100000;

export class AskonaBedAccessory {
  private headService: Service;
  private footService: Service;
  private headMassageService: Service;
  private footMassageService: Service;
  private lightService: Service;
  private zeroGService: Service;
  private flatService: Service;
  private loungeService: Service;
  private tvService: Service;
  private connectionService: Service;

  private peripheral: Peripheral;
  private writeChar: NobleCharacteristic | undefined;
  private notifyChar: NobleCharacteristic | undefined;

  private currentHeadPosition = 0;
  private currentFootPosition = 0;
  private isConnected = false;
  private maxHeadRaw = 100;
  private maxFootRaw = 100;

  private idleTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly platform: AskonaBedPlatform,
    private readonly accessory: PlatformAccessory,
    peripheral: Peripheral,
  ) {
    this.platform.log.info('=== AskonaBedAccessory constructor ===');
    this.peripheral = peripheral;

    this.currentHeadPosition = this.accessory.context.currentHeadPosition || 0;
    this.currentFootPosition = this.accessory.context.currentFootPosition || 0;
    this.maxHeadRaw = this.accessory.context.maxHeadRaw || 100;
    this.maxFootRaw = this.accessory.context.maxFootRaw || 100;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Askona')
      .setCharacteristic(this.platform.Characteristic.Model, 'base-i5')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, peripheral.address);

    this.headService = this.findOrAdd('WindowCovering', 'LED Light', 'head');
    this.headService.getCharacteristic(this.platform.Characteristic.CurrentPosition).onGet(() => this.currentHeadPosition);
    this.headService.getCharacteristic(this.platform.Characteristic.TargetPosition).onSet(this.setHeadPosition.bind(this));

    this.footService = this.findOrAdd('WindowCovering', 'Foot', 'foot');
    this.footService.getCharacteristic(this.platform.Characteristic.CurrentPosition).onGet(() => this.currentFootPosition);
    this.footService.getCharacteristic(this.platform.Characteristic.TargetPosition).onSet(this.setFootPosition.bind(this));

    this.headMassageService = this.findOrAdd('Fan', 'Head Massage', 'head_massage');
    this.headMassageService.getCharacteristic(this.platform.Characteristic.On).onSet(this.setHeadMassageOn.bind(this));

    this.footMassageService = this.findOrAdd('Fan', 'Foot Massage', 'foot_massage');
    this.footMassageService.getCharacteristic(this.platform.Characteristic.On).onSet(this.setFootMassageOn.bind(this));

    this.lightService = this.findOrAdd('Switch', 'LED Light', 'light');
    this.lightService.getCharacteristic(this.platform.Characteristic.On).onSet(this.setLight.bind(this));

    this.zeroGService = this.findOrAdd('Switch', 'Zero G', 'zerog');
    this.zeroGService.getCharacteristic(this.platform.Characteristic.On).onSet(this.setZeroG.bind(this));

    this.flatService = this.findOrAdd('Switch', 'Flat', 'flat');
    this.flatService.getCharacteristic(this.platform.Characteristic.On).onSet(this.setFlat.bind(this));

    this.loungeService = this.findOrAdd('Switch', 'Lounge', 'lounge');
    this.loungeService.getCharacteristic(this.platform.Characteristic.On).onSet(this.setLounge.bind(this));

    this.tvService = this.findOrAdd('Switch', 'TV', 'tv');
    this.tvService.getCharacteristic(this.platform.Characteristic.On).onSet(this.setTV.bind(this));

    this.connectionService = this.findOrAdd('ContactSensor', 'Connection', 'connection');
    this.connectionService.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(() => this.isConnected
        ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
        : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);

    this.connectAndPrepare();
  }

  private findOrAdd(type: string, name: string, subtype: string): Service {
    const serviceType = (this.platform.Service as any)[type];
    let service = this.accessory.services.find(
      s => s.UUID === serviceType.UUID && s.subtype === subtype
    );
    if (!service) {
      service = this.accessory.addService(serviceType, name, subtype);
    }
    return service;
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.platform.log.info('Idle 2 minutes - disconnecting.');
      this.disconnect();
    }, IDLE_TIMEOUT_MS);
  }

  private async disconnect() {
    if (!this.isConnected) return;
    try {
      if (this.notifyChar) {
        await this.notifyChar.unsubscribeAsync();
      }
      await this.peripheral.disconnectAsync();
      this.platform.log.info('Disconnected.');
    } catch (e) {
      this.platform.log.warn('Disconnect error:', e);
    } finally {
      this.isConnected = false;
      this.writeChar = undefined;
      this.notifyChar = undefined;
      if (this.connectionService) {
        this.connectionService.updateCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        );
      }
    }
  }

  private async connectAndPrepare(): Promise<boolean> {
    if (this.isConnected && this.writeChar) {
      this.resetIdleTimer();
      return true;
    }

    try {
      this.platform.log.info('Connecting to ' + this.peripheral.address + '...');

      if (this.peripheral.state === 'connected') {
        await this.peripheral.disconnectAsync();
        await this.delay(500);
      }

      await this.peripheral.connectAsync();
      this.platform.log.info('Connected.');
      await this.delay(1000);

      await this.peripheral.discoverServicesAsync();
      const services = this.peripheral.services || [];
      const characteristics: NobleCharacteristic[] = [];
      for (const s of services) {
        await s.discoverCharacteristicsAsync();
        if (s.characteristics) characteristics.push(...s.characteristics);
      }
      this.platform.log.info('Found services: ' + services.length + ', characteristics: ' + characteristics.length);

      this.writeChar = characteristics.find(c =>
        c.uuid === CHAR_WRITE_UUID || c.uuid === CHAR_WRITE_UUID.replace(/-/g, '') || c.uuid === 'ffe9'
      );
      this.notifyChar = characteristics.find(c =>
        c.uuid === CHAR_NOTIFY_UUID || c.uuid === CHAR_NOTIFY_UUID.replace(/-/g, '') || c.uuid === 'ffe4'
      );

      if (!this.writeChar) {
        this.platform.log.error('Write characteristic not found!');
        return false;
      }

      if (this.notifyChar) {
        await this.notifyChar.subscribeAsync();
        this.notifyChar.on('data', (data: Buffer) => {
          const hex = data.toString('hex');
          this.platform.log.info('Notification: ' + hex);
          this.parseNotification(hex);
        });
      }

      this.isConnected = true;
      this.connectionService.updateCharacteristic(
        this.platform.Characteristic.ContactSensorState,
        this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      );
      await this.writeChar.writeAsync(CMD_INIT, false);
      await this.delay(500);
      await this.writeChar.writeAsync(CMD_PING, false);

      this.resetIdleTimer();
      this.platform.log.info('BLE connected and initialized.');
      return true;
    } catch (e) {
      this.platform.log.error('BLE connection error:', e);
      this.isConnected = false;
      return false;
    }
  }

  private parseNotification(hex: string) {
    if (!hex.startsWith('f1fe16') || hex.length < 14) return;
    try {
      const headHex = hex.substring(6, 10);
      const headBytes = headHex.match(/../g)!;
      this.currentHeadPosition = parseInt(headBytes[1] + headBytes[0], 16);

      const footHex = hex.substring(10, 14);
      const footBytes = footHex.match(/../g)!;
      this.currentFootPosition = parseInt(footBytes[1] + footBytes[0], 16);

      this.accessory.context.currentHeadPosition = this.currentHeadPosition;
      this.accessory.context.currentFootPosition = this.currentFootPosition;
    } catch (e) {
      // ignore
    }
  }

  private async send(cmd: Buffer) {
    const ok = await this.connectAndPrepare();
    if (!ok || !this.writeChar) return;
    try {
      await this.writeChar.writeAsync(cmd, false);
      this.resetIdleTimer();
    } catch (e) {
      this.platform.log.error('Command send error:', e);
    }
  }

  // --- Movement ---
  private async setHeadPosition(value: CharacteristicValue) {
    const target = value as number;
    this.platform.log.info('Head position: target ' + target + '%');
    if (target > this.currentHeadPosition) await this.send(CMD_HEAD_UP);
    else if (target < this.currentHeadPosition) await this.send(CMD_HEAD_DOWN);
    this.currentHeadPosition = target;
    this.headService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, target);
  }

  private async setFootPosition(value: CharacteristicValue) {
    const target = value as number;
    this.platform.log.info('Foot position: target ' + target + '%');
    if (target > this.currentFootPosition) await this.send(CMD_FEET_UP);
    else if (target < this.currentFootPosition) await this.send(CMD_FEET_DOWN);
    this.currentFootPosition = target;
    this.footService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, target);
  }

  // --- Massage ---
  private async setHeadMassageOn(value: CharacteristicValue) {
    const on = value as boolean;
    this.platform.log.info('Head massage: ' + (on ? 'On' : 'Foot'));
    await this.send(on ? CMD_MASSAGE_HEAD : CMD_MASSAGE_HEAD_OFF);
  }

  private async setFootMassageOn(value: CharacteristicValue) {
    const on = value as boolean;
    this.platform.log.info('Foot massage: ' + (on ? 'On' : 'Foot'));
    await this.send(on ? CMD_MASSAGE_FOOT : CMD_MASSAGE_FOOT_OFF);
  }

  // --- LED Light ---
  private async setLight(value: CharacteristicValue) {
    const on = value as boolean;
    this.platform.log.info('LED Light: ' + (on ? 'On' : 'Foot'));
    await this.send(CMD_LIGHT_TOGGLE);
  }

  // --- Scenes ---
  private async setZeroG(value: CharacteristicValue) {
    const on = value as boolean;
    this.platform.log.info('Zero G: ' + (on ? 'On' : 'Foot'));
    await this.send(on ? CMD_ZERO_G : CMD_STOP);
  }

  private async setFlat(value: CharacteristicValue) {
    const on = value as boolean;
    this.platform.log.info('Flat: ' + (on ? 'On' : 'Foot'));
    if (on) await this.send(CMD_FLAT);
  }

  private async setLounge(value: CharacteristicValue) {
    const on = value as boolean;
    this.platform.log.info('Lounge: ' + (on ? 'On' : 'Foot'));
    if (on) await this.send(CMD_LOUNGE);
  }

  private async setTV(value: CharacteristicValue) {
    const on = value as boolean;
    this.platform.log.info('TV: ' + (on ? 'On' : 'Foot'));
    if (on) await this.send(CMD_TV);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
