#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Simulador de Falla y Recuperación de Desastres (RNF15)
 * ============================================================================
 * Simula una falla catastrófica en la base de datos de producción,
 * recupera los datos desde la copia externa fuera de Supabase,
 * verifica la integridad de datos y salud (RF116),
 * ejecuta el re-despliegue de la aplicación web y cronometra el RTO.
 * ============================================================================
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  simularFallaYRecuperacionCompleta,
  cifrarDatosSaludPrueba
} from './lib-respaldo-restauracion.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const RUTA_COPIA_EXTERNA = path.join(ROOT, 'respaldos_externos', 'copia_seguridad_fuera_de_supabase.json')

async function ejecutarSimulacro() {
  console.log('\n============================================================')
  console.log('🚨 Iniciando Simulacro de Falla Catastrófica y Recuperación (RNF15)')
  console.log('============================================================\n')

  let tablasOrigen = {}
  if (fs.existsSync(RUTA_COPIA_EXTERNA)) {
    const jsonCopia = JSON.parse(fs.readFileSync(RUTA_COPIA_EXTERNA, 'utf8'))
    tablasOrigen = jsonCopia.tablas || {}
  } else {
    // Generación al vuelo si no existe el archivo previo
    const sobre = await cifrarDatosSaludPrueba(
      { sueno_horas: 8, estres_nivel: 1 },
      'clave_contingencia_unach_2026_!!'
    )
    tablasOrigen = {
      perfiles: [{ id: 'usr-1', nombre: 'Test', correo: 'test@unach.cl', rol: 'admin' }],
      pacientes_salud: [{ id: 'salud-1', usuario_id: 'usr-1', sobre_cifrado: sobre }]
    }
  }

  const reporte = await simularFallaYRecuperacionCompleta({
    tablasProduccion: tablasOrigen,
    claveCifradoSalud: 'clave_contingencia_unach_2026_!!',
    ejecutarCompilacion: process.argv.includes('--con-build')
  })

  console.log('📋 Bitácora de Pasos Ejecutados en el Simulacro:')
  for (const p of reporte.bitacoraPasos) {
    const dur = p.duracionMs !== undefined ? `(${p.duracionMs} ms)` : ''
    console.log(`  [Paso ${p.paso}] ${p.nombre} -> ${p.estado.toUpperCase()} ${dur}`)
    console.log(`          ${p.detalle}`)
  }

  console.log('\n📊 Métricas de Tiempo y Continuidad:')
  console.log(`  • RTO Máximo Aceptable: ${reporte.rtoDefinidoHoras} horas (Meta lógica: < ${reporte.rtoLogicoDefinidoMinutos} minutos)`)
  console.log(`  • RPO Máximo Definido: ${reporte.rpoDefinidoHoras} horas (Copia externa: < ${reporte.rpoCopiaExternaHoras} hora)`)
  console.log(`  • Tiempo Total de Recuperación Medido: ${reporte.tiempoTotalRecuperacionMs} ms (${reporte.tiempoTotalRecuperacionSegundos} s)`)
  console.log(`  • Copia Fuera de Supabase Utilizada: ${reporte.copiaFueraDeSupabase.checksum}`)
  console.log(`  • Descifrado Criptográfico RF116: ${reporte.fichaDescifradaOk ? 'VÁLIDO' : 'FALLIDO'}`)
  console.log(`  • ¿Cumple RTO?: ${reporte.cumpleRTO ? '✅ SÍ (Ampliamente dentro del objetivo)' : '❌ NO'}`)
  console.log('\n============================================================\n')

  return reporte
}

ejecutarSimulacro().catch((err) => {
  console.error('❌ Error en el simulacro de recuperación:', err)
  process.exit(1)
})
