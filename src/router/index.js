import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import MedicionView from '../views/MedicionView.vue'
import ComparacionView from '../views/ComparacionView.vue'
import AulasView from '../views/AulasView.vue'
import AprendizajeView from '../views/AprendizajeView.vue'
import LoginView from '../views/LoginView.vue'

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
    path: '/simulador',
    redirect: '/aprendizaje'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
