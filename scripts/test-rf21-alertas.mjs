/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF21
 * Requerimiento: Alerta fuera de rango: visual, sonora y con registro en el historial.
 * ============================================================================
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

// Mock de localStorage y window para entorno Node
const mockStorage = new Map()
globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) ?? null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
}

globalThis.window = {
  AudioContext: class MockAudioContext {
    constructor() {
      this.state = 'running'
      this.currentTime = 0
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {}
      }
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {}
        },
        connect: () => {}
      }
    }
    resume() {
      return Promise.resolve()
    }
  },
  dispatchEvent: () => true
}

import {
  sonidoHabilitado,
  alarmaSonando,
  silenciadoTemporalmente,
  reproducirAlertaSonora,
  silenciarAlarma,
  reanudarAlarma,
  alternarHabilitacionSonido
} from '../src/utils/alertaSonora.js'

import {
  TIPOS_ALERTA_VALIDOS,
  METADATOS_ALERTAS,
  obtenerMetadatosAlerta,
  registrarAlerta,
  listarHistorialAlertas,
  obtenerAlertasLocales,
  limpiarAlertasLocales
} from '../src/services/alertasService.js'

let passed = 0
let failed = 0

function it(description, fn) {
  try {
    const res = fn()
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        console.log(`  [PASS] ${description}`)
        passed++
      }).catch((err) => {
        console.error(`  [FAIL] ${description}`)
        console.error(`     Error: ${err.message}\n`)
        failed++
      })
    }
    console.log(`  [PASS] ${description}`)
    passed++
  } catch (err) {
    console.error(`  [FAIL] ${description}`)
    console.error(`     Error: ${err.message}\n`)
    failed++
  }
}

