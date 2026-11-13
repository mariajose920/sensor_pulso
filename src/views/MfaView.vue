<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  consultarEstadoMfa,
  enrolarMfaTotp,
  listarFactoresTotp,
  verificarCodigoMfa
} from '../services/mfaService.js'

const router = useRouter()
const route = useRoute()

const destinoTrasMfa = () => {
  const destino = route.query.redirect

  if (
    typeof destino === 'string' &&
    destino.startsWith('/') &&
    !destino.startsWith('//')
  ) {
    const resuelto = router.resolve(destino)

    if (
      resuelto.matched.length &&
      resuelto.name !== 'Mfa' &&
      resuelto.name !== 'Login'
    ) {
      return resuelto.fullPath
    }
  }

  return '/medicion'
}

const estado = ref('cargando')
const factores = ref([])
const factorId = ref('')
const inscripcion = ref(null)
const codigo = ref('')
const ocupado = ref(false)
const error = ref('')

const listoParaVerificar = computed(() =>
  Boolean(factorId.value && /^\d{6}$/.test(codigo.value.trim()))
)

const ejecutar = async (operacion) => {
  if (ocupado.value) return
  ocupado.value = true
  error.value = ''

  try {
    await operacion()
  } catch (fallo) {
    error.value = fallo.message || 'No se pudo completar la operación.'
  } finally {
    ocupado.value = false
  }
}

const cargar = () => ejecutar(async () => {
  const nivel = await consultarEstadoMfa()

  if (nivel.nivelActual === 'aal2') {
    await router.replace(destinoTrasMfa())
    return
  }

  factores.value = await listarFactoresTotp()
  factorId.value = factores.value[0]?.id || ''
  estado.value = factorId.value ? 'verificar' : 'configurar'
})

const generarQr = () => ejecutar(async () => {
  inscripcion.value = await enrolarMfaTotp()
  factorId.value = inscripcion.value.factorId
})

const confirmar = () => ejecutar(async () => {
  await verificarCodigoMfa(factorId.value, codigo.value)

  const nivel = await consultarEstadoMfa()
  if (nivel.nivelActual !== 'aal2') {
    throw new Error('Supabase aún no confirma el segundo factor de esta sesión.')
  }

  codigo.value = ''
  inscripcion.value = null
  await router.replace(destinoTrasMfa())
})

onMounted(cargar)
</script>

<template>
  <main class="card">
    <h1>Autenticación de dos factores</h1>

    <p v-if="error" role="alert">{{ error }}</p>

    <template v-if="estado === 'cargando'">
      <p v-if="ocupado" role="status">Consultando tu cuenta…</p>
      <button v-else type="button" class="btn btn-secondary" @click="cargar">
        Reintentar
      </button>
    </template>

    <template v-else>
      <div v-if="estado === 'configurar'">
        <p>Si aún no tienes una app autenticadora, instala Google Authenticator o Microsoft Authenticator en tu teléfono.</p>
        <ol>
            <li>Pulsa «Generar código QR» en esta página.</li>
            <li>Abre la app autenticadora y elige «Agregar cuenta» y luego «Escanear código QR». Escanéalo desde la app.</li>
            <li>Escribe aquí el código de seis dígitos que muestra la app y pulsa «Verificar código».</li>
        </ol>

        <button
          v-if="!inscripcion"
          type="button"
          class="btn btn-primary"
          :disabled="ocupado"
          @click="generarQr"
        >
          {{ ocupado ? 'Generando…' : 'Generar código QR' }}
        </button>

        <div v-else>
          <p>Escanea este QR con tu aplicación autenticadora.</p>
          <img
            :src="inscripcion.codigoQr"
            alt="Código QR para vincular el autenticador"
            width="200"
            height="200"
          />
          <p>Si prefieres agregar la cuenta manualmente, usa esta clave:</p>
          <p><code>{{ inscripcion.secreto }}</code></p>
        </div>
      </div>

      <form v-if="factorId" @submit.prevent="confirmar">
        <p v-if="estado === 'verificar'">Abre la app autenticadora que vinculaste a esta cuenta e ingresa el código de seis dígitos que muestra en este momento.</p>
        <div v-if="factores.length > 1">
          <label for="mfa-factor">Autenticador</label>
          <select id="mfa-factor" v-model="factorId" :disabled="ocupado">
            <option v-for="(factor, indice) in factores" :key="factor.id" :value="factor.id">
              {{ factor.friendly_name || `Autenticador ${indice + 1}` }}
            </option>
          </select>
        </div>

        <label for="mfa-codigo">Código de seis dígitos</label>
        <input
          id="mfa-codigo"
          v-model="codigo"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          pattern="[0-9]{6}"
          class="form-input"
          :disabled="ocupado"
          required
        />

        <button
          type="submit"
          class="btn btn-primary"
          :disabled="ocupado || !listoParaVerificar"
        >
          {{ ocupado ? 'Verificando…' : 'Verificar código' }}
        </button>
      </form>
    </template>
  </main>
</template>