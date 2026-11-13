// La ficha del paciente debe quedar en la base aunque se cierre la sesión (desarrollo local).
// Causa del problema: sin CLAVE_CIFRADO_CAMPOS el servidor no cifra y la ficha solo queda en el dispositivo.
// Uso: node scripts/test-ficha-persistente-local.mjs
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asegurarClaveCifradoLocal, hayClaveDeCifrado, ENCABEZADO_CLAVE_LOCAL } from './claveCifradoLocal.mjs'
import { crearHandler as crearCifrar } from '../api/declaraciones/cifrar.js'
import { crearHandler as crearDescifrar } from '../api/declaraciones/descifrar.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

const carpeta = mkdtempSync(join(tmpdir(), 'sp-clave-'))
const ruta = join(carpeta, '.env.local')

// --- Generación de la clave local
writeFileSync(ruta, 'VITE_SUPABASE_URL=https://ejemplo.supabase.co')
let env = { VITE_SUPABASE_URL: 'https://ejemplo.supabase.co' }
let destino = {}
let r = asegurarClaveCifradoLocal({ env, rutaEnvLocal: ruta, esDesarrollo: true, destino })
const archivo = readFileSync(ruta, 'utf8')
marcar(r.generada && env.CLAVE_CIFRADO_CAMPOS.length >= 32 && destino.CLAVE_CIFRADO_CAMPOS === env.CLAVE_CIFRADO_CAMPOS, 'En desarrollo, sin clave, se crea una clave local de 32 bytes y queda en el entorno')
marcar(archivo.includes(ENCABEZADO_CLAVE_LOCAL) && archivo.includes(`CLAVE_CIFRADO_CAMPOS=${env.CLAVE_CIFRADO_CAMPOS}`) && archivo.startsWith('VITE_SUPABASE_URL=https://ejemplo.supabase.co\n'), 'La clave se guarda en .env.local sin tocar lo que ya había, para que sea la misma en cada arranque')
marcar(hayClaveDeCifrado(env), 'Con esa clave el entorno queda con cifrado disponible')

const claveInicial = env.CLAVE_CIFRADO_CAMPOS
r = asegurarClaveCifradoLocal({ env, rutaEnvLocal: ruta, esDesarrollo: true, destino })
marcar(!r.generada && env.CLAVE_CIFRADO_CAMPOS === claveInicial && readFileSync(ruta, 'utf8') === archivo, 'En el siguiente arranque no se genera otra: se conserva la misma')
r = asegurarClaveCifradoLocal({ env: { CLAVE_CIFRADO_CAMPOS: 'una-clave-de-produccion-larga' }, rutaEnvLocal: ruta, esDesarrollo: true, destino: {} })
marcar(!r.generada, 'Si ya hay una clave (por ejemplo la de producción) no se reemplaza')
const rutaProd = join(carpeta, '.env.prod')
r = asegurarClaveCifradoLocal({ env: {}, rutaEnvLocal: rutaProd, esDesarrollo: false, destino: {} })
marcar(!r.generada, 'Fuera del servidor de desarrollo (build/producción) nunca se genera una clave')
r = asegurarClaveCifradoLocal({ env: {}, rutaEnvLocal: rutaProd, esDesarrollo: true, destino: { VERCEL: '1' } })
marcar(!r.generada, 'En Vercel nunca se inventa una clave')
r = asegurarClaveCifradoLocal({ env: {}, rutaEnvLocal: rutaProd, esDesarrollo: true, destino: { NODE_ENV: 'production' } })
marcar(!r.generada, 'Con NODE_ENV=production tampoco')
marcar(!hayClaveDeCifrado({ CLAVE_CIFRADO_CAMPOS: 'corta' }) && hayClaveDeCifrado({ SALUD_ENCRYPTION_KEY_V1: 'x'.repeat(16) }), 'Una clave de menos de 16 caracteres no cuenta')

// --- El servidor cifra y descifra con esa clave (como al guardar la ficha y volver a leerla tras cerrar sesión)
const respuesta = () => {
  const r2 = { codigo: 0, cuerpo: '' }
  return {
    r: r2,
    res: {
      statusCode: 0,
      setHeader() {},
      end(c) { r2.codigo = this.statusCode; r2.cuerpo = c }
    }
  }
}
const peticion = (cuerpo) => ({
  method: 'POST',
  headers: { host: 'localhost:5173', origin: 'http://localhost:5173', authorization: 'Bearer token-de-prueba', 'x-forwarded-for': '10.1.1.1' },
  socket: { remoteAddress: '10.1.1.1' },
  body: JSON.stringify(cuerpo)
})
const sesion = async () => ({ usuario: { id: 'usuario-1' }, db: null })
const llamar = async (handler, cuerpo) => { const { r: salida, res } = respuesta(); await handler(peticion(cuerpo), res); return { codigo: salida.codigo, json: JSON.parse(salida.cuerpo || '{}') } }

const sinClave = crearCifrar({ verificar: sesion, env: { VITE_SUPABASE_URL: 'x' } })
let out = await llamar(sinClave, { factores: { nivelEstres: 'alto' } })
marcar(out.codigo === 503, 'Sin clave el servidor no cifra (503): por eso la ficha no llegaba a la base')

const conClave = crearCifrar({ verificar: sesion, env })
out = await llamar(conClave, { factores: { nivelEstres: 'alto', cafeina: 'ninguna' } })
marcar(out.codigo === 200 && out.json.ok && out.json.datosCifrados.length > 40, 'Con la clave local el servidor cifra la ficha (200) y devuelve el sobre cifrado')
marcar(!out.json.datosCifrados.includes(Buffer.from('alto').toString('hex')), 'El sobre cifrado no contiene los datos en claro')

// --- La base: la retención no borra la ficha propia
const sqlRet = readFileSync(new URL('../supabase/migrations/20261113000600_rf03_ficha_propia_persistente.sql', import.meta.url), 'utf8')
marcar(sqlRet.includes('and sesion_id is not null'), 'La retención diaria no borra la ficha propia')

// --- El arranque de desarrollo usa la clave local y el cierre de sesión termina de guardar
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
marcar(/asegurarClaveCifradoLocal\(\{/.test(vite) && /esDesarrollo: command === 'serve'/.test(vite), 'El servidor de desarrollo asegura la clave al arrancar (solo con `serve`)')
const auth = readFileSync(new URL('../src/composables/useAuth.js', import.meta.url), 'utf8')
marcar(auth.includes('pacienteService.esperarGuardado()') && auth.includes('pacienteService.reintentarSincronizacion()'), 'Al cerrar sesión se termina de guardar la ficha antes de salir')

rmSync(carpeta, { recursive: true, force: true })
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
