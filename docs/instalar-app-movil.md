# Instalar sensor_pulso como app en el celular

Dirección de la app (producción): **https://sensorpulso.vercel.app**

No uses los enlaces largos de Vercel (por ejemplo `sensor-pulso-abc123-...vercel.app`): son de pruebas (preview) y piden iniciar sesión en Vercel.

## Android (Chrome)
1. Abre https://sensorpulso.vercel.app en Chrome.
2. Aparece el botón «Instalar» de la app, o el menú ⋮ → «Instalar app» / «Agregar a la pantalla principal».
3. Se crea el ícono; la app abre sin la barra del navegador.

## iPhone (Safari)
1. Abre la dirección en Safari.
2. Compartir → «Agregar a inicio».

## Comprobar que es instalable
- `npm run probar:pwa` (revisa manifiesto, íconos, service worker y modo sin conexión).
- Chrome → DevTools → Application → Manifest / Service Workers.

## Si Vercel pide iniciar sesión
Es «Deployment Protection». En Vercel: Project → Settings → Deployment Protection → desactivar «Vercel Authentication» (o dejarla solo para Preview) y volver a desplegar.
