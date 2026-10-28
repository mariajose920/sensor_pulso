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
