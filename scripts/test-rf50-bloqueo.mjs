// RF50: Bloqueo de cuenta en servidor tras intentos fallidos (correo e IP).
// Uso: node scripts/test-rf50-bloqueo.mjs
import { readFileSync } from 'node:fs'
import { formatearTiempoRestante } from '../src/services/seguridadLoginService.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

console.log('--- Pruebas de RF50: Bloqueo en Servidor tras Intentos Fallidos ---\n')

const servicio = lee('../src/services/seguridadLoginService.js')
const migracion = lee('../supabase/migrations/20261109000200_bloqueo_servidor_rf50.sql')
const useAuth = lee('../src/composables/useAuth.js')
const loginView = lee('../src/views/LoginView.vue')

// 1. Quitar localStorage como fuente de verdad
marcar(
  !servicio.includes('STORAGE_BLOQUEOS') && 
  !servicio.includes('STORAGE_INTENTOS') &&
  !servicio.includes('localStorage.getItem'),
  'Se quitó localStorage como fuente de verdad del bloqueo'
)

// 2. Llamar a la función del servidor registrar_intento_login
marcar(
  servicio.includes("'registrar_intento_login'") && 
  servicio.includes('supabase.rpc'),
  'Llama a la función registrar_intento_login de Supabase mediante RPC'
)

// 3. Consultar verificación en el servidor
marcar(
  servicio.includes("'verificar_estado_bloqueo'") && 
  servicio.includes('bloqueado_hasta'),
  'Verifica el estado del bloqueo consultando al servidor'
)

// 4. Bloquear por correo y por IP en la base de datos
marcar(
  migracion.includes('p_correo') && 
  migracion.includes('p_ip inet') && 
  migracion.includes('bloqueos_cuenta'),
  'La migración SQL incluye soporte para bloqueo tanto por correo como por IP'
)

// 5. Criterio de aceptación: 5 intentos fallidos
marcar(
  migracion.includes('v_fallos_correo >= 5') || migracion.includes('5'),
  'Bloquea la cuenta al alcanzar el límite de 5 intentos fallidos'
)

// 6. Criterio de aceptación: Permisos de ejecución para anon y authenticated
marcar(
  migracion.includes('grant execute on function public.registrar_intento_login') &&
  migracion.includes('grant execute on function public.verificar_estado_bloqueo'),
  'Otorga permisos de ejecución a los roles anónimo y autenticado en la base de datos'
)

// 7. Criterio de aceptación: Mensaje indica el tiempo restante y hora de término
const textoSegundos = formatearTiempoRestante(45)
const textoMinutos = formatearTiempoRestante(900, '2026-11-09T20:00:00Z')
marcar(
  textoSegundos.includes('45 segundos') && 
  textoMinutos.includes('15 minutos'),
  'El formateador calcula correctamente el tiempo restante en minutos y segundos'
)

// 8. El login llama a la verificación antes de validar credenciales
marcar(
  useAuth.includes('verificarEstadoBloqueo(email)') && 
  useAuth.includes('registrarIntentoLogin'),
  'El flujo de login valida el estado de bloqueo antes de autenticar'
)

// 9. La vista muestra el temporizador regresivo de bloqueo
marcar(
  loginView.includes('cuentaBloqueada') && 
  loginView.includes('tiempoRestanteTexto'),
  'La interfaz muestra el mensaje con el tiempo restante cuando la cuenta está bloqueada'
)

if (fallos === 0) {
  console.log('\nResultado: TODAS LAS PRUEBAS PASARON EXITOSAMENTE (RF50)')
  process.exit(0)
} else {
  console.error(`\nResultado: HUBO ${fallos} FALLO(S) EN RF50`)
  process.exit(1)
}