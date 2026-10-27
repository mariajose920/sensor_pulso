import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import MedicionView from '../views/MedicionView.vue'
import ComparacionView from '../views/ComparacionView.vue'
import AulasView from '../views/AulasView.vue'
import AprendizajeView from '../views/AprendizajeView.vue'
import LoginView from '../views/LoginView.vue'
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

// RF97: Navigation Guard para control de acceso según roles
router.beforeEach(async (to, _from, next) => {
  const { isAuthenticated, currentUserRole, loading } = useAuth()

  // Esperar a que se resuelva la sesión inicial si aún está cargando
  if (loading.value) {
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (!loading.value) {
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
  if (to.meta.roles && !to.meta.roles.includes(currentUserRole.value)) {
    return next({ name: 'Forbidden' })
  }

  next()
})

export default router