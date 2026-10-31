# Base de datos de sensor_pulso (Supabase)

- Proyecto: `ozzehtpqxpicfqvmulcg` (https://ozzehtpqxpicfqvmulcg.supabase.co), región us-east-1, Postgres 17.
- `migrations/`: esquema completo en 10 migraciones, que la integración con GitHub aplica al hacer merge en la rama de producción.
- `sensor_pulso_base_de_datos_completa.sql`: las mismas 10 migraciones en un solo archivo, para pegar en el SQL Editor de un proyecto vacío. No ejecutar si ya se aplicaron las migraciones.
- `seed.example.sql`: ejemplo para registrar el correo del primer administrador (RF44). No poner el correo real en un archivo versionado.

## Conexión desde la web (Vue + Vite)
1. Copiar `.env.example` a `.env.local`.
2. El cliente está en `src/services/supabase.js` y usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. `SUPABASE_SECRET_KEY` y `CLAVE_CIFRADO_CAMPOS` son solo del servidor (Vercel). Nunca con prefijo `VITE_` ni en el repositorio.

## Integración GitHub en Supabase
Project Settings → Integrations → GitHub. Repositorio `mariajose920/sensor_pulso`, directorio `supabase`, y **una sola** rama de producción (no `main, develop`).

## Antes del primer uso
- Insertar el correo del primer admin en `admins_iniciales` antes de que esa persona se registre.
- Activar `exigir_mfa` en `config_plataforma` cuando admin y profesores hayan inscrito su segundo factor (RF49).
- Completar los textos legales de `documentos_legales` y `consentimientos_version`.
