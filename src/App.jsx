import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Home, Plus, Tag, Repeat, PiggyBank, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, X, Trash2, Pencil, ShoppingCart, Pill, Fuel,
  Utensils, Gamepad2, ShoppingBag, Receipt, MoreHorizontal, Heart, Plane,
  Dumbbell, Gift, Smartphone, Wifi, Car, AlertTriangle, Check, Clock,
  TrendingDown, TrendingUp, Wallet, CreditCard, Banknote, QrCode, FileText,
  Landmark
} from "lucide-react";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
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
function monthLabel(year, month) {
  const d = new Date(year, month, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    },
    updatedAt: Date.now(),
  };
}
function ensureShape(parsed) {
  const def = defaultData();
  const settings = { ...def.settings, ...(parsed.settings || {}) };
  // Garante que o número de semanas sempre fique dentro do intervalo válido (1 a 5), mesmo vindo de dados antigos
  settings.weeksCount = Math.min(5, Math.max(1, Number(settings.weeksCount) || 4));
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
function computeWeeksForMonth(year, month, weeksCount) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const chunk = Math.ceil(daysInMonth / weeksCount);
  const weeks = [];
  for (let i = 0; i < weeksCount; i++) {
    const startDay = i * chunk + 1;
    if (startDay > daysInMonth) break;
    const endDay = Math.min(startDay + chunk - 1, daysInMonth);
    weeks.push({ index: i + 1, startDay, endDay });
  }
  return weeks;
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
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
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

  const persist = useCallback(async (newData) => {
    const withTs = { ...newData, updatedAt: Date.now() };
    setData(withTs);
    try {
      setSaveError(false);
      await setDoc(docRef, withTs);
      // Só marca como sincronizado depois que a gravação realmente foi confirmada na nuvem
      lastSyncedRef.current = withTs.updatedAt;
    } catch (e) {
      console.error("Erro ao salvar no Firestore:", e);
      setSaveError(true);
    }
  }, []);

  // Geração automática de gastos recorrentes para o mês atual real
  useEffect(() => {
    if (!data) return;
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let changed = false;
    const newExpenses = [...data.expenses];
    (data.recurring || []).filter((r) => r.active).forEach((r) => {
      const day = Math.min(Number(r.day) || 1, daysInMonth);
      if (today >= day) {
        const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
        const exists = newExpenses.some((e) => e.recurringId === r.id && e.date.startsWith(monthPrefix));
        if (!exists) {
          newExpenses.push({
            id: genId("exp"),
            value: Number(r.value) || 0,
            description: r.description,
            date: `${monthPrefix}-${String(day).padStart(2, "0")}`,
            categoryId: r.categoryId,
            person: r.person || "Automático",
            paymentMethodId: r.paymentMethodId,
            recurringId: r.id,
          });
          changed = true;
        }
      }
    });
    if (changed) {
      persist({ ...data, expenses: newExpenses });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data.recurring, data && data.expenses && data.expenses.length]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return now.getFullYear() === viewYear && now.getMonth() === viewMonth;
  }, [viewYear, viewMonth]);

  const weeksCount = data ? data.settings.weeksCount : 4;
  const monthlyLimit = data ? Number(data.settings.monthlyLimit) || 0 : 0;
  const weeklyGoal = weeksCount ? monthlyLimit / weeksCount : 0;

  const weeksRaw = useMemo(() => computeWeeksForMonth(viewYear, viewMonth, weeksCount), [viewYear, viewMonth, weeksCount]);

  const monthExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses
      .filter((e) => {
        const d = parseDate(e.date);
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data, viewYear, viewMonth]);

  const monthCardExpenses = useMemo(
    () => (data ? monthExpenses.filter((e) => isCardMethod(e.paymentMethodId, data.paymentMethods)) : []),
    [monthExpenses, data]
  );
  const monthTotalSpent = useMemo(() => monthCardExpenses.reduce((s, e) => s + Number(e.value), 0), [monthCardExpenses]);
  const monthTotalAll = useMemo(() => monthExpenses.reduce((s, e) => s + Number(e.value), 0), [monthExpenses]);

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const todayZero = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTick]);

  // Quando o mês real virar (ex: app aberto na virada de 30→31 ou 31→1), avança automaticamente
  // a visualização para o novo mês — mas só se a pessoa estava olhando o mês "atual", sem ter navegado manualmente para outro mês.
  const lastKnownCurrentMonthRef = useRef(null);
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const prev = lastKnownCurrentMonthRef.current;
    if (prev && (prev.y !== y || prev.m !== m)) {
      setViewDate((vd) => (vd.getFullYear() === prev.y && vd.getMonth() === prev.m ? new Date(y, m, 1) : vd));
    }
    lastKnownCurrentMonthRef.current = { y, m };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTick]);

  const weeksWithStatus = useMemo(() => {
    return weeksRaw.map((w) => {
      const spent = monthCardExpenses
        .filter((e) => {
          const day = parseDate(e.date).getDate();
          return day >= w.startDay && day <= w.endDay;
        })
        .reduce((s, e) => s + Number(e.value), 0);
      const weekEnd = new Date(viewYear, viewMonth, w.endDay, 23, 59, 59);
      const weekStart = new Date(viewYear, viewMonth, w.startDay);
      let status;
      if (weekEnd < todayZero) status = spent > weeklyGoal ? "acima" : "concluida";
      else if (weekStart > todayZero) status = "futuro";
      else status = spent > weeklyGoal ? "acima" : "dentro";
      const saved = weekEnd < todayZero ? Math.max(0, weeklyGoal - spent) : 0;
      return { ...w, spent, goal: weeklyGoal, status, saved, weekStart, weekEnd };
    });
  }, [weeksRaw, monthCardExpenses, weeklyGoal, viewYear, viewMonth, todayZero]);

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
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const history = [];
    let total = 0;
    let guard = 0;
    while (
      (cursor.getFullYear() < now.getFullYear() ||
        (cursor.getFullYear() === now.getFullYear() && cursor.getMonth() <= now.getMonth())) &&
      guard < 240
    ) {
      guard++;
      const y = cursor.getFullYear(), m = cursor.getMonth();
      const wks = computeWeeksForMonth(y, m, data.settings.weeksCount);
      wks.forEach((w) => {
        const weekEnd = new Date(y, m, w.endDay, 23, 59, 59);
        if (weekEnd < now && weekEnd >= start) {
          const spent = data.expenses
            .filter((e) => {
              const d = parseDate(e.date);
              return (
                d.getFullYear() === y &&
                d.getMonth() === m &&
                d.getDate() >= w.startDay &&
                d.getDate() <= w.endDay &&
                isCardMethod(e.paymentMethodId, data.paymentMethods)
              );
            })
            .reduce((s, e) => s + Number(e.value), 0);
          const goal = (Number(data.settings.monthlyLimit) || 0) / data.settings.weeksCount;
          const saved = Math.max(0, goal - spent);
          total += saved;
          history.push({ y, m, week: w.index, startDay: w.startDay, endDay: w.endDay, spent, goal, saved });
        }
      });
      cursor = new Date(y, m + 1, 1);
    }
    history.reverse();
    return { total, history };
  }, [data]);

  if (loading || !data) {
    return (
      <div className="fc-app" style={{ minHeight: 480, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{STYLE}</style>
        <p style={{ color: "var(--ink-soft)", fontFamily: "Inter,sans-serif" }}>Carregando seus dados…</p>
      </div>
    );
  }

  // ---------- ações ----------
  function saveExpense(exp) {
    const exists = data.expenses.some((e) => e.id === exp.id);
    const expenses = exists ? data.expenses.map((e) => (e.id === exp.id ? exp : e)) : [...data.expenses, exp];
    persist({ ...data, expenses });
    setExpenseModal(null);
  }
  function deleteExpense(id) {
    persist({ ...data, expenses: data.expenses.filter((e) => e.id !== id) });
  }
  function saveCategory(cat) {
    const exists = data.categories.some((c) => c.id === cat.id);
    const categories = exists ? data.categories.map((c) => (c.id === cat.id ? cat : c)) : [...data.categories, cat];
    persist({ ...data, categories });
    setCategoryModal(null);
  }
  function deleteCategory(id) {
    if (data.categories.length <= 1) return;
    const fallback = data.categories.find((c) => c.id !== id).id;
    const categories = data.categories.filter((c) => c.id !== id);
    const expenses = data.expenses.map((e) => (e.categoryId === id ? { ...e, categoryId: fallback } : e));
    const recurring = data.recurring.map((r) => (r.categoryId === id ? { ...r, categoryId: fallback } : r));
    persist({ ...data, categories, expenses, recurring });
  }
  function savePaymentMethod(pm) {
    const exists = data.paymentMethods.some((p) => p.id === pm.id);
    const paymentMethods = exists ? data.paymentMethods.map((p) => (p.id === pm.id ? pm : p)) : [...data.paymentMethods, pm];
    persist({ ...data, paymentMethods });
    setPaymentMethodModal(null);
  }
  function deletePaymentMethod(id) {
    if (data.paymentMethods.length <= 1) return;
    const fallback = data.paymentMethods.find((p) => p.id !== id).id;
    const paymentMethods = data.paymentMethods.filter((p) => p.id !== id);
    const expenses = data.expenses.map((e) => (e.paymentMethodId === id ? { ...e, paymentMethodId: fallback } : e));
    const recurring = data.recurring.map((r) => (r.paymentMethodId === id ? { ...r, paymentMethodId: fallback } : r));
    persist({ ...data, paymentMethods, expenses, recurring });
  }
  function saveRecurring(rec) {
    const exists = data.recurring.some((r) => r.id === rec.id);
    const recurring = exists ? data.recurring.map((r) => (r.id === rec.id ? rec : r)) : [...data.recurring, rec];
    persist({ ...data, recurring });
    setRecurringModal(null);
  }
  function deleteRecurring(id) {
    persist({ ...data, recurring: data.recurring.filter((r) => r.id !== id) });
  }
  function saveSettings(settings) {
    persist({ ...data, settings });
    setSettingsOpen(false);
  }

  function goPrevMonth() {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  }
  function goNextMonth() {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  }
  function goToday() {
    const d = new Date();
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  const percentSpent = monthlyLimit > 0 ? (monthTotalSpent / monthlyLimit) * 100 : 0;
  const barColor = percentSpent > 100 ? "var(--clay)" : percentSpent > 80 ? "var(--gold)" : "var(--jade)";

  const TABS = [
    { key: "inicio", label: "Início", icon: Home },
    { key: "categorias", label: "Categorias", icon: Tag },
    { key: "recorrentes", label: "Recorrentes", icon: Repeat },
    { key: "caixinha", label: "Caixinha", icon: PiggyBank },
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
          <button onClick={goPrevMonth} className="fc-icon-btn"><ChevronLeft size={18} /></button>
          <button onClick={goToday} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "center" }}>
            <p className="fc-display" style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: "capitalize" }}>{monthLabel(viewYear, viewMonth)}</p>
            {!isCurrentMonth && <p style={{ fontSize: 10, color: "var(--jade)", margin: 0 }}>Toque para voltar a hoje</p>}
          </button>
          <button onClick={goNextMonth} className="fc-icon-btn"><ChevronRight size={18} /></button>
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
            onToggleActive={(r) => saveRecurring({ ...r, active: !r.active })}
          />
        )}
        {activeTab === "caixinha" && <CaixinhaTab caixinha={caixinha} monthlyLimit={monthlyLimit} />}
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
function InicioTab({ data, monthTotalSpent, monthTotalAll, monthlyLimit, percentSpent, barColor, weeksWithStatus, monthExpenses, onEditExpense, onDeleteExpense }) {
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

      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 2px 8px" }}>Metas semanais</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {weeksWithStatus.map((w) => (
          <WeekRow key={w.index} w={w} />
        ))}
      </div>

      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.4, margin: "18px 2px 8px" }}>Últimos lançamentos</p>
      {monthExpenses.length === 0 ? (
        <EmptyState text="Nenhum gasto lançado neste mês ainda. Toque no botão + para começar." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {monthExpenses.slice(0, 12).map((e) => (
            <ExpenseRow key={e.id} expense={e} categories={data.categories} paymentMethods={data.paymentMethods} onEdit={() => onEditExpense(e)} onDelete={() => onDeleteExpense(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekRow({ w }) {
  const pct = w.goal > 0 ? Math.min(100, (w.spent / w.goal) * 100) : 0;
  const over = w.spent > w.goal;
  const cfg = {
    futuro: { label: "Ainda não começou", color: "var(--ink-soft)", Icon: Clock },
    dentro: { label: "Dentro da meta", color: "var(--jade)", Icon: TrendingDown },
    acima: { label: "Acima da meta", color: "var(--clay)", Icon: TrendingUp },
    concluida: { label: over ? "Excedeu a meta" : "Economizou nesta semana", color: over ? "var(--clay)" : "var(--jade)", Icon: over ? TrendingUp : Check },
  }[w.status];
  return (
    <div className="fc-card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Semana {w.index} <span style={{ color: "var(--ink-soft)", fontWeight: 400, fontSize: 11.5 }}>(dias {w.startDay}–{w.endDay})</span></p>
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
  return (
    <div className="fc-card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ background: colors.bg, width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={cat?.icon} size={17} color={colors.text} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{expense.description || cat?.name}</p>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }}>{formatDateBR(expense.date)} · {expense.person}{pm ? ` · ${pm.name}` : ""}</p>
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
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>Assinaturas, escola, internet, plano de saúde…</p>
        <button onClick={onAdd} className="fc-btn-primary" style={{ padding: "7px 12px", fontSize: 12.5 }}><Plus size={14} /> Nova</button>
      </div>
      {recurring.length === 0 ? (
        <EmptyState text="Nenhuma despesa recorrente cadastrada. Cadastre contas fixas para que sejam lançadas automaticamente todo mês." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recurring.map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            const colors = COLOR_CLASSES[cat?.color] || COLOR_CLASSES.gray;
            return (
              <div key={r.id} className="fc-card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, opacity: r.active ? 1 : 0.5 }}>
                <div style={{ background: colors.bg, width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={cat?.icon} size={18} color={colors.text} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{r.description}</p>
                  <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: 0 }}>{formatBRL(r.value)} · todo dia {r.day} {r.person ? `· ${r.person}` : ""}</p>
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
                <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0, textTransform: "capitalize" }}>{monthLabel(h.y, h.m)} · Semana {h.week}</p>
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
  const [active, setActive] = useState(initial.active ?? true);

  function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim() || !value) return;
    onSave({ id: initial.id || genId("rec"), description: description.trim(), value: Number(value), categoryId, paymentMethodId, day: Number(day), person, active });
  }

  return (
    <ModalShell title={isEdit ? "Editar recorrente" : "Nova despesa recorrente"} onClose={onClose}>
      <div>
        <Field label="Descrição">
          <input className="fc-input" type="text" placeholder="Ex: Internet, escola, plano de saúde" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus required />
        </Field>
        <Field label="Valor (R$)">
          <input className="fc-input" type="number" step="0.01" min="0" value={value} onChange={(e) => setValue(e.target.value)} required />
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
        <Field label="Dia da cobrança no mês">
          <input className="fc-input" type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} required />
        </Field>
        <Field label="Responsável (opcional)">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["", settings.person1, settings.person2].map((p) => (
              <button type="button" key={p || "auto"} onClick={() => setPerson(p)} className={person === p ? "fc-chip fc-chip-active" : "fc-chip"}>{p || "Automático"}</button>
            ))}
          </div>
        </Field>
        <Field label="Status">
          <button type="button" onClick={() => setActive(!active)} className={active ? "fc-chip fc-chip-active" : "fc-chip"}>{active ? "Ativa — lança todo mês" : "Pausada"}</button>
        </Field>
        <button type="button" onClick={handleSubmit} className="fc-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>Salvar</button>
      </div>
    </ModalShell>
  );
}

// ---------------- Modal: configurações ----------------
function SettingsModal({ initial, onSave, onClose }) {
  const [monthlyLimit, setMonthlyLimit] = useState(initial.monthlyLimit ?? 4000);
  const [weeksCount, setWeeksCount] = useState(Math.min(5, Math.max(1, Number(initial.weeksCount) || 4)));
  const [person1, setPerson1] = useState(initial.person1 ?? "Você");
  const [person2, setPerson2] = useState(initial.person2 ?? "Esposa");
  const [startDate, setStartDate] = useState(initial.startDate ?? todayStr());
  const [localError, setLocalError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    try {
      const safeLimit = Number(monthlyLimit);
      onSave({
        monthlyLimit: Number.isFinite(safeLimit) && safeLimit >= 0 ? safeLimit : 0,
        weeksCount: Math.min(5, Math.max(1, Number(weeksCount) || 4)),
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
        <Field label="Dividir o limite em quantas metas semanais">
          <select className="fc-input" value={weeksCount} onChange={(e) => setWeeksCount(e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? "semana" : "semanas"} — {formatBRL((Number(monthlyLimit) || 0) / n)} por semana</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "6px 0 0" }}>Esse valor é um saldo único do casal por semana — não é por pessoa. Os gastos de vocês dois somam juntos dentro da mesma meta.</p>
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
