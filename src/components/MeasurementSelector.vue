<template>
  <div class="card" style="margin-bottom: 1.5rem;">
    <!-- Encabezado con estado actual -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
      <div>
        <h2 style="font-size: 1.05rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.15rem;">
          Medicion Seleccionada para Comparar
        </h2>
        <p style="font-size: 0.85rem; color: var(--color-muted); margin-bottom: 0;">
          Agrega la medicion tomada con el sensor de pulso o selecciona un registro para contrastar contra el ECG y la plantilla de reposo.
        </p>
      </div>

      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="badge badge-usuario" style="font-size: 0.8rem; font-weight: 600;">
          Activa: {{ currentLabel }} ({{ modelBpm }} BPM)
        </span>
      </div>
    </div>

    <!-- Pestañas o Modos: Cargar/Agregar Medicion vs Presets -->
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem; flex-wrap: wrap;">
      <button
        @click="activeTab = 'add'"
        class="btn"
        :class="activeTab === 'add' ? 'btn-primary' : 'btn-secondary'"
        style="font-size: 0.85rem; padding: 0.35rem 0.85rem;"
      >
        + Agregar Medicion Tomada
      </button>
      <button
        @click="activeTab = 'history'"
        class="btn"
        :class="activeTab === 'history' ? 'btn-primary' : 'btn-secondary'"
        style="font-size: 0.85rem; padding: 0.35rem 0.85rem;"
      >
        Historial de Mediciones ({{ savedMeasurements.length }})
      </button>
      <button
        @click="activeTab = 'presets'"
        class="btn"
        :class="activeTab === 'presets' ? 'btn-primary' : 'btn-secondary'"
        style="font-size: 0.85rem; padding: 0.35rem 0.85rem;"
      >
        Perfiles de Referencia
      </button>
    </div>

    <!-- 1. Formulario para agregar una medicion tomada -->
    <div v-if="activeTab === 'add'" style="background: var(--color-bg); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--color-border); margin-bottom: 1rem;">
      <h3 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--color-text);">
        Ingresar Datos de la Medicion Tomada
      </h3>
      <form @submit.prevent="handleAddMeasurement" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem; align-items: end;">
        <div>
          <label class="form-label" style="font-size: 0.8rem;">
            Frecuencia Cardiaca Medida (BPM): <span style="color: var(--color-danger);">*</span>
          </label>
          <input
            type="number"
            min="35"
            max="220"
            required
            v-model.number="inputBpm"
            class="form-input"
            placeholder="Ej: 82"
            style="height: 2.3rem; font-weight: 700; font-family: monospace;"
          />
        </div>

        <div>
          <label class="form-label" style="font-size: 0.8rem;">
            Nombre o Identificador (opcional):
          </label>
          <input
            type="text"
            v-model="inputLabel"
            class="form-input"
            placeholder="Ej: Toma con Sensor Reposo"
            style="height: 2.3rem;"
          />
        </div>

        <div>
          <label class="form-label" style="font-size: 0.8rem;">
            Amplitud de la Senal (%):
          </label>
          <input
            type="number"
            min="40"
            max="150"
            v-model.number="inputAmplitude"
            class="form-input"
            style="height: 2.3rem;"
          />
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button
            type="submit"
            class="btn btn-primary"
            style="height: 2.3rem; padding: 0 1.25rem; font-size: 0.85rem; width: 100%;"
          >
            Guardar y Comparar
          </button>
        </div>
      </form>
    </div>

    <!-- 2. Lista de mediciones guardadas -->
    <div v-else-if="activeTab === 'history'" style="margin-bottom: 1rem;">
      <div v-if="savedMeasurements.length === 0" style="padding: 1rem; text-align: center; color: var(--color-muted); font-size: 0.85rem; background: var(--color-bg); border-radius: 0.5rem;">
        No hay mediciones guardadas aun. Agrega una medicion tomada en la pestana anterior.
      </div>
      <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 0.75rem;">
        <div
          v-for="item in savedMeasurements"
          :key="item.id"
          @click="selectSavedItem(item)"
          style="padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid var(--color-border); cursor: pointer; transition: all 0.15s; position: relative;"
          :style="{
            backgroundColor: selectedId === item.id ? '#f0fdf4' : 'var(--color-bg)',
            borderColor: selectedId === item.id ? 'var(--color-success)' : 'var(--color-border)'
          }"
        >
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--color-text);">
                {{ item.name }}
              </div>
              <div style="font-size: 0.75rem; color: var(--color-muted); margin-top: 0.15rem;">
                Registrado: {{ item.date }}
              </div>
            </div>
            <button
              @click.stop="removeMeasurement(item.id)"
              style="background: transparent; border: none; color: var(--color-muted); cursor: pointer; font-size: 0.9rem; padding: 0 4px;"
              title="Eliminar"
            >
              &times;
            </button>
          </div>

          <div style="margin-top: 0.5rem; display: flex; align-items: baseline; gap: 0.5rem;">
            <span style="font-size: 1.3rem; font-weight: 700; font-family: monospace; color: var(--color-success);">
              {{ item.bpm }}
            </span>
            <span style="font-size: 0.75rem; color: var(--color-muted);">BPM</span>
            <span style="margin-left: auto; font-size: 0.75rem; font-family: monospace; color: var(--color-muted);">
              T = {{ Math.round(60000 / item.bpm) }} ms
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Presets clinicos -->
    <div v-else style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
      <button
        v-for="preset in presets"
        :key="preset.id"
        @click="selectPreset(preset)"
        class="btn"
        :class="selectedId === preset.id ? 'btn-primary' : 'btn-secondary'"
        style="font-size: 0.85rem; padding: 0.4rem 0.85rem;"
      >
        {{ preset.name }} ({{ preset.bpm }} BPM)
      </button>
    </div>

    <!-- Ajuste fino y controles interactivos -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 1rem; align-items: center; font-size: 0.85rem; padding-top: 0.75rem; border-top: 1px solid var(--color-border);">
      <div>
        <label class="form-label" style="margin-bottom: 0.2rem;">
          Ajuste Fino de Frecuencia Cardiaca (BPM):
        </label>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <input
            type="range"
            min="40"
            max="160"
            step="1"
            v-model.number="modelBpm"
            class="form-input"
            style="padding: 0; height: 1.5rem;"
          />
          <span style="font-family: monospace; font-weight: 700; font-size: 1.1rem; color: var(--color-text); min-width: 75px;">
            {{ modelBpm }} BPM
          </span>
        </div>
      </div>

      <div>
        <label class="form-label" style="margin-bottom: 0.2rem;">
          Amplitud de la Senal (%):
        </label>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <input
            type="range"
            min="40"
            max="150"
            step="5"
            v-model.number="modelAmplitude"
            class="form-input"
            style="padding: 0; height: 1.5rem;"
          />
          <span style="font-family: monospace; font-weight: 700; font-size: 1.1rem; color: var(--color-text); min-width: 60px;">
            {{ modelAmplitude }}%
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  bpm: { type: Number, default: 80 },
  amplitude: { type: Number, default: 100 },
  measurementName: { type: String, default: 'Medicion Sensor' }
})

