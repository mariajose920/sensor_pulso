// RF111 · «Terminar» la medición de un canal: guardar (RF30) y publicar (RF31, RF57, RF98)
//   node scripts/test-terminar-medicion.mjs
import { readFileSync } from 'node:fs'
import { calcularMetricasCanal } from '../src/utils/metricasCanal.js'
import { construirMedicion, MENSAJES_GUARDADO } from '../src/utils/medicion.js'
import {
  PERMISO_PUBLICAR, CONSENTIMIENTO_PACIENTE_INCLUYE_PUBLICAR, MENSAJES_TERMINAR,
  puedePublicarPorCuenta, evaluarPublicacion, evaluarGuardado, preguntasATerminar,
  contextoPaciente, armarRegistroTerminado, formatearDuracion, duracionSegundos,
  rangoDeEdad, vistaPreviaPublica, vistaPreviaSinDatosIdentificables,
  mensajeResultado, estadoParaTarjeta, clasificarErrorPublicacion, mensajeErrorPublicacion
} from '../src/utils/terminarMedicion.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const leer = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

console.log('Quién puede publicar (RF31 + RF98)')
const conPermiso = { [PERMISO_PUBLICAR]: true }
const sinPermiso = { [PERMISO_PUBLICAR]: false }
prueba('administrador con sesión: sí', puedePublicarPorCuenta({ haySesion: true, esAdmin: true, rol: 'profesor' }).puede)
prueba('administrador sin sesión: no (sin_sesion)', puedePublicarPorCuenta({ haySesion: false, esAdmin: true }).codigo === 'sin_sesion')
prueba('profesor con el permiso de RF98: sí', puedePublicarPorCuenta({ haySesion: true, rol: 'profesor', permisos: conPermiso }).puede)
prueba('profesor sin el permiso: no (sin_permiso)', puedePublicarPorCuenta({ haySesion: true, rol: 'profesor', permisos: sinPermiso }).codigo === 'sin_permiso')
prueba('profesor sin datos de permisos: no', !puedePublicarPorCuenta({ haySesion: true, rol: 'profesor', permisos: null }).puede)
prueba('profesor con permiso pero sin sesión: no', !puedePublicarPorCuenta({ haySesion: false, rol: 'profesor', permisos: conPermiso }).puede)
prueba('el permiso exacto es publicar_galeria', PERMISO_PUBLICAR === 'publicar_galeria')
prueba('un permiso distinto (crear_aulas) no habilita', !puedePublicarPorCuenta({ haySesion: true, rol: 'profesor', permisos: { crear_aulas: true } }).puede)
prueba('estudiante con sesión: sí (RF31)', puedePublicarPorCuenta({ haySesion: true, rol: 'usuario' }).puede)
prueba('estudiante sin sesión: no', !puedePublicarPorCuenta({ haySesion: false, rol: 'usuario' }).puede)

console.log('\nCuándo se pregunta por publicar')
const base = { haySesion: true, fuente: 'sensor', pacienteConConsentimientoPropio: false }
const admin = evaluarPublicacion({ ...base, esAdmin: true })
prueba('admin con medición propia del sensor: se pregunta', admin.preguntar && admin.nota === null)
prueba('profesor con permiso: se pregunta', evaluarPublicacion({ ...base, rol: 'profesor', permisos: conPermiso }).preguntar)
const sinPerm = evaluarPublicacion({ ...base, rol: 'profesor', permisos: sinPermiso })
prueba('profesor sin permiso: NO se pregunta y no hay nota', !sinPerm.preguntar && sinPerm.nota === null)
const sinSes = evaluarPublicacion({ ...base, haySesion: false, esAdmin: true })
prueba('sin sesión: NO se pregunta y no hay nota', !sinSes.preguntar && sinSes.nota === null)
const simu = evaluarPublicacion({ ...base, esAdmin: true, fuente: 'simulador' })
prueba('simulador: no se publica y se explica por qué', !simu.preguntar && /simulador/.test(simu.nota))
const pac = evaluarPublicacion({ ...base, esAdmin: true, pacienteConConsentimientoPropio: true })
prueba('paciente con consentimiento propio: se ofrece publicar, pero quien mide confirma que el paciente lo autorizó', !CONSENTIMIENTO_PACIENTE_INCLUYE_PUBLICAR && pac.preguntar && pac.requiereAutorizacionPaciente === true)
prueba('el consentimiento actual no menciona publicar (texto del servicio)', !/public/i.test(leer('../src/services/consentimientoService.js').match(/CONSENTIMIENTO_BASE = \{[\s\S]*?\n\}/)[0]))

