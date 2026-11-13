/** Host half of dsh-reports-panel.
 *
 * Browser-only плагин: клиентская часть читает папку «Отчёты» через Remote
 * `workspaceFiles` и рисует ленту в левой панели. Хосту нужна только строка
 * в Loader — сервисов и конфигурации нет.
 */

/** Loader display name. */
export const name = 'reports-panel'

/** No host service or configuration is required. */
export function apply() {}
