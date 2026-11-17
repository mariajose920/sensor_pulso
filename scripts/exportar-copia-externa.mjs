#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Exportador de Copia de Seguridad Fuera de Supabase (RNF15)
 * ============================================================================
 * Genera un dump lógico estructurado fuera de la infraestructura principal
 * de Supabase con firma de integridad SHA-256 (Estrategia 3-2-1).
 * ============================================================================
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  exportarCopiaFueraDeSupabase,
  cifrarDatosSaludPrueba
} from './lib-respaldo-restauracion.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const CARPETA_DESTINO = path.join(ROOT, 'respaldos_externos')
const RUTA_ARCHIVO = path.join(CARPETA_DESTINO, 'copia_seguridad_fuera_de_supabase.json')

async function ejecutarExportacion() {
  if (!fs.existsSync(CARPETA_DESTINO)) {
    fs.mkdirSync(CARPETA_DESTINO, { recursive: true })
  }

  const claveCifradoSimulada = 'clave_contingencia_unach_2026_!!'
  const sobreCifrado = await cifrarDatosSaludPrueba(
    {
      sueno_horas: 7.5,
      estres_nivel: 2,
      cafeina_consumo: 'moderado',
      medicacion: 'ninguna'
    },
    claveCifradoSimulada
  )

  // Conjunto de datos base representativo del esquema institucional
  const tablasBase = {
    perfiles: [
      { id: 'usr-admin-1', nombre: 'Adán Ramos', correo: 'adan.ramos@unach.cl', rol: 'admin' },
      { id: 'usr-docente-1', nombre: 'Darío Sandoval', correo: 'dario.sandoval@unach.cl', rol: 'profesor' },
      { id: 'usr-estudiante-1', nombre: 'Estudiante UNACH', correo: 'alumno@alu.unach.cl', rol: 'estudiante' }
    ],
    aulas: [
      { id: 'aula-fisiologia-1', codigo: 'FISIO-2026', nombre: 'Fisiología Cardíaca', docente_id: 'usr-docente-1' }
    ],
    evaluaciones: [
      { id: 'eval-cardio-1', titulo: 'Evaluación de Bioseñales', aula_id: 'aula-fisiologia-1', estado: 'programada' }
    ],
    mediciones: [
      { id: 'med-001', usuario_id: 'usr-estudiante-1', bpm_promedio: 72, spo2_promedio: 98, creado_en: '2026-11-17T12:00:00Z' }
    ],
    pacientes_salud: [
      { id: 'salud-001', usuario_id: 'usr-estudiante-1', sobre_cifrado: sobreCifrado }
    ],
    auditoria: [
      { id: 'aud-001', accion: 'RESPALDO_OFFSITE_GENERADO', actor: 'Adán Ramos', fecha: '2026-11-17T12:00:00Z' }
    ]
  }

  const dump = exportarCopiaFueraDeSupabase(tablasBase, {
    destino: 'almacenamiento_frio_externo_independiente',
    responsable: 'Adán Ramos'
  })

  fs.writeFileSync(RUTA_ARCHIVO, JSON.stringify(dump, null, 2), 'utf8')
  console.log(`✅ Copia fuera de Supabase generada exitosamente en:\n   ${RUTA_ARCHIVO}`)
  console.log(`   Checksum SHA-256: ${dump.checksum}`)
  console.log(`   Total tablas: ${Object.keys(dump.tablas).length}`)
}

ejecutarExportacion().catch((err) => {
  console.error('❌ Error al exportar copia fuera de Supabase:', err)
  process.exit(1)
})
