import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import MedicionView from '../views/MedicionView.vue'
import ComparacionView from '../views/ComparacionView.vue'
import AulasView from '../views/AulasView.vue'
import AulaDetalleView from '../views/AulaDetalleView.vue'
import AprendizajeView from '../views/AprendizajeView.vue'
import LeccionView from '../views/LeccionView.vue'
import PracticaView from '../views/PracticaView.vue'
import SimuladorView from '../views/SimuladorView.vue'
import LoginView from '../views/LoginView.vue'
import DispositivosView from '../views/DispositivosView.vue'
import AdminView from '../views/AdminView.vue'
import RangosView from '../views/RangosView.vue'
import ContenidosView from '../views/ContenidosView.vue'
import ForbiddenView from '../views/ForbiddenView.vue'
import HistorialView from '../views/HistorialView.vue'
import PrivacidadView from '../views/PrivacidadView.vue'
import MisDatosView from '../views/MisDatosView.vue'
import SeguridadAdminView from '../views/SeguridadAdminView.vue'
import EvaluacionesView from '../views/EvaluacionesView.vue'
import { useAuth } from '../composables/useAuth'
import { ROLES } from '../utils/roles'
import { motivoDeRuta } from '../utils/accesoSinSesion'
import { consultarEstadoMfa } from '../services/mfaService.js'

const routes = [
  {
    // RF88: política de privacidad, pública (se lee antes de crear la cuenta)
    path: '/privacidad',
    name: 'Privacidad',
    component: PrivacidadView
  },
  {
    // RF89/RF90: cada persona ve y gestiona solo sus propios datos
    path: '/mis-datos',
    name: 'MisDatos',
    component: MisDatosView,
    meta: { requiresAuth: true }
  },
  {
    // RF89/RF92: solicitudes de derechos, incidentes y brechas; solo administrador (la RLS también lo exige)
    path: '/admin/seguridad',
    name: 'SeguridadAdmin',
    component: SeguridadAdminView,
    meta: { requiresAuth: true, roles: [ROLES.ADMIN] }
  },
  {
    path: '/',
    name: 'Home',
    component: HomeView
  },
  {
    path: '/medicion',
    name: 'Medicion',
    component: MedicionView,
    meta: { requiresAuth: true }   // sin sesión no hay sensor: solo se estudia o se compara
  },
  {
    // RF13: Asistente integrado en la vista de medición
    path: '/asistente',
    redirect: '/medicion'
  },
  {
    path: '/dispositivos',
    name: 'Dispositivos',
    component: DispositivosView,
    meta: { requiresAuth: true }   // los sensores ESP32 son de quien tiene sesión
  },
  {
    path: '/historial',
    name: 'Historial',
    component: HistorialView,
    meta: { requiresAuth: true }
  },
  {
    path: '/comparacion',
    name: 'Comparacion',
    component: ComparacionView
  },
  {
    path: '/aulas',
    name: 'Aulas',
    component: AulasView,
    meta: { requiresAuth: true }   // sin sesión no se ven aulas
  },
  {
    // RF103: Página del aula (con pestañas: estudiantes, cursos y evaluaciones)
    path: '/aulas/:id',
    name: 'AulaDetalle',
    component: AulaDetalleView,
    meta: { requiresAuth: true, roles: [ROLES.PROFESOR, ROLES.ADMIN] }
  },
  {
    // RF106: tipos de evaluación; solo profesor o administrador (la RLS también lo exige)
    path: '/evaluaciones',
    name: 'Evaluaciones',
    component: EvaluacionesView,
    meta: { requiresAuth: true, roles: [ROLES.PROFESOR, ROLES.ADMIN] }
  },
  {
    path: '/mis-evaluaciones',
    name: 'MisEvaluaciones',
    component: () => import('../views/MisEvaluacionesView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/aprendizaje',
    name: 'Aprendizaje',
    component: AprendizajeView
  },
  {
    // RF41: el simulador vive dentro del apartado de aprendizaje; va antes de la lección para que no se tome como slug
    path: '/aprendizaje/simulador',
    name: 'Simulador',
    component: SimuladorView
  },
  {
    // Práctica para las evaluaciones: abierta con o sin sesión (va antes de la lección para que no se tome como slug)
    path: '/aprendizaje/practica',
    name: 'Practica',
    component: PracticaView
  },
  {
    // RF38: una lección del apartado de aprendizaje
    path: '/aprendizaje/:slug',
    name: 'Leccion',
    component: LeccionView
  },
  {
    path: '/simulador',
    redirect: '/aprendizaje/simulador'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView
  },
  {
    path: '/mfa',
    name: 'Mfa',
    component: () => import('../views/MfaView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'Admin',
    component: AdminView,
    meta: { requiresAuth: true, roles: [ROLES.ADMIN] }
  },
  {
    // RF19: el profesor edita sus rangos si tiene el permiso editar_rangos (RF98); lo valida la vista y la RLS
    path: '/rangos',
    name: 'Rangos',
    component: RangosView,
    meta: { requiresAuth: true, roles: [ROLES.PROFESOR, ROLES.ADMIN] }
  },
  {
    // RF46: el profesor con permiso editar_contenidos propone cambios de lecciones y de sincronización
    path: '/contenidos',
    name: 'Contenidos',
    component: ContenidosView,
    meta: { requiresAuth: true, roles: [ROLES.PROFESOR, ROLES.ADMIN] }
  },
  {
    path: '/sin-acceso',
    name: 'Forbidden',
    component: ForbiddenView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// RF97 y RF45: Navigation Guard para control de acceso según roles desde BD
router.beforeEach(async (to, _from, next) => {
  const { isAuthenticated, isAdmin, isProfesor, currentUserRole, loading } = useAuth()

  // Esperar a que se resuelva la sesión inicial (con límite de seguridad de 1s para evitar pantalla blanca)
  if (loading.value) {
    await new Promise(resolve => {
      let intentos = 0
      const interval = setInterval(() => {
        intentos++
        if (!loading.value || intentos >= 20) {
          clearInterval(interval)
          resolve()
        }
      }, 50)
    })
  }

  // Si la ruta requiere autenticación (Medición muestra su propio bloqueo institucional dentro de la vista)
  if (to.meta.requiresAuth && !isAuthenticated.value && to.name !== 'Medicion') {
    // Se avisa en el login por qué hace falta la sesión y se vuelve a la pantalla pedida al entrar
    const query = { redirect: to.fullPath }
    const motivo = motivoDeRuta(to.name)
    if (motivo) query.motivo = motivo
    return next({ name: 'Login', query })
  }

  if (isAuthenticated.value && to.meta.requiresAuth && to.name !== 'Mfa') {
    try {
      const { nivelActual, nivelSiguiente } = await consultarEstadoMfa()
      const requiereMfa = isAdmin.value || isProfesor.value || nivelSiguiente === 'aal2'

      if (requiereMfa && nivelActual !== 'aal2') {
        return next({
          name: 'Mfa',
          query: { redirect: to.fullPath }
        })
      }
    } catch {
      return next({
        name: 'Mfa',
        query: { redirect: to.fullPath }
      })
    }
  }

  // Si la ruta está restringida a ciertos roles
  if (to.meta.roles) {
    const tienePermiso = to.meta.roles.some(rol => {
      if (rol === ROLES.ADMIN) return isAdmin.value
      if (rol === ROLES.PROFESOR) return isProfesor.value
      if (rol === ROLES.USUARIO) return true
      return false
    })

    if (!tienePermiso) {
      return next({ name: 'Forbidden' })
    }
  }

  next()
})

export default router
