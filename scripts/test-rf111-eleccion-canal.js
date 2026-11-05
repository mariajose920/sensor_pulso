/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF111
 * ============================================================================
 * Requerimiento RF111:
 *   - Elección de canal libre (1 a 5) por el estudiante (atómico).
 *   - Un estudiante solo puede tener 1 canal activo por sesión.
 *   - Corrección, asignación manual y liberación de canales por el profesor.
 *   - Rondas de 5 estudiantes: incremento de ronda y liberación masiva atómica.
 * ============================================================================
 */

console.log('================================================================')
console.log('  sensor_pulso · Suite de Pruebas RF111: Elección de Canal y Rondas')
console.log('================================================================\n')

// ----------------------------------------------------------------------------
// Simulador en memoria de Supabase para RF111
// ----------------------------------------------------------------------------
class SimuladorSupabaseRF111 {
  constructor() {
    this.sesiones = []
    this.canales = []
  }

  crearSesion(dispositivoId = 'ESP32-Biomedico-01', iniciadaPor = 'usr-docente-01') {
    const sesion = {
      id: `ses-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      dispositivo_id: dispositivoId,
      iniciada_por: iniciadaPor,
      ronda: 1,
      estado: 'activa',
      inicio: new Date().toISOString()
    }
    this.sesiones.push(sesion)

    // Trigger automático: crear los 5 canales físicos
    for (let i = 1; i <= 5; i++) {
      this.canales.push({
        sesion_id: sesion.id,
        canal: i,
        usuario_id: null,
        usuario_nombre: null,
        asignado_en: null
      })
    }
    return sesion
  }

  // Función RPC atómica: elegir_canal(p_sesion, p_canal)
  elegirCanal(sesionId, canalNum, usuarioId, usuarioNombre) {
    const sesion = this.sesiones.find(s => s.id === sesionId && s.estado === 'activa')
    if (!sesion) throw new Error('Sesión no encontrada o inactiva')

    if (canalNum < 1 || canalNum > 5) {
      throw new Error('Canal fuera de rango (debe ser entre 1 y 5)')
    }

    // Regla de unicidad: un usuario solo puede tener 1 canal asignado
    const previo = this.canales.find(c => c.sesion_id === sesionId && c.usuario_id === usuarioId)
    if (previo && previo.canal !== canalNum) {
      throw new Error(`El usuario ya tiene asignado el Canal ${previo.canal}. Debe liberarlo primero.`)
    }

    // Regla atómica: el canal debe estar libre
    const target = this.canales.find(c => c.sesion_id === sesionId && c.canal === canalNum)
    if (!target) throw new Error('Canal no encontrado')
    if (target.usuario_id !== null && target.usuario_id !== usuarioId) {
      return false // Ocupado atómicamente por otro estudiante
    }

    target.usuario_id = usuarioId
    target.usuario_nombre = usuarioNombre
    target.asignado_en = new Date().toISOString()
    return true
  }

  // Desvincular canal propio
  liberarCanal(sesionId, usuarioId) {
    const target = this.canales.find(c => c.sesion_id === sesionId && c.usuario_id === usuarioId)
    if (!target) return false
    const canalNum = target.canal
    target.usuario_id = null
    target.usuario_nombre = null
    target.asignado_en = null
    return canalNum
  }

  // Asignar o liberar como profesor: asignar_canal(p_sesion, p_canal, p_usuario)
  asignarCanalDocente(sesionId, canalNum, nuevoUsuarioId, nuevoUsuarioNombre) {
    const target = this.canales.find(c => c.sesion_id === sesionId && c.canal === canalNum)
    if (!target) throw new Error('Canal no encontrado')

    target.usuario_id = nuevoUsuarioId
    target.usuario_nombre = nuevoUsuarioNombre
    target.asignado_en = nuevoUsuarioId ? new Date().toISOString() : null
    return true
  }

  // Avanzar ronda (RF111): incrementa ronda y libera los 5 canales
  abrirSiguienteRonda(sesionId) {
    const sesion = this.sesiones.find(s => s.id === sesionId && s.estado === 'activa')
    if (!sesion) throw new Error('Sesión no encontrada o inactiva')

    sesion.ronda += 1

    this.canales
      .filter(c => c.sesion_id === sesionId)
      .forEach(c => {
        c.usuario_id = null
        c.usuario_nombre = null
        c.asignado_en = null
      })

    return sesion.ronda
  }

  // Obtener estado de métricas de ronda
  calcularMetricasRonda(sesionId) {
    const sesion = this.sesiones.find(s => s.id === sesionId)
    const canalesSesion = this.canales.filter(c => c.sesion_id === sesionId)
    const ocupados = canalesSesion.filter(c => c.usuario_id !== null).length
    const libres = 5 - ocupados
    return {
      rondaActual: sesion ? sesion.ronda : 1,
      canalesOcupados: ocupados,
      canalesLibres: libres,
      rondaCompleta: ocupados === 5,
      porcentajeOcupacion: Math.round((ocupados / 5) * 100)
    }
  }
}

// ----------------------------------------------------------------------------
// Ejecución de Pruebas
// ----------------------------------------------------------------------------
async function runTests() {
  const db = new SimuladorSupabaseRF111()
  let fallos = 0
  let exitos = 0

  function assert(condicion, titulo, detalle = '') {
    if (condicion) {
      console.log(`  ✓ ${titulo}`)
      exitos++
    } else {
      console.error(`  ✖ FALLO: ${titulo}`)
      if (detalle) console.error(`    Detalle: ${detalle}`)
      fallos++
    }
  }

  console.log('--- 1. Inicialización y Estructura de 5 Canales (RF111) ---')
  const sesion = db.crearSesion()
  const metricas0 = db.calcularMetricasRonda(sesion.id)
  assert(metricas0.rondaActual === 1, 'La sesión inicia en la Ronda 1')
  assert(metricas0.canalesLibres === 5, 'Los 5 canales inician disponibles (libres)')
  assert(metricas0.rondaCompleta === false, 'La ronda inicial no está completa (0/5)')

  console.log('\n--- 2. Elección Atómica de Canal Libre por Estudiantes ---')
  // Estudiante 1 elige Canal 1
  const ok1 = db.elegirCanal(sesion.id, 1, 'usr-adan-01', 'Adán Ramos')
  assert(ok1 === true, 'Estudiante 1 elige exitosamente el Canal 1 libre')

  // Estudiante 2 intenta tomar el mismo Canal 1 (debe ser rechazado atómicamente)
  const ok2Rechazo = db.elegirCanal(sesion.id, 1, 'usr-maria-02', 'María José')
  assert(ok2Rechazo === false, 'Estudiante 2 es rechazado al intentar tomar Canal 1 ya ocupado')

  // Estudiante 2 toma el Canal 2 libre
  const ok2 = db.elegirCanal(sesion.id, 2, 'usr-maria-02', 'María José')
  assert(ok2 === true, 'Estudiante 2 toma exitosamente el Canal 2 libre')

  console.log('\n--- 3. Regla de Unicidad: 1 Solo Canal por Usuario ---')
  let rechazoUnicidad = false
  try {
    // Adán ya tiene el Canal 1, intenta tomar también el Canal 3
    db.elegirCanal(sesion.id, 3, 'usr-adan-01', 'Adán Ramos')
  } catch (err) {
    rechazoUnicidad = true
  }
  assert(rechazoUnicidad === true, 'Se bloquea intento de tomar un segundo canal sin liberar el primero')

  console.log('\n--- 4. Liberación Voluntaria de Canal ---')
  const canalLiberado = db.liberarCanal(sesion.id, 'usr-adan-01')
  assert(canalLiberado === 1, 'Estudiante 1 libera exitosamente el Canal 1')

  // Ahora María puede cambiarse al Canal 1 tras liberar el Canal 2
  db.liberarCanal(sesion.id, 'usr-maria-02')
  const ok1Maria = db.elegirCanal(sesion.id, 1, 'usr-maria-02', 'María José')
  assert(ok1Maria === true, 'Canal 1 liberado puede ser tomado inmediatamente por otro estudiante')

  console.log('\n--- 5. Completar Tanda de 5 Estudiantes (Ronda Completa) ---')
  // Asignar los 5 canales
  db.elegirCanal(sesion.id, 2, 'usr-carlos-03', 'Carlos Soto')
  db.elegirCanal(sesion.id, 3, 'usr-paula-04', 'Paula Díaz')
  db.elegirCanal(sesion.id, 4, 'usr-diego-05', 'Diego Flores')
  db.elegirCanal(sesion.id, 5, 'usr-lucas-06', 'Lucas Rivas')

  const metricasFull = db.calcularMetricasRonda(sesion.id)
  assert(metricasFull.canalesOcupados === 5, 'Los 5 canales físicos están ocupados')
  assert(metricasFull.canalesLibres === 0, '0 canales libres restantes')
  assert(metricasFull.rondaCompleta === true, 'Se detecta tanda completa de 5 alumnos (RF111)')
  assert(metricasFull.porcentajeOcupacion === 100, 'Ocupación de la ronda al 100%')

  console.log('\n--- 6. Corrección y Liberación por el Docente (asignar_canal) ---')
  // El docente libera el Canal 3 forzadamente
  db.asignarCanalDocente(sesion.id, 3, null, null)
  const metricasDocente = db.calcularMetricasRonda(sesion.id)
  assert(metricasDocente.canalesOcupados === 4, 'El docente liberó el Canal 3 (4 canales ocupados)')

  // El docente asigna manualmente a un estudiante al Canal 3
  db.asignarCanalDocente(sesion.id, 3, 'usr-sofia-07', 'Sofía Castro')
  const canal3 = db.canales.find(c => c.sesion_id === sesion.id && c.canal === 3)
  assert(canal3.usuario_nombre === 'Sofía Castro', 'Docente reasignó exitosamente a Sofía Castro en Canal 3')

  console.log('\n--- 7. Avance a la Siguiente Ronda de 5 Estudiantes (RF111) ---')
  const nuevaRonda = db.abrirSiguienteRonda(sesion.id)
  assert(nuevaRonda === 2, 'La sesión avanza correctamente a la Ronda 2')

  const metricasR2 = db.calcularMetricasRonda(sesion.id)
  assert(metricasR2.rondaActual === 2, 'Metadato de ronda actual se actualiza a 2')
  assert(metricasR2.canalesLibres === 5, 'Los 5 canales quedan libres para la nueva tanda de 5 alumnos')
  assert(metricasR2.canalesOcupados === 0, '0 canales ocupados tras abrir nueva ronda')
  assert(metricasR2.rondaCompleta === false, 'Nueva ronda inicia disponible')

  console.log('\n================================================================')
  console.log(`  Resultados: ${exitos} pasadas, ${fallos} fallidas`)
  console.log('================================================================')

  if (fallos > 0) {
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Error no controlado en pruebas:', err)
  process.exit(1)
})