console.log('\nQué preguntas se hacen')
const g = evaluarGuardado({ haySesion: true, sesionReal: true, bpm: 72, calidad: 'buena' })
prueba('con permiso: guardar y luego publicar', JSON.stringify(preguntasATerminar({ guardado: g, publicacion: admin })) === '["guardar","publicar"]')
prueba('sin permiso: solo guardar', JSON.stringify(preguntasATerminar({ guardado: g, publicacion: sinPerm })) === '["guardar"]')
prueba('si no se puede guardar: ninguna pregunta (nunca se publica sin guardar)', preguntasATerminar({ guardado: evaluarGuardado({ haySesion: false, sesionReal: true, bpm: 72 }), publicacion: admin }).length === 0)

console.log('\nCuándo se puede guardar')
prueba('sin sesión: no', evaluarGuardado({ haySesion: false, sesionReal: true, bpm: 70 }).codigo === 'sin_sesion')
const demo = evaluarGuardado({ haySesion: true, sesionReal: false, bpm: 70 })
prueba('sesión de demostración: igual se puede guardar (sesion_id es opcional)', demo.puede === true && demo.codigo === null)
prueba('un id de sesión que no es uuid (demostración) no se envía a la base', armarRegistroTerminado({ canal: 1, paciente: { nombre: 'Ana', edad: 30 }, metricas: { bpm: 72 }, sesionId: 'ses-demo-01' }).datos.sesionId === undefined)
prueba('un uuid real de sesión sí se envía', armarRegistroTerminado({ canal: 1, paciente: { nombre: 'Ana', edad: 30 }, metricas: { bpm: 72 }, sesionId: '0b7e6a0e-6f55-4d6e-9d58-2d3b3d1c7a11' }).datos.sesionId === '0b7e6a0e-6f55-4d6e-9d58-2d3b3d1c7a11')
prueba('el paciente sin consentimiento propio (la cuenta) no necesita la casilla', evaluarPublicacion({ ...base, esAdmin: true, pacienteConConsentimientoPropio: false }).requiereAutorizacionPaciente === false)
prueba('la casilla de autorización existe y bloquea «Sí, publicar» hasta marcarla', leer('../src/components/TerminarMedicionModal.vue').includes('terminar-autoriza-casilla') && leer('../src/components/TerminarMedicionModal.vue').includes('requiereAutorizacionPaciente && !autorizaPaciente'))
prueba('sin BPM: no', evaluarGuardado({ haySesion: true, sesionReal: true, bpm: null }).codigo === 'sin_datos')
prueba('calidad mala: no (RF16)', evaluarGuardado({ haySesion: true, sesionReal: true, bpm: 70, calidad: 'mala' }).mensaje === MENSAJES_GUARDADO.calidad_mala)
prueba('todo bien: sí', g.puede)

