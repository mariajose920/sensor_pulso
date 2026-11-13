-- sensor_pulso · RF107 (ampliación): el estudiante puede entregar cualquier medición guardada
-- Antes, la base rechazaba la entrega si la medición tenía calidad «mala», era anterior a la apertura de la evaluación o no
-- traía el dato pedido (BPM o SpO₂): el estudiante no podía entregar y no veía qué había salido mal. Ahora la entrega
-- NUNCA se bloquea por la calidad de la medición: se califica con lo que tenga (puede dar 0) y la retroalimentación explica
-- qué pasó (señal mala, medición antigua, falta el dato). Solo se exige que la medición sea del propio estudiante.
-- Reemplaza `evaluar_criterio` (migración 20261113000200); las demás funciones de RF107 no cambian.

create or replace function public.evaluar_criterio(
  p_eval uuid, p_criterio jsonb, p_medicion uuid, p_alumno uuid, p_desde timestamptz, p_validar_ventana boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ev public.evaluaciones; v_m public.mediciones;
  v_crit jsonb := p_criterio; v_tipo text; v_min numeric; v_max numeric; v_minimo numeric;
  v_valor numeric; v_sim numeric; v_pts numeric; v_cumple boolean; v_motivo text;
  v_desde timestamptz; v_ref jsonb; v_ref_bpm numeric; v_ref_reg numeric; v_ref_ritmo text; v_ref_nombre text;
  v_avisos text[] := '{}';
begin
  select * into v_ev from public.evaluaciones where id = p_eval;
  if not found then raise exception 'Evaluación no encontrada'; end if;
  select * into v_m from public.mediciones where id = p_medicion and usuario_id = p_alumno;
  if not found then raise exception 'Medición no válida: debe ser una medición tuya'; end if;

  -- Avisos (no bloquean): se agregan a la retroalimentación para que el estudiante vea qué pasó
  if v_m.calidad = 'mala' then
    v_avisos := v_avisos || 'La señal de esta medición era de calidad mala, así que el valor puede no ser confiable.';
  end if;
  v_desde := case when v_ev.modo = 'en_vivo' then coalesce(v_ev.iniciada_en, v_ev.abre_en) else v_ev.abre_en end;
  if v_desde is not null and v_m.inicio < v_desde then
    v_avisos := v_avisos || 'Esta medición es anterior a la apertura de la evaluación.';
  end if;

  v_tipo := v_crit ->> 'tipo';

  if v_tipo = 'bpm_en_rango' then
    v_valor := v_m.bpm_promedio;
    v_min := (v_crit ->> 'min')::numeric; v_max := (v_crit ->> 'max')::numeric;
    if v_valor is null then
      v_pts := 0; v_cumple := false;
      v_motivo := 'Esta medición no tiene BPM, así que no se puede comparar con el rango pedido.';
    else
      v_pts := public.puntaje_rango(v_valor, v_min, v_max); v_cumple := v_valor between v_min and v_max;
      v_motivo := case when v_cumple then format('Tu pulso (%s BPM) está dentro del rango pedido (%s a %s BPM).', v_valor, v_min, v_max)
                       else format('Tu pulso (%s BPM) está %s del rango pedido (%s a %s BPM).', v_valor,
                                   case when v_valor < v_min then 'por debajo' else 'por encima' end, v_min, v_max) end;
    end if;

  elsif v_tipo = 'spo2_en_rango' then
    v_valor := v_m.spo2_promedio;
    v_min := (v_crit ->> 'min')::numeric; v_max := (v_crit ->> 'max')::numeric;
    if v_valor is null then
      v_pts := 0; v_cumple := false;
      v_motivo := 'Esta medición no tiene SpO₂, así que no se puede comparar con el rango pedido.';
    else
      v_pts := public.puntaje_rango(v_valor, v_min, v_max); v_cumple := v_valor between v_min and v_max;
      v_motivo := case when v_cumple then format('Tu SpO₂ (%s %%) está dentro del rango pedido (%s a %s %%).', v_valor, v_min, v_max)
                       else format('Tu SpO₂ (%s %%) está %s del rango pedido (%s a %s %%).', v_valor,
                                   case when v_valor < v_min then 'por debajo' else 'por encima' end, v_min, v_max) end;
    end if;

  elsif v_tipo = 'similitud_minima' then
    v_ref := v_crit -> 'referencia';
    v_minimo := (v_crit ->> 'valor')::numeric;
    if v_ref is null or (v_ref ->> 'id') is null then
      -- Falta algo del lado del profesor: la entrega queda registrada y él puede recalificarla después
      v_pts := 0; v_cumple := false;
      v_motivo := 'El profesor aún no definió la señal de referencia. Tu entrega quedó registrada y se recalificará cuando la defina.';
    else
      if v_ref ->> 'origen' = 'plantilla' then
        select s.bpm_referencia, s.ritmo::text, s.nombre into v_ref_bpm, v_ref_ritmo, v_ref_nombre
          from public.senales_referencia s where s.id = (v_ref ->> 'id')::uuid and s.aprobada;
      elsif v_ref ->> 'origen' = 'medicion' then
        -- Solo una medición del propio profesor: nunca los datos de otro estudiante.
        select r.bpm_promedio, r.regularidad, r.ritmo::text, 'Medición de referencia del profesor'
          into v_ref_bpm, v_ref_reg, v_ref_ritmo, v_ref_nombre
          from public.mediciones r where r.id = (v_ref ->> 'id')::uuid and r.usuario_id = v_ev.creador_id;
      end if;
      if not found then
        v_pts := 0; v_cumple := false;
        v_motivo := 'La señal de referencia ya no está disponible. Tu entrega quedó registrada y el profesor podrá recalificarla.';
      else
        v_sim := public.similitud_rasgos(v_m.bpm_promedio, v_ref_bpm, v_m.regularidad, v_ref_reg, v_m.ritmo::text, v_ref_ritmo);
        if v_sim is null then
          v_pts := 0; v_cumple := false;
          v_motivo := 'No hay BPM suficiente en esta medición para compararla con la referencia.';
        else
          v_valor := v_sim;
          v_pts := public.puntaje_similitud(v_sim, v_minimo); v_cumple := v_sim >= v_minimo;
          v_motivo := case when v_cumple then format('Tu señal tiene %s %% de similitud con «%s» (mínimo %s %%).', v_sim, v_ref_nombre, v_minimo)
                           else format('Tu señal tiene %s %% de similitud con «%s»; el mínimo era %s %%.', v_sim, v_ref_nombre, v_minimo) end;
        end if;
      end if;
    end if;
  else
    raise exception 'La evaluación no tiene un criterio válido';
  end if;

  if cardinality(v_avisos) > 0 then
    v_motivo := v_motivo || ' Aviso: ' || array_to_string(v_avisos, ' ');
  end if;

  return jsonb_build_object('valor', v_valor, 'similitud', v_sim, 'cumple', v_cumple,
                            'puntaje', v_pts, 'motivo', v_motivo, 'avisos', to_jsonb(v_avisos),
                            'criterio', v_crit - 'referencia');
end $$;

revoke all on function public.evaluar_criterio(uuid,jsonb,uuid,uuid,timestamptz,boolean) from public, anon, authenticated;
