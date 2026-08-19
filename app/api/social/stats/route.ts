import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sourceFor } from "@/lib/insta";

export const dynamic = "force-dynamic";

// Все аккаунты всех платформ одной формой: платформа + проект (бренд) +
// профиль — три оси, по которым фильтрует дашборд «Соц.Сети».
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accounts: any[] = [];

  for (const r of await prisma.igAccount.findMany({ orderBy: { username: "asc" } })) {
    const p = JSON.parse(r.profile);
    accounts.push({
      id: `ig-${r.igId}`,
      platform: "instagram",
      brand: r.brand,
      username: r.username,
      title: `@${r.username}`,
      avatar: p.avatar || null,
      url: `https://instagram.com/${r.username}`,
      followers: p.followers ?? null,
      source: sourceFor(r.username),
      history: JSON.parse(r.history),
      media: JSON.parse(r.media),
      updatedAt: r.updatedAt.toISOString(),
    });
  }

  for (const r of await prisma.oracleChannel.findMany({ orderBy: [{ platform: "asc" }, { key: "asc" }] })) {
    const p = JSON.parse(r.profile);
    const history: any[] = JSON.parse(r.history);
    const media: any[] = JSON.parse(r.media);
    accounts.push({
      id: `${r.platform}-${r.key}`,
      platform: r.platform === "yt" ? "youtube" : "tiktok",
      brand: "oracle",
      username: p.handle || r.key,
      title: p.title || r.key,
      avatar: p.avatar || null,
      url: p.url || "",
      followers: p.followers ?? null,
      totalViews: p.totalViews ?? null,
      lang: r.platform === "yt" ? r.key : undefined,
      source: "factory",
      // У YouTube просмотры в history кумулятивные — дашборду нужна дневная
      // дельта, считаем её здесь, чтобы фронт работал с одной формой.
      history: history.map((h, i) => ({
        ...h,
        views: r.platform === "yt"
          ? Math.max(0, (h.views || 0) - (i > 0 ? history[i - 1].views || 0 : h.views || 0))
          : h.views,
      })),
      media: media.map((m) => ({ ...m, caption: m.caption ?? m.title ?? "" })),
      updatedAt: r.updatedAt.toISOString(),
    });
  }

  return NextResponse.json({ accounts });
}
