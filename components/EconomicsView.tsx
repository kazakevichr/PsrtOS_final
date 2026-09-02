"use client";

// Экран бухгалтерии. Метод кассовый: наверху то, что пришло, ниже то, что
// ушло и когда. Каждая строка расхода подписана источником — чтобы на вопрос
// «почему столько» отвечал сам экран, а не переписка.
import { useCallback, useEffect, useState } from "react";

const CAT_COLOR: Record<string, string> = {
  salary: "#2952e3",
  ai: "#0f9b8e",
  recurring: "#7c5cd6",
  ads: "#d97706",
  other: "#94a3b8",
};

const fmt = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

const monthKey = (back: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 7);
};

// «сентябрь 2026» — без хвостового «г.», иначе css-capitalize делает «Г.»
const monthName = (ym: string) =>
  new Date(ym + "-01T00:00:00")
    .toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
    .replace(/\s*г\.$/, "");

const monthTitle = (ym: string) => {
  const s = monthName(ym);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function EconomicsView() {
  const [back, setBack] = useState(0);
  const [proj, setProj] = useState("");
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sync, setSync] = useState<any[] | null>(null);

  const month = monthKey(back);

  const load = useCallback(() => {
    const q = proj ? `&project=${proj}` : "";
    fetch(`/api/economics?month=${month}${q}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setErr("Не получилось загрузить месяц"));
  }, [month, proj]);

  useEffect(() => {
    setD(null);
    load();
  }, [load]);

  const send = async (url: string, method: string, body: any) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "Не сохранилось");
        return false;
      }
      load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <p className="text-sm text-gray-400">Загружаю…</p>;

  const costs = d.costs.rows.filter((r: any) => r.amount > 0);
  const total = d.costs.total || 1;
  const projects: any[] = d.projects || [];
  const current = projects.find((p) => p.id === proj);

  return (
    <div className="space-y-4">
      {err && <div className="card border-red-200 bg-red-50 text-sm text-red-700">{err}</div>}

      {sync && (
        <div className="card text-sm">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <b>Поступления обновлены</b>
            <button className="text-xs text-gray-400 hover:text-gray-700" onClick={() => setSync(null)}>
              скрыть
            </button>
          </div>
          {sync.length === 0 ? (
            <p className="text-gray-500">
              Ни у одного направления не указан источник. Настройки → проект → откуда берём доход.
            </p>
          ) : (
            <ul className="space-y-1">
              {sync.map((r: any) => (
                <li key={r.project} className={r.error ? "text-red-700" : "text-gray-600"}>
                  <b className="text-gray-900">{r.project}</b>{" "}
                  {r.error
                    ? `— источник не ответил: ${r.error}`
                    : r.added
                      ? `— новых платежей: ${r.added}${r.known ? `, уже было ${r.known}` : ""}`
                      : `— ничего нового${r.known ? `, всего ${r.known}` : ""}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Итог месяца */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Бухгалтерия</h1>
            <p className="text-sm text-gray-500">
              {monthTitle(d.month)} · курс {d.fx.toLocaleString("ru-RU")} ₽/$
              {current ? ` · ${current.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary text-xs" onClick={() => setBack(back + 1)}>←</button>
            <button className="btn btn-secondary text-xs" disabled={back === 0} onClick={() => setBack(back - 1)}>→</button>
            <FxInput fx={d.fx} busy={busy} onSave={(fx) => send("/api/economics", "POST", { fx })} />
            <button
              className="btn btn-secondary text-xs"
              disabled={busy}
              title="Спросить у Суперфита и Оракла, что пришло за месяц"
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  const r = await fetch("/api/economics/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ month: d.month }),
                  });
                  const j = await r.json();
                  if (!r.ok) setErr(j.error || "Не получилось обновить");
                  else {
                    setSync(j.results);
                    load();
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "…" : "Обновить поступления"}
            </button>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            <Tab on={!proj} onClick={() => setProj("")}>Все направления</Tab>
            {projects.map((p) => (
              <Tab key={p.id} on={proj === p.id} onClick={() => setProj(p.id)}>
                {p.name}
              </Tab>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <Kpi label="Оборот" value={fmt(d.income.turnover)} hint={`партнёрам ушло ${fmt(d.income.partnerShare)}`} />
          <Kpi
            label="Доход компании"
            value={fmt(d.income.total)}
            hint={d.income.other ? `в том числе ${fmt(d.income.other)} прочих` : "продажи партнёров"}
          />
          <Kpi label="Расходы" value={fmt(d.costs.total)} hint={`зарплаты выплачено ${fmt(d.costs.salaryPaid)}`} />
          <Kpi
            label={d.scoped ? "Вклад направления" : "Прибыль"}
            value={fmt(d.profit)}
            hint={
              d.scoped
                ? "до общих расходов — сервер и завод общие"
                : d.margin == null
                  ? "дохода за месяц нет"
                  : `рентабельность ${d.margin.toLocaleString("ru-RU")} %`
            }
            tone={d.profit >= 0 ? "good" : "bad"}
          />
        </div>
      </div>

      {/* Сводка по направлениям */}
      {!proj && d.split && d.split.rows.length > 0 && (
        <div className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="font-semibold">По направлениям</h2>
            <span className="text-xs text-gray-400">
              вклад — это доход минус свои расходы, до общих
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className="text-left font-medium pb-2">Направление</th>
                <th className="text-right font-medium pb-2">Доход</th>
                <th className="text-right font-medium pb-2">Свои расходы</th>
                <th className="text-right font-medium pb-2">Вклад</th>
                <th className="text-right font-medium pb-2">Рентабельность</th>
              </tr>
            </thead>
            <tbody>
              {d.split.rows.map((r: any) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <button className="text-brand-700 hover:underline" onClick={() => setProj(r.id)}>
                      {r.name}
                    </button>
                  </td>
                  <td className="py-2 text-right tabular-nums">{fmt(r.income)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{fmt(r.direct)}</td>
                  <td className={`py-2 text-right tabular-nums ${r.contribution < 0 ? "text-red-700" : ""}`}>
                    {fmt(r.contribution)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500">
                    {r.margin == null ? "—" : `${r.margin.toLocaleString("ru-RU")} %`}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-100 text-gray-500">
                <td className="py-2">
                  Общие
                  <span className="text-xs text-gray-400 ml-2">сервер, завод, зарплата без направления</span>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {d.split.shared.income ? fmt(d.split.shared.income) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">{fmt(d.split.shared.direct)}</td>
                <td className="py-2 text-right tabular-nums">
                  {fmt(d.split.shared.income - d.split.shared.direct)}
                </td>
                <td className="py-2 text-right">—</td>
              </tr>
              <tr className="border-t border-gray-300 font-semibold">
                <td className="py-2">Итого</td>
                <td className="py-2 text-right tabular-nums">{fmt(d.income.total)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(d.costs.total)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(d.profit)}</td>
                <td className="py-2 text-right tabular-nums">
                  {d.margin == null ? "—" : `${d.margin.toLocaleString("ru-RU")} %`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Расходы */}
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Куда ушли деньги</h2>
          <span className="text-xs text-gray-400">доля партнёров сюда не входит — она вычтена до дохода</span>
        </div>

        {costs.length === 0 ? (
          <p className="text-sm text-gray-400">За этот месяц расходов не записано.</p>
        ) : (
          <>
            <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-4">
              {costs.map((r: any) => (
                <span
                  key={r.key}
                  style={{ width: `${(r.amount / total) * 100}%`, background: CAT_COLOR[r.key] }}
                  title={`${r.label}: ${fmt(r.amount)}`}
                />
              ))}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-400">
                  <th className="text-left font-medium pb-2">Статья</th>
                  <th className="text-left font-medium pb-2">Откуда цифра</th>
                  <th className="text-right font-medium pb-2">Сумма</th>
                  <th className="text-right font-medium pb-2">Доля</th>
                </tr>
              </thead>
              <tbody>
                {d.costs.rows.map((r: any) => (
                  <tr key={r.key} className="border-t border-gray-100">
                    <td className="py-2">
                      <span
                        className="inline-block w-2 h-2 rounded-sm mr-2 align-middle"
                        style={{ background: CAT_COLOR[r.key] }}
                      />
                      {r.label}
                    </td>
                    <td className="py-2 text-gray-500">
                      <span className={`badge-${r.manual ? "yellow" : "green"} mr-2`}>
                        {r.manual ? "ввод" : "считается"}
                      </span>
                      {r.source}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt(r.amount)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">
                      {Math.round((r.amount / total) * 100)} %
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-300 font-semibold">
                  <td className="py-2">Итого</td>
                  <td />
                  <td className="py-2 text-right tabular-nums">{fmt(d.costs.total)}</td>
                  <td className="py-2 text-right">100 %</td>
                </tr>
              </tbody>
            </table>
            {d.costs.salaryAccrued !== d.costs.salaryPaid && (
              <p className="text-xs text-gray-500 mt-3">
                За {monthName(d.month)} начислено зарплаты {fmt(d.costs.salaryAccrued)} — в расходы попадает
                выплаченное, начисление ждёт отметки о выплате на вкладке «Зарплата».
              </p>
            )}
          </>
        )}
      </div>

      {/* Метрики */}
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Эффективность</h2>
          <span className="text-xs text-gray-400">за {monthName(d.month)}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Unit
            label="Себестоимость ролика"
            value={d.units.videoCost == null ? null : fmt(d.units.videoCost)}
            form={
              d.units.videoCost == null
                ? "завод не выпускал роликов со сметой"
                : `$${d.units.jobsUsd} по смете ÷ ${d.units.videos} шт.`
            }
          />
          <Unit
            label="Привлечение партнёра"
            value={d.units.partnerCac == null ? null : fmt(d.units.partnerCac)}
            form={
              d.units.partnerCac == null
                ? "в этом месяце никто не подключился"
                : `(${fmt(d.units.ads)} реклама + ${fmt(d.units.kpiForNew)} KPI) ÷ ${d.units.newPartners}`
            }
          />
          <Unit
            label="Окупаемость партнёра"
            value={d.units.payback == null ? null : `${d.units.payback.toLocaleString("ru-RU")} мес`}
            form={d.units.payback == null ? "нужны и новые партнёры, и продажи" : "вложено ÷ доход с партнёра в месяц"}
          />
          <Unit
            label="Привлечение покупателя"
            value={null}
            form="продажи с лендинга в Постос не приходят"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Recurring rows={d.recurring} month={d.month} busy={busy} send={send} projects={projects} proj={proj} />
        <Journal rows={d.ledger} month={d.month} busy={busy} send={send} projects={projects} proj={proj} />
      </div>
    </div>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: any }) {
  return (
    <button
      className={`btn text-xs ${on ? "btn-primary" : "btn-secondary"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
  const color = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-gray-400">{hint}</div>
    </div>
  );
}

function Unit({ label, value, form }: { label: string; value: string | null; form: string }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={value ? "text-xl font-bold tabular-nums" : "text-base font-semibold text-gray-400"}>
        {value ?? "нет данных"}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{form}</div>
    </div>
  );
}

function FxInput({ fx, busy, onSave }: { fx: number; busy: boolean; onSave: (fx: number) => void }) {
  const [v, setV] = useState(String(fx));
  useEffect(() => setV(String(fx)), [fx]);
  return (
    <div className="flex items-center gap-1">
      <input
        className="input w-20 text-xs"
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-label="Курс доллара"
      />
      <button
        className="btn btn-secondary text-xs"
        disabled={busy || v === String(fx)}
        onClick={() => onSave(Number(v.replace(",", ".")))}
      >
        курс
      </button>
    </div>
  );
}

function Recurring({ rows, month, busy, send, projects, proj }: any) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", amount: "", currency: "RUB", projectId: proj || "" });
  const sum = rows.reduce((s: number, r: any) => s + (r.currency === "USD" ? 0 : r.amount), 0);

  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold">Постоянные расходы</h2>
        <button className="btn btn-secondary text-xs" onClick={() => setOpen(!open)}>
          {open ? "свернуть" : "добавить"}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Пусто. Заведи сервер, домены и подписки — дальше они подставляются сами.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="py-2">
                  {r.title}
                  <span className="text-xs text-gray-400 ml-2">{r.project || "общий"}</span>
                </td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">
                  {r.currency === "USD" ? `$${r.amount}` : fmt(r.amount)}
                </td>
                <td className="py-2 pl-3 text-right">
                  <button
                    className="text-xs text-gray-400 hover:text-red-600"
                    disabled={busy}
                    onClick={() => send("/api/economics/recurring", "PATCH", { id: r.id, toMonth: month })}
                    title="Больше не платим — закрыть этим месяцем"
                  >
                    закрыть
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="py-2">В месяц</td>
              <td className="py-2 text-right tabular-nums">{fmt(sum)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-dashed">
          <input
            className="input flex-1 min-w-[140px]"
            placeholder="За что платим"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
          <input
            className="input w-24"
            placeholder="Сумма"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
          <select
            className="input w-20"
            value={f.currency}
            onChange={(e) => setF({ ...f, currency: e.target.value })}
          >
            <option value="RUB">₽</option>
            <option value="USD">$</option>
          </select>
          <select
            className="input w-32"
            value={f.projectId}
            onChange={(e) => setF({ ...f, projectId: e.target.value })}
          >
            <option value="">общий</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              const ok = await send("/api/economics/recurring", "POST", {
                ...f,
                amount: Number(f.amount.replace(",", ".")),
                fromMonth: month,
              });
              if (ok) setF({ title: "", amount: "", currency: "RUB", projectId: proj || "" });
            }}
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  );
}

