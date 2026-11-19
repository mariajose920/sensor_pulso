<template>
  <div class="revelar" :class="{ 'revelar--activo': control.revelado.value }" data-testid="control-revelar-datos">
    <span class="revelar-estado" :class="control.revelado.value ? 'revelar-estado--visible' : 'revelar-estado--oculto'">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="control.revelado.value">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </template>
        <template v-else>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </template>
      </svg>
      {{ control.revelado.value ? 'Datos personales visibles' : 'Datos personales enmascarados' }}
    </span>

    <button
      type="button"
      class="btn btn-secondary btn-sm"
      :disabled="control.trabajando.value"
      :aria-pressed="control.revelado.value"
      data-testid="boton-revelar-datos"
      @click="control.alternar()"
    >
      <template v-if="control.trabajando.value">Registrando...</template>
      <template v-else-if="control.revelado.value">Volver a ocultar ({{ control.restante.value }} s)</template>
      <template v-else>Mostrar datos personales</template>
    </button>

    <p v-if="!control.revelado.value && !control.error.value" class="revelar-nota">
      Mostrarlos queda registrado en la auditoría y se vuelven a ocultar solos.
    </p>
    <p v-if="control.error.value" class="revelar-error" role="alert" data-testid="revelar-error">{{ control.error.value }}</p>
  </div>
</template>

<script setup>
// `control` es lo que devuelve useRevelarDatos(contexto)
defineProps({
  control: { type: Object, required: true }
})
</script>

<style scoped>
.revelar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
}

.revelar-estado {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
}

.revelar-estado--oculto {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.revelar-estado--visible {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}

.revelar-nota,
.revelar-error {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.76rem;
  color: #64748b;
}

.revelar-error {
  color: #b91c1c;
  font-weight: 600;
}
</style>
