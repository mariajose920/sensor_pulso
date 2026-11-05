import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import MedicionView from '../views/MedicionView.vue'
import ComparacionView from '../views/ComparacionView.vue'
import AulasView from '../views/AulasView.vue'
import AprendizajeView from '../views/AprendizajeView.vue'
import LeccionView from '../views/LeccionView.vue'
import SimuladorView from '../views/SimuladorView.vue'
import LoginView from '../views/LoginView.vue'
import DispositivosView from '../views/DispositivosView.vue'
import AdminView from '../views/AdminView.vue'
import RangosView from '../views/RangosView.vue'
import ForbiddenView from '../views/ForbiddenView.vue'
import HistorialView from '../views/HistorialView.vue'
import { useAuth } from '../composables/useAuth'
import { ROLES } from '../utils/roles'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView
  },
  {
    path: '/medicion',
    name: 'Medicion',
    component: MedicionView
  },
  {
    // RF13: Asistente integrado en la vista de medición
    path: '/asistente',
    redirect: '/medicion'
  },
  {
    path: '/dispositivos',
    name: 'Dispositivos',
    component: DispositivosView
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
    component: AulasView
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

  // Si la ruta requiere autenticación
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return next({ name: 'Login' })
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
