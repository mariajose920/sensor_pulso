import crypto from 'crypto'

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF54')
console.log('  Autenticación de ESP32 con Token Propio y Revocación por Admin')
console.log('================================================================\n')

// 1. Simulación de la tabla 'dispositivos' y 'eventos_seguridad' según las migraciones
const dbDispositivos = []
const dbEventosSeguridad = []

// Función para generar token (idéntica a la función PL/pgSQL crear_dispositivo de la migración 9)
function crearDispositivoSQL(nombre, canales = 5, adminId = 'admin-unach-uuid') {
  const tokenBytes = crypto.randomBytes(24).toString('hex')
  const token = `esp_${tokenBytes}`
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const id = `disp-${Date.now()}`
  const nuevoRegistro = {
    id,
    nombre,
    token_hash: tokenHash, // En la BD sólo queda SHA-256 (ISO 27001 A.8.2)
    canales,
    activo: true,
    revocado_en: null,
    revocado_por: null,
    ultimo_contacto: null,
    creado_por: adminId,
    creado_en: new Date().toISOString()
  }

  dbDispositivos.push(nuevoRegistro)
  return { id, token } // El token se retorna sólo en la creación
}

// Función para validar token (idéntica a la función PL/pgSQL validar_token_dispositivo de la migración 9)
function validarTokenSQL(token) {
  if (!token || typeof token !== 'string') return null
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const disp = dbDispositivos.find(d => d.token_hash === hash && d.activo && !d.revocado_en)

  if (disp) {
    disp.ultimo_contacto = new Date().toISOString()
    return { valido: true, dispositivo_id: disp.id, canales: disp.canales, nombre: disp.nombre }
  }
  return { valido: false, error: 'Token no autorizado o revocado' }
}

// Función para revocar token (idéntica a revocar_dispositivo de la migración 9)
function revocarDispositivoSQL(dispositivoId, motivo = 'Token comprometido', adminId = 'admin-unach-uuid') {
  const disp = dbDispositivos.find(d => d.id === dispositivoId && d.activo)
  if (!disp) return false

  disp.activo = false
  disp.revocado_en = new Date().toISOString()
  disp.revocado_por = adminId

  // Registro de evento de seguridad (RF72)
  dbEventosSeguridad.push({
    tipo: 'token_esp32_comprometido',
    severidad: 'alta',
    descripcion: 'Se revocó el token de un ESP32',
    detalles: { dispositivo_id: dispositivoId, motivo }
  })

  return true
}

// --- EJECUCIÓN DE PRUEBAS ---
async function ejecutarPruebasRF54() {
  let errores = 0

  // Caso 1: Generación de token único y almacenamiento seguro del hash
  console.log('▶ [Prueba 1] Creación de dispositivo y generación de token criptográfico...');
  const { id, token } = crearDispositivoSQL('ESP32-Laboratorio-1', 5)
  if (!token.startsWith('esp_') || token.length < 32) {
    console.error('❌ Error: Formato de token inválido:', token)
    errores++
  } else {
    console.log(`✅ Token generado correctamente: ${token.substring(0, 12)}... (Longitud: ${token.length})`)
  }

  const enDb = dbDispositivos.find(d => d.id === id)
  if (!enDb || enDb.token_hash === token) {
    console.error('❌ Error: El token fue guardado en texto plano en la base de datos!')
    errores++
  } else {
    console.log(`✅ En la base de datos únicamente se almacena el SHA-256: ${enDb.token_hash.substring(0, 16)}...`)
  }

  // Caso 2: Validación exitosa de un token activo
  console.log('\n▶ [Prueba 2] Validación de token activo (microcontrolador conectándose)...');
  const resValid = validarTokenSQL(token)
  if (!resValid.valido || resValid.dispositivo_id !== id) {
    console.error('❌ Error: El token activo no fue validado exitosamente:', resValid)
    errores++
  } else {
    console.log(`✅ Validación exitosa para ${resValid.nombre} (ID: ${resValid.dispositivo_id})`)
    console.log(`✅ Marca de último contacto actualizada: ${enDb.ultimo_contacto}`)
  }

  // Caso 3: Rechazo de token inexistente o alterado
  console.log('\n▶ [Prueba 3] Rechazo de token inválido o alterado...');
  const resInvalido = validarTokenSQL('esp_tokenfalso1234567890abcdef')
  if (resInvalido.valido) {
    console.error('❌ Error: Un token falso fue aceptado!')
    errores++
  } else {
    console.log('✅ Token falso rechazado correctamente:', resInvalido.error)
  }

  // Caso 4: Revocación por el administrador (RF54)
  console.log('\n▶ [Prueba 4] Revocación de token por el administrador...');
  const exitoRevocacion = revocarDispositivoSQL(id, 'Prueba de fuga de credenciales')
  if (!exitoRevocacion || enDb.activo !== false || !enDb.revocado_en) {
    console.error('❌ Error al revocar dispositivo:', enDb)
    errores++
  } else {
    console.log(`✅ Dispositivo marcado como inactivo (revocado_en: ${enDb.revocado_en})`)
    console.log(`✅ Evento de seguridad registrado: ${dbEventosSeguridad[0]?.tipo} (Severidad: ${dbEventosSeguridad[0]?.severidad})`)
  }

  // Caso 5: Verificación inmediata de que el token revocado es bloqueado
  console.log('\n▶ [Prueba 5] Verificación de rechazo inmediato del token revocado...');
  const resPostRevocacion = validarTokenSQL(token)
  if (resPostRevocacion.valido) {
    console.error('❌ Error: Un token revocado fue aceptado por el sistema!')
    errores++
  } else {
    console.log('✅ Token revocado bloqueado con éxito. Acceso denegado.')
  }

  console.log('\n----------------------------------------------------------------')
  if (errores === 0) {
    console.log('🎉 TODAS LAS PRUEBAS DE RF54 PASARON SATISFACTORIAMENTE (5/5)')
    console.log('----------------------------------------------------------------\n')
  } else {
    console.error(`💥 SE DETECTARON ${errores} ERRORES EN LAS PRUEBAS`)
    process.exit(1)
  }
}

ejecutarPruebasRF54()