const emit = defineEmits(['update:bpm', 'update:amplitude', 'update:measurementName'])

const activeTab = ref('add')
const selectedId = ref('sensor-1')
const currentLabel = ref('Medicion Tomada')

// Formulario de ingreso
const inputBpm = ref(80)
const inputLabel = ref('')
const inputAmplitude = ref(100)

// Mediciones guardadas (cargadas de localStorage)
const savedMeasurements = ref([])

const presets = [
  { id: 'preset-1', name: 'Paciente en Reposo', bpm: 78, amplitude: 100 },
  { id: 'preset-2', name: 'Post-Ejercicio', bpm: 102, amplitude: 115 },
  { id: 'preset-3', name: 'Bradicardia', bpm: 54, amplitude: 90 },
  { id: 'preset-4', name: 'Reposo Teorico', bpm: 72, amplitude: 100 }
]

const modelBpm = computed({
  get: () => props.bpm,
  set: (val) => {
    selectedId.value = 'custom'
    currentLabel.value = `Manual (${val} BPM)`
    emit('update:bpm', val)
    emit('update:measurementName', currentLabel.value)
  }
})

const modelAmplitude = computed({
  get: () => props.amplitude,
  set: (val) => {
    emit('update:amplitude', val)
  }
})

function handleAddMeasurement() {
  const bpm = Number(inputBpm.value)
  if (!bpm || bpm < 35 || bpm > 220) return

  const label = inputLabel.value.trim() || `Medicion Tomada (${bpm} BPM)`
  const newId = `meas-${Date.now()}`
  const now = new Date()
  const dateStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hrs`

  const newRecord = {
    id: newId,
    name: label,
    bpm: bpm,
    amplitude: Number(inputAmplitude.value) || 100,
    date: dateStr
  }

  savedMeasurements.value.unshift(newRecord)
  saveToLocalStorage()

  // Seleccionar la nueva medicion
  selectedId.value = newId
  currentLabel.value = label
  emit('update:bpm', bpm)
  emit('update:amplitude', newRecord.amplitude)
  emit('update:measurementName', label)

  // Cambiar a la vista del historial para verla seleccionada
  activeTab.value = 'history'
  inputLabel.value = ''
}

function selectSavedItem(item) {
  selectedId.value = item.id
  currentLabel.value = item.name
  emit('update:bpm', item.bpm)
  emit('update:amplitude', item.amplitude || 100)
  emit('update:measurementName', item.name)
}

function selectPreset(preset) {
  selectedId.value = preset.id
  currentLabel.value = preset.name
  emit('update:bpm', preset.bpm)
  emit('update:amplitude', preset.amplitude)
  emit('update:measurementName', preset.name)
}

function removeMeasurement(id) {
  savedMeasurements.value = savedMeasurements.value.filter(m => m.id !== id)
  saveToLocalStorage()
  if (selectedId.value === id) {
    if (savedMeasurements.value.length > 0) {
      selectSavedItem(savedMeasurements.value[0])
    } else {
      selectPreset(presets[0])
    }
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem('sensor_history_measurements', JSON.stringify(savedMeasurements.value))
  } catch (e) {
    // Ignorar
  }
}

function loadSavedMeasurements() {
  try {
    const raw = localStorage.getItem('sensor_history_measurements')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        savedMeasurements.value = parsed
      }
    }

    // Comprobar si hay una medicion reciente guardada directamente desde el sensor (RF17)
    const lastSensor = localStorage.getItem('sensor_last_measurement')
    if (lastSensor) {
      const sensorData = JSON.parse(lastSensor)
      if (sensorData.bpm) {
        const exists = savedMeasurements.value.some(m => m.bpm === sensorData.bpm && m.id === 'sensor-direct')
        if (!exists) {
          savedMeasurements.value.unshift({
            id: 'sensor-direct',
            name: `Medicion Sensor MAX30102 (${sensorData.bpm} BPM)`,
            bpm: sensorData.bpm,
            amplitude: 100,
            date: 'Reciente con Sensor'
          })
        }
      }
    }

    // Si la lista sigue vacia, agregar un ejemplo inicial
    if (savedMeasurements.value.length === 0) {
      savedMeasurements.value = [
        { id: 'sensor-init-1', name: 'Medicion Sensor ESP32', bpm: 80, amplitude: 100, date: 'Toma Reciente' },
        { id: 'sensor-init-2', name: 'Paciente en Reposo', bpm: 74, amplitude: 100, date: 'Toma Previa' }
      ]
    }

    // Seleccionar la primera medicion
    if (savedMeasurements.value.length > 0) {
      const first = savedMeasurements.value[0]
      selectedId.value = first.id
      currentLabel.value = first.name
      emit('update:bpm', first.bpm)
      emit('update:amplitude', first.amplitude)
      emit('update:measurementName', first.name)
    }
  } catch (e) {
    // Ignorar
  }
}

onMounted(() => {
  loadSavedMeasurements()
})
</script>