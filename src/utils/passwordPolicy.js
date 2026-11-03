// Lista de contraseñas comunes y vulnerables a bloquear
const CONTRASENAS_COMUNES = new Set([
  '12345678', 'password', 'password123', 'admin123', 'qwerty123',
  'unach123', 'unach2024', 'unach2025', 'unach2026', 'estudiante123'
])

export function evaluarFuerzaContrasena(password) {
  if (!password) {
    return {
      valida: false,
      score: 0,
      nivel: 'vacía',
      color: 'var(--color-muted)',
      errores: [],
      criterios: {
        longitud: false,
        mayuscula: false,
        minuscula: false,
        numero: false,
        simbolo: false,
        noComun: true
      }
    }
  }

  const criterios = {
    longitud: password.length >= 8,
    mayuscula: /[A-Z]/.test(password),
    minuscula: /[a-z]/.test(password),
    numero: /[0-9]/.test(password),
    simbolo: /[^A-Za-z0-9]/.test(password),
    noComun: !CONTRASENAS_COMUNES.has(password.toLowerCase())
  }

  const errores = []
  if (!criterios.longitud) errores.push('Mínimo 8 caracteres.')
  if (!criterios.mayuscula) errores.push('Al menos una letra mayúscula.')
  if (!criterios.minuscula) errores.push('Al menos una letra minúscula.')
  if (!criterios.numero) errores.push('Al menos un número.')
  if (!criterios.simbolo) errores.push('Al menos un símbolo especial (!, @, #, $, etc.).')
  if (!criterios.noComun) errores.push('La contraseña es demasiado común o predecible.')

  // Cálculo de puntaje (0 a 100)
  let puntos = 0
  if (criterios.longitud) puntos += 25
  if (criterios.mayuscula) puntos += 15
  if (criterios.minuscula) puntos += 15
  if (criterios.numero) puntos += 20
  if (criterios.simbolo) puntos += 25

  let nivel = 'Débil'
  let color = 'var(--color-danger)'

  if (puntos >= 90 && criterios.noComun) {
    nivel = 'Segura'
    color = 'var(--color-success)'
  } else if (puntos >= 60 && criterios.noComun) {
    nivel = 'Media'
    color = 'var(--color-warning)'
  }

  const valida = errores.length === 0

  return {
    valida,
    score: puntos,
    nivel,
    color,
    errores,
    criterios
  }
}