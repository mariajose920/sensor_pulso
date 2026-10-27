-- sensor_pulso · Migración 2: auditoría, consentimiento, datos declarados, catálogos y rangos
-- RF03, RF04, RF14, RF19, RF28, RF46, RF53, RF59, RF62, RF63, RF76, RF116, RF117

-- ================================================================ AUDITORÍA
-- Solo inserción: nadie (ni admin) edita ni borra (RF63).
create table public.auditoria (
  id          bigint generated always as identity primary key,
  ocurrio_en  timestamptz not null default now(),            -- hora del servidor
  actor_id    uuid,
  accion      text not null,                                 -- p. ej. 'login','cambio_rol','descarga','publicacion','eliminacion','retiro_estudiante'
  entidad     text,
  entidad_id  text,
  detalle     jsonb not null default '{}'::jsonb,
  ip          inet,
  sospechoso  boolean not null default false
);
create index auditoria_actor_idx on public.auditoria (actor_id, ocurrio_en desc);
create index auditoria_accion_idx on public.auditoria (accion, ocurrio_en desc);

create or replace function public.auditoria_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'La auditoría no se puede modificar ni borrar' using errcode = '42501';
end $$;
create trigger auditoria_no_update before update or delete on public.auditoria
  for each row execute function public.auditoria_inmutable();
create trigger auditoria_no_truncate before truncate on public.auditoria
  for each statement execute function public.auditoria_inmutable();

create or replace function public.registrar_auditoria(
  p_accion text, p_entidad text default null, p_entidad_id text default null,
  p_detalle jsonb default '{}'::jsonb, p_sospechoso boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle, sospechoso)
  values (auth.uid(), p_accion, p_entidad, p_entidad_id, p_detalle, p_sospechoso)
$$;
-- Solo la usan otras funciones del servidor: un usuario no puede escribir acciones arbitrarias (RF63).
revoke all on function public.registrar_auditoria(text,text,text,jsonb,boolean) from public, anon, authenticated;

-- Única entrada de auditoría permitida al cliente: descargas de informe, CSV o imagen (RF32, RF62).
create or replace function public.registrar_descarga(p_tipo text, p_entidad_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  if p_tipo not in ('informe_pdf','datos_csv','grafico_imagen') then
    raise exception 'Tipo de descarga no válido';
  end if;
  perform public.registrar_auditoria('descarga', 'descargas', p_entidad_id, jsonb_build_object('tipo', p_tipo));
end $$;
revoke all on function public.registrar_descarga(text, text) from public, anon;
grant execute on function public.registrar_descarga(text, text) to authenticated;

-- Cada cambio de rol / admin / permisos queda registrado (RF53).
create or replace function public.auditar_cambio_rol()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.rol is distinct from old.rol) or (new.es_admin is distinct from old.es_admin) then
    insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'cambio_rol', 'perfiles', new.id::text,
      jsonb_build_object('rol_antes', old.rol, 'rol_despues', new.rol,
                         'admin_antes', old.es_admin, 'admin_despues', new.es_admin));
  end if;
  return new;
end $$;
create trigger perfiles_auditar after update on public.perfiles
  for each row execute function public.auditar_cambio_rol();

alter table public.auditoria enable row level security;
create policy auditoria_admin_lee on public.auditoria
  for select to authenticated using ((select public.es_admin()));        -- RF64
-- Sin políticas de insert/update/delete: se escribe solo vía registrar_auditoria() o service role.

-- ================================================================ CONSENTIMIENTO
create table public.consentimientos_version (            -- RF59, RF76
  version        text primary key,
  texto          text not null,
  finalidad      text not null,
  datos_recogidos text not null,
  responsable    text not null,
  plazo_conservacion text not null,
  vigente_desde  timestamptz not null default now(),
  activa         boolean not null default false
);
create unique index consentimiento_unica_activa on public.consentimientos_version (activa) where activa;

create table public.consentimientos_aceptados (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.perfiles (id) on delete cascade,
  version       text not null references public.consentimientos_version (version),
  aceptado_en   timestamptz not null default now(),
  revocado_en   timestamptz,                               -- RF90
  unique (usuario_id, version)
);
create index consent_usuario_idx on public.consentimientos_aceptados (usuario_id);

