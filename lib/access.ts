import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Кто что видит. Единственное место, где решается доступ к направлениям, —
// чтобы правило нельзя было случайно повторить по-разному в двадцати файлах.
//
// Две оси:
//   роль    — что человек делает: владелец, менеджер партнёров, СММ, партнёр;
//   доступ  — где он это делает: список направлений в ProjectAccess.
//
// ПУСТОЙ СПИСОК У ВЛАДЕЛЬЦА = ВСЕ НАПРАВЛЕНИЯ. Иначе, заводя новый проект,
// пришлось бы не забыть выдать себе доступ — а забудется обязательно.
//
// Выбранное направление живёт в куке: сервер рисует страницы, и контекст
// должен быть известен до рендера, а не после первого запроса из браузера.

export const PROJECT_COOKIE = "postos_project";
export const ALL = "all";

export type Level = "view" | "work" | "manage";

export type Access = {
  userId: string;
  name: string;
  role: string;
  isOwner: boolean;
  /** Направления, доступные человеку. У владельца — все активные. */
  projects: { id: string; name: string }[];
  /** Выбранное направление; null означает «все сразу». */
  projectId: string | null;
  /** Может ли менять данные выбранного направления. */
  canEdit: boolean;
  /** Показывать ли переключатель «Все направления». */
  canSeeAll: boolean;
};

/** Уровень человека на конкретном направлении. */
function levelOf(rows: { projectId: string; level: string }[], isOwner: boolean, projectId: string | null): Level {
  if (isOwner) return "manage";
  if (!projectId) {
    // Сводный режим: право на правку только если оно есть везде.
    return rows.every((r) => r.level !== "view") ? "work" : "view";
  }
  const row = rows.find((r) => r.projectId === projectId);
  return (row?.level as Level) || "view";
}

/**
 * Доступ текущего пользователя. Возвращает null, если не авторизован —
 * страницы сами решают, куда отправлять.
 */
export async function currentAccess(): Promise<Access | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const isOwner = session.user.role === "OWNER";
  const rows = isOwner
    ? []
    : await prisma.projectAccess.findMany({
        where: { userId: session.user.id },
        select: { projectId: true, level: true },
      });

  const projects = await prisma.project.findMany({
    where: isOwner ? { isActive: true } : { isActive: true, id: { in: rows.map((r) => r.projectId) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // «Все направления» есть у того, кому доступно больше одного.
  const canSeeAll = projects.length > 1;

  const picked = cookies().get(PROJECT_COOKIE)?.value || "";
  let projectId: string | null;
  if (picked === ALL) {
    projectId = canSeeAll ? null : projects[0]?.id ?? null;
  } else if (picked && projects.some((p) => p.id === picked)) {
    projectId = picked;
  } else {
    // Без выбора: владелец видит всё, остальные — своё единственное.
    projectId = canSeeAll ? null : projects[0]?.id ?? null;
  }

  const level = levelOf(rows, isOwner, projectId);

  return {
    userId: session.user.id,
    name: session.user.name || "",
    role: session.user.role,
    isOwner,
    projects,
    projectId,
    canEdit: level !== "view",
    canSeeAll,
  };
}

/**
 * Условие Prisma по направлениям для таблиц с полем projectId.
 * Пусто — ограничений нет (владелец в сводном режиме).
 */
export function projectWhere(access: Access): { projectId?: string | { in: string[] } } {
  if (access.projectId) return { projectId: access.projectId };
  if (access.isOwner) return {};
  return { projectId: { in: access.projects.map((p) => p.id) } };
}

/** Те же рамки, но для таблиц, связанных с направлением через партнёра. */
export function partnerProjectWhere(access: Access) {
  const w = projectWhere(access);
  return w.projectId ? { partner: { projectId: w.projectId } } : {};
}

/** Список направлений, которые человеку можно показывать. */
export function allowedProjectIds(access: Access): string[] {
  return access.projectId ? [access.projectId] : access.projects.map((p) => p.id);
}

/**
 * Рамки для задач. Задача принадлежит направлению через партнёра; задача без
 * партнёра — через того, на кого назначена. Иначе норма СММ по СуперФиту
 * висела бы в списке Оракла и путала бы обоих.
 */
export function taskWhere(access: Access) {
  if (!access.projectId) {
    if (access.isOwner) return {};
    const ids = access.projects.map((p) => p.id);
    return {
      OR: [
        { partner: { projectId: { in: ids } } },
        { partnerId: null, assignedTo: { access: { some: { projectId: { in: ids } } } } },
      ],
    };
  }
  const projectId = access.projectId;
  return {
    OR: [
      { partner: { projectId } },
      { partnerId: null, assignedTo: { access: { some: { projectId } } } },
    ],
  };
}

/** Есть ли у человека доступ к конкретному направлению. */
export function mayTouchProject(access: Access, projectId: string): boolean {
  return access.isOwner || access.projects.some((p) => p.id === projectId);
}
