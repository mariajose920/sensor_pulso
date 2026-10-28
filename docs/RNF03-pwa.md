# RNF03 · App instalable en el celular (PWA)

Requerimiento: *la plataforma debe poder instalarse en el celular como una app.*

## Decisiones

| Tema | Decisión |
|---|---|
| Nombre e ícono | `sensor_pulso`; línea de pulso blanca sobre el azul del sitio (`#1e40af`). Hay versión normal, versión adaptable de Android (*maskable*) e ícono para iPhone. |
| Pantalla | Se abre a **pantalla completa de app** (`display: standalone`), sin barra del navegador. |
| Orientación | **Libre**: vertical u horizontal. |
| Accesos directos | Al mantener presionado el ícono en Android: **Medición**, **Comparación** y **Aprendizaje**. |
| Instalar | **Botón propio** "Instalar app" en Android y computador, y **guía con pasos** en iPhone. "Ahora no" se recuerda 14 días. |
| Sin internet | La app abre y avisa "Sin conexión". Quedan disponibles las pantallas de la app, las plantillas y el comparador, las lecciones y las últimas mediciones vistas. |
| Actualización | **Automática al abrir**: la versión nueva se descarga en segundo plano y se activa la próxima vez que se abre la app. No recarga la pantalla en uso, para no cortar una medición. |

## Qué se guarda en el celular (y qué no)

| Dato | ¿Se guarda? | Cómo |
|---|---|---|
| Pantallas, estilos, plantilla PPG/ECG y comparador | Sí | Caché de precarga del service worker (`sw.js`). |
| Lecciones publicadas (contenido público) | Sí | Caché `lecciones`, se actualiza al volver internet. Aplica cuando las lecciones se lean de Supabase (RF38). |
| Últimas mediciones vistas | Sí, con límites | IndexedDB (`src/pwa/medicionesOffline.js`): máximo **10**, hasta **30 días**, solo BPM, SpO₂, ritmo, calidad, actividad, fecha y si está dentro de rango. **Nunca** nombre, correo, edad ni factores declarados. |
| Sesión, base de datos, tiempo real y datos personales | **No** | Las llamadas a Supabase van siempre por la red (`NetworkOnly`). |
| Todo lo guardado | Se borra | Al **cerrar sesión** (`src/pwa/limpiarAlSalir.js`). |

Esto responde a RNF08 y RNF14: los datos de salud no deben quedar en un dispositivo compartido.

## Dónde está el código

- `vite.config.js`: manifiesto, accesos directos y reglas de caché (`vite-plugin-pwa`).
- `public/icons/`: íconos. Para cambiarlos, edita `icono.svg` e `icono-maskable.svg` y ejecuta `npm run generar:iconos`.
- `index.html`: favicon y datos para iPhone.
- `src/pwa/registro.js`: registro del service worker y búsqueda de versiones nuevas.
- `src/pwa/medicionesOffline.js` y `limpiarAlSalir.js`: mediciones vistas y su borrado.
- `src/components/EstadoPwa.vue`: aviso "Sin conexión", botón "Instalar app" y guía de iPhone.
- `vercel.json`: rutas de la app (SPA) y cabeceras de `sw.js` y del manifiesto.

## Pendiente de integrar

- **Mediciones vistas:** `guardarMedicionVista()` y `listarMedicionesVistas()` están listas y probadas, pero todavía nadie las llama: el historial de mediciones (RF30) no existe aún. Al construir esa pantalla, llamar `guardarMedicionVista()` cada vez que el usuario abra una medición, y `listarMedicionesVistas()` cuando no haya internet.
- **Borrar al revocar el consentimiento (RF90):** además de cerrar sesión, llamar `limpiarDatosLocales()` (de `limpiarAlSalir.js`).
- **Lecciones:** la regla de caché ya está; se usará cuando RF38 lea las lecciones desde la tabla `lecciones`.

## Prueba automática

```bash
npm install
npm run probar:pwa
```

Compila la web y, con el Chrome o Edge instalado, revisa:

1. el manifiesto (nombre, colores, modo, orientación, accesos directos) y que cada ícono exista con su tamaño,
2. que el navegador no reporte errores de instalabilidad,
3. el service worker, y que **sin internet** la app abra y muestre "Sin conexión",
4. el botón "Instalar app", "Ahora no" y la guía de iPhone,
5. que las mediciones guardadas sean 10 como máximo, sin datos personales y que se puedan borrar.

## Lista de revisión manual (con la web ya desplegada en Vercel, que sirve HTTPS)

Una PWA solo se instala desde HTTPS (o `localhost`). Prueba con la URL de Vercel.

**Android (Chrome)**
- [ ] Aparece el botón "Instalar app" y, al tocarlo, el cuadro de instalación del navegador.
- [ ] El ícono queda en la pantalla de inicio con el nombre `sensor_pulso` y se ve bien dentro de cualquier forma (redonda, cuadrada).
- [ ] Se abre sin barra de direcciones.
- [ ] Al mantener presionado el ícono aparecen Medición, Comparación y Aprendizaje.
- [ ] Con el modo avión: la app abre, muestra "Sin conexión" y se navega por las pantallas.

**iPhone (Safari)**
- [ ] Aparece la guía con los pasos de Compartir > Añadir a pantalla de inicio.
- [ ] Tras instalarla, abre a pantalla completa con el ícono azul del pulso.
- [ ] Sin internet, abre y muestra "Sin conexión".

**Computador (Chrome o Edge)**
- [ ] Aparece "Instalar app" y el ícono de instalar en la barra de direcciones.
- [ ] La app instalada abre en su propia ventana.

**Actualización**
- [ ] Publica un cambio visible, abre la app instalada (verás la versión anterior), ciérrala por completo y ábrela otra vez: debe mostrar la versión nueva.

**Privacidad**
- [ ] Al cerrar sesión, las mediciones vistas guardadas desaparecen (DevTools > Application > IndexedDB).

## Límites a tener en cuenta

- **Sin internet no se puede medir con el ESP32 por WiFi hacia la nube, ni iniciar sesión ni consultar la base de datos.** La app lo avisa; no lo oculta.
- **iPhone:** Apple no permite el botón de instalación ni los accesos directos; por eso se muestra la guía.
- **La versión nueva llega al abrir la app, no antes.** Si alguien la deja abierta días, seguirá con la versión que cargó.
