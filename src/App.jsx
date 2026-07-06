import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Home, Plus, Tag, Repeat, PiggyBank, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, X, Trash2, Pencil, ShoppingCart, Pill, Fuel,
  Utensils, Gamepad2, ShoppingBag, Receipt, MoreHorizontal, Heart, Plane,
  Dumbbell, Gift, Smartphone, Wifi, Car, AlertTriangle, Check, Clock,
  TrendingDown, TrendingUp, Wallet, CreditCard, Banknote, QrCode, FileText,
  Landmark, History
} from "lucide-react";
import { doc, getDoc, setDoc, onSnapshot, runTransaction } from "firebase/firestore";
import { db } from "./firebase.js";

// Documento único no Firestore onde ficam guardados todos os dados compartilhados
// (gastos, categorias, formas de pagamento, recorrentes, configurações).
const docRef = doc(db, "nossosGastos", "dados");

const ICON_COMPONENTS = {
  ShoppingCart, Pill, Fuel, Utensils, Gamepad2, ShoppingBag, Receipt, Home,
  Heart, Plane, Dumbbell, Gift, Smartphone, Wifi, Car, MoreHorizontal,
  CreditCard, Banknote, QrCode, FileText, Landmark,
};
const ICON_KEYS = Object.keys(ICON_COMPONENTS);

const COLOR_CLASSES = {
  emerald: { bg: "#d1fae5", text: "#047857", dot: "#10b981" },
  rose: { bg: "#ffe4e6", text: "#be123c", dot: "#f43f5e" },
  amber: { bg: "#fef3c7", text: "#b45309", dot: "#f59e0b" },
  blue: { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  violet: { bg: "#ede9fe", text: "#6d28d9", dot: "#8b5cf6" },
  orange: { bg: "#ffedd5", text: "#c2410c", dot: "#f97316" },
  slate: { bg: "#f1f5f9", text: "#334155", dot: "#64748b" },
  teal: { bg: "#ccfbf1", text: "#0f766e", dot: "#14b8a6" },
  fuchsia: { bg: "#fae8ff", text: "#a21caf", dot: "#d946ef" },
  sky: { bg: "#e0f2fe", text: "#0369a1", dot: "#0ea5e9" },
  gray: { bg: "#f3f4f6", text: "#374151", dot: "#6b7280" },
};
const COLOR_KEYS = Object.keys(COLOR_CLASSES);

const DEFAULT_CATEGORIES = [
  { id: "cat_super", name: "Supermercado", icon: "ShoppingCart", color: "emerald" },
  { id: "cat_farm", name: "Farmácia", icon: "Pill", color: "rose" },
  { id: "cat_comb", name: "Combustível", icon: "Fuel", color: "amber" },
  { id: "cat_alim", name: "Alimentação", icon: "Utensils", color: "orange" },
  { id: "cat_lazer", name: "Lazer", icon: "Gamepad2", color: "violet" },
  { id: "cat_compras", name: "Compras", icon: "ShoppingBag", color: "blue" },
  { id: "cat_contas", name: "Contas fixas", icon: "Receipt", color: "slate" },
  { id: "cat_outros", name: "Outros", icon: "MoreHorizontal", color: "gray" },
];

const DEFAULT_PAYMENT_METHODS = [
  { id: "pm_a", name: "Cartão A", icon: "CreditCard", color: "blue", isCard: true },
  { id: "pm_b", name: "Cartão B", icon: "CreditCard", color: "violet", isCard: true },
  { id: "pm_c", name: "Cartão C", icon: "CreditCard", color: "fuchsia", isCard: true },
  { id: "pm_pix", name: "Pix", icon: "QrCode", color: "teal", isCard: false },
  { id: "pm_cash", name: "Dinheiro vivo", icon: "Banknote", color: "emerald", isCard: false },
  { id: "pm_boleto", name: "Boleto", icon: "FileText", color: "slate", isCard: false },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDate(str) {
  return new Date(str + "T00:00:00");
}
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function formatBRL(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
}
function formatDateBR(str) {
  if (!str) return "";
  return parseDate(str).toLocaleDateString("pt-BR");
}
function defaultData() {
  return {
    categories: DEFAULT_CATEGORIES,
    paymentMethods: DEFAULT_PAYMENT_METHODS,
    expenses: [],
    recurring: [],
    settings: {
      monthlyLimit: 4000,
      weeksCount: 4,
      person1: "Você",
      person2: "Esposa",
      startDate: todayStr().slice(0, 8) + "01",
      // Dia em que o ciclo da fatura começa e termina. Os defaults (1 e 31) reproduzem
      // o comportamento de "mês calendário" (dia 31 é sempre interpretado como o último
      // dia daquele mês, então funciona certo mesmo em meses com menos dias).
      cycleStartDay: 1,
      cycleEndDay: 31,
    },
    updatedAt: Date.now(),
  };
}
function ensureShape(parsed) {
  const def = defaultData();
  const settings = { ...def.settings, ...(parsed.settings || {}) };
  // Garante que o número de semanas sempre fique dentro do intervalo válido (1 a 5), mesmo vindo de dados antigos
  settings.weeksCount = Math.min(5, Math.max(1, Number(settings.weeksCount) || 4));
  settings.cycleStartDay = Math.min(31, Math.max(1, Number(settings.cycleStartDay) || 1));
  settings.cycleEndDay = Math.min(31, Math.max(1, Number(settings.cycleEndDay) || 31));
  return {
    categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : def.categories,
    paymentMethods: Array.isArray(parsed.paymentMethods) && parsed.paymentMethods.length ? parsed.paymentMethods : def.paymentMethods,
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    recurring: Array.isArray(parsed.recurring) ? parsed.recurring : [],
    settings,
    updatedAt: parsed.updatedAt || Date.now(),
  };
}
// Gastos antigos sem forma de pagamento definida são considerados cartão (comportamento anterior do app)
function isCardMethod(methodId, paymentMethods) {
  if (!methodId) return true;
  const m = (paymentMethods || []).find((p) => p.id === methodId);
  return m ? !!m.isCard : true;
}
// Gera (se ainda não existirem) os gastos do CICLO ATUAL referentes às despesas recorrentes ativas.
// Usa o ciclo de fatura configurado (cycleStartDay/cycleEndDay), não o mês calendário —
// assim um gasto recorrente no dia 3, num ciclo 4 jul–4 ago, cai em 3 ago (dentro do ciclo).
function generateRecurringExpenses(current) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const csd = Math.min(31, Math.max(1, Number(current.settings?.cycleStartDay) || 1));
  const ced = Math.min(31, Math.max(1, Number(current.settings?.cycleEndDay) || 31));

  // Calcula o ciclo atual a partir das configurações
  const { start: cycleStart, end: cycleEnd } = getCycleForOffset(csd, ced, 0);

  let changed = false;
  const newExpenses = [...current.expenses];

  (current.recurring || []).filter((r) => r.active).forEach((r) => {
    const targetDay = Math.min(31, Math.max(1, Number(r.day) || 1));

    // Encontra todos os meses que o ciclo toca (pode ser 1 ou 2 meses) e calcula
    // em qual desses meses o targetDay cai DENTRO do ciclo E já passou (today >= targetDate)
    const monthsSeen = new Set();
    let cursor = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), 1);
    const cycleEndCursor = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth() + 1, 1);
    while (cursor < cycleEndCursor) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const key = `${y}-${m}`;
      if (!monthsSeen.has(key)) {
        monthsSeen.add(key);
        const dim = new Date(y, m + 1, 0).getDate();
        const day = Math.min(targetDay, dim);
        const targetDate = new Date(y, m, day);
        // A data de destino precisa estar dentro do ciclo (passada OU futura — mostramos
        // recorrentes futuros também, para o usuário ver o planejamento completo do ciclo)
        if (targetDate >= cycleStart && targetDate <= cycleEnd) {
          const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          // Verifica se já existe um gasto gerado para esse recorrente nesse ciclo
          const alreadyExists = newExpenses.some(
            (e) => e.recurringId === r.id &&
            parseDate(e.date) >= cycleStart && parseDate(e.date) <= cycleEnd
          );
          if (!alreadyExists) {
            newExpenses.push({
              id: genId("exp"),
              value: Number(r.value) || 0,
              description: r.description,
              date: dateStr,
              categoryId: r.categoryId,
              person: r.person || "Automático",
              paymentMethodId: r.paymentMethodId,
              recurringId: r.id,
              pending: targetDate > now, // marca como previsto se ainda não chegou
            });
            changed = true;
          }
        }
      }
      cursor = new Date(y, m + 1, 1);
    }
  });

  return { expenses: newExpenses, changed };
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}
// Conta os dias entre duas datas (ambas à meia-noite local), incluindo o dia final.
function diffDaysInclusive(start, end) {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b - a) / 86400000) + 1;
}
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Procura, a partir de uma data (exclusive), a próxima data cujo dia-do-mês seja targetDay.
// targetDay é "clampado" ao tamanho de cada mês — por isso 31 sempre cai no último dia do mês.
function nextOccurrenceOfDay(afterDateExclusive, targetDay) {
  let d = addDays(afterDateExclusive, 1);
  for (let i = 0; i < 60; i++) {
    const dim = daysInMonth(d.getFullYear(), d.getMonth());
    if (d.getDate() === Math.min(targetDay, dim)) return d;
    d = addDays(d, 1);
  }
  return afterDateExclusive;
}
// Procura, partindo de uma data (inclusive) e andando para trás, a ocorrência mais recente de targetDay.
function findStartOnOrBefore(refDate, targetDay) {
  let d = refDate;
  for (let i = 0; i < 60; i++) {
    const dim = daysInMonth(d.getFullYear(), d.getMonth());
    if (d.getDate() === Math.min(targetDay, dim)) return d;
    d = addDays(d, -1);
  }
  return refDate;
}

