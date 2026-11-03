console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF12 / RF111')
console.log('  Vinculación de ESP32 y Canales por Cuenta de Usuario')
console.log('================================================================\n')

// Simulación de las tablas sesiones_medicion y sesion_canales según la migración 4 de Supabase
const dbSesiones = []
const dbSesionCanales = []

// Función para crear sesión (simula trigger crear_canales_sesion de la migración 4)
function crearSesionMedicion(dispositivoId, iniciadaPor, numCanales = 5) {
  const sesionId = `ses-${Date.now()}`
  const sesion = {
    id: sesionId,
    dispositivo_id: dispositivoId,
    iniciada_por: iniciadaPor,
    ronda: 1,
    estado: 'activa',
    inicio: new Date().toISOString()
  }
  dbSesiones.push(sesion)

  // Trigger automático: crea las filas correspondientes a los 5 canales
  for (let c = 1; c <= numCanales; c++) {
    dbSesionCanales.push({
      sesion_id: sesionId,
      canal: c,
      usuario_id: null,
      asignado_en: null
    })
  }

  return sesion
}

// Simulación de la función PL/pgSQL elegir_canal(p_sesion, p_canal)
function elegirCanal(sesionId, canalNum, usuarioId) {
  const sesion = dbSesiones.find(s => s.id === sesionId)
  if (!sesion || sesion.estado !== 'activa') {
    throw new Error('Sesión no disponible')
  }

  // Regla: Un usuario solo puede tener un canal asignado a la vez (índice unique sesion_canal_un_usuario)
  const canalYaAsignado = dbSesionCanales.find(c => c.sesion_id === sesionId && c.usuario_id === usuarioId)
  if (canalYaAsignado) {
    throw new Error(`El usuario ya tiene asignado el canal ${canalYaAsignado.canal}`)
  }

  // Regla atómica: solo toma el canal si está libre (usuario_id is null)
  const filaCanal = dbSesionCanales.find(c => c.sesion_id === sesionId && c.canal === canalNum)
  if (!filaCanal) {
    throw new Error('Canal inválido')
  }
  if (filaCanal.usuario_id !== null) {
    return false // Ocupado
  }

  filaCanal.usuario_id = usuarioId
  filaCanal.asignado_en = new Date().toISOString()
  return true
}

// Simulación de asignar_canal(p_sesion, p_canal, p_usuario) del docente/admin
function asignarCanalDocente(sesionId, canalNum, nuevoUsuarioId) {
  const filaCanal = dbSesionCanales.find(c => c.sesion_id === sesionId && c.canal === canalNum)
  if (!filaCanal) throw new Error('Canal no encontrado')
  filaCanal.usuario_id = nuevoUsuarioId
  filaCanal.asignado_en = nuevoUsuarioId ? new Date().toISOString() : null
  return true
}

// Simulación de avanzar ronda (RF111)
function abrirSiguienteRonda(sesionId) {
  const sesion = dbSesiones.find(s => s.id === sesionId)
  if (!sesion) throw new Error('Sesión no encontrada')
  sesion.ronda += 1

  // Liberar los 5 canales para los siguientes 5 estudiantes
  dbSesionCanales
    .filter(c => c.sesion_id === sesionId)
    .forEach(c => {
      c.usuario_id = null
      c.asignado_en = null
    })

  return sesion.ronda
}