function Journal({ rows, month, busy, send, projects, proj }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const inMonth = month === today.slice(0, 7);
  const [f, setF] = useState({
    kind: "out",
    category: "реклама",
    title: "",
    amount: "",
    currency: "RUB",
    date: inMonth ? today : `${month}-01`,
    projectId: proj || "",
  });

  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold">Журнал денег</h2>
        <span className="text-xs text-gray-400">разовые приходы и траты</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">За этот месяц записей нет.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="py-2 text-gray-400 whitespace-nowrap">{r.date.slice(8)}.{r.date.slice(5, 7)}</td>
                <td className="py-2">
                  {r.title}
                  <span className="text-xs text-gray-400 ml-2">
                    {r.category}{r.project ? ` · ${r.project}` : ""}
                    {r.source !== "руками" ? " · сам" : ""}
                  </span>
                </td>
                <td className={`py-2 text-right tabular-nums whitespace-nowrap ${r.kind === "in" ? "text-green-700" : ""}`}>
                  {r.kind === "in" ? "+" : "−"}
                  {r.currency === "USD" ? `$${r.amount}` : fmt(r.amount)}
                </td>
                <td className="py-2 pl-3 text-right">
                  {r.source === "руками" ? (
                    <button
                      className="text-xs text-gray-400 hover:text-red-600"
                      disabled={busy}
                      onClick={() => send(`/api/economics/ledger?id=${r.id}`, "DELETE", {})}
                    >
                      удалить
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300" title="Пришло из источника — правится там">
                      из источника
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-dashed">
        <select className="input w-24" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="out">Трата</option>
          <option value="in">Приход</option>
        </select>
        <input
          className="input w-32"
          type="date"
          value={f.date}
          onChange={(e) => setF({ ...f, date: e.target.value })}
        />
        <input
          className="input flex-1 min-w-[140px]"
          placeholder="За что"
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
        />
        <select
          className="input w-28"
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
        >
          <option value="реклама">реклама</option>
          <option value="сервис">сервис</option>
          <option value="продажи">продажи</option>
          <option value="прочее">прочее</option>
        </select>
        <input
          className="input w-24"
          placeholder="Сумма"
          value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })}
        />
        <select className="input w-16" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
          <option value="RUB">₽</option>
          <option value="USD">$</option>
        </select>
        <select
          className="input w-32"
          value={f.projectId}
          onChange={(e) => setF({ ...f, projectId: e.target.value })}
        >
          <option value="">общий</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            const ok = await send("/api/economics/ledger", "POST", {
              ...f,
              amount: Number(f.amount.replace(",", ".")),
            });
            if (ok) setF({ ...f, title: "", amount: "" });
          }}
        >
          Записать
        </button>
      </div>
    </div>
  );
}
