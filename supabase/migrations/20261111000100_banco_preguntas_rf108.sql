-- RF108: Banco de preguntas personal y compartido, con selección al azar.

-- 1. Ajustar políticas de creación/edición de preguntas (permite profesor o admin,
--    y exige permiso compartir_banco o rol admin para compartir al banco común)
drop policy if exists preguntas_ver on public.preguntas;
create policy preguntas_ver on public.preguntas for select to authenticated
  using (
    autor_id = (select auth.uid())
    or (select public.es_admin())
    or (compartida and revision_global = 'aprobada' and (select public.es_profesor()))
    or (select public.puede_ver_pregunta(id))
  );
drop policy if exists preguntas_crear on public.preguntas;
create policy preguntas_crear on public.preguntas for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and ((select public.es_profesor()) or (select public.es_admin()))
    and (
      not compartida
      or (select public.es_admin())
      or (select public.tiene_permiso('compartir_banco'))
    )
  );

drop policy if exists preguntas_editar on public.preguntas;
create policy preguntas_editar on public.preguntas for update to authenticated
  using (autor_id = (select auth.uid()) or (select public.es_admin()))
  with check (
    (autor_id = (select auth.uid()) or (select public.es_admin()))
    and (
      not compartida
      or (select public.es_admin())
      or (select public.tiene_permiso('compartir_banco'))
    )
  );

-- 2. Sincronizar estado revision_global cuando un usuario autorizado comparte una pregunta
create or replace function public.sync_revision_banco_preguntas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.compartida then
    if coalesce(new.revision_global, 'no_solicitada') <> 'rechazada' then
      new.revision_global := 'aprobada';
    end if;
  else
    new.revision_global := 'no_solicitada';
  end if;
  return new;
end $$;

drop trigger if exists preguntas_sync_compartida on public.preguntas;
create trigger preguntas_sync_compartida
  before insert or update of compartida on public.preguntas
  for each row execute function public.sync_revision_banco_preguntas();

-- 3. Asegurar visibilidad del banco compartido también para administradores
create or replace function public.puede_ver_pregunta(p_pregunta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.preguntas q
    where q.id = p_pregunta
      and (
        q.autor_id = auth.uid()
        or public.es_admin()
        or (q.compartida and q.revision_global = 'aprobada' and (public.es_profesor() or public.es_admin()))
        or exists (
          select 1 from public.evaluacion_preguntas ep
          where ep.pregunta_id = q.id
            and (
              public.profesor_de_evaluacion(ep.evaluacion_id)
              or (public.evaluacion_asignada_a_mi(ep.evaluacion_id) and public.evaluacion_abierta(ep.evaluacion_id))
            )
        )
      )
  )
$$;

-- 4. Seleccionar N preguntas al azar para vista previa antes o durante la creación de evaluaciones
create or replace function public.seleccionar_preguntas_banco_azar(
  p_cantidad integer,
  p_origen text default 'ambos',
  p_etiquetas text[] default null,
  p_excluir uuid[] default '{}'
)
returns setof public.preguntas
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.es_profesor() or public.es_admin()) then
    raise exception 'Solo profesores o administradores pueden consultar el banco' using errcode = '42501';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    return;
  end if;

  return query
  select q.*
    from public.preguntas q
   where q.leccion_id is null
     and not (q.id = any (coalesce(p_excluir, '{}')))
     and (p_etiquetas is null or cardinality(p_etiquetas) = 0 or q.etiquetas && p_etiquetas)
     and (
       (p_origen = 'personal' and q.autor_id = auth.uid())
       or (p_origen = 'compartido' and q.compartida and q.revision_global = 'aprobada')
       or (p_origen not in ('personal', 'compartido') and (
         q.autor_id = auth.uid() or (q.compartida and q.revision_global = 'aprobada')
       ))
     )
   order by random()
   limit least(p_cantidad, 100);
end $$;

-- 5. Actualizar armar_preguntas_aleatorias con filtro por origen (personal/compartido/ambos)
drop function if exists public.armar_preguntas_aleatorias(uuid, integer, text[]);

create or replace function public.armar_preguntas_aleatorias(
  p_eval uuid,
  p_cantidad integer,
  p_etiquetas text[] default null,
  p_origen text default 'ambos'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  v_orden_base integer;
begin
  if not (public.profesor_de_evaluacion(p_eval) or public.es_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    return 0;
  end if;

  select coalesce(max(orden), 0) into v_orden_base
    from public.evaluacion_preguntas
   where evaluacion_id = p_eval;

  with elegidas as (
    select q.id
      from public.preguntas q
     where q.leccion_id is null
       and (p_etiquetas is null or cardinality(p_etiquetas) = 0 or q.etiquetas && p_etiquetas)
       and not exists (
         select 1 from public.evaluacion_preguntas ep
          where ep.evaluacion_id = p_eval and ep.pregunta_id = q.id
       )
       and (
         (p_origen = 'personal' and q.autor_id = auth.uid())
         or (p_origen = 'compartido' and q.compartida and q.revision_global = 'aprobada')
         or (p_origen not in ('personal', 'compartido') and (
           q.autor_id = auth.uid() or (q.compartida and q.revision_global = 'aprobada')
         ))
       )
     order by random()
     limit least(p_cantidad, 100)
  )
  insert into public.evaluacion_preguntas (evaluacion_id, pregunta_id, orden)
  select p_eval, id, (v_orden_base + row_number() over ())::smallint
    from elegidas;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.seleccionar_preguntas_banco_azar(integer, text, text[], uuid[]),
  public.armar_preguntas_aleatorias(uuid, integer, text[], text) from public, anon;
grant execute on function public.seleccionar_preguntas_banco_azar(integer, text, text[], uuid[]),
  public.armar_preguntas_aleatorias(uuid, integer, text[], text) to authenticated;