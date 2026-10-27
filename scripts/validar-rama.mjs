#!/usr/bin/env node
// Valida el nombre de la rama (RF74): debe comenzar con RFNN o RNFNN, donde NN es el número
// del requerimiento. Lo que sigue es libre; mayúsculas, minúsculas y puntos no importan.
//   Válidas:   RF12-esquema, rf05.recepcion.wifi, Rnf04_latencia, RF118
//   Inválidas: mi-rama, esquema-rf12, rf-12, RF1234
//   node scripts/validar-rama.mjs [nombre]   (sin argumento usa la rama actual)
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FIJAS = ['main', 'develop']
const PATRON = /^(?:rf|rnf)\d{1,3}(?:\D.*)?$/i

export function validarRama(nombre) {
  if (FIJAS.includes(nombre)) return []
  if (PATRON.test(nombre)) return []
  return [`La rama "${nombre}" debe comenzar con RFNN o RNFNN (NN = número del requerimiento). Ejemplos: RF12-esquema-supabase, rnf04.latencia.`]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const nombre = process.argv[2] ?? execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
  const errores = nombre ? validarRama(nombre) : []   // rama desacoplada (CI): no aplica
  if (errores.length) {
    console.error(`\n✖ ${errores[0]}\n  Guía: docs/COMMITS.md\n`)
    process.exit(1)
  }
}
