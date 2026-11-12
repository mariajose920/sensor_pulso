-- sensor_pulso · Migración RF63: Registros Inmutables y Sello de Tiempo del Servidor
-- Requerimiento RF63: "Los registros no se editan ni se borran, y llevan sello de tiempo."

-- 1. Asegurar que la función auditoria_inmutable() lance excepción ante cualquier intento de UPDATE, DELETE o TRUNCATE
create or replace function public.auditoria_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La auditoría no se puede modificar ni borrar (RF63)'
    using errcode = '42501';
end;
$$;

-- 2. Asegurar que los triggers bloqueen UPDATE, DELETE y TRUNCATE en public.auditoria
drop trigger if exists auditoria_no_update on public.auditoria;
create trigger auditoria_no_update
  before update or delete on public.auditoria
  for each row execute function public.auditoria_inmutable();

drop trigger if exists auditoria_no_truncate on public.auditoria;
create trigger auditoria_no_truncate
  before truncate on public.auditoria
  for each statement execute function public.auditoria_inmutable();

-- 3. Sello de tiempo obligatorio del servidor (now()):
-- Trigger BEFORE INSERT para forzar que el sello ocurrio_en siempre sea el timestamp oficial del servidor
create or replace function public.auditoria_forzar_sello_servidor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Forzar sello de tiempo generado por el motor de base de datos
  new.ocurrio_en := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists auditoria_sello_servidor on public.auditoria;
create trigger auditoria_sello_servidor
  before insert on public.auditoria
  for each row execute function public.auditoria_forzar_sello_servidor();

-- 4. Revocar explícitamente cualquier permiso de UPDATE, DELETE o TRUNCATE a todos los roles
revoke update, delete, truncate on public.auditoria from public, anon, authenticated;

-- 5. RLS: Garantizar que no existan políticas de UPDATE ni DELETE en public.auditoria
alter table public.auditoria enable row level security;
