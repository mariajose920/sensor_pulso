#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso Â· Pruebas Automatizadas de RF72
 * NotificaciÃ³n AutomÃ¡tica de Alertas de Seguridad al Administrador
 * ============================================================================
 * Criterios de AceptaciÃ³n:
 *   1. Un evento sospechoso simulado genera un correo al administrador.
 *   2. No se repite el mismo aviso muchas veces (anti-spam / deduplicaciÃ³n).
 *   3. El aviso no incluye secretos ni datos de salud.
 *   4. Pendiente de decisiÃ³n humana: configurable quiÃ©n recibe los avisos.
 * ============================================================================
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  esEventoCritico,
  sanitizarDetallesParaAlerta,
  comprobarDeduplicacion,
  limpiarCacheDeduplicacion,
  obtenerDestinatarioAdmin,
  procesarAlertaSeguridad,
  PATRONES_SECRETOS,
  PATRONES_DATOS_SALUD
} from '../api/_lib/alertasSeguridad.js'
import { usarTransporte } from '../api/_lib/correo.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

let totalPruebas = 0
let pruebasPasadas = 0
let pruebasFalladas = 0

async function test(nombre, fn) {
  totalPruebas++
  try {
    await fn()
    pruebasPasadas++
    console.log(`  âœ… [PASS] ${nombre}`)
  } catch (err) {
    pruebasFalladas++
    console.error(`  âŒ [FAIL] ${nombre}`)
    console.error(`     Error: ${err.message}`)
  }
}

console.log('\n============================================================')
console.log('ðŸ§ª Iniciando Pruebas Automatizadas de RF72: Alertas Seguridad')
console.log('============================================================\n')

