# dsh-reports-panel

Панель «Отчёты» в левом сайдбаре DeepSeek Harness: файлы из папки `Отчёты` рабочей
папки сессии — под рукой, без переключения на файловый менеджер.

## Что делает

- Читает список файлов из папки `Отчёты` текущей рабочей папки сессии через Remote
  `workspaceFiles` — то есть показывает ровно то, что агент положил рядом с работой.
- Рисует ленту в левой панели, клик открывает файл.
- Есть кнопка «Обновить», состояния «Загружаю…», «Отчётов пока нет. Появятся после
  обработки файлов.» и понятные ошибки: «Нет активной сессии — откройте чат и
  обновите.», «Не удалось прочитать отчёты.».
- На хосте — только строка в Loader: ни сервисов, ни конфигурации, ни своих маршрутов.

## Установка

Нужны Node.js 20+ и `pnpm` (DSH ставит плагины через него):

```powershell
dsh plugin --profile desktop add dsh-reports-panel
```

Обновление — двумя шагами, `add` поверх стоящего пакета DSH отклонит:

```powershell
dsh plugin --profile desktop remove dsh-reports-panel
dsh plugin --profile desktop add dsh-reports-panel
```

Перезапустите DSH после установки: плагин добавляет строку в сайдбар через
`@deepseek-ai/dsh-client-ui-sidebar`.

## Настройка

Настройки нет. Папка берётся по имени `Отчёты` в рабочей папке сессии — если её нет,
панель показывает пустое состояние, а не ошибку.

## Устройство

- `lib/index.js` — хост: пустой `apply()`, нужен только для строки в Loader.
- `lib/client.js` — браузерная половина: сайдбар, чтение `workspaceFiles`, рендер.
- `cordis.patch.yml` — вставка плагина в стек слоёв профиля.

## Выключить

```powershell
dsh plugin --profile desktop remove dsh-reports-panel
```

## Лицензия

MIT.

---

English: reports feed in the DSH left sidebar — lists files from the `Отчёты` folder of
the session workspace through the `workspaceFiles` remote, with refresh and empty states.
