-- RF46 · Panel de administración: rangos, método de sincronización y contenidos precargados.
-- El administrador cambia directamente; los profesores con permiso (RF98) proponen en
-- propuestas_cambio y el administrador aprueba con resolver_propuesta().
-- Cambio respecto a la versión anterior: una propuesta de tipo 'leccion' identifica la lección por su
-- slug (las lecciones precargadas viven en el código y la tabla solo guarda los cambios) y la crea
-- o la actualiza (upsert). El método de sincronización solo acepta los métodos disponibles.

create or replace function public.resolver_propuesta(p_propuesta uuid, p_aprobar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.propuestas_cambio;
  v_metodo text;
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
      v_metodo := p.propuesta ->> 'metodo';
      if not exists (
        select 1 from public.config_plataforma c, jsonb_array_elements_text(c.valor) m
         where c.clave = 'metodos_sincronizacion_disponibles' and m = v_metodo
      ) then
        raise exception 'Método de sincronización no disponible: %', v_metodo;
      end if;
      insert into public.config_plataforma (clave, valor, actualizado_por)
      values ('metodo_sincronizacion', to_jsonb(v_metodo), auth.uid())
      on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por,
                                        actualizado_en = now();
    elsif p.tipo = 'leccion' and p.entidad_id is not null then
      insert into public.lecciones (slug, titulo, categoria, contenido, orden, publicada, actualizado_por)
      values (p.entidad_id, p.propuesta ->> 'titulo', p.propuesta ->> 'categoria',
              coalesce(p.propuesta -> 'contenido', '{}'::jsonb),
              coalesce((p.propuesta ->> 'orden')::smallint, 0), true, p.proponente_id)
      on conflict (slug) do update
        set titulo = excluded.titulo, categoria = excluded.categoria, contenido = excluded.contenido,
            publicada = true, actualizado_por = excluded.actualizado_por;
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

-- Todo cambio a la configuración o a las lecciones queda en la auditoría (quién, qué y cuándo).
create or replace function public.auditar_cambio_config()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb := to_jsonb(new);
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cambio_config', tg_table_name, coalesce(v ->> 'clave', v ->> 'slug'),
          jsonb_build_object('operacion', tg_op, 'despues', v));
  return new;
end $$;
drop trigger if exists config_plataforma_auditar on public.config_plataforma;
create trigger config_plataforma_auditar after insert or update on public.config_plataforma
  for each row execute function public.auditar_cambio_config();
drop trigger if exists lecciones_auditar on public.lecciones;
create trigger lecciones_auditar after insert or update on public.lecciones
  for each row execute function public.auditar_cambio_config();
