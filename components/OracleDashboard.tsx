"use client";

// Дашборд контент-завода Оракла: шесть языковых YouTube-каналов и TikTok.
// Данные — /api/oracle/stats, сбор — /api/oracle/collect.
import { useEffect, useMemo, useState } from "react";

const LANG_NAMES: Record<string, string> = {
  ru: "🇷🇺 Россия",
  en: "🇺🇸 США",
  "en-in": "🇮🇳 Индия",
  es: "🇪🇸 Испания",
  pt: "🇧🇷 Бразилия",
  tr: "🇹🇷 Турция",
};

const fmt = (n: any) => (n == null ? "—" : Number(n).toLocaleString("ru-RU"));

export default function OracleDashboard() {
  const [channels, setChannels] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    const r = await fetch("/api/oracle/stats");
    const j = await r.json();
    setChannels(j.channels || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function collectNow() {
    setBusy(true);
    setNote("Собираю статистику YouTube и TikTok…");
    try {
      const r = await fetch("/api/oracle/collect", { method: "POST" });
      const s = await r.json();
      setNote(
        s.errors?.length
          ? `Собрано каналов: ${s.channels}. Ошибки: ${s.errors.join("; ")}`
          : `Собрано каналов: ${s.channels}.`
      );
      await load();
    } catch (e: any) {
      setNote(`Сбор не удался: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const yt = channels.filter((c) => c.platform === "yt");
  const tiktok = channels.filter((c) => c.platform === "tiktok");

  // Прирост просмотров YouTube за 7 дней считаем по своим дневным срезам
  // суммарных просмотров каналов — сам YouTube отдаёт только кумулятив.
  const weekViews = useMemo(() => {
    const edge = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    let delta = 0;
    for (const c of yt) {
      const hist = (c.history || []).filter((h: any) => h.views != null);
      if (hist.length < 2) continue;
      const old = hist.filter((h: any) => h.date <= edge);
      const base = old.length ? old[old.length - 1].views : hist[0].views;
      delta += hist[hist.length - 1].views - base;
    }
    return delta;
  }, [yt]);

  const videos7 = useMemo(() => {
    const edge = new Date(Date.now() - 7 * 864e5).toISOString();
    return yt.flatMap((c: any) => c.media || []).filter((m: any) => (m.timestamp || "") >= edge).length;
  }, [yt]);

  const tk = useMemo(() => {
    const last = (c: any) => (c.history || [])[c.history.length - 1] || {};
    return {
      followers: tiktok.reduce((s: number, c: any) => s + (last(c).followers || 0), 0),
      views: tiktok.reduce((s: number, c: any) => s + (last(c).views || 0), 0),
      likes: tiktok.reduce((s: number, c: any) => s + (last(c).likes || 0), 0),
    };
  }, [tiktok]);

  const tiles = [
    { label: "Подписчики YouTube", value: fmt(yt.reduce((s, c) => s + (c.profile?.followers || 0), 0)), sub: `${yt.length} каналов` },
    { label: "Просмотры YouTube всего", value: fmt(yt.reduce((s, c) => s + (c.profile?.totalViews || 0), 0)), sub: weekViews > 0 ? `+${fmt(weekViews)} за 7 дней` : "" },
    { label: "Роликов за 7 дней", value: fmt(videos7), sub: "по всем каналам" },
    { label: "TikTok просмотры", value: fmt(tk.views), sub: "за 30 дней" },
    { label: "TikTok лайки", value: fmt(tk.likes), sub: "за 30 дней" },
  ];

  const feed = useMemo(() => {
    const posts = yt.flatMap((c: any) =>
      (c.media || []).map((m: any) => ({ ...m, lang: c.key, channel: c.profile?.title }))
    );
    posts.sort((a: any, b: any) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    const maxViews = Math.max(1, ...posts.map((p: any) => p.views || 0));
    const byDay: Record<string, any[]> = {};
    for (const p of posts.slice(0, 120)) {
      const day = (p.timestamp || "").slice(0, 10);
      (byDay[day] ||= []).push({ ...p, barW: Math.round(((p.views || 0) / maxViews) * 100) });
    }
    return Object.entries(byDay);
  }, [yt]);

  const updatedAt = channels.length
    ? new Date(Math.max(...channels.map((c: any) => +new Date(c.updatedAt)))).toLocaleString("ru-RU")
    : "ещё не собиралось";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold mb-1">Оракл · контент-завод</h1>
          <p className="text-sm text-gray-500">YouTube и TikTok · обновлено {updatedAt}</p>
        </div>
        <button className="btn btn-primary" onClick={collectNow} disabled={busy}>
          {busy ? "Собираю…" : "Собрать сейчас"}
        </button>
      </div>
      {note && <p className="text-sm text-gray-500">{note}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className="text-sm text-gray-500">{t.label}</div>
            <div className="text-2xl font-bold mt-1">{t.value}</div>
            {t.sub && <div className="text-sm mt-1 text-gray-500">{t.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map((c: any) => (
          <div key={`${c.platform}-${c.key}`} className="card flex items-center gap-3">
            {c.profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.profile.avatar} alt="" className="w-10 h-10 rounded-full bg-gray-100" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                {c.platform === "yt" ? "📺" : "🎵"}
              </div>
            )}
            <div className="min-w-0">
              <a href={c.profile?.url} target="_blank" className="font-semibold text-brand-700 block truncate">
                {c.profile?.title || c.key}
              </a>
              <div className="text-sm text-gray-500">
                {c.platform === "yt" ? (LANG_NAMES[c.key] || c.key) : "TikTok"} ·{" "}
                {fmt(c.profile?.followers)} подписчиков
                {c.platform === "yt" && <> · {fmt(c.profile?.totalViews)} просмотров</>}
              </div>
            </div>
          </div>
        ))}
        {!channels.length && (
          <div className="card text-sm text-gray-500">
            Пока пусто. Нажмите «Собрать сейчас» — я схожу в YouTube и TikTok и заполню статистику.
          </div>
        )}
      </div>

      {feed.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Ролики YouTube</h2>
          <div className="space-y-4">
            {feed.map(([day, posts]) => (
              <div key={day}>
                <div className="text-xs uppercase text-gray-400 mb-2">
                  {new Date(day + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </div>
                <div className="space-y-2">
                  {posts.map((p: any) => (
                    <a
                      key={p.id}
                      href={p.permalink}
                      target="_blank"
                      className="grid grid-cols-[56px_1fr] sm:grid-cols-[56px_1fr_auto] gap-3 items-start rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 p-2 -m-2 transition-colors"
                    >
                      {p.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnail} alt="" loading="lazy"
                          className="w-14 h-20 object-cover rounded-md bg-gray-100" />
                      ) : (
                        <div className="w-14 h-20 rounded-md bg-gray-100 flex items-center justify-center text-gray-300 text-xl">▶</div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs text-gray-400 mb-0.5">
                          {LANG_NAMES[p.lang] || p.lang} · {p.channel}
                        </div>
                        <div className="text-sm line-clamp-2">{p.title || "(без названия)"}</div>
                        <div className="h-1.5 bg-gray-100 rounded mt-1.5 max-w-xl">
                          <div className="h-1.5 bg-brand-600 rounded" style={{ width: `${p.barW}%` }} />
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 sm:text-right whitespace-nowrap leading-6 col-start-2 sm:col-start-3">
                        <div><b className="text-gray-900">{fmt(p.views)}</b> просмотров</div>
                        <div>♥ {fmt(p.likes)} · 💬 {fmt(p.comments)}</div>
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
