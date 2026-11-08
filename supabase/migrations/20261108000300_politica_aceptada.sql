-- RF88 · ISO 27001 A.5.34: queda registrada la versión de la política de privacidad que cada persona aceptó
-- al crear su cuenta, con la fecha puesta por la base (no por el navegador).

alter table public.perfiles
  add column if not exists politica_version text,
  add column if not exists politica_aceptada_en timestamptz;

-- Mismo alta de cuenta que la migración 0100, más la política aceptada.
-- Solo se acepta la versión vigente de la política; cualquier otro valor se ignora.
-- (También lee 'nombre_completo', que es lo que envía el formulario de registro.)
create or replace function public.crear_perfil_al_registrarse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_correo text := lower(new.email);
  v_rol public.rol_app;
  v_admin boolean;
  v_politica text;
  v_vigente text;
begin
  if v_correo ~ '^[^@\s]+@alu\.unach\.cl$' then
    v_rol := 'usuario';
  elsif v_correo ~ '^[^@\s]+@unach\.cl$' then
    v_rol := 'profesor';
  else
    raise exception 'Solo se aceptan correos @alu.unach.cl o @unach.cl' using errcode = 'check_violation';
  end if;

  v_admin := exists (select 1 from public.admins_iniciales a where lower(a.correo) = v_correo);

  select d.version into v_vigente from public.documentos_legales d where d.clave = 'politica_privacidad';
  v_politica := nullif(new.raw_user_meta_data ->> 'politica_version', '');
  if v_politica is distinct from v_vigente then v_politica := null; end if;

  insert into public.perfiles (id, correo, nombre, rol, es_admin, mfa_requerido, politica_version, politica_aceptada_en)
  values (new.id, v_correo,
          coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), new.raw_user_meta_data ->> 'nombre_completo', ''),
          v_rol, v_admin, (v_rol = 'profesor' or v_admin),
          v_politica, case when v_politica is not null then now() end);

  if v_rol = 'profesor' then
    insert into public.permisos_profesor (profesor_id) values (new.id);
  end if;
  return new;
end $$;

-- La evidencia de la aceptación no la puede cambiar la propia persona (solo un administrador o el servicio).
create or replace function public.proteger_politica_aceptada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.politica_version is distinct from old.politica_version
      or new.politica_aceptada_en is distinct from old.politica_aceptada_en)
     and auth.uid() is not null and not public.es_admin() then
    raise exception 'La política aceptada no se puede modificar.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger perfiles_politica_protegida before update on public.perfiles
  for each row execute function public.proteger_politica_aceptada();
