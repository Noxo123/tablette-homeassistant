# Noxo Home — tablette Home Assistant

Dashboard tactile plein écran pour tablette murale, connecté directement à Home Assistant via WebSocket.

## Installation rapide

1. Copie `config.example.js` vers `config.js`.
2. Renseigne l'URL de Home Assistant et ton Long-Lived Access Token.
3. Adapte les `entity_id` dans `config.js`.
4. Sers le dossier avec un serveur HTTP local (évite `file://`), par exemple VS Code Live Server ou `python -m http.server 8080`.
5. Ouvre `http://IP_DU_PC:8080` sur la tablette.

## Configuration

`config.js` n'est volontairement pas versionné : le token Home Assistant reste local.

Exemple :

```js
window.HA_CONFIG = {
  url: 'http://192.168.1.20:8123',
  token: 'TON_LONG_LIVED_ACCESS_TOKEN',
  entities: {
    profiles: {
      nolhan: { entity: 'person.nolhan', battery: 'sensor.nolhan_phone_battery' },
      lisea: { entity: 'person.lisea', battery: 'sensor.lisea_phone_battery' }
    },
    lights: ['light.plafond_1'],
    weather: 'weather.maison',
    media: 'media_player.salon'
  }
};
```

## Profils dynamiques

Home Assistant fournit notamment `person.*` avec des états tels que `home`, `not_home`, `work`, etc. Le dashboard utilise l'état pour le badge et peut être étendu pour mapper une image par état.

## Véhicule

Le module est prêt à recevoir les capteurs de carburant/batterie, autonomie, verrouillage et pression des pneus. Pour un vrai modèle 3D, remplace le placeholder de `#vehicleVisual` par une scène Three.js ou un `<model-viewer>`.

## Sécurité

Un token Long-Lived Access Token placé dans une application frontend est lisible par toute personne ayant accès à la tablette et aux fichiers du dashboard. Utilise de préférence un token dédié et limité à cette tablette. Pour une exposition hors LAN, ajoute un backend/proxy et ne mets jamais le token dans le navigateur.
