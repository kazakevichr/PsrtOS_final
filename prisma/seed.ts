import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("partneros2026", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@partneros.local" },
    update: {},
    create: {
      name: "Роман (Владелец)",
      email: "owner@partneros.local",
      passwordHash,
      role: "OWNER",
      fixedSalary: 0,
    },
  });

  const ivan = await prisma.user.upsert({
    where: { email: "ivan@partneros.local" },
    update: {},
    create: {
      name: "Иван",
      email: "ivan@partneros.local",
      passwordHash,
      role: "MANAGER",
      fixedSalary: 15000,
    },
  });

  const petr = await prisma.user.upsert({
    where: { email: "petr@partneros.local" },
    update: {},
    create: {
      name: "Пётр",
      email: "petr@partneros.local",
      passwordHash,
      role: "MANAGER",
      fixedSalary: 15000,
    },
  });

  const oracle = await prisma.project.create({
    data: {
      name: "Oracle",
      currency: "RUB",
      unitPrice: 7500,
      partnerCommissionPercent: 50,
      ownerProfitPercent: 50,
      kpiEnabled: true,
      kpiAmount: 5000,
      bonusEnabled: true,
      bonusPercent: 5,
      bonusThreshold: 50000,
      bonusMaxAmount: 30000,
      bonusPeriodMonths: null,
      partnerPlan: 15,
    },
  });

  const superfit = await prisma.project.create({
    data: {
      name: "SUPERFIT24",
      currency: "RUB",
      unitPrice: 1490,
      partnerCommissionPercent: 50,
      ownerProfitPercent: 100,
      kpiEnabled: true,
      kpiAmount: 1500,
      bonusEnabled: false,
    },
  });

  const velar = await prisma.project.create({
    data: {
      name: "Velar24 (VPN)",
      currency: "RUB",
      unitPrice: 250,
      partnerCommissionPercent: 50,
      ownerProfitPercent: 50,
      kpiEnabled: true,
      kpiAmount: 300,
      bonusEnabled: false,
    },
  });

  const muzlotto = await prisma.project.create({
    data: {
      name: "Музлото",
      currency: "THB",
      unitPrice: 1000,
      partnerCommissionPercent: 50,
      ownerProfitPercent: 50,
      kpiEnabled: true,
      kpiAmount: 0, // KPI задаётся по типу партнёра
      bonusEnabled: false,
    },
  });

  const blogerType = await prisma.partnerType.create({
    data: { projectId: muzlotto.id, name: "Блогер", kpiAmount: 1500 },
  });
  await prisma.partnerType.create({
    data: { projectId: muzlotto.id, name: "Сертификат", kpiAmount: 500 },
  });

  // Пример партнёров, чтобы дашборд и зарплата не были пустыми
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const oracleStrongPartner = await prisma.partner.create({
    data: {
      projectId: oracle.id,
      name: "Сильный партнёр (Oracle)",
      instagram: "@oracle_partner",
      responsibleUserId: ivan.id,
      stage: "Работает",
      status: "ACTIVE",
      firstContactDate: daysAgo(60),
      connectedDate: daysAgo(45),
      firstSaleDate: daysAgo(40),
      lastSaleDate: daysAgo(2),
      kpiPaid: true,
    },
  });
  await prisma.stageHistory.create({
    data: {
      partnerId: oracleStrongPartner.id,
      fromStage: "Настройка",
      toStage: "Работает",
      changedByUserId: ivan.id,
      changedAt: daysAgo(45),
    },
  });
  await prisma.transaction.create({
    data: {
      partnerId: oracleStrongPartner.id,
      date: daysAgo(2),
      revenueAmount: 300000,
      ownerProfitAmount: 75000,
      note: "Выручка партнёра за месяц",
      createdByUserId: owner.id,
    },
  });

  const superfitPartner = await prisma.partner.create({
    data: {
      projectId: superfit.id,
      name: "Тренер SUPERFIT",
      telegram: "@superfit_trainer",
      responsibleUserId: petr.id,
      stage: "Есть продажи",
      status: "ACTIVE",
      firstContactDate: daysAgo(20),
      connectedDate: daysAgo(10),
      firstSaleDate: daysAgo(5),
      lastSaleDate: daysAgo(5),
      kpiPaid: true,
    },
  });
  await prisma.transaction.create({
    data: {
      partnerId: superfitPartner.id,
      date: daysAgo(5),
      revenueAmount: 10000,
      ownerProfitAmount: 10000,
      createdByUserId: owner.id,
    },
  });

  const velarPartner = await prisma.partner.create({
    data: {
      projectId: velar.id,
      name: "Блогер Velar",
      instagram: "@velar_blogger",
      responsibleUserId: ivan.id,
      stage: "Первый контакт",
      status: "ACTIVE",
      firstContactDate: daysAgo(3),
    },
  });

  const muzlottoPartner = await prisma.partner.create({
    data: {
      projectId: muzlotto.id,
      partnerTypeId: blogerType.id,
      name: "Блогер Музлото",
      instagram: "@muzlotto_blogger",
      responsibleUserId: petr.id,
      stage: "Активный партнёр",
      status: "ACTIVE",
      firstContactDate: daysAgo(30),
      connectedDate: daysAgo(25),
      firstSaleDate: daysAgo(20),
      lastSaleDate: daysAgo(1),
      kpiPaid: true,
    },
  });
  await prisma.transaction.createMany({
    data: [
      {
        partnerId: muzlottoPartner.id,
        date: daysAgo(15),
        revenueAmount: 5000,
        ownerProfitAmount: 1250,
        note: "Мероприятие 1: 5 гостей x 1000 бат",
        createdByUserId: owner.id,
      },
      {
        partnerId: muzlottoPartner.id,
        date: daysAgo(1),
        revenueAmount: 8000,
        ownerProfitAmount: 2000,
        note: "Мероприятие 2: 8 гостей x 1000 бат",
        createdByUserId: owner.id,
      },
    ],
  });

  // Упущенный партнёр
  await prisma.partner.create({
    data: {
      projectId: velar.id,
      name: "Отказавшийся блогер",
      telegram: "@declined_blogger",
      responsibleUserId: ivan.id,
      stage: "Неактивный",
      status: "LOST",
      firstContactDate: daysAgo(90),
      lostReason: "Нет времени",
      lostAt: daysAgo(80),
      retryReminderDate: daysAgo(-10), // напомнить через 10 дней от сегодня
    },
  });

  // Задачи
  await prisma.task.createMany({
    data: [
      {
        assignedToUserId: ivan.id,
        partnerId: velarPartner.id,
        title: "Написать блогеру Velar, узнать про запуск рекламы",
        dueDate: daysAgo(-1),
      },
      {
        assignedToUserId: ivan.id,
        title: "Проверить активность партнёра Oracle",
        dueDate: daysAgo(0),
      },
      {
        assignedToUserId: petr.id,
        partnerId: muzlottoPartner.id,
        title: "Поздравить блогера Музлото с результатом",
        dueDate: daysAgo(-2),
      },
    ],
  });

  console.log("Seed завершён.");
  console.log("Вход: owner@partneros.local / partneros2026 (Владелец)");
  console.log("Вход: ivan@partneros.local / partneros2026 (Менеджер)");
  console.log("Вход: petr@partneros.local / partneros2026 (Менеджер)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
