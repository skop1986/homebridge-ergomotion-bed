import { API } from 'homebridge';
import { AskonaBedPlatform } from './platform';

export default (api: API) => {
  api.registerPlatform('AskonaBed', AskonaBedPlatform);
};