// RF30 · Prueba de la preparación y el guardado de mediciones (lógica pura, sin red).
// Uso: node scripts/test-rf30-mediciones.mjs
import {
  construirMedicion,
  calcularRegularidad,
  clasificarErrorGuardado,
  resumirParaHistorial
} from '../src/utils/medicion.js'
import {
  listarPendientes,
  agregarPendiente,
  quitarPendiente,
  borrarPendientes
} from '../src/pwa/medicionesPendientes.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

// Almacenamiento falso para la cola sin conexión
function falso() {
  const d = new Map()
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) }
}

const UUID = '11111111-1111-4111-8111-111111111111'
const base = { usuarioId: 'u1', bpm: 72.34, spo2: 97.26, rmssd: 41.567, sdnn: 30, ritmo: 'normal', calidad: 'buena' }

console.log('RF30 · guardado de mediciones e historial\n')

// Fila válida
const ok = construirMedicion({ ...base, canal: 2, edad: 30, declaracionId: 'd1', idCliente: UUID })
marcar(ok.ok, 'Una medición válida se arma')
marcar(ok.ok && ok.fila.bpm_promedio === 72.3 && ok.fila.spo2_promedio === 97.3 && ok.fila.hrv_rmssd_ms === 41.57,
  'Los valores se redondean a lo que admite la tabla')
marcar(ok.ok && ok.fila.usuario_id === 'u1' && ok.fila.id_cliente === UUID && ok.fila.estado_conexion === 'finalizada',
  'Lleva el usuario, el id_cliente y queda finalizada')
marcar(ok.ok && ok.fila.fuente === 'sensor' && ok.fila.canal === 2 && ok.fila.edad_al_medir === 30,
  'Fuente, canal y edad al medir')
marcar(ok.ok && ok.fila.ritmo === 'normal' && ok.fila.calidad === 'buena', 'Guarda ritmo y calidad')

// Reglas
marcar(construirMedicion({ ...base, usuarioId: null }).motivo === 'sin_sesion', 'Sin sesión no se guarda')
marcar(construirMedicion({ ...base, bpm: 0 }).motivo === 'sin_datos', 'Sin BPM no se guarda')
marcar(construirMedicion({ ...base, bpm: 300 }).motivo === 'bpm_invalido', 'BPM fuera de 20 a 250 no se guarda')
marcar(construirMedicion({ ...base, spo2: 20 }).motivo === 'spo2_invalida', 'SpO₂ fuera de 50 a 100 no se guarda')
marcar(construirMedicion({ ...base, fuente: 'csv' }).motivo === 'fuente_invalida', 'Solo se guarda sensor o simulador')

// RF16: calidad mala no se guarda como válida; regular y buena sí
const mala = construirMedicion({ ...base, calidad: 'mala' })
marcar(!mala.ok && mala.motivo === 'calidad_mala' && /no se guard/i.test(mala.mensaje), 'Calidad mala no se guarda y avisa el motivo')
marcar(construirMedicion({ ...base, calidad: 'regular' }).ok, 'Calidad regular sí se guarda')
const sinSenal = construirMedicion({ ...base, calidad: 'sin_senal' })
marcar(sinSenal.ok && sinSenal.fila.calidad === null, 'Sin evaluación de calidad se guarda con calidad vacía')

// Valores opcionales
const minima = construirMedicion({ usuarioId: 'u1', bpm: 60 })
marcar(minima.ok && minima.fila.spo2_promedio === null && minima.fila.ritmo === null && minima.fila.canal === null,
  'Los datos opcionales quedan vacíos, no inventados')
marcar(construirMedicion({ ...base, ritmo: 'otro' }).fila.ritmo === null, 'Un ritmo desconocido no se guarda')
marcar(construirMedicion({ ...base, edad: 15 }).fila.edad_al_medir === null, 'La edad menor de 18 no se envía (solo mayores)')
const inicioTardio = construirMedicion({ ...base, inicio: '2030-01-01T00:00:00Z', fin: '2026-11-02T10:00:00Z' })
marcar(inicioTardio.ok && inicioTardio.fila.inicio === inicioTardio.fila.fin, 'Si el inicio es posterior al fin se corrige (fin >= inicio)')

// Regularidad
marcar(calcularRegularidad({ sdnn: 0, bpm: 60 }) === 1, 'Regularidad: sin variación = 1')
marcar(calcularRegularidad({ sdnn: 500, bpm: 60 }) === 0, 'Regularidad: muy variable = 0')
marcar(calcularRegularidad({ sdnn: 30, bpm: 0 }) === null, 'Regularidad sin BPM = vacía')

// Errores
marcar(clasificarErrorGuardado({ code: '23505' }) === 'duplicada', 'Error 23505 = ya estaba guardada')
marcar(clasificarErrorGuardado({ code: '42501', message: 'row-level security' }) === 'sin_permiso', 'RLS = sin permiso')
marcar(clasificarErrorGuardado({ code: '23514', message: 'Se requiere consentimiento informado vigente antes de medir' }) === 'consentimiento',
  'Falta de consentimiento se distingue')
marcar(clasificarErrorGuardado({ code: '23514', message: 'violates check constraint "mediciones_calidad_no_mala"' }) === 'calidad_mala',
  'La regla de calidad mala de la base se distingue')
marcar(clasificarErrorGuardado(new TypeError('Failed to fetch')) === 'conexion', 'Falla de red = sin conexión')
marcar(clasificarErrorGuardado({ message: 'algo raro' }) === 'generico', 'Otro error = genérico')

// Historial
const r = resumirParaHistorial({ id: 'a', inicio: 'x', bpm_promedio: '72.3', spo2_promedio: null, ritmo: 'normal', actividad: { nombre: 'Reposo' } })
marcar(r.bpm === 72.3 && r.spo2 === null && r.actividad === 'Reposo', 'El historial convierte los números y la actividad')

// Cola sin conexión
const s = falso()
marcar(agregarPendiente(ok.fila, s) && listarPendientes('u1', s).length === 1, 'Una medición sin conexión queda en cola')
agregarPendiente(ok.fila, s)
marcar(listarPendientes(null, s).length === 1, 'La misma medición no se duplica en la cola')
marcar(listarPendientes('otro', s).length === 0, 'Cada cuenta ve solo sus pendientes')
marcar(!agregarPendiente({ ...ok.fila, id_cliente: null }, s), 'Sin id_cliente no entra a la cola')
quitarPendiente(UUID, s)
marcar(listarPendientes(null, s).length === 0, 'Al enviarse sale de la cola')
agregarPendiente(ok.fila, s)
borrarPendientes(s)
marcar(listarPendientes(null, s).length === 0, 'Al cerrar sesión la cola se borra')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
