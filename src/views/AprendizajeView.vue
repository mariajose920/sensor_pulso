<template>
  <div>
    <div class="card">
      <h1 class="card-title">Apartado de aprendizaje</h1>
      <p class="intro">
        Aprende cómo funciona el corazón, qué es la frecuencia cardíaca, cómo trabajan el sensor y el ESP32 y cómo la plataforma
        obtiene tus resultados de BPM y saturación de oxígeno.
      </p>
      <p class="aviso-educativo">{{ AVISO_EDUCATIVO }}</p>
    </div>

    <h2 class="seccion">Lecciones</h2>
    <div class="lecciones-grid" data-testid="lista-lecciones">
      <router-link
        v-for="(l, i) in LECCIONES"
        :key="l.slug"
        :to="'/aprendizaje/' + l.slug"
        class="leccion-card card"
      >
        <span class="numero">{{ i + 1 }}</span>
        <span class="badge badge-usuario">{{ CATEGORIAS[l.categoria] }}</span>
        <h3 class="leccion-titulo">{{ l.titulo }}</h3>
        <p class="leccion-resumen">{{ l.resumen }}</p>
        <span class="leccion-meta">{{ l.minutos }} min de lectura</span>
      </router-link>
    </div>

    <h2 class="seccion">Practica</h2>
    <router-link to="/aprendizaje/simulador" class="leccion-card card practica">
      <h3 class="leccion-titulo">Simulador de señal</h3>
      <p class="leccion-resumen">
        Cambia el BPM, el ruido, la amplitud y la arritmia y mira cómo cambia la onda en vivo. No necesita ESP32.
      </p>
      <span class="leccion-meta">Interactivo</span>
    </router-link>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { AVISO_EDUCATIVO, CATEGORIAS, LECCIONES as LECCIONES_BASE } from '../data/lecciones.js'
import { obtenerLeccionesPlataforma } from '../services/panelAdminService'

// RF46: las lecciones precargadas más los cambios que aprobó el administrador
const LECCIONES = ref(LECCIONES_BASE)
onMounted(async () => { LECCIONES.value = await obtenerLeccionesPlataforma() })
</script>

<style scoped>
.intro { color: var(--color-muted); margin: 0 0 0.75rem; line-height: 1.55; }
.aviso-educativo { font-size: 0.8rem; color: var(--color-muted); margin: 0; }
.seccion { font-size: 1.15rem; font-weight: 600; margin: 0 0 0.75rem; }
.lecciones-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.leccion-card { position: relative; display: block; text-decoration: none; color: inherit; margin-bottom: 0; transition: border-color 0.15s, box-shadow 0.15s; min-height: var(--alto-tactil); }
.leccion-card:hover, .leccion-card:focus-visible { border-color: var(--color-primary); box-shadow: 0 2px 8px rgba(30, 64, 175, 0.15); }
.numero { position: absolute; top: 1rem; right: 1rem; font-size: 1.4rem; font-weight: 700; color: var(--color-border); }
.leccion-titulo { font-size: 1.05rem; font-weight: 600; margin: 0.6rem 0 0.35rem; }
.leccion-resumen { font-size: 0.9rem; color: var(--color-muted); line-height: 1.5; margin: 0 0 0.6rem; }
.leccion-meta { font-size: 0.8rem; color: var(--color-primary); font-weight: 600; }
.practica { border-left: 4px solid var(--color-primary); }
</style>
