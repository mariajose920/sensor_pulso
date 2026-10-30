import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import MedicionView from '../views/MedicionView.vue'
import ComparacionView from '../views/ComparacionView.vue'
import AulasView from '../views/AulasView.vue'
import AprendizajeView from '../views/AprendizajeView.vue'
import LoginView from '../views/LoginView.vue'
import DispositivosView from '../views/DispositivosView.vue'
import AdminView from '../views/AdminView.vue'
import ForbiddenView from '../views/ForbiddenView.vue'
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
    path: '/dispositivos',
    name: 'Dispositivos',
    component: DispositivosView
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
    path: '/simulador',
    redirect: '/aprendizaje'
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
