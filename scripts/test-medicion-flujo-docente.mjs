// Pantalla de Medición del docente/administrador: identificación, fuente (WiFi/USB), pacientes y gráficas
//   node scripts/test-medicion-flujo-docente.mjs
import { readFileSync } from 'node:fs'
import { esPuertoEsp32, FILTROS_PUERTO_ESP32 } from '../src/composables/useSerialSensor.js'
import { evaluarAgregarCanal } from '../src/utils/canalesMultiples.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

const vista = leer('../src/views/MedicionView.vue')
const ident = leer('../src/components/UserIdentifier.vue')
const fuente = leer('../src/components/FuenteMedicionSelector.vue')
const panel = leer('../src/components/CanalesPacientesPanel.vue')
const router = leer('../src/router/index.js')
const aprendizaje = leer('../src/views/AprendizajeView.vue')

console.log('Identificación')
prueba('«Identificado» sale antes del encabezado de la vista', vista.indexOf('<UserIdentifier />') < vista.indexOf('<h1 class="view-title">'))
prueba('profesor y admin se identifican como docentes', ident.includes('Identificado como docente'))
prueba('ya no se muestra el ID de medición', !ident.includes('ID de Medición') && !ident.includes('currentUserId'))
prueba('el docente ve si su consentimiento es válido o no', vista.includes('data-testid="consentimiento-valido"') && vista.includes('data-testid="consentimiento-no-valido"'))

console.log('Fuente de medición')
prueba('se pregunta cómo se mide antes que los canales', vista.indexOf('<FuenteMedicionSelector />') < vista.indexOf('<CanalesPacientesPanel'))
prueba('WiFi: mensaje de conectado', fuente.includes('data-testid="wifi-conectado"'))
prueba('WiFi: sin conexión explica el porqué y qué hacer', fuente.includes('data-testid="wifi-sin-conexion"') && /Enciende el ESP32/.test(fuente))
prueba('USB: botón «Conectar por USB»', fuente.includes('Conectar por USB'))
prueba('USB: mensaje de conectado y de sin conectar con pasos', fuente.includes('data-testid="usb-conectado"') && fuente.includes('data-testid="usb-sin-conexion"') && /cable USB/.test(fuente))
prueba('USB: puerto identificado solo o elegido a mano', fuente.includes('identificado automáticamente') && fuente.includes('Elegir otro puerto'))
prueba('aviso «solo con fines de aprendizaje» con cualquier fuente', vista.includes('data-testid="aviso-solo-aprendizaje"') && vista.indexOf('data-testid="aviso-solo-aprendizaje"') < vista.indexOf('<CanalesPacientesPanel'))

console.log('Identificación automática del puerto USB')
prueba('reconoce los chips USB-serie de ESP32', esPuertoEsp32({ usbVendorId: 0x10c4 }) && esPuertoEsp32({ usbVendorId: 0x1a86 }) && esPuertoEsp32({ usbVendorId: 0x303a }))
prueba('no confunde otros dispositivos', !esPuertoEsp32({ usbVendorId: 0x046d }) && !esPuertoEsp32({}) && !esPuertoEsp32(undefined))
prueba('el selector del navegador se filtra a esos chips', FILTROS_PUERTO_ESP32.length === 4)

console.log('Pacientes y canales')
const libres = [1, 2, 3, 4, 5].map(canal => ({ canal, usuario_id: null }))
prueba('docente sin pacientes ya puede usar «Agregar canal»', evaluarAgregarCanal({ rol: 'profesor', canales: libres, usuarioId: 'p' }).puede)
prueba('el botón solo aparece con la fuente conectada', /<CanalesPacientesPanel v-if="fuenteConectada"/.test(vista))
prueba('el botón dice «Agregar canal» y luego «Agregar otro canal»', panel.includes("'Agregar otro canal' : 'Agregar canal'"))
prueba('cada paciente pasa por la ventana de datos y consentimiento', panel.includes('<AgregarCanalModal'))
prueba('ya no hay botón «Iniciar medición»: al agregar el canal aparece la gráfica', !panel.includes('Iniciar medición') && !vista.includes('usbIniciada'))

console.log('Gráficas')
prueba('con WiFi y con USB la gráfica aparece apenas hay canal y sensor', !vista.includes('mostrarGraficas') && vista.includes('const medicionActiva = computed(() => canalSeleccionadoListo.value && sensorDetectado.value)'))
prueba('las gráficas solo aparecen con sensor detectado', vista.includes('v-if="sensorDetectado && graficablesPropios.length >= 1"'))
prueba('el docente no ve el monitor de 5 canales (usa las gráficas)', vista.includes('v-if="canalesMostrados.length && !esDocenteVista"'))
prueba('estudiantes siguen eligiendo canal a mano', vista.includes('<VinculacionCanales'))

console.log('Solo un botón para agregar canales')
prueba('el panel ya no lista canales ni pacientes', !panel.includes('lista-pacientes') && !panel.includes('Pacientes y canales ('))
prueba('docente no ve asignación de canales ni el monitor de 5 canales', vista.includes('v-if="canalesMostrados.length && !esDocenteVista"'))
prueba('al agregar el canal la pantalla se mueve al centro de la gráfica', vista.includes("block: 'center'") && vista.includes('@agregado="alAgregarCanal"') && vista.includes('ref="zonaGraficas"'))
prueba('se puede quitar un canal desde su gráfica', vista.includes('@quitar="quitarCanal"') && leer('../src/components/GraficasCanalesPropios.vue').includes("emit('quitar', d.canal)"))

console.log('Evaluaciones formativas sin sesión')
prueba('la práctica no exige sesión', /path: '\/aprendizaje\/practica',\s*name: 'Practica',\s*component: PracticaView\s*}/.test(router))
prueba('Aprendizaje enlaza a la práctica', aprendizaje.includes('/aprendizaje/practica'))

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
