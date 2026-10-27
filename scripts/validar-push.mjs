#!/usr/bin/env node
// Hook pre-push (RF74): no deja subir una rama si
//   1. su nombre no sigue el formato (rfNN-descripcion en minúscula),
//   2. alguno de los commits nuevos no sigue la convención de mensajes, o
//   3. la web no instala o no compila.
// Git entrega por stdin una línea por referencia:  <ref local> <sha local> <ref remota> <sha remota>
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { validarRama } from './validar-rama.mjs'
import { validarMensaje } from './validar-commit.mjs'

const CERO = /^0+$/
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const errores = []
let hayRamasNuevas = false

const lineas = readFileSync(0, 'utf8').split('\n').filter(Boolean)

for (const linea of lineas) {
  const [refLocal, shaLocal, refRemota, shaRemota] = linea.split(' ')
  if (CERO.test(shaLocal)) continue                       // borrar una rama siempre se permite
  if (!refRemota.startsWith('refs/heads/')) continue      // etiquetas y otras referencias: no aplica

  const rama = refRemota.slice('refs/heads/'.length)
  for (const e of validarRama(rama)) errores.push(e)
  hayRamasNuevas = true

  // Commits que se están subiendo: los nuevos respecto del remoto.
  const rango = CERO.test(shaRemota) ? [shaLocal, '--not', '--remotes'] : [`${shaRemota}..${shaLocal}`]
  const shas = git('log', '--no-merges', '--format=%H', ...rango).split('\n').filter(Boolean)
  for (const sha of shas) {
    const fallos = validarMensaje(git('log', '-1', '--format=%B', sha))
    if (fallos.length) errores.push(`Commit ${sha.slice(0, 7)} (${git('log', '-1', '--format=%s', sha).trim()}): ${fallos.join(' ')}`)
  }
}

if (errores.length) {
  console.error('\n✖ Push bloqueado:')
  for (const e of errores) console.error(`  - ${e}`)
  console.error('\nGuía: docs/COMMITS.md  (para renombrar la rama: git branch -m <nombre-nuevo>)\n')
  process.exit(1)
}

// La web debe compilar sin errores. Si faltan dependencias, se instalan.
if (hayRamasNuevas) {
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