console.log('\nPaciente del canal (ficha del canal, no la de la cuenta)')
const fichaCanal = { nombre: 'Ana Pérez', fechaNacimiento: '1990-05-10', actividadPrevia: 'ejercicio_intenso' }
const fichaCuenta = { id: 'decl-cuenta', nombre: 'Prof. Rojas', edad: 45, actividadPrevia: 'reposo' }
const hoy = new Date('2026-11-09T12:00:00')
const pCanal = contextoPaciente({ fichaCanal, fichaCuenta, declaracionIdCanal: 'decl-canal', nombreCuenta: 'Cuenta', hoy })
prueba('usa el nombre de la ficha del canal', pCanal.nombre === 'Ana Pérez')
prueba('usa la declaración del canal, no la de la cuenta', pCanal.declaracionId === 'decl-canal')
prueba('calcula la edad con la fecha de nacimiento del canal', pCanal.edad === 36)
prueba('usa la actividad del canal', pCanal.actividad === 'ejercicio_intenso')
prueba('marca consentimiento propio', pCanal.consentimientoPropio === true)
prueba('canal sin declaración en el servidor: declaracionId null (no se usa la de la cuenta)', contextoPaciente({ fichaCanal, fichaCuenta, hoy }).declaracionId === null)
const pCuenta = contextoPaciente({ fichaCanal: null, fichaCuenta, nombreCuenta: 'Cuenta', hoy })
prueba('canal sin ficha propia usa la de la cuenta', pCuenta.nombre === 'Prof. Rojas' && pCuenta.declaracionId === 'decl-cuenta' && pCuenta.edad === 45 && !pCuenta.consentimientoPropio)
prueba('sin ninguna ficha: nombre de la cuenta y sin edad', contextoPaciente({ nombreCuenta: 'Cuenta' }).nombre === 'Cuenta' && contextoPaciente({}).edad === null)

console.log('\nRegistro a guardar desde las métricas finales del canal')
function senal(bpm, seg = 12, hz = 50) {
  const n = seg * hz, per = 60 / bpm, out = []
  for (let i = 0; i < n; i++) {
    const t = i / hz
    let v = 0
    for (let tp = 0.4; tp < seg; tp += per) v += Math.exp(-((t - tp) ** 2) / (2 * 0.06 * 0.06))
    out.push(90000 + 3000 * v)
  }
  return out
}
const metricas = calcularMetricasCanal({ ir: senal(72), frecuenciaHz: 50, bpmDispositivo: 72, spo2Dispositivo: 97 })
const t0 = new Date('2026-11-09T10:00:00Z'), t1 = new Date('2026-11-09T10:01:05Z')
const reg = armarRegistroTerminado({ canal: 2, paciente: pCanal, metricas, fuente: 'sensor', sesionId: '11111111-1111-4111-8111-111111111111', inicio: t0, fin: t1, idCliente: 'id-1' })
prueba('BPM y SpO₂ del canal', reg.datos.bpm === 72 && reg.datos.spo2 === 97)
prueba('canal y sesión', reg.datos.canal === 2 && reg.datos.sesionId === '11111111-1111-4111-8111-111111111111')
prueba('declaración y edad del paciente del canal', reg.datos.declaracionId === 'decl-canal' && reg.datos.edad === 36)
prueba('idCliente se conserva (evita duplicados al reintentar)', reg.datos.idCliente === 'id-1')
prueba('duración: 65 s → «1 min 05 s»', reg.resumen.duracionS === 65 && reg.resumen.duracionTexto === '1 min 05 s')
prueba('resumen con paciente y canal', reg.resumen.paciente === 'Ana Pérez' && reg.resumen.canal === 2)
prueba('calidad tomada de la señal', ['buena', 'regular', 'mala'].includes(reg.datos.calidad))
prueba('dentro de rango es booleano', typeof reg.datos.dentroDeRango === 'boolean')
const fila = construirMedicion({ ...reg.datos, usuarioId: 'u1' })
prueba('construirMedicion (servicio de guardado) acepta el registro', fila.ok && fila.fila.canal === 2 && fila.fila.declaracion_id === 'decl-canal')
prueba('la fila lleva el HRV y el ritmo calculados', 'hrv_rmssd_ms' in fila.fila && (reg.datos.ritmo === null || fila.fila.ritmo === reg.datos.ritmo))
const sinDatos = armarRegistroTerminado({ canal: 3, paciente: pCanal, metricas: calcularMetricasCanal({ ir: [1, 2, 3], frecuenciaHz: 50 }), fin: t1 })
prueba('sin señal: sin BPM ni valores inventados y no se puede guardar', sinDatos.datos.bpm === null && sinDatos.datos.dentroDeRango === null && !construirMedicion({ ...sinDatos.datos, usuarioId: 'u1' }).ok)
prueba('duración sin inicio = 0 s', duracionSegundos(null, t1) === 0 && formatearDuracion(0) === '0 s' && formatearDuracion(59) === '59 s')

