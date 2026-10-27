#!/usr/bin/env node
// Hook pre-push (RF74). No deja subir:
//   1. nada a main ni a develop (solo se llega ahí por pull request),
//   2. una rama cuyo nombre no contenga RFNN o RNFNN,
//   3. si la web no instala o no compila.
// Los commits dentro de una rama RFNN / RNFNN no tienen ninguna exigencia.
// Git entrega por stdin una línea por referencia:  <ref local> <sha local> <ref remota> <sha remota>
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { validarRama } from './validar-rama.mjs'

const CERO = /^0+$/
const PROTEGIDAS = ['main', 'develop']
const errores = []
let hayRamas = false

for (const linea of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
  const [, shaLocal, refRemota] = linea.split(' ')
  if (!refRemota.startsWith('refs/heads/')) continue      // etiquetas y otras referencias: no aplica
  const rama = refRemota.slice('refs/heads/'.length)

  if (PROTEGIDAS.includes(rama)) {
    errores.push(`No se puede subir directamente a "${rama}". Sube tu rama RFNN / RNFNN y abre un pull request hacia ${rama}.`)
    continue
  }
  if (CERO.test(shaLocal)) continue                       // borrar una rama que no es main/develop se permite
  for (const e of validarRama(rama)) errores.push(e)
  hayRamas = true
}

if (errores.length) {
  console.error('\n✖ Push bloqueado:')
  for (const e of errores) console.error(`  - ${e}`)
  console.error('\nGuía: docs/COMMITS.md  (para renombrar la rama: git branch -m <nombre-nuevo>)\n')
  process.exit(1)
}

// La web debe compilar sin errores. Si faltan dependencias, se instalan.
if (hayRamas) {
  // Comando como texto con shell: funciona igual en Windows (npm.cmd) y en Linux/Mac.
  const correr = (...args) => spawnSync(`npm ${args.join(' ')}`, { stdio: 'inherit', shell: true })
  if (!existsSync('node_modules')) {
    console.log('pre-push: instalando dependencias (npm ci)...')
    if (correr('ci').status !== 0) { console.error('\n✖ Push bloqueado: no se pudieron instalar las dependencias.\n'); process.exit(1) }
  }
  console.log('pre-push: compilando (npm run build)...')
  if (correr('run', 'build').status !== 0) {
    console.error('\n✖ Push bloqueado: la compilación falló. Corrige los errores antes de subir.\n')
    process.exit(1)
  }
}
