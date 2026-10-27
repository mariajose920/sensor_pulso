#!/usr/bin/env node
// Valida el nombre de la rama (RF74): debe contener RFNN o RNFNN, donde NN es el número del
// requerimiento, en cualquier posición. Mayúsculas, minúsculas, puntos y guiones no importan.
//   Válidas:   RF12-esquema, esquema-rf12, rf-12, rf05.recepcion.wifi, Rnf04_latencia, RF118
//   Inválidas: mi-rama, RF1234 (más de 3 dígitos), perf12 (el "rf" es parte de otra palabra)
//   node scripts/validar-rama.mjs [nombre]   (sin argumento usa la rama actual)
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FIJAS = ['main', 'develop']
// "rf" o "rnf" que no sea parte de otra palabra, un separador opcional y de 1 a 3 dígitos.
const PATRON = /(?<![a-z])(?:rf|rnf)[^a-z0-9]?\d{1,3}(?!\d)/i

export function validarRama(nombre) {
  if (FIJAS.includes(nombre)) return []
  if (PATRON.test(nombre)) return []
  return [`La rama "${nombre}" debe contener RFNN o RNFNN (NN = número del requerimiento). Ejemplos: RF12-esquema-supabase, esquema-rf12, rnf04.latencia.`]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const nombre = process.argv[2] ?? execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
  const errores = nombre ? validarRama(nombre) : []   // rama desacoplada (CI): no aplica
  if (errores.length) {
    console.error(`\n✖ ${errores[0]}\n  Guía: docs/COMMITS.md\n`)
    process.exit(1)
  }
}
