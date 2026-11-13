/**
 * Logo genérico (sin marca de empresa) para los documentos que emite la app:
 * certificados, actas, consentimientos y listas de asistencia/distribución.
 *
 * Va como data URL para que html2canvas lo rasterice sin pasar por el proxy de
 * imágenes ni depender de CORS, a diferencia de un logo servido desde Drive.
 */
// El viewBox debe cubrir el ancho real del texto: si se queda corto, el
// subtítulo se recorta al escalar el logo dentro de la celda del formato.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64">
  <g fill="none" stroke="#1b4d89" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M32 7 54 15v18c0 13-9 21-22 25-13-4-22-12-22-25V15z"/>
    <path d="M22 31l7 7 14-14"/>
  </g>
  <text x="68" y="30" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="bold" fill="#00366b" letter-spacing="0.5">SEGURIDAD</text>
  <text x="68" y="47" font-family="Arial, Helvetica, sans-serif" font-size="10.5" font-weight="bold" fill="#1b4d89" letter-spacing="0.8">Y SALUD EN EL TRABAJO</text>
</svg>`;

export const GENERIC_LOGO_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`;
