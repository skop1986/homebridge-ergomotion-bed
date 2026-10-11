import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { withBindings } from '@stoprocent/noble';
import { exec } from 'child_process';
import { AskonaBedAccessory } from './bed-accessory';

const noble = withBindings('hci', {
  hciDriver: 'native',
  deviceId: 0,
});

export class AskonaBedPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  public readonly bedMacAddress: string | undefined;
  public readonly debug: boolean;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.bedMacAddress = config.macAddress;
    this.debug = config.debug === true;

    if (!this.bedMacAddress) {
      this.log.error('Bed MAC address not specified in config.json! Plugin will not work.');
      return;
    }

    noble.on('stateChange', async (state) => {
      if (state === 'poweredOn') {
        this.log.info('Bluetooth powered on, starting bed discovery...');
        await noble.startScanningAsync([], false);
      } else {
        await noble.stopScanningAsync();
      }
    });

    noble.on('discover', this.handleDiscovery.bind(this));

    api.on('didFinishLaunching', () => {
      this.log.info('AskonaBed platform started.');
    });
  }

  private async handleDiscovery(peripheral: any) {
    const name = peripheral.advertisement.localName;

    if (this.bedMacAddress && peripheral.address.toLowerCase() !== this.bedMacAddress.toLowerCase()) {
      return;
    }

    if (name && (name.toUpperCase().includes('ERGO') || name.toUpperCase().includes('BASE'))) {
      if (this.accessories.length > 0) {
        const uuid = this.api.hap.uuid.generate(peripheral.address);
        const existing = this.accessories.find(a => a.UUID === uuid);
        if (existing) {
          this.log.info('Accessory already exists, reconnecting...');
          new AskonaBedAccessory(this, existing, peripheral);
          return;
        }
      }

      this.log.info(`Bed found: ${name} (${peripheral.address})`);
      await noble.stopScanningAsync();

      // HCI reset
      this.log.info('Resetting HCI adapter before connection...');
      try {
        await new Promise<void>((resolve) => {
          exec('sudo hciconfig hci0 reset', (error) => {
            if (error) {
              this.log.error(`HCI reset error: ${error.message}`);
            } else {
              this.log.info('HCI adapter reset.');
            }
            resolve();
          });
        });
      } catch (e) {
        this.log.warn('HCI reset failed:', e);
      }

      const uuid = this.api.hap.uuid.generate(peripheral.address);
      const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory.');
        new AskonaBedAccessory(this, existingAccessory, peripheral);
      } else {
        this.log.info('Adding new accessory.');
        const accessory = new this.api.platformAccessory('Ergomotion Bed', uuid);
        new AskonaBedAccessory(this, accessory, peripheral);
        this.api.registerPlatformAccessories('homebridge-ergomotion-bed', 'AskonaBed', [accessory]);
      }
    }
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }
}
