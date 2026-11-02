// RF30 + RNF03: mediciones que no se pudieron enviar por falta de conexión.
//
// Se guardan en este dispositivo hasta que vuelve internet y se reenvían sin duplicarse
// (cada una lleva su id_cliente). Por ser datos de salud (RNF08) se guarda lo mínimo:
// solo los valores de la medición (sin nombre ni factores declarados), máximo 20 y hasta 7 días.
// Se borran al cerrar sesión (ver limpiarAlSalir.js).
const CLAVE = 'sensor_mediciones_pendientes'
const MAXIMO = 20
const DIAS = 7

function almacen(storage) {
  if (storage) return storage
  return typeof localStorage !== 'undefined' ? localStorage : null
}

function leer(storage) {
  try {
    const s = almacen(storage)
    if (!s) return []
    const lista = JSON.parse(s.getItem(CLAVE) || '[]')
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function escribir(lista, storage) {
  try {
    const s = almacen(storage)
    if (!s) return false
    s.setItem(CLAVE, JSON.stringify(lista))
    return true
  } catch {
    return false
  }
}

/** Pendientes vigentes (descarta los de más de 7 días). Si se pasa usuarioId, solo los de esa cuenta. */
export function listarPendientes(usuarioId = null, storage = null) {
  const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000
  const vigentes = leer(storage).filter((p) => p.guardadoEn >= limite)
  return usuarioId ? vigentes.filter((p) => p.fila?.usuario_id === usuarioId) : vigentes
}

/** Agrega una fila a la cola. Devuelve false si no hay almacenamiento. */
export function agregarPendiente(fila, storage = null) {
  if (!fila?.id_cliente) return false
  const lista = leer(storage).filter((p) => p.fila?.id_cliente !== fila.id_cliente)
  lista.push({ fila, guardadoEn: Date.now() })
  lista.sort((a, b) => b.guardadoEn - a.guardadoEn)
  return escribir(lista.slice(0, MAXIMO), storage)
}

export function quitarPendiente(idCliente, storage = null) {
  return escribir(leer(storage).filter((p) => p.fila?.id_cliente !== idCliente), storage)
}

export function borrarPendientes(storage = null) {
  try {
    const s = almacen(storage)
    if (s) s.removeItem(CLAVE)
    return true
  } catch {
    return false
  }
}
