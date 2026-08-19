"use client";

// «Соц.Сети»: все платформы и проекты на одном экране. Три фильтра —
// платформа, проект, профиль — плюс период. Кнопки сбора нет: данные
// обновляет сам сервер каждые 20 минут (instrumentation.ts).
import { useEffect, useMemo, useState } from "react";

const BRAND_NAMES: Record<string, string> = {
  superfit: "СуперФит",
  party: "Вечеринки",
  oracle: "Оракл",
  other: "Прочее",
};
const PLATFORM_NAMES: Record<string, string> = {
  instagram: "📸 Инстаграм",
  youtube: "📺 Ютуб",
  tiktok: "🎵 ТикТок",
};
const LANG_NAMES: Record<string, string> = {
  ru: "🇷🇺", en: "🇺🇸", "en-in": "🇮🇳", es: "🇪🇸", pt: "🇧🇷", tr: "🇹🇷",
};

const fmt = (n: any) => (n == null ? "—" : Number(n).toLocaleString("ru-RU"));

function humanError(e: string): string {
  if (e.includes("17841435633230475") || e.toLowerCase().includes("does not exist")) {
    const id = e.split(":")[0].trim();
    return `${id === "17841435633230475" ? "superfit24_training" : id}: аккаунт отвязан от Business Manager — добавь его в портфолио заново и назначь HQ Bot`;
  }
  return e;
}

