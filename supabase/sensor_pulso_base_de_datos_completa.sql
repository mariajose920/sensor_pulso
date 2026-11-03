-- =============================================================================
-- sensor_pulso · Base de datos completa (migraciones 1 a 10 en un solo archivo)
-- Pegar entero en Supabase > SQL Editor y ejecutar UNA sola vez en un proyecto vacío.
-- Equivale a ejecutar en orden supabase/migrations/*.sql
-- =============================================================================

-- ########## 20261027000100_base_perfiles_roles.sql ##########
-- sensor_pulso · Migración 1: perfiles, roles y permisos
-- RF01, RF02, RF44, RF45, RF49, RF52, RF53, RF96, RF97, RF98, RNF07, RNF12

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tipos
create type public.rol_app as enum ('usuario', 'profesor');

-- ---------------------------------------------------------------- utilidades
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

-- ---------------------------------------------------------------- perfiles
-- Un perfil por cuenta de auth.users. El administrador es un indicador aparte
-- porque puede ser también profesor (RF97).
create table public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  correo         text not null unique,
  nombre         text not null default '',
  rol            public.rol_app not null default 'usuario',
  es_admin       boolean not null default false,
  mfa_requerido  boolean not null default false,          -- RF49
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perfiles_dominio_ck check (
    correo ~* '^[^@\s]+@(alu\.)?unach\.cl$'                 -- RF96
  ),
  constraint perfiles_rol_dominio_ck check (
    (correo ~* '@alu\.unach\.cl$' and rol = 'usuario')
    or (correo ~* '@unach\.cl$' and not (correo ~* '@alu\.unach\.cl$'))
  )
);
create trigger perfiles_updated before update on public.perfiles
  for each row execute function public.set_updated_at();

-- Correos que serán administradores al registrarse (primer admin "en código", RF44).
-- Se llena con migración/seed del equipo; nadie la lee desde la API.
create table public.admins_iniciales (
  correo text primary key
);
alter table public.admins_iniciales enable row level security;

-- Permisos personalizados por profesor (RF98).
create table public.permisos_profesor (
  profesor_id          uuid primary key references public.perfiles (id) on delete cascade,
  crear_aulas          boolean not null default false,
  publicar_galeria     boolean not null default false,
  compartir_banco      boolean not null default false,
  editar_rangos        boolean not null default false,
  editar_contenidos    boolean not null default false,
  otorgado_por         uuid references public.perfiles (id),
  actualizado_en       timestamptz not null default now()
);
create trigger permisos_updated before update on public.permisos_profesor
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- funciones de rol
-- security definer para evitar recursión de RLS; search_path fijo.

-- MFA obligatorio para administradores y profesores (RF49). Se activa poniendo
-- config_plataforma.exigir_mfa = true, una vez que esas cuentas hayan inscrito su segundo factor.
create or replace function public.mfa_ok()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_exigir boolean; v_claims jsonb;
begin
  select coalesce((select (c.valor #>> '{}')::boolean from public.config_plataforma c where c.clave = 'exigir_mfa'), false)
    into v_exigir;
  if not v_exigir then return true; end if;
  v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  return coalesce(v_claims ->> 'aal', '') = 'aal2';
end $$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.es_admin from public.perfiles p where p.id = auth.uid()), false)
         and public.mfa_ok()
$$;

create or replace function public.es_profesor()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.rol = 'profesor' from public.perfiles p where p.id = auth.uid()), false)
         and public.mfa_ok()
$$;

create or replace function public.tiene_permiso(p_permiso text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r boolean;
begin
  if public.es_admin() then return true; end if;
  execute format(
    'select coalesce((select %I from public.permisos_profesor where profesor_id = auth.uid()), false)',
    p_permiso) into r;
  return r;
end $$;

-- ---------------------------------------------------------------- alta de cuenta
-- Valida el dominio institucional y asigna el rol inicial (RF96).
create or replace function public.crear_perfil_al_registrarse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_correo text := lower(new.email);
  v_rol public.rol_app;
  v_admin boolean;
begin
  if v_correo ~ '^[^@\s]+@alu\.unach\.cl$' then
    v_rol := 'usuario';
  elsif v_correo ~ '^[^@\s]+@unach\.cl$' then
    v_rol := 'profesor';
  else
    raise exception 'Solo se aceptan correos @alu.unach.cl o @unach.cl' using errcode = 'check_violation';
  end if;

  v_admin := exists (select 1 from public.admins_iniciales a where lower(a.correo) = v_correo);

  insert into public.perfiles (id, correo, nombre, rol, es_admin, mfa_requerido)
  values (new.id, v_correo, coalesce(new.raw_user_meta_data ->> 'nombre', ''), v_rol,
          v_admin, (v_rol = 'profesor' or v_admin));

  if v_rol = 'profesor' then
    insert into public.permisos_profesor (profesor_id) values (new.id);
  end if;
  return new;
end $$;

create trigger al_registrarse after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- Impide que un usuario se cambie a sí mismo rol/admin (RF52, RF53);
-- solo un administrador (o el service role) puede hacerlo.
create or replace function public.proteger_cambio_rol()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.rol is distinct from old.rol)
     or (new.es_admin is distinct from old.es_admin)
     or (new.correo is distinct from old.correo)
     or (new.mfa_requerido is distinct from old.mfa_requerido) then
    if auth.uid() is not null and not public.es_admin() then
      raise exception 'Solo un administrador puede cambiar rol, correo o MFA' using errcode = '42501';
    end if;
  end if;
  -- Nunca puede quedar la plataforma sin administrador.
  if old.es_admin and not new.es_admin
     and not exists (select 1 from public.perfiles p where p.es_admin and p.id <> old.id) then
    raise exception 'Debe existir al menos un administrador' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger perfiles_proteger before update on public.perfiles
  for each row execute function public.proteger_cambio_rol();

-- ---------------------------------------------------------------- RLS
alter table public.perfiles enable row level security;
alter table public.permisos_profesor enable row level security;

create policy perfiles_ver_propio on public.perfiles
  for select to authenticated using (id = (select auth.uid()) or (select public.es_admin()));
create policy perfiles_editar_propio on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()))
  with check (id = (select auth.uid()) or (select public.es_admin()));

create policy permisos_ver on public.permisos_profesor
  for select to authenticated using (profesor_id = (select auth.uid()) or (select public.es_admin()));
create policy permisos_admin_escribe on public.permisos_profesor
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));


-- ########## 20261027000200_auditoria_consentimiento_catalogos.sql ##########
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


-- ########## 20261027000300_aulas_cursos.sql ##########
-- sensor_pulso · Migración 3: aulas, cursos y membresías
-- RF12, RF43, RF97, RF99, RF100, RF101, RF102, RF103, RF110

create or replace function public.generar_codigo_aula()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sin 0/O/1/I
  r text := '';
begin
  for i in 1..8 loop
    r := r || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return r;
end $$;

create table public.aulas (
  id             uuid primary key default gen_random_uuid(),
  profesor_id    uuid not null references public.perfiles (id),
  nombre         text not null check (length(trim(nombre)) > 0),
  descripcion    text,
  codigo         text not null unique default public.generar_codigo_aula(),   -- RF99
  codigo_activo  boolean not null default true,                               -- RF100
  max_estudiantes smallint not null default 100 check (max_estudiantes between 1 and 100),
  archivada      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index aulas_profesor_idx on public.aulas (profesor_id);
create trigger aulas_updated before update on public.aulas
  for each row execute function public.set_updated_at();

create table public.cursos (                              -- RF101
  id        uuid primary key default gen_random_uuid(),
  aula_id   uuid not null references public.aulas (id) on delete cascade,
  nombre    text not null check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now(),
  unique (aula_id, nombre)
);

-- Estudiante dentro de un aula. Al retirarlo (RF102) se conserva la fila como registro
-- académico, pero el profesor pierde acceso a sus mediciones y respuestas detalladas.
create table public.aula_estudiantes (
  aula_id      uuid not null references public.aulas (id) on delete cascade,
  usuario_id   uuid not null references public.perfiles (id) on delete cascade,
  estado       text not null default 'activo' check (estado in ('activo','retirado')),
  unido_en     timestamptz not null default now(),
  retirado_en  timestamptz,
  retirado_por uuid references public.perfiles (id),
  primary key (aula_id, usuario_id)
);
create index aula_est_usuario_idx on public.aula_estudiantes (usuario_id);

create table public.curso_estudiantes (
  curso_id   uuid not null references public.cursos (id) on delete cascade,
  aula_id    uuid not null,
  usuario_id uuid not null,
  primary key (curso_id, usuario_id),
  foreign key (aula_id, usuario_id) references public.aula_estudiantes (aula_id, usuario_id) on delete cascade
);

create table public.invitaciones_aula (                   -- RF100: invitación al correo
  id          uuid primary key default gen_random_uuid(),
  aula_id     uuid not null references public.aulas (id) on delete cascade,
  correo      text not null check (correo ~* '^[^@\s]+@alu\.unach\.cl$'),
  enviada_en  timestamptz not null default now(),
  aceptada_en timestamptz,
  unique (aula_id, correo)
);

-- ---------------------------------------------------------------- funciones de pertenencia
create or replace function public.es_profesor_del_aula(p_aula uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.aulas a where a.id = p_aula and a.profesor_id = auth.uid())
$$;

create or replace function public.es_miembro_activo(p_aula uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.aula_estudiantes e
                 where e.aula_id = p_aula and e.usuario_id = auth.uid() and e.estado = 'activo')
$$;

-- El profesor ve datos de un estudiante solo si éste sigue activo en un aula suya (RF102, RF117).
create or replace function public.profesor_ve_a(p_usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.aula_estudiantes e
    join public.aulas a on a.id = e.aula_id
    where e.usuario_id = p_usuario and e.estado = 'activo' and a.profesor_id = auth.uid())
$$;

-- Unirse con el código (RF97, RF100): valida código activo y cupo.
create or replace function public.unirse_a_aula(p_codigo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_aula public.aulas; v_n int;
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  select * into v_aula from public.aulas
   where codigo = upper(trim(p_codigo)) and codigo_activo and not archivada;
  if not found then raise exception 'Código de aula inválido o desactivado'; end if;

  select count(*) into v_n from public.aula_estudiantes
   where aula_id = v_aula.id and estado = 'activo';
  if v_n >= v_aula.max_estudiantes then raise exception 'El aula alcanzó su cupo'; end if;

  insert into public.aula_estudiantes (aula_id, usuario_id)
  values (v_aula.id, auth.uid())
  on conflict (aula_id, usuario_id)
  do update set estado = 'activo', retirado_en = null, retirado_por = null, unido_en = now();

  update public.invitaciones_aula i set aceptada_en = now()
   where i.aula_id = v_aula.id and lower(i.correo) =
         (select lower(correo) from public.perfiles where id = auth.uid());

  perform public.registrar_auditoria('union_aula', 'aulas', v_aula.id::text);
  return v_aula.id;
end $$;

-- Regenerar el código (RF100).
create or replace function public.regenerar_codigo_aula(p_aula uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if not (public.es_profesor_del_aula(p_aula) or public.es_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  v := public.generar_codigo_aula();
  update public.aulas set codigo = v, codigo_activo = true where id = p_aula;
  return v;
end $$;

-- Retiro de uno o varios estudiantes con registro en auditoría (RF102).
create or replace function public.retirar_estudiantes(p_aula uuid, p_usuarios uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not (public.es_profesor_del_aula(p_aula) or public.es_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.aula_estudiantes
     set estado = 'retirado', retirado_en = now(), retirado_por = auth.uid()
   where aula_id = p_aula and usuario_id = any (p_usuarios) and estado = 'activo';
  get diagnostics n = row_count;
  delete from public.curso_estudiantes
   where aula_id = p_aula and usuario_id = any (p_usuarios);
  perform public.registrar_auditoria('retiro_estudiantes', 'aulas', p_aula::text,
          jsonb_build_object('usuarios', p_usuarios));
  return n;
end $$;

revoke all on function public.unirse_a_aula(text), public.regenerar_codigo_aula(uuid),
  public.retirar_estudiantes(uuid, uuid[]) from public, anon;
grant execute on function public.unirse_a_aula(text), public.regenerar_codigo_aula(uuid),
  public.retirar_estudiantes(uuid, uuid[]) to authenticated;

-- El profesor puede conocer nombre y correo de quien pertenece (o perteneció) a un aula suya,
-- para conservar el registro académico (RF102, RF117). No da acceso a nada más.
create or replace function public.profesor_conoce_a(p_usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.aula_estudiantes e
    join public.aulas a on a.id = e.aula_id
    where e.usuario_id = p_usuario and a.profesor_id = auth.uid())
$$;

create policy perfiles_profesor_ve_estudiantes on public.perfiles
  for select to authenticated using ((select public.profesor_conoce_a(id)));

-- ---------------------------------------------------------------- RLS
alter table public.aulas enable row level security;
alter table public.cursos enable row level security;
alter table public.aula_estudiantes enable row level security;
alter table public.curso_estudiantes enable row level security;
alter table public.invitaciones_aula enable row level security;

create policy aulas_ver on public.aulas for select to authenticated
  using (profesor_id = (select auth.uid()) or (select public.es_miembro_activo(id)) or (select public.es_admin()));
create policy aulas_crear on public.aulas for insert to authenticated
  with check (profesor_id = (select auth.uid()) and (select public.es_profesor())
              and (select public.tiene_permiso('crear_aulas')));
create policy aulas_editar on public.aulas for update to authenticated
  using (profesor_id = (select auth.uid()) or (select public.es_admin()))
  with check (profesor_id = (select auth.uid()) or (select public.es_admin()));
create policy aulas_borrar on public.aulas for delete to authenticated
  using (profesor_id = (select auth.uid()) or (select public.es_admin()));

create policy cursos_ver on public.cursos for select to authenticated
  using ((select public.es_profesor_del_aula(aula_id)) or (select public.es_miembro_activo(aula_id))
         or (select public.es_admin()));
create policy cursos_gestion on public.cursos for all to authenticated
  using ((select public.es_profesor_del_aula(aula_id)))
  with check ((select public.es_profesor_del_aula(aula_id)));

-- El estudiante ve su propia fila (incluso retirado, para saber su estado); el profesor ve la lista.
create policy aula_est_ver on public.aula_estudiantes for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_profesor_del_aula(aula_id))
         or (select public.es_admin()));
-- Altas y bajas solo por funciones (unirse_a_aula / retirar_estudiantes).

create policy curso_est_ver on public.curso_estudiantes for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_profesor_del_aula(aula_id)));
create policy curso_est_gestion on public.curso_estudiantes for all to authenticated
  using ((select public.es_profesor_del_aula(aula_id)))
  with check ((select public.es_profesor_del_aula(aula_id)));

create policy invitaciones_profesor on public.invitaciones_aula for all to authenticated
  using ((select public.es_profesor_del_aula(aula_id)))
  with check ((select public.es_profesor_del_aula(aula_id)));


-- ########## 20261027000400_dispositivos_mediciones.sql ##########
-- sensor_pulso · Migración 4: ESP32, sesiones, canales, mediciones, señal y alertas
-- RF05–RF12, RF14–RF21, RF30, RF54, RF65, RF111, RF114, RNF04, RNF09

create type public.estado_conexion as enum ('activa', 'perdida', 'finalizada');       -- RF11
create type public.ritmo_cardiaco  as enum ('normal', 'taquicardia', 'bradicardia', 'irregular'); -- RF18
create type public.calidad_senal   as enum ('buena', 'regular', 'mala');              -- RF15
create type public.fuente_senal    as enum ('sensor', 'simulador', 'csv', 'dataset', 'referencia'); -- RF27

-- ================================================================ ESP32
create table public.dispositivos (                         -- RF54
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  token_hash    text not null unique,                      -- SHA-256 del token; el token en claro nunca se guarda
  canales       smallint not null default 5 check (canales between 1 and 5),
  activo        boolean not null default true,
  revocado_en   timestamptz,
  revocado_por  uuid references public.perfiles (id),
  ultimo_contacto timestamptz,
  creado_por    uuid references public.perfiles (id),
  creado_en     timestamptz not null default now(),
  check (activo = (revocado_en is null))
);

-- ================================================================ SESIONES
create table public.sesiones_medicion (                    -- RF09, RF10, RF11, RF12
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid references public.dispositivos (id),  -- null = simulador / sin ESP32
  iniciada_por   uuid not null references public.perfiles (id),
  aula_id        uuid references public.aulas (id) on delete set null,
  evaluacion_id  uuid,                                      -- FK se agrega en la migración de evaluaciones
  ronda          smallint not null default 1 check (ronda >= 1),     -- RF111
  estado         estado_conexion not null default 'activa',
  motivo_fin     text,                                      -- 'usuario','perdida_comunicacion','sensor_desconectado'
  inicio         timestamptz not null default now(),
  fin            timestamptz,
  ultimo_latido  timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index sesiones_dispositivo_idx on public.sesiones_medicion (dispositivo_id, inicio desc);
create index sesiones_aula_idx on public.sesiones_medicion (aula_id) where aula_id is not null;

-- Cada canal (1..5) del ESP32 se asocia a la cuenta de un usuario (RF12, RF111).
create table public.sesion_canales (
  sesion_id  uuid not null references public.sesiones_medicion (id) on delete cascade,
  canal      smallint not null check (canal between 1 and 5),
  usuario_id uuid references public.perfiles (id),
  asignado_en timestamptz,
  primary key (sesion_id, canal)
);
create unique index sesion_canal_un_usuario on public.sesion_canales (sesion_id, usuario_id)
  where usuario_id is not null;

-- El estudiante elige un canal libre (RF111). Atómico: solo toma el canal si está libre.
create or replace function public.elegir_canal(p_sesion uuid, p_canal smallint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; v_aula uuid; v_estado public.estado_conexion;
begin
  select aula_id, estado into v_aula, v_estado from public.sesiones_medicion where id = p_sesion;
  if not found or v_estado <> 'activa' then raise exception 'Sesión no disponible'; end if;
  if v_aula is not null and not public.es_miembro_activo(v_aula) then
    raise exception 'No perteneces al aula de esta sesión' using errcode = '42501';
  end if;
  update public.sesion_canales
     set usuario_id = auth.uid(), asignado_en = now()
   where sesion_id = p_sesion and canal = p_canal and usuario_id is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- El profesor corrige la asignación o libera canales (RF111).
create or replace function public.asignar_canal(p_sesion uuid, p_canal smallint, p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_aula uuid;
begin
  select aula_id into v_aula from public.sesiones_medicion where id = p_sesion;
  if not (public.es_admin() or (v_aula is not null and public.es_profesor_del_aula(v_aula))) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.sesion_canales
     set usuario_id = p_usuario, asignado_en = case when p_usuario is null then null else now() end
   where sesion_id = p_sesion and canal = p_canal;
end $$;

revoke all on function public.elegir_canal(uuid, smallint), public.asignar_canal(uuid, smallint, uuid)
  from public, anon;
grant execute on function public.elegir_canal(uuid, smallint), public.asignar_canal(uuid, smallint, uuid)
  to authenticated;

-- Crea los canales al crear la sesión según el dispositivo.
create or replace function public.crear_canales_sesion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n smallint := 5;
begin
  if new.dispositivo_id is not null then
    select canales into n from public.dispositivos where id = new.dispositivo_id;
  end if;
  insert into public.sesion_canales (sesion_id, canal)
  select new.id, g from generate_series(1, coalesce(n, 5)) g;
  return new;
end $$;
create trigger sesion_crear_canales after insert on public.sesiones_medicion
  for each row execute function public.crear_canales_sesion();

-- ================================================================ MEDICIONES
create table public.mediciones (                           -- RF30
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.perfiles (id) on delete cascade,
  sesion_id       uuid references public.sesiones_medicion (id) on delete set null,
  canal           smallint check (canal between 1 and 5),
  fuente          fuente_senal not null default 'sensor',
  actividad_id    smallint references public.actividades (id),         -- RF14
  declaracion_id  uuid references public.declaraciones_paciente (id) on delete set null,
  consentimiento_version text references public.consentimientos_version (version),
  edad_al_medir   smallint check (edad_al_medir between 5 and 120),
  inicio          timestamptz not null default now(),
  fin             timestamptz,
  duracion_s      integer generated always as (extract(epoch from (fin - inicio))::integer) stored,
  es_reposo_inicial boolean not null default false,                   -- RF13: reposo de 1 minuto
  bpm_promedio    numeric(5,1) check (bpm_promedio between 20 and 250),
  spo2_promedio   numeric(4,1) check (spo2_promedio between 50 and 100),  -- RF114
  hrv_rmssd_ms    numeric(7,2),                                       -- RF17
  regularidad     numeric(4,3) check (regularidad between 0 and 1),   -- RF17
  ritmo           ritmo_cardiaco,                                     -- RF18
  explicacion_ritmo text,
  interpretacion  text,                                               -- RF23: lectura textual y causas de variación
  calidad         calidad_senal,                                      -- RF15
  causa_calidad   text,                                               -- RF16: ruido, movimiento, saturación
  dentro_de_rango boolean,                                            -- RF20
  estado_conexion estado_conexion not null default 'activa',
  nota            text,
  publica         boolean not null default false,                     -- se activa vía publicaciones (RF91)
  creado_en       timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index mediciones_usuario_idx on public.mediciones (usuario_id, inicio desc);
create index mediciones_sesion_idx on public.mediciones (sesion_id);
create index mediciones_publica_idx on public.mediciones (actividad_id, ritmo) where publica;

-- No se mide sin consentimiento vigente (RF04, RF59).
create or replace function public.exigir_consentimiento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fuente = 'sensor' and not exists (
       select 1 from public.consentimientos_aceptados c
       where c.usuario_id = new.usuario_id and c.revocado_en is null) then
    raise exception 'Se requiere consentimiento informado vigente antes de medir' using errcode = 'check_violation';
  end if;
  if new.consentimiento_version is null then
    select c.version into new.consentimiento_version
      from public.consentimientos_aceptados c
     where c.usuario_id = new.usuario_id and c.revocado_en is null
     order by c.aceptado_en desc limit 1;
  end if;
  return new;
end $$;
create trigger mediciones_consentimiento before insert on public.mediciones
  for each row execute function public.exigir_consentimiento();

-- Señal cruda en bloques (RF06, RF65): tamaño acotado por validación.
create table public.bloques_senal (
  id           bigint generated always as identity primary key,
  medicion_id  uuid not null references public.mediciones (id) on delete cascade,
  orden        integer not null check (orden >= 0),
  t_inicio_ms  bigint not null check (t_inicio_ms >= 0),
  frecuencia_hz numeric(6,1) not null check (frecuencia_hz between 10 and 1000),
  ir           real[] not null,                                     -- infrarrojo (BPM)
  rojo         real[],                                              -- luz roja (SpO₂)
  unique (medicion_id, orden),
  check (cardinality(ir) between 1 and 5000),
  check (rojo is null or cardinality(rojo) = cardinality(ir))
);

-- Lecturas por segundo para el tiempo real y las gráficas de 5 canales (RF07, RF08).
create table public.lecturas (
  id          bigint generated always as identity primary key,
  medicion_id uuid not null references public.mediciones (id) on delete cascade,
  t           timestamptz not null default now(),
  bpm         numeric(5,1) check (bpm between 20 and 250),
  spo2        numeric(4,1) check (spo2 between 50 and 100),
  calidad     calidad_senal
);
create index lecturas_medicion_idx on public.lecturas (medicion_id, t);

-- Alertas fuera de rango (RF21).
create table public.alertas (
  id          uuid primary key default gen_random_uuid(),
  medicion_id uuid not null references public.mediciones (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  tipo        text not null check (tipo in ('bpm_alto','bpm_bajo','spo2_bajo','irregular','senal_mala')),
  valor       numeric(5,1),
  limite      numeric(5,1),
  sonora      boolean not null default true,
  creada_en   timestamptz not null default now()
);
create index alertas_usuario_idx on public.alertas (usuario_id, creada_en desc);

-- ---------------------------------------------------------------- RLS
alter table public.dispositivos enable row level security;
alter table public.sesiones_medicion enable row level security;
alter table public.sesion_canales enable row level security;
alter table public.mediciones enable row level security;
alter table public.bloques_senal enable row level security;
alter table public.lecturas enable row level security;
alter table public.alertas enable row level security;

-- Dispositivos: solo admin (el token nunca viaja al cliente). El ESP32 escribe con service role vía API.
create policy dispositivos_admin on public.dispositivos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Funciones security definer para que sesiones y canales no se referencien con RLS (evita recursión).
create or replace function public.tiene_canal_en(p_sesion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sesion_canales c
                 where c.sesion_id = p_sesion and c.usuario_id = auth.uid())
$$;

create or replace function public.puede_ver_sesion(p_sesion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sesiones_medicion s
    where s.id = p_sesion
      and (s.iniciada_por = auth.uid()
           or public.es_admin()
           or (s.aula_id is not null and (public.es_profesor_del_aula(s.aula_id)
                                          or public.es_miembro_activo(s.aula_id)))
           or public.tiene_canal_en(s.id)))
$$;

create policy sesiones_ver on public.sesiones_medicion for select to authenticated
  using ((select public.puede_ver_sesion(id)));
create policy sesiones_crear on public.sesiones_medicion for insert to authenticated
  with check (iniciada_por = (select auth.uid()));
create policy sesiones_editar on public.sesiones_medicion for update to authenticated
  using (iniciada_por = (select auth.uid())
         or (aula_id is not null and (select public.es_profesor_del_aula(aula_id))))
  with check (iniciada_por = (select auth.uid())
         or (aula_id is not null and (select public.es_profesor_del_aula(aula_id))));

create policy canales_ver on public.sesion_canales for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.puede_ver_sesion(sesion_id)));
-- Asignación solo mediante elegir_canal() / asignar_canal().

create policy mediciones_propias on public.mediciones for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
create policy mediciones_admin_ver on public.mediciones for select to authenticated
  using ((select public.es_admin()));

create policy bloques_propios on public.bloques_senal for all to authenticated
  using (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())));
create policy lecturas_propias on public.lecturas for all to authenticated
  using (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())));
create policy alertas_propias on public.alertas for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));


-- ########## 20261027000500_evaluaciones.sql ##########
-- sensor_pulso · Migración 5: preguntas, evaluaciones, intentos y resultados
-- RF104–RF113, RF117, RNF04, RNF09

create type public.nivel_logro as enum ('logrado', 'medianamente_logrado', 'no_logrado');   -- RF112

-- ================================================================ BANCO DE PREGUNTAS
create table public.preguntas (                            -- RF108
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid references public.perfiles (id) on delete set null,
  enunciado     text not null check (length(trim(enunciado)) > 0),
  tipo          text not null check (tipo in ('opcion_multiple','verdadero_falso','numerica','abierta')),
  opciones      jsonb,                                       -- [{"id":"a","texto":"..."}]
  puntaje       numeric(5,2) not null default 1 check (puntaje > 0),
  etiquetas     text[] not null default '{}',
  compartida    boolean not null default false,              -- marcada por el profesor
  revision_global text not null default 'no_solicitada'
                  check (revision_global in ('no_solicitada','pendiente','aprobada','rechazada')),
  revisada_por  uuid references public.perfiles (id),
  leccion_id    uuid,                                        -- reto de una lección (RF42); FK en migración 6
  creado_en     timestamptz not null default now(),
  check ((tipo in ('opcion_multiple') and opciones is not null) or tipo <> 'opcion_multiple')
);
create index preguntas_autor_idx on public.preguntas (autor_id);
create index preguntas_global_idx on public.preguntas (revision_global) where revision_global = 'aprobada';

-- La clave de respuesta vive aparte para que los estudiantes nunca la lean.
create table public.preguntas_claves (
  pregunta_id uuid primary key references public.preguntas (id) on delete cascade,
  correcta    jsonb not null,                                -- "a" | true | {"valor":72,"tolerancia":2}
  explicacion text
);

-- ================================================================ EVALUACIONES
create table public.evaluaciones (
  id             uuid primary key default gen_random_uuid(),
  aula_id        uuid references public.aulas (id) on delete cascade,     -- null = plantilla precargada
  creador_id     uuid references public.perfiles (id) on delete set null,
  titulo         text not null check (length(trim(titulo)) > 0),
  descripcion    text,
  tipo           text not null check (tipo in ('preguntas','ejercicio_aplicado')),     -- RF106
  ejercicio      text check (ejercicio in ('medir_pulso','medir_spo2','comparar_senales')),
  criterio       jsonb,                                       -- RF107, p. ej. {"tipo":"bpm_en_rango","min":60,"max":100}
  precargada     boolean not null default false,              -- RF105
  modo           text not null default 'ventana' check (modo in ('en_vivo','ventana')),   -- RF109
  estado         text not null default 'borrador' check (estado in ('borrador','programada','en_curso','cerrada')),
  tiempo_limite_s integer check (tiempo_limite_s > 0),
  iniciada_en    timestamptz,
  abre_en        timestamptz,
  cierra_en      timestamptz,
  umbral_logrado numeric(5,2) not null default 70 check (umbral_logrado between 1 and 100),    -- RF112
  umbral_medio   numeric(5,2) not null default 40 check (umbral_medio between 0 and 100),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (umbral_medio < umbral_logrado),
  check (cierra_en is null or abre_en is null or cierra_en > abre_en),
  check (tipo <> 'ejercicio_aplicado' or (ejercicio is not null and criterio is not null) or precargada)
);
create index evaluaciones_aula_idx on public.evaluaciones (aula_id);
create trigger evaluaciones_updated before update on public.evaluaciones
  for each row execute function public.set_updated_at();

alter table public.sesiones_medicion
  add constraint sesiones_evaluacion_fk foreign key (evaluacion_id)
  references public.evaluaciones (id) on delete set null;

create table public.evaluacion_preguntas (
  evaluacion_id uuid not null references public.evaluaciones (id) on delete cascade,
  pregunta_id   uuid not null references public.preguntas (id),
  orden         smallint not null default 0,
  puntaje       numeric(5,2),                                -- null = el de la pregunta
  primary key (evaluacion_id, pregunta_id)
);

-- A quién se asigna (RF104): aula completa, un curso o estudiantes concretos.
create table public.evaluacion_asignaciones (
  id            uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.evaluaciones (id) on delete cascade,
  alcance       text not null check (alcance in ('aula','curso','estudiante')),
  curso_id      uuid references public.cursos (id) on delete cascade,
  usuario_id    uuid references public.perfiles (id) on delete cascade,
  check ((alcance = 'aula'       and curso_id is null and usuario_id is null)
      or (alcance = 'curso'      and curso_id is not null and usuario_id is null)
      or (alcance = 'estudiante' and usuario_id is not null and curso_id is null))
);
create index asignaciones_eval_idx on public.evaluacion_asignaciones (evaluacion_id);

-- Un intento por estudiante y evaluación; el resultado se actualiza en tiempo real (RF112–RF113).
create table public.intentos_evaluacion (
  id             uuid primary key default gen_random_uuid(),
  evaluacion_id  uuid not null references public.evaluaciones (id) on delete cascade,
  usuario_id     uuid not null references public.perfiles (id) on delete cascade,
  inicio         timestamptz not null default now(),
  fin            timestamptz,
  medicion_id    uuid references public.mediciones (id) on delete set null,   -- ejercicio aplicado
  puntaje        numeric(7,2) not null default 0,
  puntaje_maximo numeric(7,2) not null default 0,
  porcentaje     numeric(5,2) generated always as
                   (case when puntaje_maximo > 0 then round(100 * puntaje / puntaje_maximo, 2) else 0 end) stored,
  nivel          nivel_logro,
  unique (evaluacion_id, usuario_id)
);
create index intentos_usuario_idx on public.intentos_evaluacion (usuario_id);

create table public.respuestas (
  id          uuid primary key default gen_random_uuid(),
  intento_id  uuid not null references public.intentos_evaluacion (id) on delete cascade,
  pregunta_id uuid not null references public.preguntas (id),
  respuesta   jsonb not null,
  es_correcta boolean,
  puntaje     numeric(5,2) not null default 0,
  respondida_en timestamptz not null default now(),
  unique (intento_id, pregunta_id)
);

-- ---------------------------------------------------------------- nivel de logro (RF112)
create or replace function public.calcular_nivel(p_pct numeric, p_logrado numeric, p_medio numeric)
returns public.nivel_logro language sql immutable set search_path = '' as $$
  select case when p_pct >= p_logrado then 'logrado'::public.nivel_logro
              when p_pct >= p_medio   then 'medianamente_logrado'::public.nivel_logro
              else 'no_logrado'::public.nivel_logro end
$$;

create or replace function public.actualizar_nivel_intento()
returns trigger language plpgsql set search_path = '' as $$
declare v_log numeric; v_med numeric; v_pct numeric;
begin
  select umbral_logrado, umbral_medio into v_log, v_med
    from public.evaluaciones where id = new.evaluacion_id;
  v_pct := case when new.puntaje_maximo > 0 then 100 * new.puntaje / new.puntaje_maximo else 0 end;
  new.nivel := public.calcular_nivel(v_pct, v_log, v_med);
  return new;
end $$;
create trigger intento_nivel before insert or update of puntaje, puntaje_maximo on public.intentos_evaluacion
  for each row execute function public.actualizar_nivel_intento();

-- ---------------------------------------------------------------- visibilidad
create or replace function public.evaluacion_abierta(p_eval uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.evaluaciones e
    where e.id = p_eval
      and ((e.modo = 'en_vivo' and e.estado = 'en_curso'
            and (e.tiempo_limite_s is null or now() < e.iniciada_en + make_interval(secs => e.tiempo_limite_s)))
        or (e.modo = 'ventana' and e.estado in ('programada','en_curso')
            and now() >= coalesce(e.abre_en, '-infinity') and now() <= coalesce(e.cierra_en, 'infinity'))))
$$;

create or replace function public.evaluacion_asignada_a_mi(p_eval uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.evaluaciones e
    join public.aula_estudiantes m on m.aula_id = e.aula_id and m.usuario_id = auth.uid() and m.estado = 'activo'
    join public.evaluacion_asignaciones a on a.evaluacion_id = e.id
    where e.id = p_eval
      and (a.alcance = 'aula'
        or (a.alcance = 'estudiante' and a.usuario_id = auth.uid())
        or (a.alcance = 'curso' and exists (select 1 from public.curso_estudiantes c
                                            where c.curso_id = a.curso_id and c.usuario_id = auth.uid()))))
$$;

create or replace function public.profesor_de_evaluacion(p_eval uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evaluaciones e join public.aulas a on a.id = e.aula_id
                 where e.id = p_eval and a.profesor_id = auth.uid())
$$;

-- RF117: el profesor ve intentos/mediciones solo de estudiantes activos en su aula.
create or replace function public.profesor_ve_intento(p_intento uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.intentos_evaluacion i
    join public.evaluaciones e on e.id = i.evaluacion_id
    join public.aulas a on a.id = e.aula_id
    join public.aula_estudiantes m on m.aula_id = a.id and m.usuario_id = i.usuario_id and m.estado = 'activo'
    where i.id = p_intento and a.profesor_id = auth.uid())
$$;

create or replace function public.profesor_ve_medicion(p_medicion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.intentos_evaluacion i
    where i.medicion_id = p_medicion and public.profesor_ve_intento(i.id))
$$;

create or replace function public.puede_ver_pregunta(p_pregunta uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.preguntas q
    where q.id = p_pregunta
      and (q.autor_id = auth.uid()
        or public.es_admin()
        or (q.compartida and q.revision_global = 'aprobada' and public.es_profesor())
        or exists (select 1 from public.evaluacion_preguntas ep
                   where ep.pregunta_id = q.id
                     and (public.profesor_de_evaluacion(ep.evaluacion_id)
                          or (public.evaluacion_asignada_a_mi(ep.evaluacion_id)
                              and public.evaluacion_abierta(ep.evaluacion_id))))))
$$;

-- ---------------------------------------------------------------- funciones de uso
-- Armar preguntas al azar del banco propio y del global aprobado (RF108).
create or replace function public.armar_preguntas_aleatorias(p_eval uuid, p_cantidad int, p_etiquetas text[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.profesor_de_evaluacion(p_eval) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  with elegidas as (
    select q.id from public.preguntas q
    where (q.autor_id = auth.uid() or (q.compartida and q.revision_global = 'aprobada'))
      and q.leccion_id is null
      and (p_etiquetas is null or q.etiquetas && p_etiquetas)
      and not exists (select 1 from public.evaluacion_preguntas ep
                      where ep.evaluacion_id = p_eval and ep.pregunta_id = q.id)
    order by random() limit p_cantidad)
  insert into public.evaluacion_preguntas (evaluacion_id, pregunta_id, orden)
  select p_eval, id, row_number() over ()::smallint from elegidas;
  get diagnostics n = row_count;
  return n;
end $$;

-- Iniciar el intento propio (valida asignación y ventana/estado).
create or replace function public.iniciar_intento(p_eval uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_max numeric;
begin
  if not public.evaluacion_asignada_a_mi(p_eval) then
    raise exception 'Evaluación no asignada' using errcode = '42501';
  end if;
  if not public.evaluacion_abierta(p_eval) then
    raise exception 'La evaluación no está abierta';
  end if;
  select coalesce(sum(coalesce(ep.puntaje, q.puntaje)), 0) into v_max
    from public.evaluacion_preguntas ep join public.preguntas q on q.id = ep.pregunta_id
   where ep.evaluacion_id = p_eval;
  insert into public.intentos_evaluacion (evaluacion_id, usuario_id, puntaje_maximo)
  values (p_eval, auth.uid(), case when v_max = 0 then 100 else v_max end)
  on conflict (evaluacion_id, usuario_id) do update set evaluacion_id = excluded.evaluacion_id
  returning id into v_id;
  return v_id;
end $$;

-- Responder y calificar en el servidor, sin exponer la clave (RF107).
create or replace function public.responder_pregunta(p_intento uuid, p_pregunta uuid, p_respuesta jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_clave jsonb; v_pts numeric; v_ok boolean;
  v_valor numeric; v_tol numeric;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento and usuario_id = auth.uid();
  if not found or v_int.fin is not null then raise exception 'Intento no disponible'; end if;
  if not public.evaluacion_abierta(v_int.evaluacion_id) then raise exception 'La evaluación está cerrada'; end if;

  select coalesce(ep.puntaje, q.puntaje) into v_pts
    from public.evaluacion_preguntas ep join public.preguntas q on q.id = ep.pregunta_id
   where ep.evaluacion_id = v_int.evaluacion_id and ep.pregunta_id = p_pregunta;
  if not found then raise exception 'La pregunta no pertenece a la evaluación'; end if;

  select correcta into v_clave from public.preguntas_claves where pregunta_id = p_pregunta;
  if v_clave is null then
    v_ok := null;                                               -- abierta: revisión manual
  elsif jsonb_typeof(v_clave) = 'object' then                   -- numérica con tolerancia
    v_valor := (v_clave ->> 'valor')::numeric; v_tol := coalesce((v_clave ->> 'tolerancia')::numeric, 0);
    v_ok := abs((p_respuesta #>> '{}')::numeric - v_valor) <= v_tol;
  else
    v_ok := (p_respuesta = v_clave);
  end if;

  insert into public.respuestas (intento_id, pregunta_id, respuesta, es_correcta, puntaje)
  values (p_intento, p_pregunta, p_respuesta, v_ok, case when v_ok then v_pts else 0 end)
  on conflict (intento_id, pregunta_id) do update
    set respuesta = excluded.respuesta, es_correcta = excluded.es_correcta,
        puntaje = excluded.puntaje, respondida_en = now();

  update public.intentos_evaluacion i
     set puntaje = (select coalesce(sum(r.puntaje), 0) from public.respuestas r where r.intento_id = i.id)
   where i.id = p_intento;
  return v_ok;
end $$;

-- Calificación automática del ejercicio aplicado (RF107). La similitud la calcula el servidor.
create or replace function public.calificar_ejercicio(p_intento uuid, p_medicion uuid, p_similitud numeric default null)
returns public.nivel_logro language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_ev public.evaluaciones; v_m public.mediciones;
  v_ok boolean := false; v_nivel public.nivel_logro;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento and usuario_id = auth.uid();
  if not found then raise exception 'Intento no disponible'; end if;
  select * into v_ev from public.evaluaciones where id = v_int.evaluacion_id;
  select * into v_m from public.mediciones where id = p_medicion and usuario_id = auth.uid();
  if not found then raise exception 'Medición no válida'; end if;
  if not public.evaluacion_abierta(v_ev.id) then raise exception 'La evaluación está cerrada'; end if;

  v_ok := case v_ev.criterio ->> 'tipo'
    when 'bpm_en_rango'  then v_m.bpm_promedio  between (v_ev.criterio ->> 'min')::numeric and (v_ev.criterio ->> 'max')::numeric
    when 'spo2_en_rango' then v_m.spo2_promedio between (v_ev.criterio ->> 'min')::numeric and (v_ev.criterio ->> 'max')::numeric
    when 'similitud_minima' then coalesce(p_similitud, 0) >= (v_ev.criterio ->> 'valor')::numeric
    else false end;

  update public.intentos_evaluacion
     set medicion_id = p_medicion, puntaje = case when v_ok then 100 else 0 end,
         puntaje_maximo = 100, fin = now()
   where id = p_intento
  returning nivel into v_nivel;
  return v_nivel;
end $$;

create or replace function public.finalizar_intento(p_intento uuid)
returns public.nivel_logro language plpgsql security definer set search_path = '' as $$
declare v_nivel public.nivel_logro;
begin
  update public.intentos_evaluacion set fin = now()
   where id = p_intento and usuario_id = auth.uid() and fin is null
  returning nivel into v_nivel;
  return v_nivel;
end $$;

revoke all on function public.armar_preguntas_aleatorias(uuid,int,text[]), public.iniciar_intento(uuid),
  public.responder_pregunta(uuid,uuid,jsonb), public.calificar_ejercicio(uuid,uuid,numeric),
  public.finalizar_intento(uuid) from public, anon;
grant execute on function public.armar_preguntas_aleatorias(uuid,int,text[]), public.iniciar_intento(uuid),
  public.responder_pregunta(uuid,uuid,jsonb), public.calificar_ejercicio(uuid,uuid,numeric),
  public.finalizar_intento(uuid) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.preguntas enable row level security;
alter table public.preguntas_claves enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.evaluacion_preguntas enable row level security;
alter table public.evaluacion_asignaciones enable row level security;
alter table public.intentos_evaluacion enable row level security;
alter table public.respuestas enable row level security;

create policy preguntas_ver on public.preguntas for select to authenticated
  using ((select public.puede_ver_pregunta(id)));
create policy preguntas_crear on public.preguntas for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select public.es_profesor())
              and (not compartida or (select public.tiene_permiso('compartir_banco'))));
create policy preguntas_editar on public.preguntas for update to authenticated
  using (autor_id = (select auth.uid()) or (select public.es_admin()))
  with check (autor_id = (select auth.uid()) or (select public.es_admin()));
create policy preguntas_borrar on public.preguntas for delete to authenticated
  using (autor_id = (select auth.uid()) or (select public.es_admin()));

create policy claves_autor on public.preguntas_claves for all to authenticated
  using (exists (select 1 from public.preguntas q where q.id = pregunta_id
                 and (q.autor_id = (select auth.uid()) or (select public.es_admin()))))
  with check (exists (select 1 from public.preguntas q where q.id = pregunta_id
                 and (q.autor_id = (select auth.uid()) or (select public.es_admin()))));

create policy evaluaciones_ver on public.evaluaciones for select to authenticated
  using ((select public.profesor_de_evaluacion(id)) or (select public.es_admin())
         or (select public.evaluacion_asignada_a_mi(id))
         or (precargada and (select public.es_profesor())));
create policy evaluaciones_crear on public.evaluaciones for insert to authenticated
  with check (creador_id = (select auth.uid()) and aula_id is not null
              and (select public.es_profesor_del_aula(aula_id)));
create policy evaluaciones_editar on public.evaluaciones for update to authenticated
  using ((select public.profesor_de_evaluacion(id))) with check ((select public.es_profesor_del_aula(aula_id)));
create policy evaluaciones_borrar on public.evaluaciones for delete to authenticated
  using ((select public.profesor_de_evaluacion(id)));
create policy evaluaciones_admin on public.evaluaciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy eval_preg_ver on public.evaluacion_preguntas for select to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id)) or (select public.es_admin())
         or ((select public.evaluacion_asignada_a_mi(evaluacion_id)) and (select public.evaluacion_abierta(evaluacion_id))));
create policy eval_preg_gestion on public.evaluacion_preguntas for all to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id)))
  with check ((select public.profesor_de_evaluacion(evaluacion_id)));

create policy asignaciones_ver on public.evaluacion_asignaciones for select to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id))
         or (usuario_id = (select auth.uid())));
create policy asignaciones_gestion on public.evaluacion_asignaciones for all to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id)))
  with check ((select public.profesor_de_evaluacion(evaluacion_id)));

-- Intentos: el estudiante ve el suyo; el profesor, los de estudiantes activos (RF113, RF117).
-- Tras un retiro (RF102) el profesor conserva calificación y nivel como registro académico,
-- pero pierde respuestas y mediciones (esas políticas siguen exigiendo al estudiante activo).
create policy intentos_ver on public.intentos_evaluacion for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.profesor_de_evaluacion(evaluacion_id)));
-- Los cambios se hacen solo mediante las funciones de arriba.

create policy respuestas_ver on public.respuestas for select to authenticated
  using (exists (select 1 from public.intentos_evaluacion i
                 where i.id = intento_id and i.usuario_id = (select auth.uid()))
         or (select public.profesor_ve_intento(intento_id)));

-- Mediciones de ejercicios aplicados visibles al profesor mientras el estudiante siga activo (RF117).
create policy mediciones_profesor_ver on public.mediciones for select to authenticated
  using ((select public.profesor_ve_medicion(id)));
create policy bloques_profesor_ver on public.bloques_senal for select to authenticated
  using ((select public.profesor_ve_medicion(medicion_id)));
create policy lecturas_profesor_ver on public.lecturas for select to authenticated
  using ((select public.profesor_ve_medicion(medicion_id)));

-- Tiempo real para el panel en vivo (RF113).
alter publication supabase_realtime add table public.intentos_evaluacion;


-- ########## 20261027000600_comparacion_galeria_aprendizaje.sql ##########
-- sensor_pulso · Migración 6: comparación, casos, galería pública y aprendizaje
-- RF24–RF29, RF31, RF33–RF35, RF38–RF42, RF47, RF57, RF91

-- ================================================================ DATASETS Y SEÑALES DE REFERENCIA
create table public.datasets_publicos (                    -- RF47
  id       uuid primary key default gen_random_uuid(),
  nombre   text not null,
  fuente   text not null,                                   -- 'PhysioNet', 'GitHub', ...
  url      text,
  licencia text,
  descripcion text,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now()
);

create table public.senales_referencia (                   -- RF24, RF25, RF27, RF33
  id            uuid primary key default gen_random_uuid(),
  propietario_id uuid references public.perfiles (id) on delete cascade,   -- null = precargada de la plataforma
  dataset_id    uuid references public.datasets_publicos (id) on delete set null,
  tipo          text not null check (tipo in ('ppg_normal','patologia','arritmia','csv','simulada','dataset','validada')),
  nombre        text not null,
  descripcion   text,
  explicacion   text,                                       -- por qué se ve así (educativo)
  frecuencia_hz numeric(6,1) not null check (frecuencia_hz between 10 and 1000),
  ppg           real[] not null check (cardinality(ppg) between 10 and 100000),
  ecg_ref       real[] check (ecg_ref is null or cardinality(ecg_ref) <= 100000),   -- solo referencia educativa
  bpm_referencia numeric(5,1),
  ritmo         ritmo_cardiaco,
  edad_min      smallint, edad_max smallint,
  aprobada      boolean not null default false,             -- visible para todos tras revisión
  creado_en     timestamptz not null default now()
);
create index senales_tipo_idx on public.senales_referencia (tipo) where aprobada;

create table public.comparaciones (                        -- RF26–RF29
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.perfiles (id) on delete cascade,
  medicion_id   uuid not null references public.mediciones (id) on delete cascade,
  contra_medicion_id uuid references public.mediciones (id) on delete set null,
  contra_senal_id    uuid references public.senales_referencia (id) on delete set null,
  metodo_sync   text not null default 'correlacion_cruzada',   -- elegido por el admin (RF28)
  desfase_ms    integer,
  similitud     numeric(4,3) check (similitud between -1 and 1),
  diferencia_bpm numeric(5,1),
  analisis      text,                                        -- RF29
  creada_en     timestamptz not null default now(),
  check ((contra_medicion_id is not null)::int + (contra_senal_id is not null)::int = 1)
);
create index comparaciones_usuario_idx on public.comparaciones (usuario_id, creada_en desc);

alter table public.datasets_publicos enable row level security;
alter table public.senales_referencia enable row level security;
alter table public.comparaciones enable row level security;

create policy datasets_leer on public.datasets_publicos for select to authenticated using (true);
create policy datasets_admin on public.datasets_publicos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy senales_leer on public.senales_referencia for select to authenticated
  using (aprobada or propietario_id = (select auth.uid()) or (select public.es_admin()));
create policy senales_cargar_propia on public.senales_referencia for insert to authenticated
  with check (propietario_id = (select auth.uid()) and tipo in ('csv','simulada') and not aprobada);
create policy senales_editar_propia on public.senales_referencia for update to authenticated
  using (propietario_id = (select auth.uid())) with check (propietario_id = (select auth.uid()) and not aprobada);
create policy senales_borrar_propia on public.senales_referencia for delete to authenticated
  using (propietario_id = (select auth.uid()));
create policy senales_admin on public.senales_referencia for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy comparaciones_propias on public.comparaciones for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- ================================================================ PUBLICACIÓN Y GALERÍA
-- Publicar exige confirmación explícita y guarda una vista anonimizada (RF31, RF57, RF91).
create table public.publicaciones (
  id             uuid primary key default gen_random_uuid(),
  medicion_id    uuid not null unique references public.mediciones (id) on delete cascade,
  autor_id       uuid not null references public.perfiles (id) on delete cascade,
  token_enlace   text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),   -- RF35
  titulo         text,
  -- Datos visibles públicamente: solo rangos y valores no identificativos.
  actividad_id   smallint references public.actividades (id),
  rango_edad     text not null check (rango_edad in ('<18','18-24','25-34','35-49','50+')),
  ritmo          ritmo_cardiaco,
  calidad        calidad_senal,
  bpm_promedio   numeric(5,1),
  spo2_promedio  numeric(4,1),
  dentro_de_rango boolean,
  confirmada_en  timestamptz not null,                      -- confirmación adicional explícita (RF91)
  retirada_en    timestamptz,                               -- revocación (RF90)
  creada_en      timestamptz not null default now()
);
create index publicaciones_galeria_idx on public.publicaciones (actividad_id, rango_edad, ritmo)
  where retirada_en is null;

alter table public.publicaciones enable row level security;

-- Cualquiera, con o sin sesión, ve las publicaciones vigentes (RF31, RF34, RF35).
create policy publicaciones_publicas on public.publicaciones for select to anon, authenticated
  using (retirada_en is null);
create policy publicaciones_autor_ve on public.publicaciones for select to authenticated
  using (autor_id = (select auth.uid()));
create policy publicaciones_admin on public.publicaciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
-- Altas y retiros solo mediante publicar_medicion() / retirar_publicacion().

-- La señal de una medición publicada es legible por todos, sin metadatos personales.
create policy bloques_publicos on public.bloques_senal for select to anon, authenticated
  using (exists (select 1 from public.publicaciones p
                 where p.medicion_id = bloques_senal.medicion_id and p.retirada_en is null));

create or replace function public.rango_de_edad(p_edad int)
returns text language sql immutable set search_path = '' as $$
  select case when p_edad < 18 then '<18' when p_edad < 25 then '18-24'
              when p_edad < 35 then '25-34' when p_edad < 50 then '35-49' else '50+' end
$$;

-- Publicar: usuarios y profesores con permiso, solo con sesión y con confirmación (RF31, RF91).
create or replace function public.publicar_medicion(p_medicion uuid, p_confirmar boolean, p_titulo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.mediciones; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  if not coalesce(p_confirmar, false) then
    raise exception 'Falta la confirmación explícita del titular';
  end if;
  if public.es_profesor() and not public.tiene_permiso('publicar_galeria') then
    raise exception 'El profesor no tiene permiso para publicar' using errcode = '42501';
  end if;
  select * into m from public.mediciones where id = p_medicion and usuario_id = auth.uid();
  if not found then raise exception 'Medición no encontrada'; end if;
  if m.fuente <> 'sensor' or m.fin is null then
    raise exception 'Solo se publican mediciones de sensor finalizadas';
  end if;
  if not exists (select 1 from public.consentimientos_aceptados c
                 where c.usuario_id = auth.uid() and c.revocado_en is null) then
    raise exception 'Se requiere consentimiento vigente';
  end if;

  insert into public.publicaciones (medicion_id, autor_id, titulo, actividad_id, rango_edad, ritmo, calidad,
                                    bpm_promedio, spo2_promedio, dentro_de_rango, confirmada_en)
  values (m.id, auth.uid(), p_titulo, m.actividad_id, public.rango_de_edad(coalesce(m.edad_al_medir, 30)),
          m.ritmo, m.calidad, m.bpm_promedio, m.spo2_promedio, m.dentro_de_rango, now())
  on conflict (medicion_id) do update set retirada_en = null, confirmada_en = now(), titulo = excluded.titulo
  returning id into v_id;

  update public.mediciones set publica = true where id = m.id;
  perform public.registrar_auditoria('publicacion', 'mediciones', m.id::text);
  return v_id;
end $$;

create or replace function public.retirar_publicacion(p_medicion uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.publicaciones set retirada_en = now()
   where medicion_id = p_medicion and (autor_id = auth.uid() or public.es_admin());
  update public.mediciones set publica = false
   where id = p_medicion and (usuario_id = auth.uid() or public.es_admin());
  perform public.registrar_auditoria('retiro_publicacion', 'mediciones', p_medicion::text);
end $$;

-- Impide marcar `publica` a mano; solo las funciones anteriores lo cambian (RF91).
create or replace function public.proteger_publica()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.publica is distinct from old.publica
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Use publicar_medicion() con confirmación' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger mediciones_proteger_publica before update of publica on public.mediciones
  for each row execute function public.proteger_publica();

revoke all on function public.publicar_medicion(uuid, boolean, text), public.retirar_publicacion(uuid)
  from public, anon;
grant execute on function public.publicar_medicion(uuid, boolean, text), public.retirar_publicacion(uuid)
  to authenticated;

-- Vista de galería con filtros por actividad, edad y estado (RF34); respeta RLS de publicaciones.
create view public.galeria with (security_invoker = true) as
  select p.id, p.token_enlace, p.titulo, a.codigo as actividad, p.rango_edad, p.ritmo, p.calidad,
         p.bpm_promedio, p.spo2_promedio, p.dentro_de_rango, p.creada_en
  from public.publicaciones p
  left join public.actividades a on a.id = p.actividad_id
  where p.retirada_en is null;
grant select on public.galeria to anon, authenticated;

-- ================================================================ APRENDIZAJE
create table public.lecciones (                            -- RF38, RF39, RF40, RF115
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  titulo     text not null,
  categoria  text not null check (categoria in ('fisiologia','sensor','esp32','bpm','spo2','ingenieria','salud')),
  contenido  jsonb not null default '[]'::jsonb,            -- bloques de texto/gráficos manipulables
  orden      smallint not null default 0,
  publicada  boolean not null default false,
  actualizado_por uuid references public.perfiles (id),
  actualizado_en timestamptz not null default now()
);
create trigger lecciones_updated before update on public.lecciones
  for each row execute function public.set_updated_at();

alter table public.preguntas
  add constraint preguntas_leccion_fk foreign key (leccion_id) references public.lecciones (id) on delete cascade;

create table public.insignias (                            -- RF42
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  criterio    jsonb not null default '{}'::jsonb
);

create table public.progreso_lecciones (
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  leccion_id  uuid not null references public.lecciones (id) on delete cascade,
  completada  boolean not null default false,
  mejor_puntaje numeric(5,2),
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, leccion_id)
);

create table public.insignias_usuario (
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  insignia_id smallint not null references public.insignias (id),
  obtenida_en timestamptz not null default now(),
  primary key (usuario_id, insignia_id)
);

alter table public.lecciones enable row level security;
alter table public.insignias enable row level security;
alter table public.progreso_lecciones enable row level security;
alter table public.insignias_usuario enable row level security;

create policy lecciones_leer on public.lecciones for select to anon, authenticated
  using (publicada or (select public.es_admin()));
create policy lecciones_admin on public.lecciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));   -- profesores proponen vía propuestas_cambio (RF46)
create policy insignias_leer on public.insignias for select to anon, authenticated using (true);
create policy insignias_admin on public.insignias for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy progreso_propio on public.progreso_lecciones for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy insignias_usuario_ver on public.insignias_usuario for select to authenticated
  using (usuario_id = (select auth.uid()));
-- Las insignias se otorgan desde el servidor (service role).

-- Retos de lección visibles para cualquier usuario (la clave sigue oculta).
create policy preguntas_retos_ver on public.preguntas for select to authenticated
  using (leccion_id is not null and exists (select 1 from public.lecciones l where l.id = leccion_id and l.publicada));


-- ########## 20261027000700_seguridad_cumplimiento.sql ##########
-- sensor_pulso · Migración 7: seguridad operativa y cumplimiento
-- RF50, RF56, RF58, RF60, RF67, RF72, RF73, RF88, RF89, RF90, RF92, RF95, RNF14

-- ================================================================ BLOQUEO DE CUENTA Y LÍMITE DE PETICIONES
create table public.intentos_login (                       -- RF50
  id         bigint generated always as identity primary key,
  correo     text not null,
  ip         inet,
  exitoso    boolean not null,
  ocurrio_en timestamptz not null default now()
);
create index intentos_login_correo_idx on public.intentos_login (lower(correo), ocurrio_en desc);

create table public.bloqueos_cuenta (
  correo        text primary key,
  bloqueado_hasta timestamptz not null,
  motivo        text not null default 'intentos_fallidos',
  creado_en     timestamptz not null default now()
);

-- Registra un intento y bloquea 15 min tras 5 fallos en 15 min. Lo llama el servidor.
create or replace function public.registrar_intento_login(p_correo text, p_exitoso boolean, p_ip inet default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_fallos int; v_hasta timestamptz;
begin
  insert into public.intentos_login (correo, ip, exitoso) values (lower(p_correo), p_ip, p_exitoso);
  if p_exitoso then
    delete from public.bloqueos_cuenta where correo = lower(p_correo);
    insert into public.auditoria (accion, entidad, entidad_id, ip)       -- RF62: inicios de sesión
    values ('login', 'perfiles', lower(p_correo), p_ip);
    return null;
  end if;
  select count(*) into v_fallos from public.intentos_login
   where lower(correo) = lower(p_correo) and not exitoso and ocurrio_en > now() - interval '15 minutes';
  if v_fallos >= 5 then
    v_hasta := now() + interval '15 minutes';
    insert into public.bloqueos_cuenta (correo, bloqueado_hasta) values (lower(p_correo), v_hasta)
    on conflict (correo) do update set bloqueado_hasta = excluded.bloqueado_hasta;
    insert into public.auditoria (accion, entidad, entidad_id, detalle, ip, sospechoso)
    values ('bloqueo_cuenta', 'perfiles', lower(p_correo), jsonb_build_object('fallos', v_fallos), p_ip, true);
  end if;
  return v_hasta;
end $$;
revoke all on function public.registrar_intento_login(text, boolean, inet) from public, anon, authenticated;

create table public.limites_peticiones (                   -- RF67
  clave       text not null,                                 -- 'login:ip', 'esp32:dispositivo', 'api:usuario'
  ventana     timestamptz not null,
  contador    integer not null default 1,
  primary key (clave, ventana)
);

create or replace function public.consumir_limite(p_clave text, p_maximo int, p_segundos int default 60)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ventana timestamptz; v_n int;
begin
  v_ventana := to_timestamp(floor(extract(epoch from now()) / p_segundos) * p_segundos);
  insert into public.limites_peticiones (clave, ventana) values (p_clave, v_ventana)
  on conflict (clave, ventana) do update set contador = public.limites_peticiones.contador + 1
  returning contador into v_n;
  return v_n <= p_maximo;
end $$;
revoke all on function public.consumir_limite(text, int, int) from public, anon, authenticated;

-- ================================================================ NOTIFICACIONES, INCIDENTES Y BRECHAS
create table public.notificaciones_seguridad (             -- RF72
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('intentos_masivos','token_esp32_comprometido','bloqueo_cuenta','otro')),
  severidad  text not null default 'media' check (severidad in ('baja','media','alta','critica')),
  mensaje    text not null,
  detalle    jsonb not null default '{}'::jsonb,
  leida      boolean not null default false,
  creada_en  timestamptz not null default now()
);

create table public.incidentes (                           -- RF73
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  severidad     text not null default 'media' check (severidad in ('baja','media','alta','critica')),
  estado        text not null default 'abierto' check (estado in ('abierto','en_analisis','contenido','resuelto','cerrado')),
  reportado_por uuid references public.perfiles (id),
  asignado_a    uuid references public.perfiles (id),
  afecta_datos_personales boolean not null default false,
  abierto_en    timestamptz not null default now(),
  cerrado_en    timestamptz,
  lecciones     text
);

create table public.brechas (                              -- RF92
  id            uuid primary key default gen_random_uuid(),
  incidente_id  uuid not null references public.incidentes (id) on delete cascade,
  afectados_estimados integer,
  datos_comprometidos text,
  afectados_notificados_en timestamptz,
  autoridad_notificada_en  timestamptz,
  medidas       text,
  creada_en     timestamptz not null default now()
);

-- ================================================================ DERECHOS DEL TITULAR
create table public.solicitudes_derechos (                 -- RF58, RF89, RF90
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles (id) on delete cascade,
  tipo         text not null check (tipo in ('acceso','rectificacion','supresion','oposicion','portabilidad','revocar_consentimiento')),
  detalle      text,
  estado       text not null default 'recibida' check (estado in ('recibida','en_proceso','resuelta','rechazada')),
  recibida_en  timestamptz not null default now(),
  vence_en     timestamptz not null default (now() + interval '30 days'),
  resuelta_en  timestamptz,
  atendida_por uuid references public.perfiles (id),
  respuesta    text
);
create index derechos_usuario_idx on public.solicitudes_derechos (usuario_id, recibida_en desc);

-- Revocar el consentimiento retira las publicaciones del titular (RF90).
create or replace function public.revocar_consentimiento()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.consentimientos_aceptados set revocado_en = now()
   where usuario_id = auth.uid() and revocado_en is null;
  update public.publicaciones set retirada_en = now() where autor_id = auth.uid() and retirada_en is null;
  update public.mediciones set publica = false where usuario_id = auth.uid() and publica;
  insert into public.solicitudes_derechos (usuario_id, tipo, estado, resuelta_en)
  values (auth.uid(), 'revocar_consentimiento', 'resuelta', now());
  perform public.registrar_auditoria('revocacion_consentimiento', 'perfiles', auth.uid()::text);
end $$;
revoke all on function public.revocar_consentimiento() from public, anon;
grant execute on function public.revocar_consentimiento() to authenticated;

-- ================================================================ CLASIFICACIÓN, RETENCIÓN Y POLÍTICA
create table public.clasificacion_datos (                  -- RF56, RF61
  tabla        text not null,
  columna      text not null,
  clase        text not null check (clase in ('publico','privado','sensible_salud')),
  cifrado_campo boolean not null default false,
  enmascarar   boolean not null default false,
  primary key (tabla, columna)
);

create table public.politicas_retencion (                  -- RF60
  tabla       text primary key,
  dias        integer not null check (dias > 0),
  accion      text not null check (accion in ('borrar','anonimizar')),
  activa      boolean not null default true
);

create table public.documentos_legales (                   -- RF75, RF88, RF94, RF95
  clave       text primary key,                              -- 'politica_privacidad','aviso_educativo','aviso_no_medico','alojamiento'
  titulo      text not null,
  contenido   text not null,
  version     text not null,
  vigente_desde timestamptz not null default now()
);

-- Aplica la retención. Se agenda con pg_cron (ver migración de datos iniciales). Nunca toca la auditoría.
create or replace function public.aplicar_retencion()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer; total integer := 0;
begin
  for r in select * from public.politicas_retencion where activa loop
    if r.tabla = 'lecturas' and r.accion = 'borrar' then
      delete from public.lecturas where t < now() - make_interval(days => r.dias);
    elsif r.tabla = 'intentos_login' and r.accion = 'borrar' then
      delete from public.intentos_login where ocurrio_en < now() - make_interval(days => r.dias);
    elsif r.tabla = 'limites_peticiones' and r.accion = 'borrar' then
      delete from public.limites_peticiones where ventana < now() - make_interval(days => r.dias);
    elsif r.tabla = 'declaraciones_paciente' and r.accion = 'borrar' then
      delete from public.declaraciones_paciente where creado_en < now() - make_interval(days => r.dias);
    else
      continue;
    end if;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  insert into public.auditoria (accion, entidad, detalle) values ('retencion', 'sistema', jsonb_build_object('filas', total));
  return total;
end $$;
revoke all on function public.aplicar_retencion() from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.intentos_login enable row level security;
alter table public.bloqueos_cuenta enable row level security;
alter table public.limites_peticiones enable row level security;
alter table public.notificaciones_seguridad enable row level security;
alter table public.incidentes enable row level security;
alter table public.brechas enable row level security;
alter table public.solicitudes_derechos enable row level security;
alter table public.clasificacion_datos enable row level security;
alter table public.politicas_retencion enable row level security;
alter table public.documentos_legales enable row level security;

-- intentos_login, bloqueos_cuenta y limites_peticiones: sin políticas (solo service role / funciones).
create policy notif_admin on public.notificaciones_seguridad for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy incidentes_admin on public.incidentes for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy brechas_admin on public.brechas for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy derechos_propios_ver on public.solicitudes_derechos for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_admin()));
create policy derechos_propios_crear on public.solicitudes_derechos for insert to authenticated
  with check (usuario_id = (select auth.uid()) and estado = 'recibida');
create policy derechos_admin_resuelve on public.solicitudes_derechos for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy clasificacion_leer on public.clasificacion_datos for select to authenticated using (true);
create policy clasificacion_admin on public.clasificacion_datos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy retencion_admin on public.politicas_retencion for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy legales_leer on public.documentos_legales for select to anon, authenticated using (true);
create policy legales_admin on public.documentos_legales for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));


-- ########## 20261027000800_datos_iniciales.sql ##########
-- sensor_pulso · Migración 8: datos iniciales
-- Los valores de referencia son educativos y deben validarse (requerimientos 3.1).
-- El primer administrador NO se crea aquí: se inserta su correo en public.admins_iniciales
-- (ver supabase/seed.example.sql) antes de que esa persona se registre (RF44).

insert into public.actividades (codigo, nombre, descripcion) values
  ('reposo',             'Reposo',              'Sentado y tranquilo, al menos 1 minuto'),
  ('sentado',            'Sentado activo',      'Sentado, estudiando o conversando'),
  ('caminata',           'Caminata',            'Caminata a ritmo normal'),
  ('ejercicio_moderado', 'Ejercicio moderado',  'Trote suave o bicicleta'),
  ('ejercicio_intenso',  'Ejercicio intenso',   'Carrera o esfuerzo alto'),
  ('post_ejercicio',     'Recuperación',        'Primeros minutos tras ejercitarse');

insert into public.rangos (actividad_id, edad_min, edad_max, bpm_min, bpm_max, spo2_min, spo2_max)
select a.id, v.emin, v.emax, v.bmin, v.bmax, 95, 100
from public.actividades a
join (values
  ('reposo',             5, 12,  70, 120),
  ('reposo',            13, 17,  60, 100),
  ('reposo',            18, 64,  60, 100),
  ('reposo',            65,120,  60, 100),
  ('sentado',            5, 17,  70, 120),
  ('sentado',           18,120,  60, 110),
  ('caminata',           5, 17,  80, 130),
  ('caminata',          18,120,  75, 120),
  ('ejercicio_moderado', 5, 17, 100, 160),
  ('ejercicio_moderado',18,120, 100, 150),
  ('ejercicio_intenso',  5, 17, 140, 200),
  ('ejercicio_intenso', 18,120, 140, 190),
  ('post_ejercicio',     5,120,  80, 160)
) as v(codigo, emin, emax, bmin, bmax) on v.codigo = a.codigo;

insert into public.consentimientos_version
  (version, texto, finalidad, datos_recogidos, responsable, plazo_conservacion, activa)
values (
  '1.0',
  'Consiento de forma expresa, previa e informada la medición de mi frecuencia cardíaca y saturación de oxígeno con fines educativos. Entiendo que la plataforma no es un dispositivo médico ni entrega diagnósticos.',
  'Actividad educativa de la asignatura: medir, visualizar y comparar la frecuencia cardíaca.',
  'Nombre, edad, factores declarados (sueño, cafeína, medicación, estrés, actividad previa, condición de salud), señal PPG, BPM y SpO2.',
  'Responsable del tratamiento: equipo del proyecto sensor_pulso (completar con datos oficiales y canal de contacto).',
  'Hasta 12 meses desde la última medición, salvo que el titular solicite antes su eliminación.',
  true);

insert into public.config_plataforma (clave, valor) values
  ('metodo_sincronizacion', '"correlacion_cruzada"'),
  ('metodos_sincronizacion_disponibles', '["correlacion_cruzada","alineacion_por_picos","dtw"]'),
  ('inactividad_sesion_minutos', '30'),
  ('max_estudiantes_por_aula', '100'),
  ('exigir_mfa', 'false'),            -- pasar a true cuando admin y profesores hayan inscrito su 2.º factor (RF49)
  ('segundos_sin_latido_para_perdida', '30'),
  ('canales_por_esp32', '5');

insert into public.insignias (codigo, nombre, descripcion) values
  ('primera_medicion', 'Primera medición', 'Completaste tu primera medición'),
  ('leccion_completa', 'Lección completa', 'Terminaste una lección'),
  ('experto_ppg',      'Experto en PPG',   'Aprobaste los retos de señal PPG'),
  ('comparador',       'Comparador',       'Hiciste tu primera comparación de señales');

insert into public.clasificacion_datos (tabla, columna, clase, cifrado_campo, enmascarar) values
  ('perfiles', 'correo', 'privado', false, true),
  ('perfiles', 'nombre', 'privado', false, true),
  ('declaraciones_paciente', 'nombre', 'privado', false, true),
  ('declaraciones_paciente', 'edad', 'privado', false, false),
  ('declaraciones_paciente', 'datos_cifrados', 'sensible_salud', true, true),
  ('mediciones', 'bpm_promedio', 'sensible_salud', false, false),
  ('mediciones', 'spo2_promedio', 'sensible_salud', false, false),
  ('bloques_senal', 'ir', 'sensible_salud', false, false),
  ('publicaciones', 'bpm_promedio', 'publico', false, false),
  ('lecciones', 'contenido', 'publico', false, false);

insert into public.politicas_retencion (tabla, dias, accion) values
  ('lecturas', 365, 'borrar'),
  ('declaraciones_paciente', 365, 'borrar'),
  ('intentos_login', 90, 'borrar'),
  ('limites_peticiones', 2, 'borrar');

insert into public.documentos_legales (clave, titulo, contenido, version) values
  ('aviso_educativo', 'Aviso educativo',
   'Esta plataforma es educativa y no sustituye un diagnóstico médico.', '1.0'),
  ('aviso_no_medico', 'No es un dispositivo médico',
   'La plataforma no es un dispositivo médico certificado ni entrega diagnósticos. Ante dudas de salud consulta a un profesional.', '1.0'),
  ('politica_privacidad', 'Política de privacidad',
   'Pendiente de redacción: responsable del tratamiento, finalidades, derechos y canal de contacto (RF88).', '0.1'),
  ('alojamiento', 'Alojamiento de los datos',
   'Los datos se alojan en Supabase, región us-east-1 (Estados Unidos), fuera de Chile. Base legal pendiente de revisión (RF95).', '1.0');

-- Retención diaria con pg_cron, si la extensión está disponible.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sensor_pulso_retencion', '0 4 * * *', 'select public.aplicar_retencion()');
  end if;
end $$;


-- ########## 20261027000900_automatizaciones_vistas_derechos.sql ##########
-- sensor_pulso · Migración 9: automatizaciones, vistas, derechos del titular y lecciones base
-- RF10, RF11, RF20, RF21, RF22, RF36, RF37, RF38, RF43, RF46, RF54, RF58, RF62, RF72, RF113, RNF04

-- ================================================================ DISPOSITIVOS ESP32 (RF54)
-- El token se muestra UNA sola vez al crearlo; en la base solo queda su hash SHA-256.
create or replace function public.crear_dispositivo(p_nombre text, p_canales smallint default 5)
returns table (dispositivo_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid;
begin
  if not public.es_admin() then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  v_token := 'esp_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.dispositivos (nombre, token_hash, canales, creado_por)
  values (p_nombre, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_canales, auth.uid())
  returning id into v_id;
  perform public.registrar_auditoria('crear_dispositivo', 'dispositivos', v_id::text);
  return query select v_id, v_token;
end $$;

create or replace function public.revocar_dispositivo(p_dispositivo uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  update public.dispositivos
     set activo = false, revocado_en = now(), revocado_por = auth.uid()
   where id = p_dispositivo and activo;
  update public.sesiones_medicion
     set estado = 'finalizada', fin = now(), motivo_fin = 'dispositivo_revocado'
   where dispositivo_id = p_dispositivo and estado = 'activa';
  insert into public.notificaciones_seguridad (tipo, severidad, mensaje, detalle)          -- RF72
  values ('token_esp32_comprometido', 'alta', 'Se revocó el token de un ESP32',
          jsonb_build_object('dispositivo_id', p_dispositivo, 'motivo', p_motivo));
  perform public.registrar_auditoria('revocar_dispositivo', 'dispositivos', p_dispositivo::text,
          jsonb_build_object('motivo', p_motivo), true);
end $$;

-- Valida el token que envía el ESP32. Solo la llama el servidor (service role), nunca el cliente.
create or replace function public.validar_token_dispositivo(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.dispositivos
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and activo;
  if v_id is not null then
    update public.dispositivos set ultimo_contacto = now() where id = v_id;
  end if;
  return v_id;
end $$;

revoke all on function public.crear_dispositivo(text, smallint), public.revocar_dispositivo(uuid, text)
  from public, anon;
grant execute on function public.crear_dispositivo(text, smallint), public.revocar_dispositivo(uuid, text)
  to authenticated;
revoke all on function public.validar_token_dispositivo(text) from public, anon, authenticated;
grant execute on function public.validar_token_dispositivo(text) to service_role;

-- ================================================================ SESIONES: LATIDO Y PÉRDIDA DE COMUNICACIÓN (RF10, RF11)
create or replace function public.registrar_latido(p_sesion uuid)
returns void language sql security definer set search_path = '' as $$
  update public.sesiones_medicion
     set ultimo_latido = now(), estado = 'activa'
   where id = p_sesion and estado in ('activa', 'perdida') and fin is null
$$;
revoke all on function public.registrar_latido(uuid) from public, anon, authenticated;
grant execute on function public.registrar_latido(uuid) to service_role;

-- Marca como pérdida las sesiones sin latido y cierra sus mediciones conservando lo medido
-- (decisión provisional del pendiente 3.2: guardar lo medido hasta el corte).
create or replace function public.cerrar_sesiones_inactivas()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer; v_seg integer;
begin
  select coalesce((select (valor #>> '{}')::integer from public.config_plataforma
                    where clave = 'segundos_sin_latido_para_perdida'), 30) into v_seg;
  with perdidas as (
    update public.sesiones_medicion
       set estado = 'perdida', fin = now(), motivo_fin = 'perdida_comunicacion'
     where estado = 'activa' and dispositivo_id is not null
       and ultimo_latido < now() - make_interval(secs => v_seg)
    returning id)
  update public.mediciones m
     set fin = now(), estado_conexion = 'perdida'
   where m.sesion_id in (select id from perdidas) and m.fin is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cerrar_sesiones_inactivas() from public, anon, authenticated;

create or replace function public.finalizar_sesion(p_sesion uuid, p_motivo text default 'usuario')
returns void language plpgsql security definer set search_path = '' as $$
declare v_aula uuid; v_ini uuid;
begin
  select aula_id, iniciada_por into v_aula, v_ini from public.sesiones_medicion where id = p_sesion;
  if not found then raise exception 'Sesión no encontrada'; end if;
  if not (v_ini = auth.uid() or public.es_admin()
          or (v_aula is not null and public.es_profesor_del_aula(v_aula))) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.sesiones_medicion set estado = 'finalizada', fin = now(), motivo_fin = p_motivo
   where id = p_sesion and fin is null;
  update public.mediciones set fin = now(), estado_conexion = 'finalizada'
   where sesion_id = p_sesion and fin is null;
end $$;
revoke all on function public.finalizar_sesion(uuid, text) from public, anon;
grant execute on function public.finalizar_sesion(uuid, text) to authenticated;

-- ================================================================ ALERTAS AUTOMÁTICAS FUERA DE RANGO (RF20, RF21)
create or replace function public.rango_aplicable(p_actividad smallint, p_edad smallint)
returns public.rangos language sql stable security definer set search_path = '' as $$
  select r.* from public.rangos r
   where r.vigente and r.actividad_id = p_actividad
     and coalesce(p_edad, 30) between r.edad_min and r.edad_max
   order by r.actualizado_en desc limit 1
$$;

create or replace function public.evaluar_lectura()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m public.mediciones; r public.rangos; v_tipo text; v_limite numeric;
begin
  select * into m from public.mediciones where id = new.medicion_id;
  if m.actividad_id is null then return new; end if;
  select * into r from public.rango_aplicable(m.actividad_id, m.edad_al_medir);
  if r.id is null then return new; end if;

  if new.bpm is not null and new.bpm > r.bpm_max then v_tipo := 'bpm_alto'; v_limite := r.bpm_max;
  elsif new.bpm is not null and new.bpm < r.bpm_min then v_tipo := 'bpm_bajo'; v_limite := r.bpm_min;
  end if;
  if v_tipo is not null and not exists (
       select 1 from public.alertas a
        where a.medicion_id = m.id and a.tipo = v_tipo and a.creada_en > now() - interval '30 seconds') then
    insert into public.alertas (medicion_id, usuario_id, tipo, valor, limite)
    values (m.id, m.usuario_id, v_tipo, new.bpm, v_limite);
  end if;

  if new.spo2 is not null and new.spo2 < r.spo2_min and not exists (
       select 1 from public.alertas a
        where a.medicion_id = m.id and a.tipo = 'spo2_bajo' and a.creada_en > now() - interval '30 seconds') then
    insert into public.alertas (medicion_id, usuario_id, tipo, valor, limite)
    values (m.id, m.usuario_id, 'spo2_bajo', new.spo2, r.spo2_min);
  end if;

  if new.calidad = 'mala' and not exists (
       select 1 from public.alertas a
        where a.medicion_id = m.id and a.tipo = 'senal_mala' and a.creada_en > now() - interval '30 seconds') then
    insert into public.alertas (medicion_id, usuario_id, tipo, sonora)
    values (m.id, m.usuario_id, 'senal_mala', false);
  end if;
  return new;
end $$;
create trigger lecturas_evaluar after insert on public.lecturas
  for each row execute function public.evaluar_lectura();

-- Cierra una medición: promedios, rango y estado (RF20, RF30). Devuelve el resumen.
create or replace function public.finalizar_medicion(p_medicion uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.mediciones; r public.rangos; v_bpm numeric; v_spo2 numeric; v_ok boolean;
begin
  select * into m from public.mediciones where id = p_medicion and usuario_id = auth.uid();
  if not found then raise exception 'Medición no encontrada'; end if;
  select round(avg(bpm), 1), round(avg(spo2), 1) into v_bpm, v_spo2
    from public.lecturas where medicion_id = p_medicion;
  if m.actividad_id is not null and v_bpm is not null then
    select * into r from public.rango_aplicable(m.actividad_id, m.edad_al_medir);
    if r.id is not null then
      v_ok := v_bpm between r.bpm_min and r.bpm_max and (v_spo2 is null or v_spo2 >= r.spo2_min);
    end if;
  end if;
  update public.mediciones
     set fin = coalesce(fin, now()), estado_conexion = 'finalizada',
         bpm_promedio = coalesce(v_bpm, bpm_promedio), spo2_promedio = coalesce(v_spo2, spo2_promedio),
         dentro_de_rango = v_ok
   where id = p_medicion;
  return jsonb_build_object('bpm_promedio', v_bpm, 'spo2_promedio', v_spo2, 'dentro_de_rango', v_ok);
end $$;
revoke all on function public.finalizar_medicion(uuid) from public, anon;
grant execute on function public.finalizar_medicion(uuid) to authenticated;

-- ================================================================ ADMINISTRACIÓN: PROPUESTAS Y AUDITORÍA DE CAMBIOS (RF46, RF62)
create or replace function public.resolver_propuesta(p_propuesta uuid, p_aprobar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.propuestas_cambio;
begin
  if not public.es_admin() then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  select * into p from public.propuestas_cambio where id = p_propuesta and estado = 'pendiente';
  if not found then raise exception 'Propuesta no encontrada o ya resuelta'; end if;

  if p_aprobar then
    if p.tipo = 'rango' then
      if p.entidad_id is not null then
        update public.rangos
           set bpm_min  = coalesce((p.propuesta ->> 'bpm_min')::smallint,  bpm_min),
               bpm_max  = coalesce((p.propuesta ->> 'bpm_max')::smallint,  bpm_max),
               spo2_min = coalesce((p.propuesta ->> 'spo2_min')::smallint, spo2_min),
               spo2_max = coalesce((p.propuesta ->> 'spo2_max')::smallint, spo2_max),
               actualizado_por = p.proponente_id, actualizado_en = now()
         where id = p.entidad_id::uuid;
      else
        insert into public.rangos (actividad_id, edad_min, edad_max, bpm_min, bpm_max, spo2_min, spo2_max, actualizado_por)
        values ((p.propuesta ->> 'actividad_id')::smallint, (p.propuesta ->> 'edad_min')::smallint,
                (p.propuesta ->> 'edad_max')::smallint, (p.propuesta ->> 'bpm_min')::smallint,
                (p.propuesta ->> 'bpm_max')::smallint, coalesce((p.propuesta ->> 'spo2_min')::smallint, 95),
                coalesce((p.propuesta ->> 'spo2_max')::smallint, 100), p.proponente_id);
      end if;
    elsif p.tipo = 'metodo_sync' then
      insert into public.config_plataforma (clave, valor, actualizado_por)
      values ('metodo_sincronizacion', p.propuesta -> 'metodo', auth.uid())
      on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por,
                                        actualizado_en = now();
    elsif p.tipo = 'leccion' and p.entidad_id is not null then
      update public.lecciones set contenido = coalesce(p.propuesta -> 'contenido', contenido),
             titulo = coalesce(p.propuesta ->> 'titulo', titulo), actualizado_por = p.proponente_id
       where id = p.entidad_id::uuid;
    end if;
  end if;

  update public.propuestas_cambio
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_propuesta;
  perform public.registrar_auditoria('resolver_propuesta', 'propuestas_cambio', p_propuesta::text,
          jsonb_build_object('aprobada', p_aprobar, 'tipo', p.tipo));
end $$;
revoke all on function public.resolver_propuesta(uuid, boolean) from public, anon;
grant execute on function public.resolver_propuesta(uuid, boolean) to authenticated;

create or replace function public.auditar_cambio_rangos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cambio_rangos', 'rangos', coalesce(new.id, old.id)::text,
          jsonb_build_object('operacion', tg_op, 'antes', to_jsonb(old), 'despues', to_jsonb(new)));
  return coalesce(new, old);
end $$;
create trigger rangos_auditar after insert or update or delete on public.rangos
  for each row execute function public.auditar_cambio_rangos();

create or replace function public.auditar_eliminacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id)
  values (auth.uid(), 'eliminacion', tg_table_name, old.id::text);
  return old;
end $$;
create trigger mediciones_auditar_borrado after delete on public.mediciones
  for each row execute function public.auditar_eliminacion();
create trigger aulas_auditar_borrado after delete on public.aulas
  for each row execute function public.auditar_eliminacion();

create or replace function public.auditar_permisos_profesor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cambio_permisos', 'permisos_profesor', new.profesor_id::text, to_jsonb(new));
  return new;
end $$;
create trigger permisos_auditar after insert or update on public.permisos_profesor
  for each row execute function public.auditar_permisos_profesor();

-- ================================================================ DERECHOS DEL TITULAR (RF58, RF89)
-- Exporta todo lo del titular. Los campos de salud declarados salen cifrados: el servidor los descifra.
create or replace function public.exportar_mis_datos()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  select jsonb_build_object(
    'generado_en', now(),
    'perfil', (select to_jsonb(p) from public.perfiles p where p.id = auth.uid()),
    'consentimientos', coalesce((select jsonb_agg(to_jsonb(c)) from public.consentimientos_aceptados c where c.usuario_id = auth.uid()), '[]'),
    'declaraciones', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'edad', d.edad,
        'datos_cifrados_base64', encode(d.datos_cifrados, 'base64'), 'clave_version', d.clave_version, 'creado_en', d.creado_en))
        from public.declaraciones_paciente d where d.usuario_id = auth.uid()), '[]'),
    'mediciones', coalesce((select jsonb_agg(to_jsonb(m)) from public.mediciones m where m.usuario_id = auth.uid()), '[]'),
    'alertas', coalesce((select jsonb_agg(to_jsonb(a)) from public.alertas a where a.usuario_id = auth.uid()), '[]'),
    'comparaciones', coalesce((select jsonb_agg(to_jsonb(c)) from public.comparaciones c where c.usuario_id = auth.uid()), '[]'),
    'progreso', coalesce((select jsonb_agg(to_jsonb(g)) from public.progreso_lecciones g where g.usuario_id = auth.uid()), '[]'),
    'aulas', coalesce((select jsonb_agg(to_jsonb(e)) from public.aula_estudiantes e where e.usuario_id = auth.uid()), '[]'),
    'evaluaciones', coalesce((select jsonb_agg(to_jsonb(i)) from public.intentos_evaluacion i where i.usuario_id = auth.uid()), '[]'),
    'solicitudes', coalesce((select jsonb_agg(to_jsonb(s)) from public.solicitudes_derechos s where s.usuario_id = auth.uid()), '[]')
  ) into v;
  insert into public.solicitudes_derechos (usuario_id, tipo, estado, resuelta_en)
  values (auth.uid(), 'portabilidad', 'resuelta', now());
  perform public.registrar_auditoria('exportacion_datos', 'perfiles', auth.uid()::text);
  return v;
end $$;

-- Suprime los datos de medición y declarados del titular (RF58, RF89). Se conservan, por ser
-- registro académico del profesor, las calificaciones; la cuenta de acceso la elimina el servidor.
create or replace function public.eliminar_mis_datos()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  delete from public.mediciones where usuario_id = auth.uid();       -- cascada: señal, lecturas, alertas, publicaciones, comparaciones
  delete from public.declaraciones_paciente where usuario_id = auth.uid();
  delete from public.senales_referencia where propietario_id = auth.uid();
  delete from public.progreso_lecciones where usuario_id = auth.uid();
  delete from public.insignias_usuario where usuario_id = auth.uid();
  update public.consentimientos_aceptados set revocado_en = coalesce(revocado_en, now()) where usuario_id = auth.uid();
  insert into public.solicitudes_derechos (usuario_id, tipo, estado, resuelta_en)
  values (auth.uid(), 'supresion', 'resuelta', now());
  perform public.registrar_auditoria('supresion_datos', 'perfiles', auth.uid()::text);
end $$;
revoke all on function public.exportar_mis_datos(), public.eliminar_mis_datos() from public, anon;
grant execute on function public.exportar_mis_datos(), public.eliminar_mis_datos() to authenticated;

-- ================================================================ VISTAS
-- Evolución personal del BPM en reposo por día, junto al rango esperado (RF36).
-- La correlación con estrés/sueño (RF37) la calcula el servidor tras descifrar esos campos.
create view public.evolucion_reposo with (security_invoker = true) as
  select m.usuario_id,
         (m.inicio at time zone 'America/Santiago')::date as dia,
         round(avg(m.bpm_promedio), 1) as bpm_reposo,
         round(avg(m.spo2_promedio), 1) as spo2_reposo,
         min(r.bpm_min) as bpm_esperado_min,
         max(r.bpm_max) as bpm_esperado_max,
         count(*) as mediciones
  from public.mediciones m
  join public.actividades a on a.id = m.actividad_id and a.codigo = 'reposo'
  left join public.rangos r on r.actividad_id = m.actividad_id and r.vigente
       and coalesce(m.edad_al_medir, 30) between r.edad_min and r.edad_max
  where m.bpm_promedio is not null
  group by m.usuario_id, (m.inicio at time zone 'America/Santiago')::date;

-- Avance del aula por evaluación para el modo docente y el panel en vivo (RF43, RF113).
create view public.avance_evaluaciones with (security_invoker = true) as
  select e.id as evaluacion_id, e.aula_id, e.titulo, e.estado,
         count(i.id) as intentos,
         count(i.id) filter (where i.fin is not null) as terminados,
         count(i.id) filter (where i.nivel = 'logrado') as logrado,
         count(i.id) filter (where i.nivel = 'medianamente_logrado') as medianamente_logrado,
         count(i.id) filter (where i.nivel = 'no_logrado') as no_logrado,
         round(avg(i.porcentaje), 1) as promedio_pct
  from public.evaluaciones e
  left join public.intentos_evaluacion i on i.evaluacion_id = e.id
  group by e.id;

-- Alertas recientes del usuario para el historial (RF21).
create view public.historial_alertas with (security_invoker = true) as
  select a.id, a.usuario_id, a.medicion_id, a.tipo, a.valor, a.limite, a.sonora, a.creada_en
  from public.alertas a;

grant select on public.evolucion_reposo, public.avance_evaluaciones, public.historial_alertas to authenticated;

-- ================================================================ TIEMPO REAL (RNF04, RF08, RF113)
alter publication supabase_realtime add table public.lecturas;
alter publication supabase_realtime add table public.alertas;
alter publication supabase_realtime add table public.sesiones_medicion;
alter publication supabase_realtime add table public.sesion_canales;

-- Cierre de sesiones sin latido, cada minuto, si pg_cron está disponible (RF10).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sensor_pulso_sesiones_inactivas', '* * * * *', 'select public.cerrar_sesiones_inactivas()');
  end if;
end $$;

-- ================================================================ LECCIONES BASE (RF22, RF38, RF39, RF115)
insert into public.lecciones (slug, titulo, categoria, orden, publicada, contenido) values
 ('corazon-y-frecuencia-cardiaca', 'El corazón y la frecuencia cardíaca', 'fisiologia', 1, true,
  '[{"tipo":"texto","texto":"El corazón bombea sangre con cada latido. La frecuencia cardíaca son los latidos por minuto (BPM) y cambia con la actividad, la edad, el estrés, el sueño y la cafeína."}]'),
 ('como-se-obtiene-el-bpm', 'Cómo se obtiene el BPM', 'bpm', 2, true,
  '[{"tipo":"texto","texto":"El sensor emite luz infrarroja (p. ej. 880 nm en el MAX30102). Con cada latido cambia el volumen de sangre bajo la piel y varía la intensidad de luz reflejada. Esa señal (PPG) se analiza: se detectan los picos, se miden los intervalos entre picos y se convierte en BPM. Los nm son la longitud de onda de la luz; el sensor entrega intensidad, no nanómetros."}]'),
 ('saturacion-de-oxigeno', 'La saturación de oxígeno (SpO₂)', 'spo2', 3, true,
  '[{"tipo":"texto","texto":"El sensor usa luz roja (p. ej. 660 nm) e infrarroja. La hemoglobina con y sin oxígeno absorbe distinto cada luz; la razón entre ambas señales se convierte en un porcentaje de saturación. En personas sanas suele estar sobre 95 %. En esta plataforma se muestra el valor medido junto al BPM."}]'),
 ('el-sensor-max30102-y-el-esp32', 'El sensor MAX30102 y el ESP32', 'sensor', 4, true,
  '[{"tipo":"texto","texto":"El MAX30102 tiene LED rojo e infrarrojo y un fotodetector. El ESP32 lee hasta 5 sensores y envía los datos por WiFi con un token propio. Cada canal se asigna a la cuenta de una persona."}]'),
 ('ingenieria-de-la-senal', 'Ingeniería aplicada a la señal', 'ingenieria', 5, true,
  '[{"tipo":"texto","texto":"Filtrado de ruido, detección de picos, variabilidad (HRV), calidad de señal y comparación de señales. El PPG mide pulso por luz; el ECG mide actividad eléctrica y aquí solo se usa como referencia educativa."}]'),
 ('esto-no-es-un-diagnostico', 'Esta plataforma no es un diagnóstico', 'salud', 6, true,
  '[{"tipo":"texto","texto":"La plataforma es educativa y no es un dispositivo médico. Una medición fuera de rango es información sensible, nunca un diagnóstico: ante dudas consulta a un profesional de la salud."}]');


-- ########## 20261031000100_rangos_spo2_y_personales.sql ##########
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
