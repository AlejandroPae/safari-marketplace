/**
 * Cuerpo de `POST /abusive_reports/reject`. `model_id` es el id del
 * objeto reportado (la reseña), no el de un reporte. `model_type` es
 * opcional: hoy el admin no lo manda y vale `Review`.
 */
export class RejectReportDto {
  model_id?: unknown;
  model_type?: unknown;
}
