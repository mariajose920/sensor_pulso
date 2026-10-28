#!/usr/bin/env node
// Impide trabajar directamente sobre main o develop (RF74): los cambios entran solo por pull request
// desde una rama RFNN / RNFNN. Lo usan los hooks pre-commit y pre-merge-commit.
//   node scripts/bloquear-directo.mjs <commit|union>
import { execFileSync } from 'node:child_process'

const accion = process.argv[2] === 'union' ? 'unir ramas' : 'hacer commits'
const actual = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()

if (['main', 'develop'].includes(actual)) {
  console.error(`\n✖ No se pueden ${accion} directamente en "${actual}".`)
  console.error('  Crea una rama del requerimiento (ej.: git switch -c RF12-esquema-supabase), trabaja ahí,')
  console.error(`  súbela y abre un pull request hacia ${actual}.\n`)
  process.exit(1)
}
