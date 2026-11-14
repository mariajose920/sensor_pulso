-- sensor_pulso · RF111 (ampliación): el estudiante recibe su canal automáticamente y deja los datos del paciente
-- Igual que el profesor con «Agregar canal», el estudiante pulsa un botón, el sistema le asigna el siguiente canal
-- libre y queda constancia de los tres requisitos: ficha del paciente (RF03), política de privacidad (RF88) y
-- consentimiento informado (RF04, RF59). Un estudiante tiene como máximo un canal por sesión (el trigger
-- `limitar_canales_por_usuario` también lo exige). Requiere la migración 20261109000200 (requisitos por canal).

create or replace function public.asignar_canal_estudiante(
  p_sesion uuid,
  p_declaracion uuid,
  p_politica_version text,
  p_consentimiento_version text
) returns smallint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_aula uuid; v_estado public.estado_conexion;
  v_canal smallint;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para tomar un canal' using errcode = '42501';
  end if;

  select aula_id, estado into v_aula, v_estado from public.sesiones_medicion where id = p_sesion;
  if not found or v_estado <> 'activa' then raise exception 'Sesión no disponible'; end if;
  if v_aula is not null and not public.es_miembro_activo(v_aula) then
    raise exception 'No perteneces al aula de esta sesión' using errcode = '42501';
  end if;

  -- Requisitos previos: ficha propia, política vigente y consentimiento activo.
  if p_declaracion is null or not exists (
       select 1 from public.declaraciones_paciente d where d.id = p_declaracion and d.usuario_id = v_uid) then
    raise exception 'Falta la ficha del paciente de este canal (RF03)' using errcode = 'P0001';
  end if;
  if p_politica_version is distinct from
     (select d.version from public.documentos_legales d where d.clave = 'politica_privacidad') then
    raise exception 'Debes aceptar la política de privacidad vigente (RF88)' using errcode = 'P0001';
  end if;
  if p_consentimiento_version is null or not exists (
       select 1 from public.consentimientos_version c where c.version = p_consentimiento_version and c.activa) then
    raise exception 'Falta el consentimiento informado vigente (RF04)' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_sesion::text || v_uid::text, 0));

  if exists (select 1 from public.sesion_canales where sesion_id = p_sesion and usuario_id = v_uid) then
    raise exception 'Ya tienes un canal en esta sesión. Libéralo para que el sistema te asigne otro.' using errcode = '23505';
  end if;

  -- Siguiente canal libre; skip locked evita que dos estudiantes tomen el mismo.
  select canal into v_canal from public.sesion_canales
   where sesion_id = p_sesion and usuario_id is null
   order by canal limit 1 for update skip locked;
  if v_canal is null then raise exception 'No hay canales libres en esta ronda'; end if;

  update public.sesion_canales set usuario_id = v_uid, asignado_en = now()
   where sesion_id = p_sesion and canal = v_canal;

  -- La ficha del estudiante es su ficha propia (sesion_id nulo): se reutiliza tal cual y NO se liga a la sesión, así sigue
  -- siendo su ficha guardada de siempre y no se le vuelve a pedir. La constancia queda en sesion_canal_requisitos.

  insert into public.sesion_canal_requisitos
    (sesion_id, canal, usuario_id, declaracion_id, politica_version, consentimiento_version)
  values (p_sesion, v_canal, v_uid, p_declaracion, p_politica_version, p_consentimiento_version);

  return v_canal;
end $$;

revoke all on function public.asignar_canal_estudiante(uuid, uuid, text, text) from public, anon;
grant execute on function public.asignar_canal_estudiante(uuid, uuid, text, text) to authenticated;
