import { createClient } from '@supabase/supabase-js'

const url = 'https://ozzehtpqxpicfqvmulcg.supabase.co'
const key = 'sb_publishable_CD_KR_pwQQQ1e_HR2aQemw_mNjM2_ml'
const supabase = createClient(url, key)

async function revisarBaseDeDatos() {
  console.log('\n=============================================================')
  console.log('   ESTADO REAL DE LA BASE DE DATOS SUPABASE (EN LA NUBE)     ')
  console.log('=============================================================\n')

  // 1. Autenticar como Administrador para saltar las políticas RLS y ver los datos reales
  const adminEmail = 'admin.general@unach.cl'
  const adminPass = 'AdminSecure#2026'
  
  let { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPass
  })

  // Si no está registrado en Supabase Auth, registrarlo e iniciar sesión
  if (authErr && (authErr.message.includes('Invalid login') || authErr.message.includes('not found'))) {
    console.log('ℹ️ Registrando administrador oficial en Supabase Auth...')
    await supabase.auth.signUp({
      email: adminEmail,
      password: adminPass,
      options: {
        data: {
          nombre: 'Administrador Inicial',
          nombre_completo: 'Administrador Inicial',
          rol: 'profesor'
        }
      }
    })
    const reAuth = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPass
    })
    authData = reAuth.data
    authErr = reAuth.error
  }

  if (authErr) {
    console.warn(`⚠️ Aviso al autenticar como admin: ${authErr.message}`)
    console.log('   (Consultando en modo anónimo público...)')
  } else {
    console.log(`🔐 Sesión autenticada en Supabase como: ${authData.user.email}`)
    console.log(`   User UUID: ${authData.user.id}\n`)
  }

  // 2. Auto-completar nombres de perfiles existentes si estaban vacíos
  const nombresConocidos = {
    'cristobalvaldes@alu.unach.cl': 'Cristóbal Valdés',
    'cmorales@alu.unach.cl': 'Constanza Morales',
    'mariavilches@alu.unach.cl': 'María Vilches',
    'mariavilche@alu.unach.cl': 'María Vilches',
    'profesor.prueba@unach.cl': 'Profesor Docente'
  }

  for (const [correo, nombre] of Object.entries(nombresConocidos)) {
    const { error: errUpd } = await supabase
      .from('perfiles')
      .update({ nombre })
      .eq('correo', correo)
    
    if (errUpd) {
      console.warn(`Aviso actualizando ${correo}:`, errUpd.message)
    }
  }

  // 3. AULAS (RF99 / RF100)
  const { data: aulas, error: errAulas } = await supabase
    .from('aulas')
    .select('id, nombre, codigo, codigo_activo, profesor_id, creado_en')
    .order('creado_en', { ascending: false })

  console.log('📌 1. TABLA AULAS (RF99 / RF100):')
  if (errAulas) {
    console.error('   ❌ Error al consultar aulas:', errAulas.message)
  } else if (!aulas || aulas.length === 0) {
    console.log('   ⚠️  No hay aulas registradas todavía en la base de datos.')
  } else {
    console.log(`   ✓ Total de aulas en la BD: ${aulas.length}`)
    console.table(aulas.map(a => ({
      'Nombre del Aula': a.nombre,
      'Código': a.codigo,
      'Código Activo': a.codigo_activo ? 'SÍ' : 'NO',
      'ID (UUID)': a.id,
      'Creado en': new Date(a.creado_en).toLocaleString('es-CL')
    })))
  }

  // 4. CURSOS / SECCIONES (RF101)
  const { data: cursos, error: errCursos } = await supabase
    .from('cursos')
    .select('id, aula_id, nombre, creado_en')
    .order('creado_en', { ascending: false })

  console.log('\n📌 2. TABLA CURSOS / SECCIONES (RF101):')
  if (errCursos) {
    console.error('   ❌ Error al consultar cursos:', errCursos.message)
  } else if (!cursos || cursos.length === 0) {
    console.log('   ℹ️  No hay secciones registradas todavía en la BD.')
  } else {
    console.log(`   ✓ Total de cursos/secciones en la BD: ${cursos.length}`)
    console.table(cursos.map(c => ({
      'ID Sección': c.id,
      'Nombre de Sección': c.nombre,
      'Aula ID': c.aula_id,
      'Fecha Creación': new Date(c.creado_en).toLocaleString('es-CL')
    })))
  }

  // 5. ESTUDIANTES EN AULAS (RF100 / RF102)
  const { data: inscritos, error: errInscritos } = await supabase
    .from('aula_estudiantes')
    .select('aula_id, usuario_id, estado, unido_en, retirado_en')

  console.log('\n📌 3. TABLA AULA_ESTUDIANTES (RF100 / RF102):')
  if (errInscritos) {
    console.error('   ❌ Error al consultar miembros de aula:', errInscritos.message)
  } else if (!inscritos || inscritos.length === 0) {
    console.log('   ℹ️  No hay estudiantes inscritos en aulas todavía en la BD.')
  } else {
    console.log(`   ✓ Total de membresías en la BD: ${inscritos.length}`)
    console.table(inscritos.map(i => ({
      'Aula ID': i.aula_id,
      'Usuario ID': i.usuario_id,
      'Estado (RF102)': i.estado,
      'Unido en': new Date(i.unido_en).toLocaleString('es-CL'),
      'Retirado en': i.retirado_en ? new Date(i.retirado_en).toLocaleString('es-CL') : 'N/A'
    })))
  }

  // 6. PERFILES / CUENTAS (RF02 / RF44)
  const { data: perfiles, error: errPerfiles } = await supabase
    .from('perfiles')
    .select('id, correo, nombre, rol, es_admin, creado_en')
    .order('creado_en', { ascending: false })

  console.log('\n📌 4. TABLA PERFILES DE USUARIOS (RF02 / RF44):')
  if (errPerfiles) {
    console.error('   ❌ Error al consultar perfiles:', errPerfiles.message)
  } else if (!perfiles || perfiles.length === 0) {
    console.log('   ℹ️  No hay perfiles visibles.')
  } else {
    console.log(`   ✓ Total de perfiles en la BD: ${perfiles.length}`)
    console.table(perfiles.map(p => ({
      'Nombre': p.nombre || '(Sin nombre)',
      'Correo': p.correo,
      'Rol': p.rol,
      'Es Admin': p.es_admin ? 'SÍ' : 'NO',
      'Registrado en': p.creado_en ? new Date(p.creado_en).toLocaleString('es-CL') : 'N/A'
    })))
  }

  // 7. REGISTRO DE AUDITORÍA (RF102)
  const { data: auditoria, error: errAuditoria } = await supabase
    .from('auditoria')
    .select('id, accion, entidad, entidad_id, ocurrio_en')
    .order('ocurrio_en', { ascending: false })
    .limit(5)

  console.log('\n📌 5. TABLA AUDITORÍA (RF102):')
  if (errAuditoria) {
    console.error('   ❌ Error al consultar auditoría:', errAuditoria.message)
  } else if (!auditoria || auditoria.length === 0) {
    console.log('   ℹ️  No hay eventos de auditoría registrados todavía.')
  } else {
    console.log(`   ✓ Últimos eventos registrados: ${auditoria.length}`)
    console.table(auditoria.map(a => ({
      'Acción': a.accion,
      'Entidad': a.entidad,
      'Entidad ID': a.entidad_id,
      'Fecha': new Date(a.ocurrio_en).toLocaleString('es-CL')
    })))
  }

  console.log('\n=============================================================\n')
}

revisarBaseDeDatos().catch(console.error)
