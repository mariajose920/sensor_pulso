/**
 * ============================================================================
 * sensor_pulso · Utilidades de Protección Web para API Serverless (RF68)
 * ============================================================================
 * Responsable: Adán
 * Requerimiento: RF68 - Protección contra XSS, CSRF e inyección, con cabeceras de seguridad
 * ============================================================================
 */
export {
  escaparHtml,
  desescaparHtml,
  escaparAtributoHtml,
  sanitizarContenidoUsuario,
  esUrlSegura,
  contieneCodigoPeligroso,
  esOrigenPermitido,
  validarOrigenCsrf,
  esUuidValido,
  detectarIntentoInyeccionSql,
  aplicarCabecerasSeguridad,
  verificarCabecerasSeguridad,
  CABECERAS_SEGURIDAD_OFICIALES,
  CABECERAS_API_SEGURIDAD,
  proteccionWebService
} from '../../src/services/proteccionWebService.js'