// --- EJECUCIÓN DE PRUEBAS ---
async function ejecutarPruebasRF12() {
  let errores = 0

  // Caso 1: Creación de sesión genera exactamente 5 canales en blanco
  console.log('▶ [Prueba 1] Creación de sesión e inicialización automática de 5 canales...');
  const sesion = crearSesionMedicion('disp-esp32-01', 'prof-carlos-id', 5)
  const canalesCreados = dbSesionCanales.filter(c => c.sesion_id === sesion.id)

  if (canalesCreados.length !== 5) {
    console.error('❌ Error: Se esperaban 5 canales iniciales, pero hay:', canalesCreados.length)
    errores++
  } else {
    console.log(`✅ 5 canales inicializados correctamente para la sesión ${sesion.id}`)
  }

  // Caso 2: El estudiante A toma el Canal 1 libre
  console.log('\n▶ [Prueba 2] Estudiante A elige el Canal 1 libre...');
  const okA = elegirCanal(sesion.id, 1, 'estudiante-adan-id')
  const canal1 = dbSesionCanales.find(c => c.sesion_id === sesion.id && c.canal === 1)

  if (!okA || canal1.usuario_id !== 'estudiante-adan-id') {
    console.error('❌ Error: Estudiante A no pudo tomar el Canal 1')
    errores++
  } else {
    console.log(`✅ Canal 1 vinculado con éxito a estudiante-adan-id (${canal1.asignado_en})`)
  }

  // Caso 3: El estudiante B intenta tomar el mismo Canal 1 (debe ser rechazado)
  console.log('\n▶ [Prueba 3] Estudiante B intenta tomar el Canal 1 (ya ocupado)...');
  const okB = elegirCanal(sesion.id, 1, 'estudiante-javiera-id')
  if (okB) {
    console.error('❌ Error: Estudiante B pudo tomar un canal que ya estaba ocupado!')
    errores++
  } else {
    console.log('✅ Rechazo correcto: El canal 1 está ocupado, estudiante B no puede sobrescribirlo.')
  }

  // Caso 4: Estudiante B elige el Canal 2 libre
  console.log('\n▶ [Prueba 4] Estudiante B elige el Canal 2 libre...');
  const okB2 = elegirCanal(sesion.id, 2, 'estudiante-javiera-id')
  const canal2 = dbSesionCanales.find(c => c.sesion_id === sesion.id && c.canal === 2)
  if (!okB2 || canal2.usuario_id !== 'estudiante-javiera-id') {
    console.error('❌ Error: Estudiante B no pudo tomar el Canal 2')
    errores++
  } else {
    console.log('✅ Canal 2 vinculado con éxito a estudiante-javiera-id')
  }

  // Caso 5: Estudiante A intenta tomar también el Canal 3 sin liberar el 1 (debe fallar)
  console.log('\n▶ [Prueba 5] Estudiante A intenta tomar un segundo canal (Canal 3)...');
  try {
    elegirCanal(sesion.id, 3, 'estudiante-adan-id')
    console.error('❌ Error: Se permitió a un usuario tomar más de 1 canal a la vez!')
    errores++
  } catch (err) {
    console.log('✅ Restricción cumplida:', err.message)
  }

  // Caso 6: El profesor libera el Canal 1 manualmente (RF111)
  console.log('\n▶ [Prueba 6] El profesor libera el Canal 1...');
  asignarCanalDocente(sesion.id, 1, null)
  if (canal1.usuario_id !== null) {
    console.error('❌ Error: El profesor no pudo liberar el canal 1')
    errores++
  } else {
    console.log('✅ Canal 1 liberado por el profesor. Queda disponible de nuevo.')
  }

  // Caso 7: Control de rondas (RF111) - Abrir siguiente ronda de 5
  console.log('\n▶ [Prueba 7] El profesor abre la siguiente ronda de 5 estudiantes (RF111)...');
  const nuevaRonda = abrirSiguienteRonda(sesion.id)
  const ocupadosDespues = dbSesionCanales.filter(c => c.sesion_id === sesion.id && c.usuario_id !== null).length

  if (nuevaRonda !== 2 || ocupadosDespues !== 0) {
    console.error(`❌ Error en apertura de ronda: ronda=${nuevaRonda}, ocupados=${ocupadosDespues}`)
    errores++
  } else {
    console.log(`✅ Ronda ${nuevaRonda} iniciada. Los 5 canales han sido liberados para el siguiente grupo.`)
  }

  console.log('\n----------------------------------------------------------------')
  if (errores === 0) {
    console.log('🎉 TODAS LAS PRUEBAS DE RF12 / RF111 PASARON SATISFACTORIAMENTE (7/7)')
    console.log('----------------------------------------------------------------\n')
  } else {
    console.error(`💥 SE DETECTARON ${errores} ERRORES EN LAS PRUEBAS`)
    process.exit(1)
  }
}

ejecutarPruebasRF12()
