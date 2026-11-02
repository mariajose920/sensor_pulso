-- sensor_pulso · Migración 11: guardado de mediciones e historial (RF30)
-- La tabla `mediciones` y su RLS ya existen (migración 4). Aquí solo se agrega lo que RF30 necesita:
-- 1) `id_cliente`: identificador que genera la web al guardar. Permite reenviar sin duplicar
--    una medición guardada sin conexión (cola local) cuando vuelve internet.
-- 2) Una medición con calidad de señal mala no se guarda como válida (RF16). Se exige también
--    en la base, no solo en la web.
-- 3) Índice para el historial paginado de cada usuario.

alter table public.mediciones add column if not exists id_cliente uuid;

-- Un mismo id_cliente no se repite para el mismo usuario (los NULL no cuentan como repetidos).
create unique index if not exists mediciones_id_cliente_un
  on public.mediciones (usuario_id, id_cliente);

-- "not valid": exige la regla en toda fila nueva o modificada sin fallar si ya hay datos de prueba.
alter table public.mediciones drop constraint if exists mediciones_calidad_no_mala;
alter table public.mediciones
  add constraint mediciones_calidad_no_mala check (calidad is distinct from 'mala') not valid;

comment on column public.mediciones.id_cliente is 'RF30: id generado por la web para no duplicar al reenviar una medición guardada sin conexión';
comment on constraint mediciones_calidad_no_mala on public.mediciones is 'RF16/RF30: una medición con calidad mala no se guarda como válida';

-- Historial del usuario: orden por fecha de inicio (ya existe mediciones_usuario_idx en usuario_id, inicio desc).
-- Las políticas mediciones_propias y mediciones_admin_ver de la migración 4 ya limitan cada consulta
-- a las mediciones de la propia cuenta; no se agregan políticas nuevas.