alter table public.consentimientos_version enable row level security;
alter table public.consentimientos_aceptados enable row level security;
create policy consent_version_leer on public.consentimientos_version
  for select to anon, authenticated using (true);
create policy consent_version_admin on public.consentimientos_version
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy consent_aceptado_propio_ver on public.consentimientos_aceptados
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy consent_aceptado_propio_insertar on public.consentimientos_aceptados
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy consent_aceptado_propio_revocar on public.consentimientos_aceptados
  for update to authenticated using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- ================================================================ ACTIVIDADES Y RANGOS
create table public.actividades (                         -- RF14, RF19
  id          smallint generated always as identity primary key,
  codigo      text not null unique,                       -- 'reposo','caminata','ejercicio','sueno', ...
  nombre      text not null,
  descripcion text,
  activa      boolean not null default true
);

create table public.rangos (                              -- RF19, RF20
  id            uuid primary key default gen_random_uuid(),
  actividad_id  smallint not null references public.actividades (id),
  edad_min      smallint not null check (edad_min >= 0),
  edad_max      smallint not null,
  bpm_min       smallint not null,
  bpm_max       smallint not null,
  spo2_min      smallint not null default 95,
  spo2_max      smallint not null default 100,
  vigente       boolean not null default true,
  actualizado_por uuid references public.perfiles (id),
  actualizado_en timestamptz not null default now(),
  check (edad_max >= edad_min),
  check (bpm_max > bpm_min),
  check (spo2_max >= spo2_min and spo2_min between 50 and 100 and spo2_max <= 100)
);
create index rangos_busqueda_idx on public.rangos (actividad_id, edad_min, edad_max) where vigente;

-- Cambios propuestos por profesores con permiso; el admin aprueba (RF46).
create table public.propuestas_cambio (
  id            uuid primary key default gen_random_uuid(),
  proponente_id uuid not null references public.perfiles (id),
  tipo          text not null check (tipo in ('rango','contenido','caso','leccion','metodo_sync')),
  entidad_id    text,
  propuesta     jsonb not null,
  motivo        text,
  estado        text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  revisado_por  uuid references public.perfiles (id),
  revisado_en   timestamptz,
  creado_en     timestamptz not null default now()
);

create table public.config_plataforma (                   -- RF28, RF46
  clave        text primary key,
  valor        jsonb not null,
  actualizado_por uuid references public.perfiles (id),
  actualizado_en timestamptz not null default now()
);

alter table public.actividades enable row level security;
alter table public.rangos enable row level security;
alter table public.propuestas_cambio enable row level security;
alter table public.config_plataforma enable row level security;

create policy actividades_leer on public.actividades for select to anon, authenticated using (true);
create policy actividades_admin on public.actividades for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy rangos_leer on public.rangos for select to authenticated using (true);
create policy rangos_admin on public.rangos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy propuestas_ver on public.propuestas_cambio for select to authenticated
  using (proponente_id = (select auth.uid()) or (select public.es_admin()));
create policy propuestas_crear on public.propuestas_cambio for insert to authenticated
  with check (proponente_id = (select auth.uid()) and (select public.es_profesor())
              and (select public.tiene_permiso('editar_rangos') or public.tiene_permiso('editar_contenidos')));
create policy propuestas_admin_resuelve on public.propuestas_cambio for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy config_leer on public.config_plataforma for select to authenticated using (true);
create policy config_admin on public.config_plataforma for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ================================================================ DATOS DECLARADOS (cifrados)
-- RF03 + RF116: nombre y edad en claro (necesarios para rangos y panel); sueño, cafeína,
-- medicación, condición de salud, estrés y otros factores van cifrados por la aplicación
-- (clave fuera del código, con rotación) en `datos_cifrados`. El profesor NUNCA los lee (RF117).
create table public.declaraciones_paciente (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfiles (id) on delete cascade,
  nombre         text not null,
  edad           smallint not null check (edad between 5 and 120),
  datos_cifrados bytea not null,
  clave_version  smallint not null default 1,
  creado_en      timestamptz not null default now()
);
create index declaraciones_usuario_idx on public.declaraciones_paciente (usuario_id, creado_en desc);

alter table public.declaraciones_paciente enable row level security;
create policy declaraciones_propias on public.declaraciones_paciente
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
