# sensor_pulso

Plataforma web educativa, responsiva e instalable (PWA) para medir, visualizar, comparar e interpretar la frecuencia cardíaca y SpO₂ con un ESP32 (hasta 5 sensores) conectado por WiFi.

Proyecto de la asignatura **Programación Web y Gestión de Ciberseguridad** — Universidad Adventista de Chile (UNACH).  
**Líder de proyecto:** Darío Sandoval.

---

## Equipo y Áreas de Trabajo

| Integrante | Área de Responsabilidad |
| :--- | :--- |
| **Cristóbal** | Gestión de usuarios y roles, aulas, cursos y asignación de evaluaciones; retos y ética. |
| **Javiera** | Análisis de señal, alertas, comparación, consentimiento, privacidad, auditoría y derechos. |
| **Adán** | ESP32, SpO₂, tiempo real y seguridad de la infraestructura y de datos de entrada. |
| **María José** | Estructura web, base de datos, administración, aprendizaje, informes, galería, calificación y despliegue. |

---

## Stack Tecnológico

- **Frontend:** Vue 3 (Composition API / `<script setup>`), Vite, Vue Router.
- **Backend / Base de Datos:** Supabase (Auth, PostgreSQL con RLS, Realtime, Storage).
- **Hardware / Firmware:** ESP32 con sensores MAX30102 comunicados por WiFi.
- **Despliegue:** Vercel.

---

## Convenciones de Desarrollo y Git

1. **Ramas por requerimiento:** Cada funcionalidad se desarrolla en una rama independiente con el formato:
   ```bash
   rfNN-descripcion
   # Ejemplo: rf01-identificar-usuario, rf05-recepcion-wifi
   ```
   El nombre de la rama contiene `RFNN` o `RNFNN` (NN = número del requerimiento; mayúsculas, puntos y guiones no importan). Dentro de la rama los commits no tienen exigencias, pero **no se puede hacer commit ni push directo a `main` o `develop`**: todo entra por pull request. Se valida con hooks de Git y con GitHub Actions: ver [docs/COMMITS.md](docs/COMMITS.md).
2. **Confirmación antes de commit/push:** Cada integrante valida sus cambios antes de hacer commit o push.
3. **Integración:** La unión a la rama principal (`main`) se coordina en las reuniones de entrega.

---

## Instalación y Ejecución Local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/mariajose920/sensor_pulso.git
   cd sensor_pulso
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno:
   Copiar `.env.example` a `.env.local` (la URL y la clave publicable del proyecto ya vienen en el ejemplo):
   ```bash
   cp .env.example .env.local
   ```

4. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

5. Compilar para producción:
   ```bash
   npm run build
   ```
