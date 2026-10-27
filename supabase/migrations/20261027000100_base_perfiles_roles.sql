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
