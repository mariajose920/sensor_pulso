#!/usr/bin/env node
// Valida el nombre de la rama (RF74: una rama por requerimiento).
//   node scripts/validar-rama.mjs [nombre]   (sin argumento usa la rama actual)
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FIJAS = ['main', 'develop']
// Todo en minúscula: rfNN-descripcion (ej.: rf12-esquema-supabase).
const PATRON = /^(?:(?:rf\d{2,3}|rnf\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*|(?:docs|hotfix)\/[a-z0-9._-]+)$/

export function validarRama(nombre) {
  if (FIJAS.includes(nombre)) return []
  if (PATRON.test(nombre)) return []
  return [`La rama "${nombre}" no sigue el formato rfNN-descripcion en minúscula (ej.: rf12-esquema-supabase), rnfNN-descripcion, docs/tema o hotfix/tema.`]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const nombre = process.argv[2] ?? execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
  const errores = nombre ? validarRama(nombre) : []   // rama desacoplada (CI): no aplica
  if (errores.length) {
    console.error(`\n✖ ${errores[0]}\n  Guía: docs/COMMITS.md\n`)
    process.exit(1)
  }
}
