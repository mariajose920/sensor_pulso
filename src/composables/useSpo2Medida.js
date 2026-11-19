/**
 * SpO₂ medida de la persona para el apartado de aprendizaje (RF115).
 *
 * Conecta la sesión y el historial de mediciones con el estado de `spo2MedidaEstado.js`. Lo usan la tarjeta de la
 * lección de SpO₂ y el resumen del inicio del apartado.
 */

import { useAuth } from './useAuth.js'
import { listarHistorial } from '../services/medicionesService.js'
import { crearEstadoSpo2Medida } from './spo2MedidaEstado.js'

export function useSpo2Medida() {
  return crearEstadoSpo2Medida({ listar: listarHistorial, autenticado: useAuth().isAuthenticated })
}
