window.HA_CONFIG = {
  // Exemple : http://homeassistant.local:8123
  url: 'http://HOME_ASSISTANT_IP:8123',
  // Long-Lived Access Token créé dans HA > Profil > Jetons d'accès longue durée.
  token: 'COLLE_TON_TOKEN_ICI',
  entities: {
    profiles: {
      nolhan: { entity: 'person.nolhan', battery: 'sensor.nolhan_phone_battery' },
      lisea: { entity: 'person.lisea', battery: 'sensor.lisea_phone_battery' }
    },
    lights: ['light.plafond_1','light.plafond_2','light.plafond_3'],
    weather: 'weather.maison',
    media: 'media_player.salon',
    vehicle: {
      name: 'Ma voiture', fuel: 'sensor.voiture_fuel_level', range: 'sensor.voiture_range',
      lock: 'lock.voiture', tireFrontLeft: 'sensor.voiture_tire_front_left',
      tireFrontRight: 'sensor.voiture_tire_front_right', tireRearLeft: 'sensor.voiture_tire_rear_left',
      tireRearRight: 'sensor.voiture_tire_rear_right'
    },
    environment: { temperature: 'sensor.temperature_maison', humidity: 'sensor.humidite_maison', air: 'sensor.qualite_air' },
    camera: 'camera.entree'
  }
};