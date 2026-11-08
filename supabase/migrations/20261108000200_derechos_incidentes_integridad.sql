-- RF88/RF89/RF92 · ISO 27001 A.5.34, A.5.26, A.8.15
-- Integridad y trazabilidad para las pantallas de derechos del titular e incidentes/brechas.
-- Las políticas RLS ya existen (migración 0700): cada persona ve solo sus solicitudes y solo el administrador
-- ve y gestiona incidentes y brechas. Aquí se agregan límites de tamaño, se impide que el administrador
-- altere lo que pidió la persona y se deja todo en la auditoría.

-- ---------------------------------------------------------------- Límites de tamaño (minimización y abuso)
alter table public.solicitudes_derechos
  add constraint derechos_detalle_largo check (detalle is null or char_length(detalle) <= 1000);
alter table public.solicitudes_derechos
  add constraint derechos_respuesta_largo check (respuesta is null or char_length(respuesta) <= 2000);
alter table public.incidentes
  add constraint incidentes_titulo_largo check (char_length(titulo) between 3 and 200);
alter table public.incidentes
  add constraint incidentes_descripcion_larga check (descripcion is null or char_length(descripcion) <= 4000);

-- Una persona no puede tener más de 5 solicitudes abiertas a la vez (evita inundar al administrador).
create or replace function public.limitar_solicitudes_abiertas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.solicitudes_derechos
       where usuario_id = new.usuario_id and estado in ('recibida','en_proceso')) >= 5 then
    raise exception 'Ya tienes 5 solicitudes abiertas. Espera la respuesta antes de enviar otra.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger derechos_limite before insert on public.solicitudes_derechos
  for each row when (new.estado in ('recibida','en_proceso')) execute function public.limitar_solicitudes_abiertas();

-- ---------------------------------------------------------------- Resolver una solicitud (solo administrador, por RLS)
create or replace function public.resolver_solicitud_derechos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Lo que la persona pidió no se puede reescribir
  if new.usuario_id is distinct from old.usuario_id or new.tipo is distinct from old.tipo
     or new.detalle is distinct from old.detalle or new.recibida_en is distinct from old.recibida_en
     or new.vence_en is distinct from old.vence_en then
    raise exception 'No se puede modificar el contenido de la solicitud.' using errcode = '42501';
  end if;
  -- Una solicitud cerrada no se reabre
  if old.estado in ('resuelta','rechazada') and new.estado is distinct from old.estado then
    raise exception 'La solicitud ya fue cerrada.' using errcode = '42501';
  end if;
  if new.estado in ('resuelta','rechazada') and old.estado not in ('resuelta','rechazada') then
    if coalesce(btrim(new.respuesta), '') = '' then
      raise exception 'Debes escribir la respuesta para la persona.' using errcode = '23514';
    end if;
    new.resuelta_en := now();
    new.atendida_por := auth.uid();
  end if;
  if new.estado is distinct from old.estado then
    perform public.registrar_auditoria('solicitud_derechos_' || new.estado, 'solicitudes_derechos', new.id::text,
      jsonb_build_object('tipo', new.tipo));
  end if;
  return new;
end $$;
create trigger derechos_resolver before update on public.solicitudes_derechos
  for each row execute function public.resolver_solicitud_derechos();

-- ---------------------------------------------------------------- Incidentes y brechas: cierre y auditoría
create or replace function public.auditar_incidente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.reportado_por := coalesce(new.reportado_por, auth.uid());
  end if;
  if new.estado in ('resuelto','cerrado') and new.cerrado_en is null then
    new.cerrado_en := now();
  elsif new.estado not in ('resuelto','cerrado') then
    new.cerrado_en := null;
  end if;
  return new;
end $$;
create trigger incidentes_cierre before insert or update on public.incidentes
  for each row execute function public.auditar_incidente();

create or replace function public.auditar_incidente_despues()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.registrar_auditoria(
    case when tg_op = 'INSERT' then 'incidente_creado' else 'incidente_actualizado' end,
    'incidentes', new.id::text,
    jsonb_build_object('severidad', new.severidad, 'estado', new.estado, 'datos_personales', new.afecta_datos_personales),
    new.severidad in ('alta','critica'));
  return new;
end $$;
create trigger incidentes_auditoria after insert or update on public.incidentes
  for each row execute function public.auditar_incidente_despues();

create or replace function public.auditar_brecha()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.registrar_auditoria(
    case when tg_op = 'INSERT' then 'brecha_registrada' else 'brecha_actualizada' end,
    'brechas', new.id::text,
    jsonb_build_object('incidente', new.incidente_id,
      'afectados_notificados', new.afectados_notificados_en is not null,
      'autoridad_notificada', new.autoridad_notificada_en is not null),
    true);
  return new;
end $$;
create trigger brechas_auditoria after insert or update on public.brechas
  for each row execute function public.auditar_brecha();

-- Una sola brecha por incidente: es el registro formal de ese incidente.
create unique index brechas_un_registro_por_incidente on public.brechas (incidente_id);
