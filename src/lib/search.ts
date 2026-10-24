/**
 * Limpia el texto de búsqueda antes de usarlo en un filtro `.or()` / `ilike` de PostgREST.
 * Esos filtros se arman como texto: comas, paréntesis y comodines del usuario los romperían
 * (o permitirían inyectar condiciones extra).
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[%_*,()\\"'.:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