console.log('\nAnonimización (RF57)')
const vista = vistaPreviaPublica(reg)
const etiquetas = vista.campos.map(c => c.etiqueta)
prueba('la vista previa muestra pulso, SpO₂ y rango de edad', ['Pulso', 'SpO₂', 'Rango de edad'].every(e => etiquetas.includes(e)))
prueba('el rango de edad reemplaza la edad exacta', vista.campos.find(c => c.etiqueta === 'Rango de edad').valor === '35-49')
prueba('no contiene el nombre del paciente', vistaPreviaSinDatosIdentificables(vista, 'Ana Pérez'))
prueba('lista lo que no se publica', vista.excluidos.includes('nombre') && vista.excluidos.some(x => /ficha/.test(x)))
prueba('detecta si un campo trajera el nombre', !vistaPreviaSinDatosIdentificables({ campos: [{ etiqueta: 'x', valor: 'Ana Pérez' }] }, 'ana pérez'))
prueba('cortes de edad iguales a rango_de_edad() de la base', [[17, '<18'], [18, '18-24'], [24, '18-24'], [25, '25-34'], [34, '25-34'], [35, '35-49'], [49, '35-49'], [50, '50+'], [null, '25-34']].every(([e, r]) => rangoDeEdad(e) === r))

console.log('\nMensajes de resultado y de error')
prueba('guardada', mensajeResultado({ guardada: true }) === 'Medición guardada.')
prueba('guardada y publicada', mensajeResultado({ guardada: true, publicada: true }) === 'Medición guardada y publicada.')
prueba('no guardada: no se envía nada a la base', /no guardada/i.test(mensajeResultado({ guardada: false })) && /nada a la base/.test(mensajeResultado({ guardada: false })))
prueba('guardada sin conexión: queda en el dispositivo', /dispositivo/.test(mensajeResultado({ guardada: true, pendiente: true })))
prueba('guardada pero la publicación falló: se explica', /no se pudo publicar|no tiene permiso/.test(mensajeResultado({ guardada: true, motivoPublicacion: MENSAJES_TERMINAR.publicar_conexion })))
prueba('estados de la tarjeta', estadoParaTarjeta('guardada_publicada') === 'Guardada y publicada' && estadoParaTarjeta('no_guardada') === 'No guardada' && /Pendiente/.test(estadoParaTarjeta(null)))
const e = (message, code, name) => ({ message, code, name })
prueba('error: sin sesión', clasificarErrorPublicacion(e('Requiere sesión', '42501')) === 'sin_sesion')
prueba('error: rechazado por permisos (RF98)', clasificarErrorPublicacion(e('El profesor no tiene permiso para publicar', '42501')) === 'sin_permiso')
prueba('error: RLS genérico → permisos', clasificarErrorPublicacion(e('new row violates row-level security', '42501')) === 'sin_permiso')
prueba('error: consentimiento', clasificarErrorPublicacion(e('Se requiere consentimiento vigente')) === 'consentimiento')
prueba('error: solo sensor', clasificarErrorPublicacion(e('Solo se publican mediciones de sensor finalizadas')) === 'no_sensor')
prueba('error: sin conexión', clasificarErrorPublicacion(e('Failed to fetch', '', 'TypeError')) === 'conexion')
prueba('error desconocido → genérico', clasificarErrorPublicacion(e('boom')) === 'generico' && clasificarErrorPublicacion(null) === 'generico')
prueba('mensajes de error en español claro', ['sin_sesion', 'sin_permiso', 'consentimiento', 'conexion', 'no_sensor', 'generico'].every(m => /^La medición se guardó/.test(mensajeErrorPublicacion(m))))

