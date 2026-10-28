# RNF01 · Diseño responsivo (computador, tablet y móvil)

Requerimiento: *la plataforma debe verse y usarse bien en computador, tablet y móvil.*

## Decisiones de diseño

| Tema | Decisión |
|---|---|
| Tamaños | 4 puntos de corte: **400 px**, **640 px**, **1024 px** y **1400 px** (móvil muy pequeño, móvil, tablet, computador y pantalla muy ancha). Están en `src/style.css` y en `src/utils/breakpoints.js`. |
| Menú | **Barra inferior** con 5 íconos y texto en móvil (hasta 640 px). En tablet y computador, los enlaces van en la barra superior. |
| Espacio | En móvil, la barra superior y la inferior **se ocultan al bajar** y reaparecen al subir, al llegar arriba o al final. |
| Gráficos | Alto proporcional al ancho (entre 240 px y 380 px). En móvil vertical aparece un **aviso para girar el celular**, que se puede cerrar. |
| Tablas | En móvil se muestran solo el criterio y la medición; el botón **Ver más** despliega hacia abajo el resto. En tablet y computador, la tabla completa. |
| Tacto | Botones y campos de **44 px** de alto como mínimo en pantallas táctiles, y letra de **16 px** en los campos. |

## Dónde está el código

- `index.html`: viewport (`viewport-fit=cover`) y color del tema.
- `src/style.css` (sección *RNF01*): puntos de corte, alto de gráficos, áreas de toque y reglas para móvil.
- `src/App.vue`: barra superior, barra inferior y ocultamiento al bajar.
- `src/composables/useScrollDirection.js`: detecta si se baja o se sube.
- `src/composables/useMediaQuery.js` y `src/components/AvisoGirar.vue`: aviso para girar el celular.
- `src/components/TemplateComparator.vue`: tabla completa y versión móvil con *Ver más*.
- `src/components/OscilloscopeCanvas.vue`: el lienzo sigue el tamaño de su contenedor (`ResizeObserver`).

## Prueba automática

```bash
npm install
npm run probar:responsivo
```

Compila la web, la abre con el Chrome o Edge instalado (o el de `CHROME_PATH`) en 320, 375, 768, 1024, 1280 y 1440 px de ancho, y en móvil horizontal. Revisa en cada página que:

1. no haya desplazamiento horizontal,
2. se vea la barra correcta (inferior en móvil, enlaces arriba en tablet y PC),
3. botones y campos midan al menos 44 px en móvil,
4. la tabla, el aviso de girar y el menú que se oculta funcionen.

Guarda una captura de cada página en `pruebas-responsivas/` (no se sube a git). Si algo falla, termina con error y lista los problemas.

## Lista de revisión manual (en dispositivos reales)

Hazla en un **celular**, una **tablet** y un **computador**, y en al menos dos navegadores (por ejemplo Chrome y Safari o Firefox).

**Celular (vertical)**
- [ ] No hay que deslizar hacia los lados en ninguna página (Inicio, Medición, Comparación, Aulas, Aprendizaje, Acceso).
- [ ] La barra inferior se ve completa y cada ícono se toca sin errar.
- [ ] Al bajar, las barras se ocultan; al subir un poco, reaparecen.
- [ ] En Comparación aparece el aviso de girar el celular, y *Entendido* lo cierra.
- [ ] En la tabla, *Ver más* abre el detalle hacia abajo y *Ver menos* lo cierra.
- [ ] Al escribir en un campo, la pantalla no hace zoom sola.
- [ ] Nada queda tapado por la barra inferior ni por el borde del teléfono (muesca).

**Celular (horizontal)**
- [ ] El aviso de girar no aparece y los gráficos se ven más grandes.
- [ ] El gráfico se ajusta al girar el teléfono.

**Celular muy pequeño (320 a 360 px de ancho)**
- [ ] El logo y el botón de acceso caben en la barra superior.
- [ ] Los textos de la barra inferior no se cortan.

**Tablet**
- [ ] Los enlaces se ven arriba y la barra inferior no aparece.
- [ ] Las tarjetas se acomodan en 2 columnas.
- [ ] La tabla completa se ve sin cortarse.

**Computador**
- [ ] El contenido queda centrado y legible, también en pantallas muy anchas (1400 px o más).
- [ ] Al cambiar el tamaño de la ventana, el diseño se adapta sin recargar.
- [ ] Se puede navegar con el teclado (Tab) y se ve el foco.