async function runTests() {
  console.log('\n================================================================')
  console.log('  sensor_pulso · Pruebas Automatizadas de RF21')
  console.log('  Alerta Fuera de Rango: Visual, Sonora y con Registro en Historial')
  console.log('================================================================\n')

  // ----------------------------------------------------------------------------
  // PILAR 1: ALERTA SONORA (Web Audio API, Síntesis Tonal, Silenciamiento)
  // ----------------------------------------------------------------------------
  console.log('▶ [Pilar 1: Alerta Sonora] Verificación de Síntesis y Control Acústico...')

  it('Reproduce tono de taquicardia (bpm_alto) retornando true', () => {
    reanudarAlarma()
    alternarHabilitacionSonido(true)
    const emitió = reproducirAlertaSonora('bpm_alto', true)
    assert.strictEqual(emitió, true)
    assert.strictEqual(alarmaSonando.value, true)
  })

  it('Reproduce tono de desaturación de oxígeno (spo2_bajo)', () => {
    const emitió = reproducirAlertaSonora('spo2_bajo', true)
    assert.strictEqual(emitió, true)
  })

  it('Reproduce tono de bradicardia (bpm_bajo)', () => {
    const emitió = reproducirAlertaSonora('bpm_bajo', true)
    assert.strictEqual(emitió, true)
  })

  it('Silenciar alarma bloquea la emisión acústica inmediatamente', () => {
    silenciarAlarma()
    assert.strictEqual(silenciadoTemporalmente.value, true)
    assert.strictEqual(alarmaSonando.value, false)

    const intento = reproducirAlertaSonora('bpm_alto', true)
    assert.strictEqual(intento, false)
  })

  it('Reanudar alarma restaura la capacidad de emitir sonido', () => {
    reanudarAlarma()
    assert.strictEqual(silenciadoTemporalmente.value, false)

    const reanudado = reproducirAlertaSonora('bpm_alto', true)
    assert.strictEqual(reanudado, true)
  })

  it('Deshabilitar globalmente las alarmas sonoras persiste en localStorage y bloquea emisión', () => {
    alternarHabilitacionSonido(false)
    assert.strictEqual(sonidoHabilitado.value, false)
    assert.strictEqual(localStorage.getItem('sensor_alerta_sonora_habilitada'), 'false')

    const intento = reproducirAlertaSonora('bpm_alto', true)
    assert.strictEqual(intento, false)

    // Restaurar
    alternarHabilitacionSonido(true)
    assert.strictEqual(sonidoHabilitado.value, true)
  })

  // ----------------------------------------------------------------------------
  // PILAR 2: PERSISTENCIA Y REGISTRO EN EL HISTORIAL (RF21)
  // ----------------------------------------------------------------------------
  console.log('\n▶ [Pilar 2: Registro en Historial] Persistencia y Consulta de Alertas...')

  it('Valida catálogo médico de tipos de alerta según la restricción SQL', () => {
    assert.deepStrictEqual(TIPOS_ALERTA_VALIDOS, [
      'bpm_alto',
      'bpm_bajo',
      'spo2_bajo',
      'irregular',
      'senal_mala'
    ])
  })

  it('Entrega metadatos clínicos correctos para taquicardia y desaturación', () => {
    const metaBpm = obtenerMetadatosAlerta('bpm_alto')
    assert.strictEqual(metaBpm.titulo, 'Taquicardia (BPM Alto)')
    assert.strictEqual(metaBpm.unidad, 'BPM')
    assert.strictEqual(metaBpm.severidad, 'alta')

    const metaSpo2 = obtenerMetadatosAlerta('spo2_bajo')
    assert.strictEqual(metaSpo2.titulo, 'Desaturación de Oxígeno (SpO₂)')
    assert.strictEqual(metaSpo2.unidad, '%')
  })

  await it('Registra una alerta fuera de rango en el historial local y caché', async () => {
    limpiarAlertasLocales()

    const res = await registrarAlerta({
      medicionId: 'med-test-uuid-001',
      usuarioId: 'usr-test-uuid-001',
      tipo: 'bpm_alto',
      valor: 128.5,
      limite: 100.0,
      sonora: true,
      forzar: true
    })

    assert.strictEqual(res.ok, true)
    assert.ok(res.alerta)
    assert.strictEqual(res.alerta.tipo, 'bpm_alto')
    assert.strictEqual(res.alerta.valor, 128.5)
    assert.strictEqual(res.alerta.limite, 100.0)
    assert.strictEqual(res.alerta.sonora, true)

    const locales = obtenerAlertasLocales()
    assert.strictEqual(locales.length, 1)
    assert.strictEqual(locales[0].tipo, 'bpm_alto')
  })

  await it('Deduplica alertas del mismo tipo en la misma medición dentro del cooldown', async () => {
    const r1 = await registrarAlerta({
      medicionId: 'med-test-uuid-002',
      tipo: 'spo2_bajo',
      valor: 91.0,
      limite: 95.0,
      forzar: true
    })
    assert.strictEqual(r1.ok, true)

    // Inmediatamente después sin forzar debe ser rechazada por cooldown
    const r2 = await registrarAlerta({
      medicionId: 'med-test-uuid-002',
      tipo: 'spo2_bajo',
      valor: 90.5,
      limite: 95.0,
      forzar: false
    })
    assert.strictEqual(r2.ok, false)
    assert.strictEqual(r2.motivo, 'cooldown_activo')
  })

  await it('Consulta y lista el historial de alertas registradas (listarHistorialAlertas)', async () => {
    const listado = await listarHistorialAlertas({ limite: 10 })
    assert.strictEqual(listado.ok, true)
    assert.ok(Array.isArray(listado.alertas))
    assert.ok(listado.alertas.length >= 2)
  })

  // ----------------------------------------------------------------------------
  // PILAR 3: INTEGRACIÓN VISUAL Y CUMPLIMIENTO DE REGLAS ("SIN EMOJIS")
  // ----------------------------------------------------------------------------
  console.log('\n▶ [Pilar 3: Alerta Visual e Integración UI] Componentes y Vistas...')

  it('Verifica existencia y estructura del componente AlertaFueraRangoBanner.vue', () => {
    const bannerPath = path.resolve('F:/sensor/src/components/AlertaFueraRangoBanner.vue')
    assert.ok(fs.existsSync(bannerPath), 'AlertaFueraRangoBanner.vue debe existir')

    const content = fs.readFileSync(bannerPath, 'utf8')
    assert.ok(content.includes('role="alert"'))
    assert.ok(content.includes('reproducirAlertaSonora'))
    assert.ok(content.includes('silenciarAlarma'))
    assert.ok(content.includes('alerta-fuera-rango-container'))
    assert.ok(content.includes('alerta-pulsante'))
  })

  it('Verifica integración de AlertaFueraRangoBanner en MedicionView.vue (Paso 4)', () => {
    const medicionPath = path.resolve('F:/sensor/src/views/MedicionView.vue')
    const content = fs.readFileSync(medicionPath, 'utf8')

    assert.ok(content.includes('AlertaFueraRangoBanner'), 'MedicionView debe importar AlertaFueraRangoBanner')
    assert.ok(content.includes('alertaFueraRangoActiva'), 'Debe existir estado reactivo alertaFueraRangoActiva')
    assert.ok(content.includes('alertaFueraRangoTipo'), 'Debe existir estado reactivo alertaFueraRangoTipo')
    assert.ok(content.includes('enviarPaquetePersonalizado'), 'Debe existir emulador de presets para pruebas de alerta')
  })

  it('Verifica pestaña de Registro de Alertas Clínicas (RF21) en HistorialView.vue', () => {
    const historialPath = path.resolve('F:/sensor/src/views/HistorialView.vue')
    const content = fs.readFileSync(historialPath, 'utf8')

    assert.ok(content.includes('Registro de Alertas Clínicas (RF21)'), 'Debe incluir pestaña de alertas')
    assert.ok(content.includes('listarHistorialAlertas'), 'Debe importar y consumir listarHistorialAlertas')
    assert.ok(content.includes('filtroTipoAlerta'), 'Debe permitir filtrar por tipo de alerta')
    assert.ok(content.includes('chip-alerta-tag'), 'Debe mostrar badge de alerta registrada en mediciones fuera de rango')
  })

  it('AUDITORÍA ESTRICTA: Cero emojis en archivos de RF21 (regla expresa de usuario)', () => {
    const archivosRevisar = [
      'F:/sensor/src/utils/alertaSonora.js',
      'F:/sensor/src/services/alertasService.js',
      'F:/sensor/src/components/AlertaFueraRangoBanner.vue',
      'F:/sensor/src/views/HistorialView.vue'
    ]

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u

    for (const file of archivosRevisar) {
      const code = fs.readFileSync(path.resolve(file), 'utf8')
      const lines = code.split('\n')
      lines.forEach((l, idx) => {
        if (emojiRegex.test(l)) {
          throw new Error(`Emoji detectado en ${file}:${idx + 1}: ${l.trim()}`)
        }
      })
    }
  })

  console.log('\n----------------------------------------------------------------')
  console.log(`  Resumen RF21: ${passed} pruebas superadas, ${failed} fallidas.`)
  console.log('----------------------------------------------------------------\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((e) => {
  console.error('Error no controlado en suite de pruebas:', e)
  process.exit(1)
})