export default function SocialDashboard() {
  const [all, setAll] = useState<any[]>([]);
  const [period, setPeriod] = useState(7);
  const [platform, setPlatform] = useState("all");
  const [brand, setBrand] = useState("all");
  const [profile, setProfile] = useState("all");

  async function load() {
    const r = await fetch("/api/social/stats");
    const j = await r.json();
    setAll(j.accounts || []);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000); // подтягиваем свежие срезы фоном
    return () => clearInterval(t);
  }, []);

  // Оси фильтров строятся от данных: появится новая платформа — появится чип
  const platforms = useMemo(() => [...new Set(all.map((a) => a.platform))], [all]);
  const brands = useMemo(() => [...new Set(all.map((a) => a.brand))], [all]);
  const profileOptions = useMemo(
    () => all.filter((a) => (platform === "all" || a.platform === platform) && (brand === "all" || a.brand === brand)),
    [all, platform, brand]
  );

  const accounts = useMemo(
    () => profileOptions.filter((a) => profile === "all" || a.id === profile),
    [profileOptions, profile]
  );

  useEffect(() => {
    if (profile !== "all" && !profileOptions.some((a) => a.id === profile)) setProfile("all");
  }, [profileOptions, profile]);

  const edgeDate = new Date(Date.now() - period * 864e5).toISOString().slice(0, 10);
  const edgeIso = new Date(Date.now() - period * 864e5).toISOString();

  const followers = accounts.reduce((s, a) => s + (a.followers || 0), 0);
  const fDelta = useMemo(() => {
    let now = 0, then = 0;
    for (const a of accounts) {
      const hist = (a.history || []).filter((h: any) => h.followers != null);
      if (!hist.length) continue;
      now += hist[hist.length - 1].followers;
      const old = hist.filter((h: any) => h.date <= edgeDate);
      then += old.length ? old[old.length - 1].followers : hist[0].followers;
    }
    return now - then;
  }, [accounts, edgeDate]);

  const sumHist = (field: string) =>
    accounts.reduce((s, a) => s + (a.history || []).filter((h: any) => h.date >= edgeDate).reduce((x: number, h: any) => x + (h[field] || 0), 0), 0);

  const posts = useMemo(
    () => accounts
      .flatMap((a) => (a.media || []).map((m: any) => ({ ...m, username: a.username, source: m.source ?? a.source, platform: a.platform, lang: a.lang })))
      .filter((m) => m.timestamp)
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")),
    [accounts]
  );
  const periodPosts = posts.filter((p) => p.timestamp >= edgeIso);
  const sumPosts = (f: string) => periodPosts.reduce((s, p) => s + (p[f] || 0), 0);

  const tiles = [
    {
      label: "Подписчики", value: fmt(followers),
      sub: fDelta === 0 ? `без изменений за ${period} дн` : `${fDelta > 0 ? "↑ +" : "↓ "}${fmt(fDelta)} за ${period} дн`,
      subClass: fDelta > 0 ? "text-green-600" : fDelta < 0 ? "text-red-600" : "text-gray-500",
    },
    {
      label: `Просмотры за ${period} дн`,
      value: fmt(sumHist("views")),
      sub: sumHist("views") === 0 && sumPosts("views") > 0
        ? "дневная история копится с 19.08 — цифра появится завтра"
        : "по дневным срезам",
      subClass: "text-gray-500",
    },
    { label: `Постов за ${period} дн`, value: fmt(periodPosts.length),
      sub: `завод ${periodPosts.filter((p) => p.source === "factory").length} · вручную ${periodPosts.filter((p) => p.source !== "factory").length}`,
      subClass: "text-gray-500" },
    { label: `Лайки за ${period} дн`, value: fmt(sumPosts("likes")), sub: "по постам периода", subClass: "text-gray-500" },
    { label: `Сейвы за ${period} дн`, value: fmt(sumPosts("saved")), sub: "по постам периода", subClass: "text-gray-500" },
    { label: `Репосты за ${period} дн`, value: fmt(sumPosts("shares")), sub: "по постам периода", subClass: "text-gray-500" },
  ];

  const daily = useMemo(() => {
    const byDate: Record<string, { views: number; reach: number }> = {};
    for (const a of accounts) {
      for (const h of a.history || []) {
        if (h.date < edgeDate) continue;
        const d = (byDate[h.date] ||= { views: 0, reach: 0 });
        d.views += h.views || 0;
        d.reach += h.reach || 0;
      }
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  }, [accounts, edgeDate]);

  const factoryStatus = useMemo(() => {
    if (platform !== "all" && platform !== "instagram") return null;
    if (brand !== "all" && brand !== "superfit") return null;
    const last = posts
      .filter((p) => p.platform === "instagram" && p.source === "factory")
      .map((p) => p.timestamp).sort().at(-1);
    if (!last) return { text: "заводских постов ещё нет", ok: false };
    const hours = Math.round((Date.now() - +new Date(last)) / 36e5);
    const when = hours < 1 ? "меньше часа назад" : hours < 24 ? `${hours} ч назад` : `${Math.round(hours / 24)} дн назад`;
    return { text: `последний пост ${when}`, ok: hours <= 36 };
  }, [posts, platform, brand]);

  const maxViews = Math.max(1, ...posts.slice(0, 120).map((p) => p.views || 0));
  const byDay: [string, any[]][] = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const p of posts.slice(0, 120)) (m[(p.timestamp || "").slice(0, 10)] ||= []).push(p);
    return Object.entries(m);
  }, [posts]);

  const updatedAt = accounts.length
    ? new Date(Math.max(...accounts.map((a) => +new Date(a.updatedAt)))).toLocaleString("ru-RU")
    : "ещё не собиралось";

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm ${on ? "bg-brand-600 text-white" : "bg-white border hover:bg-gray-50"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold mb-1">Соц.Сети</h1>
        <p className="text-sm text-gray-500">
          Все платформы и проекты · обновлено {updatedAt} · данные обновляются сами каждые 20 минут
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-white border rounded-lg p-0.5">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`px-2.5 py-1 rounded-md text-sm ${d === period ? "bg-brand-600 text-white" : "hover:bg-gray-50"}`}>
              {d} дн
            </button>
          ))}
        </div>
        <button className={chip(platform === "all")} onClick={() => setPlatform("all")}>Все платформы</button>
        {platforms.map((p) => (
          <button key={p} className={chip(platform === p)} onClick={() => setPlatform(p)}>{PLATFORM_NAMES[p] || p}</button>
        ))}
        <span className="w-px h-6 bg-gray-200 mx-1" />
        <button className={chip(brand === "all")} onClick={() => setBrand("all")}>Все проекты</button>
        {brands.map((b) => (
          <button key={b} className={chip(brand === b)} onClick={() => setBrand(b)}>{BRAND_NAMES[b] || b}</button>
        ))}
        <span className="w-px h-6 bg-gray-200 mx-1" />
        <select value={profile} onChange={(e) => setProfile(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm bg-white">
          <option value="all">Все профили</option>
          {profileOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
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

      {daily.length > 1 && (
        <div className="card">
          <h2 className="font-semibold mb-1">Динамика по дням</h2>
          <p className="text-xs text-gray-400 mb-3">синее — просмотры, зелёное — охват</p>
          <div className="flex items-end gap-1 h-32">
            {daily.map(([date, d]) => {
              const max = Math.max(1, ...daily.map(([, x]) => x.views));
              return (
                <div key={date} className="flex-1 flex flex-col justify-end items-center gap-0.5 group relative min-w-0">
                  <div className="hidden group-hover:block absolute -top-10 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    {new Date(date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}:{" "}
                    {fmt(d.views)} просм{d.reach ? ` · ${fmt(d.reach)} охват` : ""}
                  </div>
                  <div className="w-full bg-brand-600 rounded-t" style={{ height: `${Math.max(2, (d.views / max) * 100)}%` }} />
                  {d.reach > 0 && <div className="w-full bg-green-500 rounded-t" style={{ height: `${Math.max(1, (d.reach / max) * 100 * 0.6)}%` }} />}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{daily[0] && new Date(daily[0][0] + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
            <span>{daily.at(-1) && new Date(daily.at(-1)![0] + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
          </div>
        </div>
      )}

      {factoryStatus && (
        <div className={`card flex items-center gap-3 text-sm ${factoryStatus.ok ? "" : "border-yellow-400 bg-yellow-50"}`}>
          <span className="text-lg">🏭</span>
          <div>
            <span className="font-semibold">Контент-завод (Инстаграм): </span>
            {factoryStatus.text}
            {!factoryStatus.ok && " — похоже, завод молчит, стоит проверить"}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((a) => (
          <div key={a.id}
            className={`card flex items-center gap-3 cursor-pointer ${profile === a.id ? "ring-2 ring-brand-500" : ""}`}
            onClick={() => setProfile(profile === a.id ? "all" : a.id)}>
            {a.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.avatar} alt="" className="w-10 h-10 rounded-full bg-gray-100" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                {a.platform === "youtube" ? "📺" : a.platform === "tiktok" ? "🎵" : "📸"}
              </div>
            )}
            <div className="min-w-0">
              <a href={a.url} target="_blank" className="font-semibold text-brand-700 block truncate" onClick={(e) => e.stopPropagation()}>
                {a.title}
              </a>
              <div className="text-sm text-gray-500 truncate">
                {PLATFORM_NAMES[a.platform] || a.platform}{a.lang ? ` ${LANG_NAMES[a.lang] || a.lang}` : ""} · {fmt(a.followers)} подп.
                {a.source === "factory" ? " · 🏭" : ""}
              </div>
            </div>
          </div>
        ))}
        {!accounts.length && (
          <div className="card text-sm text-gray-500">Пока пусто — сервер собирает данные каждые 20 минут, загляни чуть позже.</div>
        )}
      </div>

      {byDay.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Публикации</h2>
          <div className="space-y-4">
            {byDay.map(([day, list]) => (
              <div key={day}>
                <div className="text-xs uppercase text-gray-400 mb-2">
                  {new Date(day + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </div>
                <div className="space-y-2">
                  {list.map((p: any) => (
                    <a key={p.id} href={p.permalink} target="_blank"
                      className="grid grid-cols-[56px_1fr] sm:grid-cols-[56px_1fr_auto] gap-3 items-start rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 p-2 -m-2 transition-colors">
                      {p.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnail} alt="" loading="lazy"
                          className="w-14 h-20 object-cover rounded-md bg-gray-100"
                          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                      ) : (
                        <div className="w-14 h-20 rounded-md bg-gray-100 flex items-center justify-center text-gray-300 text-xl">▶</div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs text-gray-400 mb-0.5">
                          {String(p.username || "").startsWith("@") ? p.username : `@${p.username}`}
                          <span className="ml-2">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                          <span className="ml-2">{p.source === "factory" ? "🏭 завод" : "✋ вручную"}</span>
                          {p.type && <span className="badge-green ml-2">{p.type}</span>}
                        </div>
                        <div className="text-sm line-clamp-2">{p.caption || "(без подписи)"}</div>
                        <div className="h-1.5 bg-gray-100 rounded mt-1.5 max-w-xl">
                          <div className="h-1.5 bg-brand-600 rounded"
                            style={{ width: `${Math.max(1, Math.round(((p.views || 0) / maxViews) * 100))}%` }} />
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 sm:text-right whitespace-nowrap leading-6 col-start-2 sm:col-start-3">
                        <div><b className="text-gray-900">{fmt(p.views)}</b> просмотров{p.reach != null ? ` · охват ${fmt(p.reach)}` : ""}</div>
                        <div>♥ {fmt(p.likes)} · 💬 {fmt(p.comments)}{p.saved != null ? ` · 🔖 ${fmt(p.saved)}` : ""}{p.shares != null ? ` · ↗ ${fmt(p.shares)}` : ""}</div>
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