// Retorna o ciclo de fatura (start/end) deslocado "offset" ciclos a partir do ciclo atual
// (o que contém a data de hoje). offset=0 é o ciclo atual, -1 o anterior, +1 o próximo.
// Como o início e o fim do ciclo são dias independentes (configuráveis separadamente),
// a navegação avança sempre pela ocorrência do "dia de início", e o fim é sempre a
// próxima ocorrência do "dia de fim" depois daquele início.
function getCycleForOffset(cycleStartDay, cycleEndDay, offset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let start = findStartOnOrBefore(today, cycleStartDay);
  let end = nextOccurrenceOfDay(start, cycleEndDay);
  const dir = offset >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(offset); i++) {
    if (dir > 0) {
      start = nextOccurrenceOfDay(start, cycleStartDay);
      end = nextOccurrenceOfDay(start, cycleEndDay);
    } else {
      start = findStartOnOrBefore(addDays(start, -1), cycleStartDay);
      end = nextOccurrenceOfDay(start, cycleEndDay);
    }
  }
  return { start, end };
}

// Lista todos os ciclos de fatura desde "fromDate" até (no mínimo) "untilDate", em ordem cronológica.
function iterateCyclesFrom(fromDate, cycleStartDay, cycleEndDay, untilDate) {
  const cycles = [];
  let start = findStartOnOrBefore(fromDate, cycleStartDay);
  let end = nextOccurrenceOfDay(start, cycleEndDay);
  let guard = 0;
  while (start <= untilDate && guard < 200) {
    cycles.push({ start, end });
    if (end >= untilDate) break;
    start = nextOccurrenceOfDay(start, cycleStartDay);
    end = nextOccurrenceOfDay(start, cycleEndDay);
    guard++;
  }
  return cycles;
}

// Divide um período (ciclo de fatura) em N metas semanais.
function computeWeeksForRange(start, end, weeksCount) {
  const totalDays = diffDaysInclusive(start, end);
  if (totalDays <= 0) return [];
  const chunk = Math.ceil(totalDays / weeksCount);
  const weeks = [];
  for (let i = 0; i < weeksCount; i++) {
    const wStart = addDays(start, i * chunk);
    if (wStart > end) break;
    let wEnd = addDays(start, (i + 1) * chunk - 1);
    if (wEnd > end) wEnd = end;
    weeks.push({ index: i + 1, start: wStart, end: wEnd });
  }
  return weeks;
}

function formatCycleLabel(start, end) {
  const sameYear = start.getFullYear() === end.getFullYear();
  const s = `${start.getDate()} ${MESES_ABREV[start.getMonth()]}`;
  const e = `${end.getDate()} ${MESES_ABREV[end.getMonth()]}${sameYear ? "" : "/" + end.getFullYear()}`;
  return `${s} – ${e}`;
}
function formatWeekRange(start, end) {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) return `${start.getDate()}–${end.getDate()} ${MESES_ABREV[start.getMonth()]}`;
  return `${start.getDate()} ${MESES_ABREV[start.getMonth()]} – ${end.getDate()} ${MESES_ABREV[end.getMonth()]}`;
}

function Icon({ name, ...props }) {
  const Comp = ICON_COMPONENTS[name] || MoreHorizontal;
  return <Comp {...props} />;
}

