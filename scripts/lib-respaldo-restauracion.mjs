/**
 * ============================================================================
 * sensor_pulso · Librería de Respaldo y Restauración de Base de Datos (RF71)
 * ============================================================================
 * Implementa las funciones de generación de copia de seguridad (dump),
 * restauración en entorno de pruebas y verificación de integridad criptográfica
 * (incluyendo descifrado de salud según RF116 / ISO 27001 A.8.13).
 * ============================================================================
 */

import crypto from 'node:crypto'
import {
  cifrarFactores,
  descifrarSobre,
  versionActiva
} from '../api/_lib/cifradoSalud.js'

/** Versión del formato de copia de seguridad */
export const VERSION_DUMP = '1.0.0'

/**
 * Genera un hash SHA-256 de un objeto o texto para control de integridad.
 * @param {any} dato
 * @returns {string}
 */
export function calcularChecksum(dato) {
  const serializado = typeof dato === 'string' ? dato : JSON.stringify(dato)
  return crypto.createHash('sha256').update(serializado).digest('hex')
}

/**
 * Genera un dump lógico estructurado con control de integridad.
 * @param {object} tablas - Diccionario de colecciones (perfiles, mediciones, etc.)
 * @param {object} [metadatosExtra]
 * @returns {object} Contenedor de copia de seguridad
 */
export function generarCopiaSeguridad(tablas = {}, metadatosExtra = {}) {
  const tablasCopiadas = {}
  const resumenConteo = {}

  for (const [nombreTabla, filas] of Object.entries(tablas)) {
    const listaFilas = Array.isArray(filas) ? filas : []
    // Clonación profunda para evitar mutaciones de referencia
    tablasCopiadas[nombreTabla] = JSON.parse(JSON.stringify(listaFilas))
    resumenConteo[nombreTabla] = listaFilas.length
  }

  const payload = {
    formato: 'sensor_pulso_dump',
    versionDump: VERSION_DUMP,
    creadoEn: new Date().toISOString(),
    origen: metadatosExtra.origen || 'produccion_supabase',
    tipo: metadatosExtra.tipo || 'copia_logica_independiente',
    resumenConteo,
    tablas: tablasCopiadas
  }

  const checksum = calcularChecksum(payload.tablas)

  return {
    ...payload,
    checksum,
    firmaIntegridad: `SHA256:${checksum}`
  }
}

/**
 * Simula la restauración de una copia de seguridad en un entorno de pruebas aislado.
 * @param {object} copiaSeguridad - Objeto generado por generarCopiaSeguridad
 * @param {object} [entornoDestino] - Contenedor en memoria donde se inyectarán las tablas
 * @returns {{ exito: boolean, tablasRestauradas: string[], totalFilas: number, tiempoMs: number }}
 */
export async function restaurarCopiaSeguridad(copiaSeguridad, entornoDestino = {}) {
  const inicioMs = Date.now()

  if (!copiaSeguridad || typeof copiaSeguridad !== 'object') {
    throw new Error('Copia de seguridad inválida o corrupta.')
  }

  if (copiaSeguridad.formato !== 'sensor_pulso_dump') {
    throw new Error(`Formato de copia desconocido: ${copiaSeguridad.formato}`)
  }

  // Verificar checksum de integridad antes de restaurar
  const checksumCalculado = calcularChecksum(copiaSeguridad.tablas)
  if (checksumCalculado !== copiaSeguridad.checksum) {
    throw new Error('Fallo de integridad: El checksum del dump no coincide con los datos.')
  }

  let totalFilas = 0
  const tablasRestauradas = []

  // Restauración tabla por tabla
  for (const [tabla, filas] of Object.entries(copiaSeguridad.tablas || {})) {
    entornoDestino[tabla] = JSON.parse(JSON.stringify(filas))
    tablasRestauradas.push(tabla)
    totalFilas += filas.length
  }

  const tiempoMs = Date.now() - inicioMs

  return {
    exito: true,
    tablasRestauradas,
    totalFilas,
    tiempoMs
  }
}

/**
 * Compara dos entornos (original vs restaurado) y valida que coincidan al 100%.
 * @param {object} origen
 * @param {object} destino
 * @returns {{ coinciden: boolean, discrepancias: string[] }}
 */
export function verificarIntegridadRestauracion(origen = {}, destino = {}) {
  const discrepancias = []
  const todasLasTablas = new Set([
    ...Object.keys(origen),
    ...Object.keys(destino)
  ])

  for (const tabla of todasLasTablas) {
    const filasOrigen = origen[tabla] || []
    const filasDestino = destino[tabla] || []

    if (filasOrigen.length !== filasDestino.length) {
      discrepancias.push(
        `Tabla ${tabla}: filas origen (${filasOrigen.length}) != filas destino (${filasDestino.length})`
      )
      continue
    }

    const hashOrigen = calcularChecksum(filasOrigen)
    const hashDestino = calcularChecksum(filasDestino)

    if (hashOrigen !== hashDestino) {
      discrepancias.push(`Tabla ${tabla}: los contenidos no coinciden exactamente (hash mismatch)`)
    }
  }

  return {
    coinciden: discrepancias.length === 0,
    discrepancias
  }
}

/**
 * Valida que una ficha de salud cifrada con RF116 en el respaldo pueda ser
 * descifrada íntegramente tras la restauración utilizando la clave en custodia.
 *
 * @param {string} sobreHex - Cadena hexadecimal del sobre cifrado (SPC...)
 * @param {string} claveCifrado - Clave secreta AES-256
 * @returns {Promise<{ exito: boolean, datosDescifrados?: object, error?: string }>}
 */
export async function probarDescifradoFichaSalud(sobreHex, claveCifrado) {
  if (!sobreHex || !claveCifrado) {
    return { exito: false, error: 'Sobre y clave requeridos' }
  }

  const envSimulado = {
    CLAVE_CIFRADO_CAMPOS: claveCifrado,
    CLAVE_VERSION_ACTIVA: '1'
  }

  try {
    const descifrado = await descifrarSobre(sobreHex, { env: envSimulado })
    return { exito: true, datosDescifrados: descifrado }
  } catch (err) {
    return { exito: false, error: err.message }
  }
}

/**
 * Cifra datos de salud de prueba para simular registros reales antes de respaldar.
 * @param {object} datos
 * @param {string} claveCifrado
 * @returns {Promise<string>}
 */
export async function cifrarDatosSaludPrueba(datos, claveCifrado) {
  const envSimulado = {
    CLAVE_CIFRADO_CAMPOS: claveCifrado,
    CLAVE_VERSION_ACTIVA: '1'
  }
  const { hex } = await cifrarFactores(datos, { version: 1, env: envSimulado })
  return hex
}