console.log('\nComprobaciones estáticas de la pantalla')
const grafs = leer('../src/components/GraficasCanalesPropios.vue')
const modal = leer('../src/components/TerminarMedicionModal.vue')
const vistaMed = leer('../src/views/MedicionView.vue')
const servicio = leer('../src/services/medicionesService.js')
prueba('botón «Terminar» en las tarjetas separadas y en la leyenda de «Juntas»', (grafs.match(/data-testid="terminar-canal"/g) || []).length === 2)
prueba('junto a cada «Terminar» hay «Quitar»', (grafs.match(/>Quitar<\/button>/g) || []).length === 2)
prueba('«Terminar» y «Medir de nuevo» tienen aria-label con el canal', /Terminar la medición del canal/.test(grafs) && /Medir de nuevo el canal/.test(grafs))
prueba('marca «Medición terminada» en la tarjeta', (grafs.match(/Medición terminada/g) || []).length >= 2)
prueba('al terminar deja de acumular muestras', /if \(terminadas\.value\[g\.canal\]\)/.test(grafs))
prueba('usa calcularMetricasCanal para los datos finales', /calcularMetricasCanal/.test(grafs) && /armarRegistroTerminado/.test(grafs))
prueba('el diálogo se abre al terminar', /terminarCanal[\s\S]*abrirDialogo\(canal\)/.test(grafs) && /<TerminarMedicionModal/.test(grafs))
prueba('el diálogo es accesible: role=dialog, aria-modal, etiqueta', /role="dialog"/.test(modal) && /aria-modal="true"/.test(modal) && /aria-labelledby="terminar-titulo"/.test(modal))
prueba('el diálogo se cierra con Escape y atrapa el foco', /e\.key === 'Escape'/.test(modal) && /e\.key !== 'Tab'/.test(modal) && /\.focus\(\)/.test(modal))
prueba('mismo estilo que los otros modales: blur y encabezado gris claro', /backdrop-filter: blur/.test(modal) && /background: #f8fafc/.test(modal))
prueba('pregunta «¿Quieres guardar esta medición?» con Guardar / No guardar', /¿Quieres guardar esta medición\?/.test(modal) && />No guardar</.test(modal) && />Guardar</.test(modal.replace(/\{\{[^}]*\}\}/g, '>Guardar<')))
prueba('pregunta de publicar con «Sí, publicar» / «No, solo guardar» y nota de anonimato', /¿Quieres publicarla para que otras personas la vean \(siempre anonimizada\)\?/.test(modal) && /Sí, publicar/.test(modal) && /No, solo guardar/.test(modal) && /sin nombre ni datos identificables/.test(modal))
prueba('la pregunta de publicar depende de evaluarPublicacion (permiso RF98)', /evalPublicacion\.value\.preguntar/.test(modal) && /obtenerPermisosProfesor/.test(modal))
prueba('reutiliza guardarMedicion y publicarMedicion del servicio', /guardarMedicion\(/.test(modal) && /publicarMedicion\(/.test(modal))
prueba('no guardar no llama al servicio', /function noGuardar\(\)\s*\{\s*mostrarResultado/.test(modal))
prueba('el servicio llama a publicar_medicion con confirmación', /rpc\('publicar_medicion'/.test(servicio) && /p_confirmar: true/.test(servicio))
prueba('guardarMedicion no cambió (sigue insertando en mediciones)', /\.from\('mediciones'\)\s*\.insert\(armada\.fila\)/.test(servicio))
prueba('la vista pasa la ficha del canal, la sesión y la fuente', /:paciente-de="pacienteDeCanal"/.test(vistaMed) && /:sesion-id="canalesState\.sesionActivaId"/.test(vistaMed) && /simuladorActivo \? 'simulador' : 'sensor'/.test(vistaMed))
prueba('el botón del paso 5 sigue en la vista', /Finalizar Medición y Ver Resultados \(Paso 5\)/.test(vistaMed))
prueba('«Agregar canal» sigue disponible', /Agregar (otro )?canal/.test(vistaMed + leer('../src/components/CanalesPacientesPanel.vue')))
prueba('móvil: botones a ancho completo', /max-width: 600px/.test(modal) && /max-width: 600px/.test(grafs))
prueba('el canal guarda el id de la ficha en el servidor', /declaracionId,\s*\n\s*completadoEn/.test(leer('../src/services/canalesService.js')))

console.log(`\n${ok} correctas, ${mal} con error`)
process.exit(mal ? 1 : 0)