export default function CartaoFamilia() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [activeTab, setActiveTab] = useState("inicio");
  const [cycleOffset, setCycleOffset] = useState(0); // 0 = ciclo atual, -1 = anterior, +1 = próximo
  const [expenseModal, setExpenseModal] = useState(null); // null | {} (edit obj) | 'new'
  const [categoryModal, setCategoryModal] = useState(null);
  const [paymentMethodModal, setPaymentMethodModal] = useState(null);
  const [recurringModal, setRecurringModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  const lastSyncedRef = useRef(0);

  const loadData = useCallback(async () => {
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const parsed = ensureShape(snap.data());
        lastSyncedRef.current = parsed.updatedAt;
        setData(parsed);
      } else {
        const initial = defaultData();
        await setDoc(docRef, initial);
        lastSyncedRef.current = initial.updatedAt;
        setData(initial);
      }
    } catch (e) {
      console.error("Erro ao carregar dados do Firestore:", e);
      const initial = defaultData();
      try {
        await setDoc(docRef, initial);
      } catch (_e) {}
      lastSyncedRef.current = initial.updatedAt;
      setData(initial);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sincronização em tempo real (compartilhada entre os dois usuários) — o Firestore avisa
  // automaticamente sempre que o documento mudar, sem precisar ficar checando de tempos em tempos.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) return;
        const parsed = snap.data();
        // Só aceita o dado remoto se ele for MAIS NOVO que o que já temos — nunca reverte uma alteração recente para um dado antigo
        if (parsed.updatedAt && parsed.updatedAt > lastSyncedRef.current) {
          lastSyncedRef.current = parsed.updatedAt;
          setData(ensureShape(parsed));
        }
      },
      (err) => {
        console.error("Erro na sincronização em tempo real:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Salva alterações de forma segura mesmo com dois celulares usando o app ao mesmo tempo.
  // "updater" é uma função que recebe o dado MAIS RECENTE (lido na hora do Firestore, dentro
  // de uma transação) e retorna a nova versão completa — isso garante que a gravação de uma
  // pessoa nunca apague por acidente uma mudança recente feita pela outra.
  const persist = useCallback(async (updater) => {
    // Atualização otimista: a tela responde na hora, sem esperar a confirmação da nuvem
    setData((current) => {
      if (!current) return current;
      const computed = typeof updater === "function" ? updater(current) : updater;
      return { ...computed, updatedAt: Date.now() };
    });
    try {
      setSaveError(false);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(docRef);
        const latest = snap.exists() ? ensureShape(snap.data()) : defaultData();
        const computed = typeof updater === "function" ? updater(latest) : updater;
        const withTs = { ...computed, updatedAt: Date.now() };
        tx.set(docRef, withTs);
        return withTs;
      });
      // Reconcilia a tela com o que realmente ficou confirmado no Firestore
      // (só aceita se for mais novo que o que já temos, pra nunca voltar no tempo)
      if (result.updatedAt >= lastSyncedRef.current) {
        lastSyncedRef.current = result.updatedAt;
        setData(result);
      }
    } catch (e) {
      console.error("Erro ao salvar no Firestore:", e);
      setSaveError(true);
    }
  }, []);

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Geração automática de gastos recorrentes para o ciclo atual
  useEffect(() => {
    if (!data) return;
    const { changed } = generateRecurringExpenses(data);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const hasStalePending = data.expenses.some((e) => e.pending && parseDate(e.date) <= now);
    if (!changed && !hasStalePending) return;
    persist((current) => {
      const { expenses: withNew } = generateRecurringExpenses(current);
      const now2 = new Date(); now2.setHours(0, 0, 0, 0);
      const expenses = withNew.map((e) =>
        e.pending && parseDate(e.date) <= now2 ? { ...e, pending: false } : e
      );
      return { ...current, expenses };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data.recurring, data && data.expenses && data.expenses.length, nowTick]);
  const todayZero = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTick]);

  const weeksCount = data ? data.settings.weeksCount : 4;
  const monthlyLimit = data ? Number(data.settings.monthlyLimit) || 0 : 0;
  const weeklyGoal = weeksCount ? monthlyLimit / weeksCount : 0;
  const cycleStartDay = data ? data.settings.cycleStartDay : 1;
  const cycleEndDay = data ? data.settings.cycleEndDay : 31;

  // Ciclo da fatura sendo exibido (recalcula automaticamente quando o ciclo real virar,
  // graças à dependência em nowTick — mas só "puxa" pra frente se a pessoa estiver vendo
  // o ciclo atual; se tiver navegado para outro ciclo, a navegação fica como está).
  const { start: cycleStart, end: cycleEnd } = useMemo(
    () => getCycleForOffset(cycleStartDay, cycleEndDay, cycleOffset),
    [cycleStartDay, cycleEndDay, cycleOffset, nowTick]
  );
  const isCurrentCycle = cycleOffset === 0;

  const weeksRaw = useMemo(() => computeWeeksForRange(cycleStart, cycleEnd, weeksCount), [cycleStart, cycleEnd, weeksCount]);

  const monthExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses
      .filter((e) => {
        const d = parseDate(e.date);
        return d >= cycleStart && d <= cycleEnd;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data, cycleStart, cycleEnd]);

  const monthCardExpenses = useMemo(
    () => (data ? monthExpenses.filter((e) => isCardMethod(e.paymentMethodId, data.paymentMethods)) : []),
    [monthExpenses, data]
  );
  const monthTotalSpent = useMemo(() => monthCardExpenses.reduce((s, e) => s + Number(e.value), 0), [monthCardExpenses]);
  const monthTotalAll = useMemo(() => monthExpenses.reduce((s, e) => s + Number(e.value), 0), [monthExpenses]);

  const weeksWithStatus = useMemo(() => {
    return weeksRaw.map((w) => {
      const spent = monthCardExpenses
        .filter((e) => {
          const d = parseDate(e.date);
          return d >= w.start && d <= w.end;
        })
        .reduce((s, e) => s + Number(e.value), 0);
      const weekEnd = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59);
      let status;
      if (weekEnd < todayZero) status = spent > weeklyGoal ? "acima" : "concluida";
      else if (w.start > todayZero) status = "futuro";
      else status = spent > weeklyGoal ? "acima" : "dentro";
      const saved = weekEnd < todayZero ? Math.max(0, weeklyGoal - spent) : 0;
      return { ...w, spent, goal: weeklyGoal, status, saved };
    });
  }, [weeksRaw, monthCardExpenses, weeklyGoal, todayZero]);

  const categorySpend = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      map[e.categoryId] = (map[e.categoryId] || 0) + Number(e.value);
    });
    return map;
  }, [monthExpenses]);

  const paymentSpend = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      const key = e.paymentMethodId || "_none";
      map[key] = (map[key] || 0) + Number(e.value);
    });
    return map;
  }, [monthExpenses]);

  const caixinha = useMemo(() => {
    if (!data) return { total: 0, history: [] };
    const start = parseDate(data.settings.startDate || todayStr());
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cycles = iterateCyclesFrom(start, cycleStartDay, cycleEndDay, now);
    const history = [];
    let total = 0;
    cycles.forEach((cyc) => {
      const wks = computeWeeksForRange(cyc.start, cyc.end, data.settings.weeksCount);
      wks.forEach((w) => {
        const weekEnd = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59);
        if (weekEnd < now && w.start >= start) {
          const spent = data.expenses
            .filter((e) => {
              const d = parseDate(e.date);
              return d >= w.start && d <= w.end && isCardMethod(e.paymentMethodId, data.paymentMethods);
            })
            .reduce((s, e) => s + Number(e.value), 0);
          const goal = (Number(data.settings.monthlyLimit) || 0) / data.settings.weeksCount;
          const saved = Math.max(0, goal - spent);
          total += saved;
          history.push({ weekStart: w.start, weekEnd: w.end, week: w.index, spent, goal, saved });
        }
      });
    });
    history.reverse();
    return { total, history };
  }, [data, cycleStartDay, cycleEndDay]);

  // Histórico mês a mês (ciclo a ciclo): total gasto, separado por forma de pagamento
  // (cartão de crédito, pix, dinheiro, etc.), para olhar pra trás e comparar.
  const monthlyHistory = useMemo(() => {
    if (!data) return [];
    const start = parseDate(data.settings.startDate || todayStr());
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cycles = iterateCyclesFrom(start, cycleStartDay, cycleEndDay, now);
    const result = cycles.map((cyc) => {
      const exps = data.expenses.filter((e) => {
        const d = parseDate(e.date);
        return d >= cyc.start && d <= cyc.end;
      });
      const total = exps.reduce((s, e) => s + Number(e.value), 0);
      const byPayment = {};
      const byCategory = {};
      exps.forEach((e) => {
        const key = e.paymentMethodId || "_none";
        byPayment[key] = (byPayment[key] || 0) + Number(e.value);
        const catKey = e.categoryId || "_none";
        byCategory[catKey] = (byCategory[catKey] || 0) + Number(e.value);
      });
      const cardTotal = exps
        .filter((e) => isCardMethod(e.paymentMethodId, data.paymentMethods))
        .reduce((s, e) => s + Number(e.value), 0);
      return {
        start: cyc.start,
        end: cyc.end,
        total,
        cardTotal,
        nonCardTotal: total - cardTotal,
        byPayment,
        byCategory,
        ongoing: cyc.end >= now,
      };
    });
    result.reverse();
    return result;
  }, [data, cycleStartDay, cycleEndDay]);

  if (loading || !data) {
    return (
      <div className="fc-app" style={{ minHeight: 480, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{STYLE}</style>
        <p style={{ color: "var(--ink-soft)", fontFamily: "Inter,sans-serif" }}>Carregando seus dados…</p>
      </div>
    );
  }

  // ---------- ações ----------
  // Cada ação abaixo é escrita como uma função que recebe o dado MAIS RECENTE
  // (lido na hora, direto do Firestore, dentro de uma transação) — assim, mesmo que
  // você e sua esposa salvem algo quase ao mesmo tempo em celulares diferentes,
  // uma gravação nunca apaga por acidente o que a outra pessoa acabou de salvar.
  function saveExpense(exp) {
    persist((current) => {
      const exists = current.expenses.some((e) => e.id === exp.id);
      const expenses = exists ? current.expenses.map((e) => (e.id === exp.id ? exp : e)) : [...current.expenses, exp];
      return { ...current, expenses };
    });
    setExpenseModal(null);
  }
  function deleteExpense(id) {
    persist((current) => ({ ...current, expenses: current.expenses.filter((e) => e.id !== id) }));
  }
  function saveCategory(cat) {
    persist((current) => {
      const exists = current.categories.some((c) => c.id === cat.id);
      const categories = exists ? current.categories.map((c) => (c.id === cat.id ? cat : c)) : [...current.categories, cat];
      return { ...current, categories };
    });
    setCategoryModal(null);
  }
  function deleteCategory(id) {
    if (data.categories.length <= 1) return;
    persist((current) => {
      if (current.categories.length <= 1) return current;
      const fallback = (current.categories.find((c) => c.id !== id) || current.categories[0]).id;
      const categories = current.categories.filter((c) => c.id !== id);
      const expenses = current.expenses.map((e) => (e.categoryId === id ? { ...e, categoryId: fallback } : e));
      const recurring = current.recurring.map((r) => (r.categoryId === id ? { ...r, categoryId: fallback } : r));
      return { ...current, categories, expenses, recurring };
    });
  }
  function savePaymentMethod(pm) {
    persist((current) => {
      const exists = current.paymentMethods.some((p) => p.id === pm.id);
      const paymentMethods = exists ? current.paymentMethods.map((p) => (p.id === pm.id ? pm : p)) : [...current.paymentMethods, pm];
      return { ...current, paymentMethods };
    });
    setPaymentMethodModal(null);
  }
  function deletePaymentMethod(id) {
    if (data.paymentMethods.length <= 1) return;
    persist((current) => {
      if (current.paymentMethods.length <= 1) return current;
      const fallback = (current.paymentMethods.find((p) => p.id !== id) || current.paymentMethods[0]).id;
      const paymentMethods = current.paymentMethods.filter((p) => p.id !== id);
      const expenses = current.expenses.map((e) => (e.paymentMethodId === id ? { ...e, paymentMethodId: fallback } : e));
      const recurring = current.recurring.map((r) => (r.paymentMethodId === id ? { ...r, paymentMethodId: fallback } : r));
      return { ...current, paymentMethods, expenses, recurring };
    });
  }
  function saveRecurring(rec) {
    persist((current) => {
      const exists = current.recurring.some((r) => r.id === rec.id);
      const recurring = exists ? current.recurring.map((r) => (r.id === rec.id ? rec : r)) : [...current.recurring, rec];
      return { ...current, recurring };
    });
    setRecurringModal(null);
  }
  function deleteRecurring(id) {
    persist((current) => ({ ...current, recurring: current.recurring.filter((r) => r.id !== id) }));
  }
  function saveSettings(settings) {
    persist((current) => ({ ...current, settings }));
    setSettingsOpen(false);
  }

  function goPrevCycle() {
    setCycleOffset((o) => o - 1);
  }
  function goNextCycle() {
    setCycleOffset((o) => o + 1);
  }
  function goToday() {
    setCycleOffset(0);
  }

  const percentSpent = monthlyLimit > 0 ? (monthTotalSpent / monthlyLimit) * 100 : 0;
  const barColor = percentSpent > 100 ? "var(--clay)" : percentSpent > 80 ? "var(--gold)" : "var(--jade)";

  const TABS = [
    { key: "inicio", label: "Início", icon: Home },
    { key: "categorias", label: "Categorias", icon: Tag },
    { key: "recorrentes", label: "Recorrentes", icon: Repeat },
    { key: "caixinha", label: "Caixinha", icon: PiggyBank },
    { key: "historico", label: "Histórico", icon: History },
  ];

  return (
    <div className="fc-app" style={{ position: "relative", maxWidth: 460, margin: "0 auto", height: "100vh", minHeight: 640, display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <style>{STYLE}</style>

      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--line)", background: "var(--paper-card)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--jade)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Wallet size={18} color="#fff" />
            </div>
            <div>
              <p className="fc-display" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1, margin: 0 }}>Nossos gastos</p>
              <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }}>{data.settings.person1} &amp; {data.settings.person2}</p>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="fc-icon-btn" aria-label="Configurações">
            <SettingsIcon size={19} color="var(--ink-soft)" />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <button onClick={goPrevCycle} className="fc-icon-btn"><ChevronLeft size={18} /></button>
          <button onClick={goToday} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "center" }}>
            <p className="fc-display" style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{formatCycleLabel(cycleStart, cycleEnd)}</p>
            {!isCurrentCycle && <p style={{ fontSize: 10, color: "var(--jade)", margin: 0 }}>Toque para voltar ao ciclo atual</p>}
          </button>
          <button onClick={goNextCycle} className="fc-icon-btn"><ChevronRight size={18} /></button>
        </div>
      </div>

      {saveError && (
        <div style={{ background: "var(--clay-light)", color: "var(--clay)", fontSize: 12, padding: "6px 16px", display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> Não foi possível salvar agora.</span>
          <button onClick={() => persist(data)} style={{ background: "none", border: "none", color: "var(--clay)", fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 110px" }}>
        {activeTab === "inicio" && (
          <InicioTab
            data={data}
            monthTotalSpent={monthTotalSpent}
            monthTotalAll={monthTotalAll}
            monthlyLimit={monthlyLimit}
            percentSpent={percentSpent}
            barColor={barColor}
            weeksWithStatus={weeksWithStatus}
            monthExpenses={monthExpenses}
            categorySpend={categorySpend}
            onEditExpense={(exp) => setExpenseModal(exp)}
            onDeleteExpense={(exp) =>
              setConfirmState({ message: `Excluir o gasto "${exp.description}" de ${formatBRL(exp.value)}?`, onConfirm: () => deleteExpense(exp.id) })
            }
          />
        )}
        {activeTab === "categorias" && (
          <CategoriasTab
            categories={data.categories}
            categorySpend={categorySpend}
            onAdd={() => setCategoryModal({})}
            onEdit={(c) => setCategoryModal(c)}
            onDelete={(c) =>
              setConfirmState({ message: `Excluir a categoria "${c.name}"? Os gastos serão movidos para outra categoria.`, onConfirm: () => deleteCategory(c.id) })
            }
            paymentMethods={data.paymentMethods}
            paymentSpend={paymentSpend}
            onAddPM={() => setPaymentMethodModal({})}
            onEditPM={(p) => setPaymentMethodModal(p)}
            onDeletePM={(p) =>
              setConfirmState({ message: `Excluir a forma de pagamento "${p.name}"? Os gastos serão movidos para outra forma.`, onConfirm: () => deletePaymentMethod(p.id) })
            }
          />
        )}
        {activeTab === "recorrentes" && (
          <RecorrentesTab
            recurring={data.recurring}
            categories={data.categories}
            onAdd={() => setRecurringModal({})}
            onEdit={(r) => setRecurringModal(r)}
            onDelete={(r) =>
              setConfirmState({ message: `Excluir a despesa recorrente "${r.description}"?`, onConfirm: () => deleteRecurring(r.id) })
            }
            onToggleActive={(r) => {
              persist((current) => {
                const recurring = current.recurring.map((x) => x.id === r.id ? { ...x, active: !x.active } : x);
                return { ...current, recurring };
              });
            }}
          />
        )}
        {activeTab === "caixinha" && <CaixinhaTab caixinha={caixinha} monthlyLimit={monthlyLimit} />}
        {activeTab === "historico" && <HistoricoTab history={monthlyHistory} paymentMethods={data.paymentMethods} categories={data.categories} />}
      </div>

      {/* Botão flutuante de adicionar gasto */}
      <button
        onClick={() => setExpenseModal({})}
        aria-label="Lançar gasto"
        style={{
          position: "absolute", right: 16, bottom: 86, width: 54, height: 54, borderRadius: 27,
          background: "var(--jade)", color: "#fff", border: "none", boxShadow: "0 8px 20px rgba(27,107,91,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 20,
        }}
      >
        <Plus size={26} />
      </button>

      {/* Navegação inferior */}
      <div style={{ display: "flex", borderTop: "1px solid var(--line)", background: "var(--paper-card)", padding: "6px 4px" }}>
        {TABS.map((t) => {
          const TIcon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: "6px 0", background: "none", border: "none", cursor: "pointer",
              }}
            >
              <TIcon size={20} color={active ? "var(--jade)" : "var(--ink-soft)"} />
              <span style={{ fontSize: 10.5, color: active ? "var(--jade)" : "var(--ink-soft)", fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Modais */}
      {expenseModal && (
        <ExpenseModal
          initial={expenseModal}
          categories={data.categories}
          paymentMethods={data.paymentMethods}
          settings={data.settings}
          onSave={saveExpense}
          onClose={() => setExpenseModal(null)}
          onDelete={
            expenseModal.id
              ? () => {
                  setConfirmState({ message: "Excluir este gasto?", onConfirm: () => { deleteExpense(expenseModal.id); setExpenseModal(null); } });
                }
              : null
          }
        />
      )}
      {categoryModal && (
        <CategoryModal initial={categoryModal} onSave={saveCategory} onClose={() => setCategoryModal(null)} />
      )}
      {paymentMethodModal && (
        <PaymentMethodModal initial={paymentMethodModal} onSave={savePaymentMethod} onClose={() => setPaymentMethodModal(null)} />
      )}
      {recurringModal && (
        <RecurringModal initial={recurringModal} categories={data.categories} paymentMethods={data.paymentMethods} settings={data.settings} onSave={saveRecurring} onClose={() => setRecurringModal(null)} />
      )}
      {settingsOpen && (
        <SettingsModal initial={data.settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />
      )}
      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// ---------------- Início ----------------
function InicioTab({ data, monthTotalSpent, monthTotalAll, monthlyLimit, percentSpent, barColor, weeksWithStatus, monthExpenses, categorySpend, onEditExpense, onDeleteExpense }) {
  const [selectedWeek, setSelectedWeek] = useState(null); // índice da semana selecionada, ou null = todos

  const categoryRanking = Object.entries(categorySpend)
    .map(([id, value]) => ({ id, value, cat: data.categories.find((c) => c.id === id) }))
    .filter((c) => c.cat && c.value > 0)
    .sort((a, b) => b.value - a.value);
  const maxCategorySpend = categoryRanking.length ? categoryRanking[0].value : 0;

  const visibleExpenses = useMemo(() => {
    if (selectedWeek === null) return monthExpenses;
    const w = weeksWithStatus.find((x) => x.index === selectedWeek);
    if (!w) return monthExpenses;
    // Usa as mesmas datas absolutas (w.start / w.end) que o cálculo de "spent" em weeksWithStatus
    // usa — assim o filtro é 100% consistente com o que aparece nos totais de cada semana.
    const weekEnd = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59);
    return monthExpenses.filter((e) => {
      const d = parseDate(e.date);
      return d >= w.start && d <= weekEnd;
    });
  }, [selectedWeek, monthExpenses, weeksWithStatus]);

  const selectedWeekObj = selectedWeek !== null ? weeksWithStatus.find((x) => x.index === selectedWeek) : null;

  return (
    <div>
      <div className="fc-card">
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>Gasto do mês no cartão</p>
        <p className="fc-display" style={{ fontSize: 28, fontWeight: 800, margin: "2px 0 6px" }}>
          {formatBRL(monthTotalSpent)} <span style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 500 }}>/ {formatBRL(monthlyLimit)}</span>
        </p>
        <div style={{ height: 10, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, percentSpent)}%`, background: barColor, transition: "width .3s" }} />
        </div>
        <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6, marginBottom: 0 }}>
          {percentSpent > 100 ? `${(percentSpent - 100).toFixed(0)}% acima do limite` : `${(100 - percentSpent).toFixed(0)}% do limite ainda disponível`}
        </p>
        {monthTotalAll !== monthTotalSpent && (
          <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6, marginBottom: 0, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
            Total do mês somando Pix, dinheiro e boleto: <strong style={{ color: "var(--ink)" }}>{formatBRL(monthTotalAll)}</strong>
          </p>
        )}
      </div>

      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 2px 8px" }}>Metas semanais <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--ink-soft)", fontSize: 11 }}>— toque para ver os gastos da semana</span></p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {weeksWithStatus.map((w) => (
          <WeekRow
            key={w.index}
            w={w}
            selected={selectedWeek === w.index}
            onSelect={() => setSelectedWeek(selectedWeek === w.index ? null : w.index)}
          />
        ))}
      </div>

      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4, margin: "18px 2px 8px" }}>Gastos por categoria</p>
      {categoryRanking.length === 0 ? (
        <EmptyState text="Nenhum gasto por categoria neste ciclo ainda." />
      ) : (
        <div className="fc-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
          {categoryRanking.map(({ id, value, cat }) => {
            const colors = COLOR_CLASSES[cat.color] || COLOR_CLASSES.gray;
            const pct = maxCategorySpend > 0 ? (value / maxCategorySpend) * 100 : 0;
            return (
              <div key={id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Icon name={cat.icon} size={14} color={colors.text} />
                  <p style={{ fontSize: 12.5, margin: 0, flex: 1 }}>{cat.name}</p>
                  <p style={{ fontSize: 12.5, margin: 0, fontWeight: 700 }}>{formatBRL(value)}</p>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: colors.dot }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 2px 8px" }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4, margin: 0 }}>
          {selectedWeekObj
            ? `Semana ${selectedWeekObj.index} — ${formatWeekRange(selectedWeekObj.start, selectedWeekObj.end)}`
            : "Últimos lançamentos"}
        </p>
        {selectedWeek !== null && (
          <button type="button" onClick={() => setSelectedWeek(null)} style={{ background: "none", border: "none", fontSize: 11.5, color: "var(--jade)", cursor: "pointer", fontWeight: 600 }}>
            Ver todos
          </button>
        )}
      </div>
      {visibleExpenses.length === 0 ? (
        <EmptyState text={selectedWeek !== null ? "Nenhum gasto lançado nesta semana." : "Nenhum gasto lançado neste mês ainda. Toque no botão + para começar."} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(selectedWeek !== null ? visibleExpenses : visibleExpenses.slice(0, 12)).map((e) => (
            <ExpenseRow key={e.id} expense={e} categories={data.categories} paymentMethods={data.paymentMethods} onEdit={() => onEditExpense(e)} onDelete={() => onDeleteExpense(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekRow({ w, selected, onSelect }) {
  const pct = w.goal > 0 ? Math.min(100, (w.spent / w.goal) * 100) : 0;
  const over = w.spent > w.goal;
  const cfg = {
    futuro: { label: "Ainda não começou", color: "var(--ink-soft)", Icon: Clock },
    dentro: { label: "Dentro da meta", color: "var(--jade)", Icon: TrendingDown },
    acima: { label: "Acima da meta", color: "var(--clay)", Icon: TrendingUp },
    concluida: { label: over ? "Excedeu a meta" : "Economizou nesta semana", color: over ? "var(--clay)" : "var(--jade)", Icon: over ? TrendingUp : Check },
  }[w.status];
  return (
    <div
      className="fc-card"
      onClick={onSelect}
      style={{
        padding: 12, cursor: "pointer",
        border: selected ? "2px solid var(--jade)" : "1px solid var(--line)",
        background: selected ? "var(--jade-light)" : "var(--paper-card)",
        transition: "border 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
            Semana {w.index}
            <span style={{ color: "var(--ink-soft)", fontWeight: 400, fontSize: 11.5 }}> ({formatWeekRange(w.start, w.end)})</span>
            {selected && <span style={{ color: "var(--jade)", fontSize: 10.5, fontWeight: 700, marginLeft: 6 }}>● selecionada</span>}
          </p>
          <p style={{ fontSize: 11.5, color: cfg.color, margin: "2px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
            <cfg.Icon size={12} /> {cfg.label}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{formatBRL(w.spent)}</p>
          <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }}>meta {formatBRL(w.goal)}</p>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--line)", overflow: "hidden", marginTop: 8 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--clay)" : "var(--jade)" }} />
      </div>
      {w.status === "concluida" && w.saved > 0 && (
        <p style={{ fontSize: 11, color: "var(--gold)", margin: "6px 0 0", fontWeight: 600 }}>+ {formatBRL(w.saved)} foram para a caixinha 🐷</p>
      )}
    </div>
  );
}

function ExpenseRow({ expense, categories, paymentMethods, onEdit, onDelete }) {
  const cat = categories.find((c) => c.id === expense.categoryId) || categories[0];
  const colors = COLOR_CLASSES[cat?.color] || COLOR_CLASSES.gray;
  const pm = (paymentMethods || []).find((p) => p.id === expense.paymentMethodId);
  const isPending = expense.pending === true;
  return (
    <div className="fc-card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, opacity: isPending ? 0.7 : 1, borderStyle: isPending ? "dashed" : "solid" }}>
      <div style={{ background: colors.bg, width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={cat?.icon} size={17} color={colors.text} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{expense.description || cat?.name}</p>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }}>
          {formatDateBR(expense.date)} · {expense.person}{pm ? ` · ${pm.name}` : ""}
          {isPending && <span style={{ color: "var(--gold-dark)", fontWeight: 600 }}> · previsto</span>}
        </p>
      </div>
      <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0, whiteSpace: "nowrap" }}>{formatBRL(expense.value)}</p>
      <button onClick={onEdit} className="fc-icon-btn" style={{ marginLeft: 2 }}><Pencil size={15} color="var(--ink-soft)" /></button>
      <button onClick={onDelete} className="fc-icon-btn"><Trash2 size={15} color="var(--clay)" /></button>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "26px 16px", color: "var(--ink-soft)", fontSize: 13 }}>
      <p style={{ margin: 0 }}>{text}</p>
    </div>
  );
}

// ---------------- Categorias ----------------
function CategoriasTab({ categories, categorySpend, onAdd, onEdit, onDelete, paymentMethods, paymentSpend, onAddPM, onEditPM, onDeletePM }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>Gasto por categoria neste mês</p>
        <button onClick={onAdd} className="fc-btn-primary" style={{ padding: "7px 12px", fontSize: 12.5 }}><Plus size={14} /> Nova</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {categories.map((c) => {
          const colors = COLOR_CLASSES[c.color] || COLOR_CLASSES.gray;
          return (
            <div key={c.id} className="fc-card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ background: colors.bg, width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={c.icon} size={18} color={colors.text} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{c.name}</p>
                <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: 0 }}>{formatBRL(categorySpend[c.id] || 0)} este mês</p>
              </div>
              <button onClick={() => onEdit(c)} className="fc-icon-btn"><Pencil size={15} color="var(--ink-soft)" /></button>
              <button onClick={() => onDelete(c)} className="fc-icon-btn"><Trash2 size={15} color="var(--clay)" /></button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "22px 0 10px" }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>Formas de pagamento</p>
        <button onClick={onAddPM} className="fc-btn-primary" style={{ padding: "7px 12px", fontSize: 12.5 }}><Plus size={14} /> Nova</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {paymentMethods.map((p) => {
          const colors = COLOR_CLASSES[p.color] || COLOR_CLASSES.gray;
          return (
            <div key={p.id} className="fc-card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ background: colors.bg, width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={p.icon} size={18} color={colors.text} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{p.name}</p>
                <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: 0 }}>
                  {formatBRL(paymentSpend[p.id] || 0)} este mês · {p.isCard ? "conta no limite do cartão" : "não conta no limite"}
                </p>
              </div>
              <button onClick={() => onEditPM(p)} className="fc-icon-btn"><Pencil size={15} color="var(--ink-soft)" /></button>
              <button onClick={() => onDeletePM(p)} className="fc-icon-btn"><Trash2 size={15} color="var(--clay)" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Recorrentes ----------------
function RecorrentesTab({ recurring, categories, onAdd, onEdit, onDelete, onToggleActive }) {
  function durationLabel(r) {
    if (!r.durationType || r.durationType === "continuous") return "Contínuo";
    const n = r.durationValue || 1;
    if (r.durationType === "weeks") return `${n} ${n === 1 ? "semana" : "semanas"}`;
    return `${n} ${n === 1 ? "mês" : "meses"}`;
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>Assinaturas, escola, internet, plano de saúde…</p>
        <button onClick={onAdd} className="fc-btn-primary" style={{ padding: "7px 12px", fontSize: 12.5 }}><Plus size={14} /> Nova</button>
      </div>
      {!recurring || recurring.length === 0 ? (
        <EmptyState text="Nenhuma despesa recorrente cadastrada. Cadastre contas fixas para que sejam lançadas automaticamente todo mês." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recurring.map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            const colors = COLOR_CLASSES[cat?.color] || COLOR_CLASSES.gray;
            return (
              <div key={r.id} className="fc-card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, opacity: r.active ? 1 : 0.5 }}>
                <div style={{ background: colors.bg, width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={cat?.icon || "MoreHorizontal"} size={18} color={colors.text} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{r.description}</p>
                  <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: 0 }}>
                    {formatBRL(r.value)} · dia {r.day} · {durationLabel(r)}{r.person ? ` · ${r.person}` : ""}
                  </p>
                </div>
                <button onClick={() => onToggleActive(r)} className="fc-icon-btn" title={r.active ? "Pausar" : "Ativar"}>
                  {r.active ? <Check size={15} color="var(--jade)" /> : <Clock size={15} color="var(--ink-soft)" />}
                </button>
                <button onClick={() => onEdit(r)} className="fc-icon-btn"><Pencil size={15} color="var(--ink-soft)" /></button>
                <button onClick={() => onDelete(r)} className="fc-icon-btn"><Trash2 size={15} color="var(--clay)" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Caixinha ----------------
function CaixinhaTab({ caixinha, monthlyLimit }) {
  const fillPct = monthlyLimit > 0 ? Math.min(100, (caixinha.total / monthlyLimit) * 100) : 0;
  return (
    <div>
      <div className="fc-card" style={{ textAlign: "center", padding: "22px 16px" }}>
        <JarSvg fillPct={fillPct} />
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "10px 0 0" }}>Total economizado para o fim do ano</p>
        <p className="fc-display" style={{ fontSize: 30, fontWeight: 800, margin: "2px 0 0", color: "var(--gold-dark)" }}>{formatBRL(caixinha.total)}</p>
      </div>

      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4, margin: "18px 2px 8px" }}>Histórico semanal</p>
      {caixinha.history.length === 0 ? (
        <EmptyState text="Ainda não há semanas concluídas. A economia aparece aqui ao final de cada semana em que vocês gastarem menos que a meta." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {caixinha.history.map((h, i) => (
            <div key={i} className="fc-card" style={{ padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>Semana {h.week} <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>({formatWeekRange(h.weekStart, h.weekEnd)})</span></p>
                <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }}>Gasto {formatBRL(h.spent)} de {formatBRL(h.goal)}</p>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: h.saved > 0 ? "var(--jade)" : "var(--ink-soft)" }}>
                {h.saved > 0 ? `+${formatBRL(h.saved)}` : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JarSvg({ fillPct }) {
  const liquidHeight = 78 * (fillPct / 100);
  const liquidY = 14 + (78 - liquidHeight);
  return (
    <svg viewBox="0 0 100 110" width="92" height="101" style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <clipPath id="jarClip">
          <path d="M22 16 Q22 12 26 12 H74 Q78 12 78 16 V88 Q78 100 64 100 H36 Q22 100 22 88 Z" />
        </clipPath>
      </defs>
      <rect x="36" y="4" width="28" height="10" rx="3" fill="var(--line)" />
      <path d="M22 16 Q22 12 26 12 H74 Q78 12 78 16 V88 Q78 100 64 100 H36 Q22 100 22 88 Z" fill="var(--paper-card)" stroke="var(--line)" strokeWidth="2.5" />
      <g clipPath="url(#jarClip)">
        <rect x="18" y={liquidY} width="64" height={92 - liquidY + 10} fill="var(--gold)" opacity="0.85" />
      </g>
      <path d="M22 16 Q22 12 26 12 H74 Q78 12 78 16 V88 Q78 100 64 100 H36 Q22 100 22 88 Z" fill="none" stroke="var(--line)" strokeWidth="2.5" />
    </svg>
  );
}

// ---------------- Histórico ----------------
function HistoricoTab({ history, paymentMethods, categories }) {
  // Intervalo disponível (com base nos ciclos que já existem)
  const monthsAvailable = useMemo(() => {
    return history.map((h) => `${h.start.getFullYear()}-${String(h.start.getMonth() + 1).padStart(2, "0")}`);
  }, [history]);
  const earliestMonth = monthsAvailable.length ? monthsAvailable[monthsAvailable.length - 1] : "";
  const latestMonth = monthsAvailable.length ? monthsAvailable[0] : "";

  const [filterStart, setFilterStart] = useState(earliestMonth);
  const [filterEnd, setFilterEnd] = useState(latestMonth);
  const [expandedCycle, setExpandedCycle] = useState(null); // chave "Y-M" do ciclo expandido

  // Se o histórico carregar depois (primeira renderização), inicializa os campos quando ainda estiverem vazios
  useEffect(() => {
    if (!filterStart && earliestMonth) setFilterStart(earliestMonth);
    if (!filterEnd && latestMonth) setFilterEnd(latestMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earliestMonth, latestMonth]);

  const filteredHistory = useMemo(() => {
    if (!filterStart && !filterEnd) return history;
    return history.filter((h) => {
      const monthKey = `${h.start.getFullYear()}-${String(h.start.getMonth() + 1).padStart(2, "0")}`;
      if (filterStart && monthKey < filterStart) return false;
      if (filterEnd && monthKey > filterEnd) return false;
      return true;
    });
  }, [history, filterStart, filterEnd]);

  const periodTotal = useMemo(() => filteredHistory.reduce((s, h) => s + h.total, 0), [filteredHistory]);

  const [breakdownMode, setBreakdownMode] = useState("payment"); // "payment" | "category"

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 12px" }}>
        Veja ciclo a ciclo quanto foi gasto no total, somando todas as formas de pagamento, e quanto disso foi no cartão de crédito.
      </p>

      <div className="fc-card" style={{ padding: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 8px" }}>
          Período de vigência
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "var(--ink-soft)", display: "block", marginBottom: 3 }}>Início</label>
            <input
              className="fc-input"
              type="month"
              value={filterStart}
              min={earliestMonth || undefined}
              max={filterEnd || latestMonth || undefined}
              onChange={(e) => setFilterStart(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "var(--ink-soft)", display: "block", marginBottom: 3 }}>Fim</label>
            <input
              className="fc-input"
              type="month"
              value={filterEnd}
              min={filterStart || earliestMonth || undefined}
              max={latestMonth || undefined}
              onChange={(e) => setFilterEnd(e.target.value)}
            />
          </div>
        </div>
        {filteredHistory.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "10px 0 0", paddingTop: 8, borderTop: "1px solid var(--line)" }}>
            Total no período: <strong style={{ color: "var(--ink)" }}>{formatBRL(periodTotal)}</strong> ({filteredHistory.length} {filteredHistory.length === 1 ? "ciclo" : "ciclos"})
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setBreakdownMode("payment")} className={breakdownMode === "payment" ? "fc-chip fc-chip-active" : "fc-chip"}>Por forma de pagamento</button>
        <button type="button" onClick={() => setBreakdownMode("category")} className={breakdownMode === "category" ? "fc-chip fc-chip-active" : "fc-chip"}>Por categoria</button>
      </div>

      {filteredHistory.length === 0 ? (
        <EmptyState text="Nenhum ciclo encontrado nesse período. Ajuste as datas de início e fim acima." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredHistory.map((h, i) => {
            const cycleKey = `${h.start.getFullYear()}-${h.start.getMonth()}`;
            const isExpanded = expandedCycle === cycleKey;
            const paymentEntries = Object.entries(h.byPayment)
              .map(([id, value]) => {
                const pm = paymentMethods.find((p) => p.id === id);
                return { id, name: pm ? pm.name : "Não informado", color: pm ? pm.color : "gray", icon: pm ? pm.icon : "MoreHorizontal", value };
              })
              .sort((a, b) => b.value - a.value);
            const categoryEntries = Object.entries(h.byCategory || {})
              .map(([id, value]) => {
                const cat = categories.find((c) => c.id === id);
                return { id, name: cat ? cat.name : "Sem categoria", color: cat ? cat.color : "gray", icon: cat ? cat.icon : "MoreHorizontal", value };
              })
              .sort((a, b) => b.value - a.value);
            const entries = breakdownMode === "category" ? categoryEntries : paymentEntries;
            return (
              <div key={i} className="fc-card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Cabeçalho clicável */}
                <div
                  onClick={() => setExpandedCycle(isExpanded ? null : cycleKey)}
                  style={{ padding: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>{formatCycleLabel(h.start, h.end)}</p>
                    {h.ongoing && <p style={{ fontSize: 10.5, color: "var(--gold-dark)", margin: "2px 0 0", fontWeight: 700 }}>EM ANDAMENTO</p>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p className="fc-display" style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{formatBRL(h.total)}</p>
                    <ChevronRight size={16} color="var(--ink-soft)" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                  </div>
                </div>
                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", gap: 8, margin: "10px 0 10px" }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setBreakdownMode("payment"); }} className={breakdownMode === "payment" ? "fc-chip fc-chip-active" : "fc-chip"} style={{ fontSize: 11.5, padding: "5px 10px" }}>Por pagamento</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setBreakdownMode("category"); }} className={breakdownMode === "category" ? "fc-chip fc-chip-active" : "fc-chip"} style={{ fontSize: 11.5, padding: "5px 10px" }}>Por categoria</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {entries.map((p) => {
                        const colors = COLOR_CLASSES[p.color] || COLOR_CLASSES.gray;
                        const pct = h.total > 0 ? (p.value / h.total) * 100 : 0;
                        return (
                          <div key={p.id}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                              <div style={{ width: 22, height: 22, borderRadius: 6, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <Icon name={p.icon} size={12} color={colors.text} />
                              </div>
                              <p style={{ fontSize: 12, margin: 0, flex: 1, color: "var(--ink-soft)" }}>{p.name}</p>
                              <p style={{ fontSize: 12.5, margin: 0, fontWeight: 600 }}>{formatBRL(p.value)}</p>
                              <p style={{ fontSize: 11, margin: 0, color: "var(--ink-soft)", width: 34, textAlign: "right" }}>{pct.toFixed(0)}%</p>
                            </div>
                            <div style={{ height: 4, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: colors.dot }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "10px 0 0", paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                      No cartão (conta na meta): <strong style={{ color: "var(--ink)" }}>{formatBRL(h.cardTotal)}</strong> · Outras formas: <strong style={{ color: "var(--ink)" }}>{formatBRL(h.nonCardTotal)}</strong>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Modal genérico ----------------
function ModalShell({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,22,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div
        className="fc-app"
        style={{ background: "var(--paper-card)", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", padding: 18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p className="fc-display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</p>
          <button onClick={onClose} className="fc-icon-btn"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600, display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function ConfirmDialog({ state, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,22,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onClose}>
      <div className="fc-app" style={{ background: "var(--paper-card)", borderRadius: 16, padding: 18, maxWidth: 340, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 13.5, margin: "0 0 16px", color: "var(--ink)" }}>{state.message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} className="fc-btn-secondary" style={{ flex: 1 }}>Cancelar</button>
          <button
            onClick={() => { state.onConfirm(); onClose(); }}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "var(--clay)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Modal: gasto ----------------
function ExpenseModal({ initial, categories, paymentMethods, settings, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [value, setValue] = useState(initial.value ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [date, setDate] = useState(initial.date ?? todayStr());
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? categories[0]?.id);
  const [paymentMethodId, setPaymentMethodId] = useState(initial.paymentMethodId ?? paymentMethods[0]?.id);
  const [person, setPerson] = useState(initial.person ?? settings.person1);

  function handleSubmit(e) {
    e.preventDefault();
    if (!value || Number(value) <= 0) return;
    onSave({
      id: initial.id || genId("exp"),
      value: Number(value),
      description: description.trim() || (categories.find((c) => c.id === categoryId)?.name || "Gasto"),
      date,
      categoryId,
      paymentMethodId,
      person,
    });
  }

  return (
    <ModalShell title={isEdit ? "Editar gasto" : "Lançar gasto"} onClose={onClose}>
      <div>
        <Field label="Valor (R$)">
          <input className="fc-input" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        </Field>
        <Field label="Descrição">
          <input className="fc-input" type="text" placeholder="Ex: Compras do mês" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Data">
          <input className="fc-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Categoria">
          <select className="fc-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Forma de pagamento">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {paymentMethods.map((p) => (
              <button type="button" key={p.id} onClick={() => setPaymentMethodId(p.id)} className={paymentMethodId === p.id ? "fc-chip fc-chip-active" : "fc-chip"}>{p.name}</button>
            ))}
          </div>
        </Field>
        <Field label="Quem lançou">
          <div style={{ display: "flex", gap: 8 }}>
            {[settings.person1, settings.person2].map((p) => (
              <button type="button" key={p} onClick={() => setPerson(p)} className={person === p ? "fc-chip fc-chip-active" : "fc-chip"}>{p}</button>
            ))}
          </div>
        </Field>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {onDelete && (
            <button type="button" onClick={onDelete} className="fc-icon-btn" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
              <Trash2 size={16} color="var(--clay)" />
            </button>
          )}
          <button type="button" onClick={handleSubmit} className="fc-btn-primary" style={{ flex: 1, justifyContent: "center" }}>Salvar</button>
        </div>
      </div>
    </ModalShell>
  );
}

// ---------------- Modal: categoria ----------------
function CategoryModal({ initial, onSave, onClose }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name ?? "");
  const [icon, setIcon] = useState(initial.icon ?? ICON_KEYS[0]);
  const [color, setColor] = useState(initial.color ?? COLOR_KEYS[0]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ id: initial.id || genId("cat"), name: name.trim(), icon, color });
  }

  return (
    <ModalShell title={isEdit ? "Editar categoria" : "Nova categoria"} onClose={onClose}>
      <div>
        <Field label="Nome">
          <input className="fc-input" type="text" placeholder="Ex: Pet shop" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label="Ícone">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
            {ICON_KEYS.map((k) => (
              <button type="button" key={k} onClick={() => setIcon(k)} className="fc-icon-pick" style={{ background: icon === k ? "var(--jade-light)" : "var(--paper)", borderColor: icon === k ? "var(--jade)" : "var(--line)" }}>
                <Icon name={k} size={17} color={icon === k ? "var(--jade)" : "var(--ink-soft)"} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Cor">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLOR_KEYS.map((k) => (
              <button type="button" key={k} onClick={() => setColor(k)} style={{ background: COLOR_CLASSES[k].dot, width: 26, height: 26, borderRadius: 13, border: color === k ? "2.5px solid var(--ink)" : "2.5px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
        </Field>
        <button type="button" onClick={handleSubmit} className="fc-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>Salvar</button>
      </div>
    </ModalShell>
  );
}

// ---------------- Modal: forma de pagamento ----------------
function PaymentMethodModal({ initial, onSave, onClose }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name ?? "");
  const [icon, setIcon] = useState(initial.icon ?? "CreditCard");
  const [color, setColor] = useState(initial.color ?? COLOR_KEYS[0]);
  const [isCard, setIsCard] = useState(initial.isCard ?? true);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ id: initial.id || genId("pm"), name: name.trim(), icon, color, isCard });
  }

  return (
    <ModalShell title={isEdit ? "Editar forma de pagamento" : "Nova forma de pagamento"} onClose={onClose}>
      <div>
        <Field label="Nome">
          <input className="fc-input" type="text" placeholder="Ex: Cartão D, Vale-refeição" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label="Ícone">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
            {ICON_KEYS.map((k) => (
              <button type="button" key={k} onClick={() => setIcon(k)} className="fc-icon-pick" style={{ background: icon === k ? "var(--jade-light)" : "var(--paper)", borderColor: icon === k ? "var(--jade)" : "var(--line)" }}>
                <Icon name={k} size={17} color={icon === k ? "var(--jade)" : "var(--ink-soft)"} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Cor">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLOR_KEYS.map((k) => (
              <button type="button" key={k} onClick={() => setColor(k)} style={{ background: COLOR_CLASSES[k].dot, width: 26, height: 26, borderRadius: 13, border: color === k ? "2.5px solid var(--ink)" : "2.5px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
        </Field>
        <Field label="Entra no limite mensal do cartão?">
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setIsCard(true)} className={isCard ? "fc-chip fc-chip-active" : "fc-chip"}>Sim, é cartão</button>
            <button type="button" onClick={() => setIsCard(false)} className={!isCard ? "fc-chip fc-chip-active" : "fc-chip"}>Não conta no limite</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "6px 0 0" }}>Gastos com formas que não contam no limite (Pix, dinheiro, boleto) ainda aparecem nos lançamentos e por categoria, mas não entram nas metas semanais nem na caixinha.</p>
        </Field>
        <button type="button" onClick={handleSubmit} className="fc-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>Salvar</button>
      </div>
    </ModalShell>
  );
}
function RecurringModal({ initial, categories, paymentMethods, settings, onSave, onClose }) {
  const isEdit = !!initial.id;
  const [description, setDescription] = useState(initial.description ?? "");
  const [value, setValue] = useState(initial.value ?? "");
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? categories[0]?.id);
  const [paymentMethodId, setPaymentMethodId] = useState(initial.paymentMethodId ?? paymentMethods[0]?.id);
  const [day, setDay] = useState(initial.day ?? 1);
  const [person, setPerson] = useState(initial.person ?? "");
  const [active, setActive] = useState(initial.active !== false); // padrão ativo
  const [durationType, setDurationType] = useState(initial.durationType ?? "continuous");
  const [durationValue, setDurationValue] = useState(initial.durationValue ?? 1);
  const [error, setError] = useState("");

  function handleSubmit() {
    const desc = String(description).trim();
    const val = parseFloat(String(value).replace(",", "."));

    if (!desc) { setError("Informe uma descrição para a despesa."); return; }
    if (!val || val <= 0) { setError("Informe um valor maior que zero."); return; }

    setError("");
    onSave({
      id: initial.id || genId("rec"),
      description: desc,
      value: val,
      categoryId: categoryId || categories[0]?.id,
      paymentMethodId: paymentMethodId || paymentMethods[0]?.id,
      day: Math.min(31, Math.max(1, Number(day) || 1)),
      person: person || "",
      active,
      durationType: durationType || "continuous",
      durationValue: durationType !== "continuous" ? (Number(durationValue) || 1) : null,
    });
  }

  const durationLabel =
    durationType === "continuous" ? "Sem prazo — lança todo mês enquanto estiver ativa" :
    durationType === "months" ? `Por ${durationValue} ${Number(durationValue) === 1 ? "mês" : "meses"} a partir de hoje` :
    `Por ${durationValue} ${Number(durationValue) === 1 ? "semana" : "semanas"} a partir de hoje`;

  return (
    <ModalShell title={isEdit ? "Editar recorrente" : "Nova despesa recorrente"} onClose={onClose}>
      <div>
        {error && (
          <p style={{ fontSize: 12.5, color: "var(--clay)", background: "var(--clay-light)", padding: "8px 12px", borderRadius: 8, margin: "0 0 12px" }}>{error}</p>
        )}
        <Field label="Descrição *">
          <input className="fc-input" type="text" placeholder="Ex: Netflix, escola, internet…" value={description} onChange={(e) => { setDescription(e.target.value); setError(""); }} autoFocus />
        </Field>
        <Field label="Valor (R$) *">
          <input className="fc-input" type="number" step="0.01" min="0.01" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} />
        </Field>
        <Field label="Categoria">
          <select className="fc-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
        <Field label="Forma de pagamento">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {paymentMethods.map((p) => (
              <button type="button" key={p.id} onClick={() => setPaymentMethodId(p.id)} className={paymentMethodId === p.id ? "fc-chip fc-chip-active" : "fc-chip"}>{p.name}</button>
            ))}
          </div>
        </Field>
        <Field label="Dia da cobrança no mês">
          <input className="fc-input" type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Prazo de vigência">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {[["continuous","Indeterminado"],["months","Por meses"],["weeks","Por semanas"]].map(([t, l]) => (
              <button type="button" key={t} onClick={() => setDurationType(t)} className={durationType === t ? "fc-chip fc-chip-active" : "fc-chip"}>{l}</button>
            ))}
          </div>
          {durationType !== "continuous" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input className="fc-input" type="number" min="1" max="120" value={durationValue} onChange={(e) => setDurationValue(e.target.value)} style={{ width: 80 }} />
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{durationType === "weeks" ? "semanas" : "meses"}</span>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--jade)", margin: 0, fontWeight: 500 }}>{durationLabel}</p>
        </Field>
        <Field label="Responsável (opcional)">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["", settings.person1, settings.person2].map((p) => (
              <button type="button" key={p || "auto"} onClick={() => setPerson(p)} className={person === p ? "fc-chip fc-chip-active" : "fc-chip"}>{p || "Automático"}</button>
            ))}
          </div>
        </Field>
        <Field label="Status">
          <button type="button" onClick={() => setActive(!active)} className={active ? "fc-chip fc-chip-active" : "fc-chip"}>{active ? "✓ Ativa — será lançada automaticamente" : "Pausada"}</button>
        </Field>
        <button type="button" onClick={handleSubmit} className="fc-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: "12px 0", fontSize: 14 }}>Salvar despesa recorrente</button>
      </div>
    </ModalShell>
  );
}

// ---------------- Modal: configurações ----------------
function SettingsModal({ initial, onSave, onClose }) {
  const [monthlyLimit, setMonthlyLimit] = useState(initial.monthlyLimit ?? 4000);
  const [weeksCount, setWeeksCount] = useState(Math.min(5, Math.max(1, Number(initial.weeksCount) || 4)));
  const [cycleStartDay, setCycleStartDay] = useState(Math.min(31, Math.max(1, Number(initial.cycleStartDay) || 1)));
  const [cycleEndDay, setCycleEndDay] = useState(Math.min(31, Math.max(1, Number(initial.cycleEndDay) || 31)));
  const [person1, setPerson1] = useState(initial.person1 ?? "Você");
  const [person2, setPerson2] = useState(initial.person2 ?? "Esposa");
  const [startDate, setStartDate] = useState(initial.startDate ?? todayStr());
  const [localError, setLocalError] = useState("");

  const previewCycle = useMemo(() => {
    const startDay = Math.min(31, Math.max(1, Number(cycleStartDay) || 1));
    const endDay = Math.min(31, Math.max(1, Number(cycleEndDay) || 31));
    return getCycleForOffset(startDay, endDay, 0);
  }, [cycleStartDay, cycleEndDay]);

  function handleSubmit(e) {
    e.preventDefault();
    try {
      const safeLimit = Number(monthlyLimit);
      onSave({
        monthlyLimit: Number.isFinite(safeLimit) && safeLimit >= 0 ? safeLimit : 0,
        weeksCount: Math.min(5, Math.max(1, Number(weeksCount) || 4)),
        cycleStartDay: Math.min(31, Math.max(1, Number(cycleStartDay) || 1)),
        cycleEndDay: Math.min(31, Math.max(1, Number(cycleEndDay) || 31)),
        person1: person1.trim() || "Pessoa 1",
        person2: person2.trim() || "Pessoa 2",
        startDate: startDate || todayStr(),
      });
    } catch (err) {
      setLocalError("Erro ao salvar: " + (err && err.message ? err.message : String(err)));
    }
  }

  return (
    <ModalShell title="Configurações" onClose={onClose}>
      <div>
        {localError && (
          <p style={{ fontSize: 12, color: "var(--clay)", background: "var(--clay-light)", padding: "8px 10px", borderRadius: 8, margin: "0 0 12px" }}>
            {localError}
          </p>
        )}
        <Field label="Limite mensal do cartão (R$)">
          <input className="fc-input" type="number" step="0.01" min="0" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
        </Field>
        <Field label="Ciclo da fatura — dia de início">
          <input className="fc-input" type="number" min="1" max="31" value={cycleStartDay} onChange={(e) => setCycleStartDay(e.target.value)} />
        </Field>
        <Field label="Ciclo da fatura — dia de fim">
          <input className="fc-input" type="number" min="1" max="31" value={cycleEndDay} onChange={(e) => setCycleEndDay(e.target.value)} />
          <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "6px 0 0" }}>
            Ciclo atual com esses dias: <strong style={{ color: "var(--ink)" }}>{formatCycleLabel(previewCycle.start, previewCycle.end)}</strong>. Use 31 para "o último dia do mês", já que o app ajusta automaticamente para meses mais curtos.
          </p>
        </Field>
        <Field label="Dividir o limite em quantas metas semanais">
          <select className="fc-input" value={weeksCount} onChange={(e) => setWeeksCount(e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? "semana" : "semanas"} — {formatBRL((Number(monthlyLimit) || 0) / n)} por semana</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "6px 0 0" }}>Esse valor é um saldo único do casal por semana — não é por pessoa. Os gastos de vocês dois somam juntos dentro da mesma meta, e as semanas são contadas dentro do ciclo da fatura (não do mês calendário).</p>
        </Field>
        <Field label="Nome da pessoa 1">
          <input className="fc-input" type="text" value={person1} onChange={(e) => setPerson1(e.target.value)} />
        </Field>
        <Field label="Nome da pessoa 2">
          <input className="fc-input" type="text" value={person2} onChange={(e) => setPerson2(e.target.value)} />
        </Field>
        <Field label="Começar a contar a caixinha de economia a partir de">
          <input className="fc-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "-4px 0 12px" }}>Os dados deste app ficam salvos na nuvem e são compartilhados entre quem tiver acesso a este link.</p>
        <button type="button" className="fc-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={(e) => { setLocalError(""); handleSubmit(e); }}>Salvar</button>
      </div>
    </ModalShell>
  );
}

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
:root{
  --paper:#F3F6F1;
  --paper-card:#FFFFFF;
  --ink:#1F2A24;
  --ink-soft:#697A70;
  --jade:#1B6B5B;
  --jade-light:#E7F2EE;
  --gold:#D9A441;
  --gold-dark:#9C7220;
  --gold-light:#FBF2DE;
  --clay:#C1502E;
  --clay-light:#FBEAE3;
  --line:#E1E7DF;
}
.fc-app{ font-family:'Inter',sans-serif; color:var(--ink); }
.fc-display{ font-family:'Sora',sans-serif; }
.fc-card{ background:var(--paper-card); border:1px solid var(--line); border-radius:14px; padding:14px; }
.fc-icon-btn{ background:none; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:6px; border-radius:8px; }
.fc-icon-btn:hover{ background:var(--paper); }
.fc-input{ width:100%; box-sizing:border-box; border:1px solid var(--line); border-radius:10px; padding:10px 11px; font-size:13.5px; font-family:'Inter',sans-serif; background:var(--paper-card); color:var(--ink); outline:none; }
.fc-input:focus{ border-color:var(--jade); }
.fc-btn-primary{ display:inline-flex; align-items:center; justify-content:center; gap:6px; background:var(--jade); color:#fff; border:none; border-radius:10px; padding:10px 16px; font-size:13.5px; font-weight:600; cursor:pointer; }
.fc-btn-secondary{ background:var(--paper); color:var(--ink); border:1px solid var(--line); border-radius:10px; padding:10px 16px; font-size:13.5px; font-weight:600; cursor:pointer; }
.fc-chip{ background:var(--paper); border:1px solid var(--line); color:var(--ink-soft); border-radius:20px; padding:7px 13px; font-size:12.5px; font-weight:600; cursor:pointer; }
.fc-chip-active{ background:var(--jade-light); border-color:var(--jade); color:var(--jade); }
.fc-icon-pick{ border:1.5px solid var(--line); border-radius:9px; padding:7px 0; display:flex; align-items:center; justify-content:center; cursor:pointer; }
`;
