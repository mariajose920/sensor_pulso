<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'inicio'">
      <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
      <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
    </template>
    <template v-else-if="name === 'medicion'">
      <path d="M3 12h4l3 8l4 -16l3 8h4" />
    </template>
    <template v-else-if="name === 'comparacion'">
      <path d="M4 19l16 0" />
      <path d="M4 15l4 -6l4 2l4 -5l4 4" />
    </template>
    <template v-else-if="name === 'aulas'">
      <path d="M22 9l-10 -4l-10 4l10 4l10 -4v6" />
      <path d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4" />
    </template>
    <template v-else-if="name === 'aprendizaje'">
      <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
      <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
      <path d="M3 6l0 13" />
      <path d="M12 6l0 13" />
      <path d="M21 6l0 13" />
    </template>
    <template v-else-if="name === 'usuario'">
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    </template>
    <template v-else-if="name === 'girar'">
      <path d="M12 6h-6a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-3" />
      <path d="M18 3l3 3l-3 3" />
      <path d="M21 6h-6" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  name: { type: String, required: true }
})
</script>