async function runTests() {
  // --------------------------------------------------------------------------
  // Grupo 1: DetecciÃ³n y ClasificaciÃ³n de Eventos Sospechosos
  // --------------------------------------------------------------------------
  console.log('ðŸ” Grupo 1: ClasificaciÃ³n de Eventos Sospechosos')

  await test('Detecta correctamente eventos sospechosos y crÃ­ticos', () => {
    assert.strictEqual(esEventoCritico({ accion: 'login_fallido_masivo' }), true)
    assert.strictEqual(esEventoCritico({ accion: 'token_esp32_revocado' }), true)
    assert.strictEqual(esEventoCritico({ accion: 'rate_limit_excedido' }), true)
    assert.strictEqual(esEventoCritico({ accion: 'login', sospechoso: true }), true)
    assert.strictEqual(esEventoCritico({ accion: 'login', severidad: 'alta' }), true)
  })

  await test('Descarta eventos ordinarios no crÃ­ticos', () => {
    assert.strictEqual(esEventoCritico({ accion: 'login', sospechoso: false }), false)
    assert.strictEqual(esEventoCritico({ accion: 'descarga_csv', severidad: 'baja' }), false)
    assert.strictEqual(esEventoCritico({ accion: 'consulta_historial' }), false)
  })

  // --------------------------------------------------------------------------
  // Grupo 2: Criterio 1 - EnvÃ­o de Correo al Administrador
  // --------------------------------------------------------------------------
  console.log('\nðŸ“§ Grupo 2: Criterio 1 - GeneraciÃ³n de Correo al Administrador')

  await test('Un evento sospechoso genera un correo al administrador', async () => {
    limpiarCacheDeduplicacion()
    const correosEnviados = []
    usarTransporte({
      sendMail: async (opts) => {
        correosEnviados.push(opts)
        return { messageId: 'msg-test-rf72-001' }
      }
    })

    const eventoSospechoso = {
      accion: 'token_esp32_revocado',
      entidad_id: 'esp32_laboratorio_01',
      sospechoso: true,
      ip: '192.168.1.105',
      detalles: { motivo: 'Intento de telemetrÃ­a con token no autorizado' }
    }

    const res = await procesarAlertaSeguridad(eventoSospechoso)
    assert.strictEqual(res.ok, true, 'El resultado debe ser exitoso')
    assert.strictEqual(res.enviado, true, 'El correo debe figurar como enviado')
    assert.strictEqual(correosEnviados.length, 1, 'Debe despacharse exactamente un correo')

    const mail = correosEnviados[0]
    assert.ok(mail.to.includes('@'), 'El correo debe tener destinatario vÃ¡lido')
    assert.ok(mail.subject.includes('[ALERTA SEGURIDAD]'), 'El asunto debe indicar alerta de seguridad')
    assert.ok(mail.text.includes('TOKEN_ESP32_REVOCADO'), 'El texto debe describir el incidente')
  })

  // --------------------------------------------------------------------------
  // Grupo 3: Criterio 2 - Mecanismo Anti-Spam / DeduplicaciÃ³n
  // --------------------------------------------------------------------------
  console.log('\nðŸ›‘ Grupo 3: Criterio 2 - No RepeticiÃ³n de Avisos (DeduplicaciÃ³n)')

  await test('No se repite el mismo aviso ante una rÃ¡faga masiva de eventos', async () => {
    limpiarCacheDeduplicacion()
    const correosEnviados = []
    usarTransporte({
      sendMail: async (opts) => {
        correosEnviados.push(opts)
        return { messageId: `msg-${correosEnviados.length}` }
      }
    })

    const eventoRepetido = {
      accion: 'fuerza_bruta',
      entidad_id: 'cuenta_profesor_01',
      sospechoso: true,
      ip: '200.54.12.34',
      detalles: { intentos: 15 }
    }

    // Simulamos 5 intentos de ataque seguidos
    const respuestas = []
    for (let i = 0; i < 5; i++) {
      const r = await procesarAlertaSeguridad(eventoRepetido)
      respuestas.push(r)
    }

    // Primer intento debe enviar correo
    assert.strictEqual(respuestas[0].enviado, true, 'El primer evento debe enviar correo')

    // Intentos 2 a 5 deben ser suprimidos por cooldown activo
    for (let i = 1; i < 5; i++) {
      assert.strictEqual(respuestas[i].enviado, false, `El intento ${i + 1} no debe enviar correo duplicado`)
      assert.strictEqual(respuestas[i].motivo, 'cooldown_activo')
      assert.strictEqual(respuestas[i].suprimidos, i, `Debe contabilizar ${i} suprimidos`)
    }

    assert.strictEqual(correosEnviados.length, 1, 'A pesar de 5 eventos seguidos, solo se enviÃ³ 1 correo')
  })

  // --------------------------------------------------------------------------
  // Grupo 4: Criterio 3 - Cero Secretos y Cero Datos de Salud
  // --------------------------------------------------------------------------
  console.log('\nðŸ”’ Grupo 4: Criterio 3 - ProtecciÃ³n de Privacidad y Secretos')

  await test('El correo no incluye secretos (contraseÃ±as, tokens JWT, claves)', async () => {
    limpiarCacheDeduplicacion()
    let correoCapturado = null
    usarTransporte({
      sendMail: async (opts) => {
        correoCapturado = opts
        return { messageId: 'msg-secrets-test' }
      }
    })

    const eventoConSecretos = {
      accion: 'login_fallido_masivo',
      entidad_id: 'user_prueba',
      sospechoso: true,
      detalles: {
        password: 'PasswordSuperSecreta123!',
        jwt: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'].join('.'),
        secret_key: 'sb_' + 'secret_' + '998877665544332211',
        token_completo: 'esp_token_987654321_secreto',
        ip: '10.0.0.15'
      }
    }

    await procesarAlertaSeguridad(eventoConSecretos, { forzarEnvio: true })
    assert.ok(correoCapturado, 'Debe haberse generado el correo')

    const cuerpoCompleto = `${correoCapturado.text} ${correoCapturado.html}`

    assert.strictEqual(cuerpoCompleto.includes('PasswordSuperSecreta123!'), false, 'No debe filtrar la contraseÃ±a')
    assert.strictEqual(cuerpoCompleto.includes('sb_' + 'secret_'), false, 'No debe filtrar tokens con sb_secret_')
    assert.strictEqual(cuerpoCompleto.includes('esp_token_987654321_secreto'), false, 'No debe filtrar tokens de ESP32')
    assert.strictEqual(cuerpoCompleto.includes('eyJhbGci'), false, 'No debe filtrar JWTs')
  })

  await test('El correo no incluye datos de salud clÃ­nica (BPM, SpO2, arritmias)', async () => {
    limpiarCacheDeduplicacion()
    let correoCapturado = null
    usarTransporte({
      sendMail: async (opts) => {
        correoCapturado = opts
        return { messageId: 'msg-health-test' }
      }
    })

    const eventoConDatosSalud = {
      accion: 'dos_detectado',
      entidad_id: 'sensor_02',
      timestamp: '2026-11-15T12:00:00.000Z',
      sospechoso: true,
      detalles: {
        bpm: 185,
        spo2: 89,
        diagnostico: 'taquicardia severa con arritmia ventricular',
        curva: [120, 130, 140, 150]
      }
    }

    await procesarAlertaSeguridad(eventoConDatosSalud, { forzarEnvio: true })
    assert.ok(correoCapturado, 'Debe haberse generado el correo')

    const cuerpoCompleto = `${correoCapturado.text} ${correoCapturado.html}`

    assert.strictEqual(cuerpoCompleto.includes('185'), false, 'No debe incluir el valor de BPM')
    assert.strictEqual(cuerpoCompleto.includes('89'), false, 'No debe incluir el valor de SpO2')
    assert.strictEqual(/taquicardia/i.test(cuerpoCompleto), false, 'No debe incluir diagnÃ³sticos ni patologÃ­as')
  })

  // --------------------------------------------------------------------------
  // Grupo 5: Arquitectura, DocumentaciÃ³n y Endpoints
  // --------------------------------------------------------------------------
  console.log('\nðŸ“‹ Grupo 5: Archivos, DocumentaciÃ³n y ConfiguraciÃ³n')

  await test('Existe el endpoint api/seguridad/alertas.js con exportaciÃ³n default', () => {
    const ruta = path.join(ROOT, 'api', 'seguridad', 'alertas.js')
    assert.ok(fs.existsSync(ruta), 'El endpoint api/seguridad/alertas.js debe existir')
    const contenido = fs.readFileSync(ruta, 'utf8')
    assert.ok(contenido.includes('export default async function handler'), 'Debe exportar un handler Vercel Serverless')
  })

  await test('Existe la documentaciÃ³n docs/RF72-alertas-seguridad.md', () => {
    const rutaDoc = path.join(ROOT, 'docs', 'RF72-alertas-seguridad.md')
    assert.ok(fs.existsSync(rutaDoc), 'El documento docs/RF72-alertas-seguridad.md debe existir')
    const contenido = fs.readFileSync(rutaDoc, 'utf8')
    assert.ok(/A\.8\.16/i.test(contenido), 'Debe referenciar el control ISO 27001 A.8.16')
    assert.ok(/deduplicaci[Ã³o]n|cooldown/i.test(contenido), 'Debe documentar la deduplicaciÃ³n')
  })

  await test('docs/iso27001/04-continuidad-monitoreo-y-vulnerabilidades.md refleja RF72 implementado', () => {
    const rutaIso = path.join(ROOT, 'docs', 'iso27001', '04-continuidad-monitoreo-y-vulnerabilidades.md')
    const contenido = fs.readFileSync(rutaIso, 'utf8')
    assert.ok(contenido.includes('RF72'), 'Debe mencionar RF72')
    assert.ok(contenido.includes('alertasSeguridad.js'), 'Debe mencionar el servicio de alertas')
  })

  // --------------------------------------------------------------------------
  // Resumen
  // --------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------')
  console.log(`Pruebas completadas: ${totalPruebas}`)
  console.log(`  Pasadas:  ${pruebasPasadas}`)
  console.log(`  Falladas: ${pruebasFalladas}`)
  console.log('------------------------------------------------------------\n')

  if (pruebasFalladas > 0) {
    console.error('âŒ Algunas pruebas de RF72 fallaron.\n')
    process.exit(1)
  } else {
    console.log('ðŸŽ‰ Todas las pruebas de RF72 pasaron exitosamente.\n')
    process.exit(0)
  }
}

runTests().catch((e) => {
  console.error('Error no capturado:', e)
  process.exit(1)
})
