// RNF03: últimas mediciones vistas, guardadas en el celular para consultarlas sin internet.
//
// Por ser datos de salud (RNF08, RNF14) se guarda lo mínimo:
//   - solo valores de la medición (sin nombre, correo, edad ni factores declarados),
//   - máximo 10 mediciones y hasta 30 días,
//   - se borran al cerrar sesión (ver limpiarAlSalir.js) y al revocar el consentimiento.
const BD = 'sensor_pulso_offline'
const ALMACEN = 'mediciones_vistas'
const MAXIMO = 10
const DIAS = 30

const CAMPOS_PERMITIDOS = ['id', 'fecha', 'actividad', 'bpm', 'spo2', 'ritmo', 'calidad', 'dentroDeRango']

function abrir() {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') return rechazar(new Error('IndexedDB no disponible'))
    const peticion = indexedDB.open(BD, 1)
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore(ALMACEN, { keyPath: 'id' })
    }
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
}

function transaccion(modo, fn) {
  return abrir().then((db) => new Promise((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN, modo)
    const almacen = tx.objectStore(ALMACEN)
    let resultado
    Promise.resolve(fn(almacen)).then((r) => { resultado = r }).catch(rechazar)
    tx.oncomplete = () => { db.close(); resolver(resultado) }
    tx.onerror = () => { db.close(); rechazar(tx.error) }
    tx.onabort = () => { db.close(); rechazar(tx.error) }
  }))
}

const pedir = (peticion) => new Promise((resolver, rechazar) => {
  peticion.onsuccess = () => resolver(peticion.result)
  peticion.onerror = () => rechazar(peticion.error)
})

export function reducirMedicion(medicion) {
  const limpia = {}
  for (const campo of CAMPOS_PERMITIDOS) {
    if (medicion[campo] !== undefined) limpia[campo] = medicion[campo]
  }
  return limpia
}

export async function guardarMedicionVista(medicion) {
  if (!medicion || medicion.id === undefined) return false
  try {
    await transaccion('readwrite', async (almacen) => {
      await pedir(almacen.put({ ...reducirMedicion(medicion), vistoEn: Date.now() }))
      const todas = await pedir(almacen.getAll())
      todas.sort((a, b) => b.vistoEn - a.vistoEn)
      for (const sobrante of todas.slice(MAXIMO)) await pedir(almacen.delete(sobrante.id))
    })
    return true
  } catch {
    return false          // sin almacenamiento disponible: la app sigue funcionando
  }
}

export async function listarMedicionesVistas() {
  try {
    const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000
    return await transaccion('readwrite', async (almacen) => {
      const todas = await pedir(almacen.getAll())
      for (const vieja of todas.filter((m) => m.vistoEn < limite)) await pedir(almacen.delete(vieja.id))
      return todas.filter((m) => m.vistoEn >= limite).sort((a, b) => b.vistoEn - a.vistoEn)
    })
  } catch {
    return []
  }
}

export async function borrarMedicionesVistas() {
  try {
    await transaccion('readwrite', (almacen) => pedir(almacen.clear()))
    return true
  } catch {
    return false
  }
}
