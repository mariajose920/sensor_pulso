-- sensor_pulso · Migración 10: rangos de BPM y SpO2 por actividad y edad (RF19)
-- 1) Ajusta el SpO2 inicial por actividad y edad.
-- 2) Rangos personales del profesor con permiso editar_rangos (RF98): solo valen para su cuenta.
--    Para cambiar los rangos de todos, el profesor crea una propuesta (propuestas_cambio, tipo 'rango')
--    y el administrador la resuelve con resolver_propuesta().
-- Valores orientativos de uso educativo; no son criterios clínicos (RF75, RF94).

-- ================================================================ SpO2 INICIAL
-- Solo toca filas que siguen con el valor inicial (95-100), para no pisar lo que ya editó un administrador.
update public.rangos r
   set spo2_min = case
         when a.codigo in ('reposo', 'sentado') and r.edad_min >= 65 then 94
         when a.codigo = 'caminata'                                  then 94
         when a.codigo in ('ejercicio_moderado', 'post_ejercicio')   then 93
         when a.codigo = 'ejercicio_intenso'                         then 92
         else r.spo2_min
       end
  from public.actividades a
 where a.id = r.actividad_id
   and r.spo2_min = 95
   and r.spo2_max = 100;

-- ================================================================ RANGOS PERSONALES DEL PROFESOR
create table public.rangos_personales (                   -- RF19
  id             uuid primary key default gen_random_uuid(),
  profesor_id    uuid not null references public.perfiles (id) on delete cascade,
  actividad_id   smallint not null references public.actividades (id),
  edad_min       smallint not null check (edad_min >= 0),
  edad_max       smallint not null,
  bpm_min        smallint not null,
  bpm_max        smallint not null,
  spo2_min       smallint not null default 95,
  spo2_max       smallint not null default 100,
  actualizado_en timestamptz not null default now(),
  check (edad_max >= edad_min),
  check (bpm_max > bpm_min),
  check (spo2_max >= spo2_min and spo2_min between 50 and 100 and spo2_max <= 100),
  unique (profesor_id, actividad_id, edad_min, edad_max)
);
create trigger rangos_personales_updated before update on public.rangos_personales
  for each row execute function public.set_updated_at();

alter table public.rangos_personales enable row level security;

-- Cada profesor ve y administra solo los suyos, y solo mientras tenga el permiso editar_rangos.
create policy rangos_personales_ver on public.rangos_personales for select to authenticated
  using (profesor_id = (select auth.uid()));
create policy rangos_personales_crear on public.rangos_personales for insert to authenticated
  with check (profesor_id = (select auth.uid()) and (select public.es_profesor())
              and (select public.tiene_permiso('editar_rangos')));
create policy rangos_personales_editar on public.rangos_personales for update to authenticated
  using (profesor_id = (select auth.uid()) and (select public.tiene_permiso('editar_rangos')))
  with check (profesor_id = (select auth.uid()) and (select public.tiene_permiso('editar_rangos')));
create policy rangos_personales_borrar on public.rangos_personales for delete to authenticated
  using (profesor_id = (select auth.uid()));
