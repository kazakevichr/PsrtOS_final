"use client";

// Дашборд инста-аналитики: перенос insta-hq/public/index.html на светлую
// тему Postos. Данные — /api/insta/stats, сбор — /api/insta/collect.
import { useEffect, useMemo, useState } from "react";

const BRAND_NAMES: Record<string, string> = {
  oracle: "Оракл",
  superfit: "СуперФит",
  other: "Прочее",
};

const fmt = (n: any) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU");

function sumLast(accounts: any[], field: string, days = 7) {
  const edge = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  let sum = 0;
  for (const a of accounts) {
    for (const h of a.history || []) {
      if (h.date >= edge && h[field] != null) sum += h[field];
    }
  }
  return sum;
}

function followersDelta(accounts: any[], days = 7) {
  let now = 0;
  let then = 0;
  const edge = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  for (const a of accounts) {
    const hist = (a.history || []).filter((h: any) => h.followers != null);
    if (!hist.length) continue;
    now += hist[hist.length - 1].followers;
    const old = hist.filter((h: any) => h.date <= edge);
    then += old.length ? old[old.length - 1].followers : hist[0].followers;
  }
  return { now, delta: now - then };
}

export default function InstaDashboard() {
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function loadBrands() {
    const r = await fetch("/api/insta/stats");
    const j = await r.json();
    setBrands(j.brands || []);
    // Фокус работы — СуперФит: открываем его, а не первый бренд по алфавиту
    if (!brand && j.brands?.length) {
      setBrand(j.brands.includes("superfit") ? "superfit" : j.brands[0]);
    }
  }

  async function loadBrand(b: string) {
    const r = await fetch(`/api/insta/stats?brand=${encodeURIComponent(b)}`);
    setData(await r.json());
  }

  useEffect(() => {
    loadBrands();
  }, []);
  useEffect(() => {
    if (brand) loadBrand(brand);
  }, [brand]);

  async function collectNow() {
    setBusy(true);
    setNote("Собираю статистику из Instagram…");
    try {
      const r = await fetch("/api/insta/collect", { method: "POST" });
      const s = await r.json();
      setNote(
        s.errors?.length
          ? `Собрано аккаунтов: ${s.accounts}. Ошибки: ${s.errors.join("; ")}`
          : `Собрано аккаунтов: ${s.accounts}.`
      );
      if (brand) await loadBrand(brand);
    } catch (e: any) {
      setNote(`Сбор не удался: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const accounts = data?.accounts || [];
  const f = useMemo(() => followersDelta(accounts), [accounts]);
  const updatedAt = accounts.length
    ? new Date(
        Math.max(...accounts.map((a: any) => +new Date(a.updatedAt)))
      ).toLocaleString("ru-RU")
    : "ещё не собиралось";

  // Лента: все посты бренда одним списком, свежие сверху, сгруппированы по дням
  const feed = useMemo(() => {
    const posts = accounts.flatMap((a: any) =>
      (a.media || []).map((m: any) => ({ ...m, username: a.profile?.username, source: a.source }))
    );
    posts.sort((a: any, b: any) =>
      (b.timestamp || "").localeCompare(a.timestamp || "")
    );
    const maxViews = Math.max(1, ...posts.map((p: any) => p.views || 0));
    const byDay: Record<string, any[]> = {};
    for (const p of posts.slice(0, 120)) {
      const day = (p.timestamp || "").slice(0, 10);
      (byDay[day] ||= []).push({ ...p, barW: Math.round(((p.views || 0) / maxViews) * 100) });
    }
    return Object.entries(byDay);
  }, [accounts]);

  // Публикации за 7 дней с разбивкой по источнику + сумма сейвов и репостов
  const week = useMemo(() => {
    const edge = new Date(Date.now() - 7 * 864e5).toISOString();
    const posts = accounts
      .flatMap((a: any) => (a.media || []).map((m: any) => ({ ...m, source: a.source })))
      .filter((m: any) => (m.timestamp || "") >= edge);
    const sum = (f: string) => posts.reduce((s: number, m: any) => s + (m[f] || 0), 0);
    return {
      posts: posts.length,
      factory: posts.filter((m: any) => m.source === "factory").length,
      manual: posts.filter((m: any) => m.source === "manual").length,
      saved: sum("saved"),
      shares: sum("shares"),
    };
  }, [accounts]);

  // Статус контент-завода: когда был последний заводской пост
  const factoryStatus = useMemo(() => {
    const last = accounts
      .filter((a: any) => a.source === "factory")
      .flatMap((a: any) => a.media || [])
      .map((m: any) => m.timestamp)
      .sort()
      .at(-1);
    if (!last) return { text: "постов ещё нет", ok: false };
    const hours = Math.round((Date.now() - +new Date(last)) / 36e5);
    const when = hours < 1 ? "меньше часа назад" : hours < 24 ? `${hours} ч назад` : `${Math.round(hours / 24)} дн назад`;
    return { text: `последний пост ${when}`, ok: hours <= 36 };
  }, [accounts]);

  const tiles = [
    {
      label: "Подписчики",
      value: fmt(f.now),
      sub: f.delta === 0 ? "без изменений за 7 дней" : `${f.delta > 0 ? "↑ +" : "↓ "}${fmt(f.delta)} за 7 дней`,
      subClass: f.delta > 0 ? "text-green-600" : f.delta < 0 ? "text-red-600" : "text-gray-500",
    },
    { label: "Просмотры за 7 дней", value: fmt(sumLast(accounts, "views")), sub: "", subClass: "" },
    { label: "Охват за 7 дней", value: fmt(sumLast(accounts, "reach")), sub: "", subClass: "" },
    {
      label: "Постов за 7 дней",
      value: fmt(week.posts),
      sub: `завод ${week.factory} · вручную ${week.manual}`,
      subClass: "text-gray-500",
    },
    { label: "Сейвы за 7 дней", value: fmt(week.saved), sub: "по постам недели", subClass: "text-gray-500" },
    { label: "Репосты за 7 дней", value: fmt(week.shares), sub: "по постам недели", subClass: "text-gray-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold mb-1">Инстаграм</h1>
          <p className="text-sm text-gray-500">Статистика аккаунтов · обновлено {updatedAt}</p>
        </div>
        <button className="btn btn-primary" onClick={collectNow} disabled={busy}>
          {busy ? "Собираю…" : "Собрать сейчас"}
        </button>
      </div>
      {note && <p className="text-sm text-gray-500">{note}</p>}

      <div className="flex gap-2">
        {brands.map((b) => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              b === brand ? "bg-brand-600 text-white" : "bg-white border hover:bg-gray-50"
            }`}
          >
            {BRAND_NAMES[b] || b}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className="text-sm text-gray-500">{t.label}</div>
            <div className="text-2xl font-bold mt-1">{t.value}</div>
            {t.sub && <div className={`text-sm mt-1 ${t.subClass}`}>{t.sub}</div>}
          </div>
        ))}
      </div>

      {accounts.some((a: any) => a.source === "factory") && (
        <div
          className={`card flex items-center gap-3 text-sm ${
            factoryStatus.ok ? "" : "border-yellow-400 bg-yellow-50"
          }`}
        >
          <span className="text-lg">🏭</span>
          <div>
            <span className="font-semibold">Контент-завод: </span>
            {factoryStatus.text}
            {", за 7 дней — "}{week.factory}{" "}
            {week.factory === 1 ? "пост" : week.factory < 5 ? "поста" : "постов"}
            {!factoryStatus.ok && " — похоже, завод молчит, стоит проверить"}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((a: any) => (
          <div key={a.profile?.igId} className="card flex items-center gap-3">
            {a.profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.profile.avatar} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100" />
            )}
            <div>
              <a
                href={`https://instagram.com/${a.profile?.username}`}
                target="_blank"
                className="font-semibold text-brand-700"
              >
                @{a.profile?.username}
              </a>
              <div className="text-sm text-gray-500">
                {fmt(a.profile?.followers)} подписчиков ·{" "}
                {a.source === "factory" ? "🏭 завод" : "✋ вручную"}
              </div>
            </div>
          </div>
        ))}
        {!accounts.length && (
          <div className="card text-sm text-gray-500">
            Пока пусто. Нажмите «Собрать сейчас» — я схожу в Instagram и заполню статистику.
          </div>
        )}
      </div>

      {feed.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Публикации</h2>
          <div className="space-y-4">
            {feed.map(([day, posts]) => (
              <div key={day}>
                <div className="text-xs uppercase text-gray-400 mb-2">
                  {new Date(day + "T00:00:00").toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })}
                </div>
                <div className="space-y-2">
                  {posts.map((p: any) => (
                    <a
                      key={p.id}
                      href={p.permalink}
                      target="_blank"
                      className="grid grid-cols-[56px_1fr] sm:grid-cols-[56px_1fr_auto] gap-3 items-start rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 p-2 -m-2 transition-colors"
                    >
                      {/* Превью: обложка поста; протухший CDN-урл просто скрываем */}
                      {p.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnail}
                          alt=""
                          loading="lazy"
                          className="w-14 h-20 object-cover rounded-md bg-gray-100"
                          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                        />
                      ) : (
                        <div className="w-14 h-20 rounded-md bg-gray-100 flex items-center justify-center text-gray-300 text-xl">▶</div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs text-gray-400 mb-0.5">
                          @{p.username}
                          <span className="ml-2">{p.source === "factory" ? "🏭 завод" : "✋ вручную"}</span>
                          <span className="badge-green ml-2">{p.type}</span>
                        </div>
                        <div className="text-sm line-clamp-2">{p.caption || "(без подписи)"}</div>
                        <div className="h-1.5 bg-gray-100 rounded mt-1.5 max-w-xl">
                          <div className="h-1.5 bg-brand-600 rounded" style={{ width: `${p.barW}%` }} />
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 sm:text-right whitespace-nowrap leading-6 col-start-2 sm:col-start-3">
                        <div><b className="text-gray-900">{fmt(p.views)}</b> просмотров · охват {fmt(p.reach)}</div>
                        <div>♥ {fmt(p.likes)} · 💬 {fmt(p.comments)} · 🔖 {fmt(p.saved)} · ↗ {fmt(p.shares)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
