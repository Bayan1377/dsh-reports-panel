/* Reports panel — левая панель «Отчёты».
 *
 * Читает папку «Отчёты» рабочей папки сессии через Remote `workspaceFiles`
 * и показывает список карточек отчётов. Клик по карточке раскрывает текст
 * отчёта прямо под этой карточкой, повторный клик — сворачивает и оставляет
 * только карточки. Открытым может быть один отчёт; текст кешируется, чтобы
 * повторное раскрытие не ходило в диск.
 *
 * Как и automation-log, панель defensive: отсутствие слота, сессии или Remote
 * не должно валить загрузку клиента.
 */
window.__ModuleLoader__.load({
	id: "dsh-reports-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");

		const PANEL_ID = "reports";
		const FOLDER = "Отчёты";
		const LABEL = "Отчёты";
		const SUBTITLE = "Отчёты по обработанным файлам. Нажмите на карточку, чтобы прочитать.";
		const EMPTY = "Отчётов пока нет.";
		const EMPTY_HINT = "Появятся после обработки файлов.";
		const RETRY = "Обновить";
		const LOADING = "Загружаю…";
		const FAILED = "Не удалось прочитать отчёты.";
		const NO_SESSION = "Нет активной сессии — откройте чат и обновите.";
		const POLL_MS = 20000;

		const COLOR = {
			primary: "var(--dsw-alias-label-primary, #e6e6e6)",
			secondary: "var(--dsw-alias-label-secondary, #9aa0a6)",
			tertiary: "var(--dsw-alias-label-tertiary, #7c8288)",
			border: "var(--dsw-alias-border-l1, rgba(255,255,255,0.10))",
			hover: "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.06))",
			accent: "var(--dsw-alias-brand-primary, #4d6bfe)"
		};

		/** Подпись отчёта: имя файла без .md. */
		function titleOf(name) {
			return String(name || "").replace(/\.md$/i, "");
		}

		/** Кеш текстов: имя отчёта → уже прочитанный текст. */
		const texts = new Map();

		const store = {
			state: { phase: "loading", rows: [], open: "", text: "", loading: false, error: null },
			listeners: new Set(),
			set(next) {
				store.state = next;
				for (const listener of store.listeners) {
					try {
						listener();
					} catch (error) {
						console.warn("[reports-panel] listener failed", error);
					}
				}
			},
			subscribe(fn) {
				store.listeners.add(fn);
				return () => store.listeners.delete(fn);
			}
		};

		let inFlight = null;
		let panelContext = null;

		/** Сервис сессий: ctx.sessions либо ctx.get('sessions'). */
		function sessionsService(ctx) {
			try {
				if (ctx && ctx.sessions) return ctx.sessions;
			} catch (error) { }
			try {
				if (ctx && typeof ctx.get === "function") {
					const service = ctx.get("sessions");
					if (service) return service;
				}
			} catch (error) { }
			return null;
		}

		/** id сессии, которую держит mainView (текущая вкладка). */
		function pickSessionId(ctx) {
			const service = sessionsService(ctx);
			if (!service) return null;
			let snapshot = null;
			try {
				if (service.list && typeof service.list.getSnapshot === "function") {
					snapshot = service.list.getSnapshot();
				}
			} catch (error) { }
			if (!snapshot) {
				try {
					if (typeof service.getSnapshot === "function") snapshot = service.getSnapshot();
				} catch (error) { }
			}
			if (!snapshot) return null;
			const byId = snapshot.byId || (snapshot.sessions && snapshot.sessions.byId);
			if (!byId) return null;
			const rows = Object.values(byId);
			const main = rows.find((row) => row && row.retainedBy && row.retainedBy.mainView > 0);
			if (main && main.id) return main.id;
			return rows.length && rows[0].id ? rows[0].id : null;
		}

		/** Список markdown-файлов в папке отчётов. */
		function listFolder(ctx) {
			const sessionId = pickSessionId(ctx);
			if (!sessionId) throw new Error(NO_SESSION);
			return Promise.resolve()
				.then(() => ctx.remote.workspaceFiles.list(sessionId, FOLDER, undefined))
				.then((raw) => {
					const value = raw && raw.ok === true ? raw.value : raw;
					if (!value || !Array.isArray(value.entries)) throw new Error("список не получен");
					return value.entries
						.filter((entry) => entry && typeof entry.name === "string" && /\.md$/i.test(entry.name))
						.map((entry) => ({ name: entry.name, path: entry.path || (FOLDER + "/" + entry.name) }))
						.sort((a, b) => b.name.localeCompare(a.name));
				});
		}

		/** Клик по карточке: раскрыть отчёт под ней или свернуть открытый. */
		function toggleReport(ctx, row) {
			const current = store.state;
			if (current.open === row.name) {
				store.set({ ...current, open: "", text: "", loading: false, error: null });
				return;
			}
			const cached = texts.get(row.name);
			if (typeof cached === "string") {
				store.set({ ...current, open: row.name, text: cached, loading: false, error: null });
				return;
			}
			store.set({ ...current, open: row.name, text: "", loading: true, error: null });
			loadText(ctx, row);
		}

		/** Чтение одного отчёта (первая страница текста) с кешированием. */
		function loadText(ctx, row) {
			const sessionId = pickSessionId(ctx);
			if (!sessionId) {
				store.set({ ...store.state, open: "", text: "", loading: false, error: NO_SESSION });
				return;
			}
			Promise.resolve()
				.then(() => ctx.remote.workspaceFiles.read(sessionId, row.path, { offset: 1, limit: 160 }, undefined))
				.then((raw) => {
					const value = raw && raw.ok === true ? raw.value : raw;
					if (!value || typeof value.text !== "string") throw new Error("текст не получен");
					texts.set(row.name, value.text);
					if (store.state.open === row.name) {
						store.set({ ...store.state, text: value.text, loading: false, error: null });
					}
				})
				.catch((error) => {
					const message = "Не удалось прочитать: " + String(error && error.message || error);
					if (store.state.open === row.name) {
						store.set({ ...store.state, text: message, loading: false });
					}
				});
		}

		/** Обновить список (одно чтение на всех). */
		function refresh(ctx) {
			if (inFlight) return inFlight;
			inFlight = Promise.resolve()
				.then(() => listFolder(ctx))
				.then((rows) => {
					const current = store.state;
					const openStillExists = Boolean(current.open) && rows.some((row) => row.name === current.open);
					store.set({
						phase: "ready",
						rows,
						open: openStillExists ? current.open : "",
						text: openStillExists ? current.text : "",
						loading: openStillExists ? current.loading : false,
						error: null
					});
				})
				.catch((error) => {
					console.warn("[reports-panel] list failed", error);
					store.set({
						phase: "error",
						rows: store.state.rows,
						open: store.state.open,
						text: store.state.text,
						loading: store.state.loading,
						error: String(error && error.message || error)
					});
				})
				.finally(() => {
					inFlight = null;
				});
			return inFlight;
		}

		function useReports(ctx) {
			const [, setTick] = react.useState(0);
			react.useEffect(() => store.subscribe(() => setTick((value) => value + 1)), []);
			react.useEffect(() => {
				refresh(ctx);
				const timer = setInterval(() => refresh(ctx), POLL_MS);
				const onVisible = () => {
					if (document.visibilityState === "visible") refresh(ctx);
				};
				document.addEventListener("visibilitychange", onVisible);
				return () => {
					clearInterval(timer);
					document.removeEventListener("visibilitychange", onVisible);
				};
			}, []);
			return store.state;
		}

		const CHEVRON = { width: 12, fontSize: 10, lineHeight: "20px", color: COLOR.secondary, flex: "0 0 auto", textAlign: "center" };

		/** Карточка отчёта: заголовок-кнопка и, если открыта, текст под ней. */
		function ReportRow({ row, active, loading, text, onToggle }) {
			const [hover, setHover] = react.useState(false);
			return react.createElement("div", {
				"data-report": row.name,
				"data-open": active ? "true" : "false",
				style: {
					marginBottom: 8,
					border: "1px solid " + (hover || active ? COLOR.accent : COLOR.border),
					borderRadius: 10,
					background: hover && !active ? COLOR.hover : "transparent",
					overflow: "hidden"
				}
			}, [
				react.createElement("div", {
					key: "head",
					role: "button",
					tabIndex: 0,
					"aria-expanded": active,
					onClick: () => onToggle(row),
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onToggle(row);
						}
					},
					onMouseEnter: () => setHover(true),
					onMouseLeave: () => setHover(false),
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "10px 12px",
						textAlign: "left",
						cursor: "pointer",
						outline: "none",
						color: COLOR.primary,
						font: "inherit"
					}
				}, [
					react.createElement("span", { key: "chevron", "aria-hidden": "true", style: CHEVRON }, active ? "▾" : "▸"),
					react.createElement("span", {
						key: "title",
						style: { fontSize: 14, lineHeight: "20px", fontWeight: 550 }
					}, titleOf(row.name))
				]),
				active ? react.createElement("div", {
					key: "body",
					"data-report-body": row.name,
					style: { borderTop: "1px solid " + COLOR.border }
				}, loading ? react.createElement("div", {
					style: { padding: "12px 14px", color: COLOR.secondary, fontSize: 12 }
				}, LOADING) : react.createElement("pre", {
					style: {
						margin: 0,
						padding: "12px 16px 14px",
						color: COLOR.primary,
						font: "12px/1.55 ui-monospace, Consolas, monospace",
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						maxHeight: 480,
						overflowY: "auto"
					}
				}, text)) : null
			]);
		}

		function ReportsPanel(props) {
			const ctx = props && props.ctx ? props.ctx : panelContext;
			const state = useReports(ctx);
			return react.createElement("div", {
				style: {
					height: "100%",
					overflowY: "auto",
					boxSizing: "border-box",
					padding: "calc(var(--dsh-frame-top-clearance, 0px) + 28px) 24px 32px"
				}
			}, react.createElement("div", {
				style: { maxWidth: 820, margin: "0 auto" }
			}, [
				react.createElement("div", {
					key: "header",
					style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }
				}, [
					react.createElement("div", { key: "text" }, [
						react.createElement("h2", {
							key: "title",
							style: { margin: 0, fontSize: 20, lineHeight: "26px", fontWeight: 600, color: COLOR.primary }
						}, LABEL),
						react.createElement("div", {
							key: "sub",
							style: { marginTop: 4, fontSize: 13, lineHeight: "18px", color: COLOR.secondary }
						}, SUBTITLE)
					]),
					react.createElement("button", {
						key: "refresh",
						type: "button",
						onClick: () => refresh(ctx),
						style: {
							padding: "6px 12px", borderRadius: 8, border: "1px solid " + COLOR.border,
							background: "transparent", color: COLOR.secondary, font: "inherit", fontSize: 12, cursor: "pointer"
						}
					}, RETRY)
				]),
				state.phase === "loading" && state.rows.length === 0 ? react.createElement("div", {
					key: "loading", style: { color: COLOR.secondary, fontSize: 13 }
				}, LOADING) : null,
				state.phase === "error" ? react.createElement("div", {
					key: "error",
					style: {
						marginBottom: 12, padding: "10px 12px", borderRadius: 10,
						border: "1px solid " + COLOR.border, color: COLOR.secondary, fontSize: 12
					}
				}, FAILED + " " + (state.error || "")) : null,
				state.rows.length === 0 && state.phase !== "loading" ? react.createElement("div", {
					key: "empty",
					style: { padding: "24px 12px", color: COLOR.secondary, fontSize: 13, textAlign: "center" }
				}, [react.createElement("div", { key: "a" }, EMPTY), react.createElement("div", {
					key: "b", style: { marginTop: 4, color: COLOR.tertiary, fontSize: 12 }
				}, EMPTY_HINT)]) : null,
				react.createElement("div", { key: "rows" }, state.rows.map((row) => react.createElement(ReportRow, {
					key: row.name,
					row,
					active: state.open === row.name,
					loading: state.loading,
					text: state.open === row.name ? state.text : "",
					onToggle: (item) => toggleReport(ctx, item)
				})))
			]));
		}

		function ReportsIcon({ size }) {
			const px = typeof size === "number" && size > 0 ? size : 16;
			return react.createElement("svg", {
				width: px, height: px, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true"
			}, [
				react.createElement("path", {
					key: "a", d: "M4 1.8h5.2L13 5.6v8.6H4z", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round"
				}),
				react.createElement("path", {
					key: "b", d: "M9 1.9v4h3.9", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round"
				}),
				react.createElement("path", {
					key: "c", d: "M6 8.4h5M6 10.8h3.4", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round"
				})
			]);
		}

		function place(ctx, attempt = 0) {
			try {
				ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
					name: "sidebar.panellist",
					id: PANEL_ID,
					order: 30,
					label: () => LABEL
				}, ReportsIcon));
				ctx.slots.inject("main", () => ctx.slots.register({
					name: "main",
					key: PANEL_ID
				}, ReportsPanel));
				return true;
			} catch (error) {
				if (attempt < 20) {
					setTimeout(() => place(ctx, attempt + 1), 1000);
				} else {
					console.warn("[reports-panel] could not place the panel", error);
				}
				return false;
			}
		}

		const inject = ["slots", "remote", "remote.workspaceFiles"];

		function apply(ctx) {
			try {
				panelContext = ctx;
				refresh(ctx);
				place(ctx);
			} catch (error) {
				console.warn("[reports-panel] apply failed", error);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
