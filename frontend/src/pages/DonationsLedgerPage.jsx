import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HandCoins,
  PlusCircle,
  Printer,
  Receipt,
  RefreshCw,
  Table2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import client from '../api/client';
import { LEDGER_ENDPOINTS } from '../api/endpoints';
import { useSettings } from '../context/SettingsContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import PrintHeader from '../components/PrintHeader';

const todayISO = () => new Date().toISOString().slice(0, 10);
const MAX_RECEIPT_NUMBER = 99999;
const RECEIPT_STORAGE_KEY = 'ledger_last_receipt_number_5digit';

// Allows whole numbers without forcing .00, while still supporting up to 2 decimal places if entered
const fmtAmount = (v) => {
  const num = Number(v || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

// Strips any "DON-" prefix and clamps/resets to a 1..99999 (up to 5-digit) number
const normalizeReceiptNumber = (rawValue, fallbackNumber = 1) => {
  const digitsOnly = String(rawValue ?? '').replace(/\D/g, '');
  let parsed = digitsOnly ? parseInt(digitsOnly, 10) : Number(fallbackNumber);
  if (!Number.isFinite(parsed) || parsed < 1) {
    parsed = 1;
  }
  const wrapped = ((parsed - 1) % MAX_RECEIPT_NUMBER) + 1;
  return String(wrapped);
};

// Cleans empty or placeholder "School Donation" text so it isn't written into Donor / Description
const cleanDescription = (desc) => {
  const trimmed = String(desc ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'school donation') {
    return '';
  }
  return trimmed;
};

const TABS = [
  { id: 'ledger', label: 'Financial Ledger Entries', icon: Table2 },
  { id: 'expense', label: 'Record Ledger Expense', icon: TrendingDown },
  { id: 'donation', label: 'Record Donation', icon: Receipt },
];

export default function DonationsLedgerPage() {
  const { school_name, school_address } = useSettings();

  // Only one tab is active at a time; all others remain hidden
  const [activeTab, setActiveTab] = useState('ledger');

  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({
    total_income: 0,
    total_expenses: 0,
    total_donations: 0,
    donation_count: 0,
    current_balance: 0,
  });

  // Transient receipt shown only for print preview; disappears automatically when print dialog closes/cancels
  const [receiptToPrint, setReceiptToPrint] = useState(null);
  const [printMode, setPrintMode] = useState('none'); // 'none' | 'receipt' | 'ledger'

  const [loading, setLoading] = useState(false);
  const [submittingDonation, setSubmittingDonation] = useState(false);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters for Financial Ledger Entries
  const [sourceFilter, setSourceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'income' | 'expense'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Donation form state
  const [donationForm, setDonationForm] = useState({
    donor_name: '',
    donor_phone: '',
    donor_email: '',
    entry_date: todayISO(),
    source: 'donation',
    description: '',
    income: '',
  });

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    entry_date: todayISO(),
    source: 'expense',
    description: '',
    expenses: '',
  });

  const getNextReceiptNumber = useCallback(() => {
    let maxSeen = 0;

    for (const row of entries) {
      if (row?.receipt_number) {
        const num = Number(normalizeReceiptNumber(row.receipt_number, 0));
        if (Number.isFinite(num) && num > maxSeen) {
          maxSeen = num;
        }
      }
    }

    let savedLast = 0;
    try {
      const stored = Number(localStorage.getItem(RECEIPT_STORAGE_KEY) || 0);
      if (Number.isFinite(stored) && stored > 0) {
        savedLast = ((stored - 1) % MAX_RECEIPT_NUMBER) + 1;
      }
    } catch {
      // Ignore storage access errors
    }

    const currentMax = Math.max(maxSeen, savedLast);
    const nextNum = currentMax >= MAX_RECEIPT_NUMBER ? 1 : currentMax + 1;

    try {
      localStorage.setItem(RECEIPT_STORAGE_KEY, String(nextNum));
    } catch {
      // Ignore storage access errors
    }

    return String(nextNum);
  }, [entries]);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (sourceFilter.trim()) params.source = sourceFilter.trim();
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await client.get(LEDGER_ENDPOINTS.LIST, { params });
      const data = res.data || {};
      const loadedEntries = Array.isArray(data.entries) ? data.entries : [];
      setEntries(loadedEntries);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Failed to load financial ledger.'
      );
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, searchQuery, fromDate, toDate]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Full client-side filtering across source, donor name, description, receipt #, income, expenses, and date range
  const filteredEntries = useMemo(() => {
    const srcTerm = sourceFilter.trim().toLowerCase();
    const qTerm = searchQuery.trim().toLowerCase();
    const numericTerm = Number(qTerm.replace(/,/g, ''));
    const hasNumericSearch = qTerm !== '' && Number.isFinite(numericTerm);

    return entries.filter((row) => {
      const rowSource = String(row.source || '').toLowerCase();
      const rowDonor = String(row.donor_name || '').trim().toLowerCase();
      const rowDesc = cleanDescription(row.description).toLowerCase();
      const rowReceipt = row.receipt_number
        ? normalizeReceiptNumber(row.receipt_number, 0).toLowerCase()
        : '';
      const rowDate = String(row.entry_date || '').slice(0, 10);
      const inc = Number(row.income || 0);
      const exp = Number(row.expenses || 0);

      if (srcTerm && !rowSource.includes(srcTerm)) {
        return false;
      }

      if (typeFilter === 'income' && !(inc > 0)) {
        return false;
      }

      if (typeFilter === 'expense' && !(exp > 0)) {
        return false;
      }

      if (fromDate && (!rowDate || rowDate < fromDate)) {
        return false;
      }

      if (toDate && (!rowDate || rowDate > toDate)) {
        return false;
      }

      if (qTerm) {
        const textMatch =
          rowDonor.includes(qTerm) ||
          rowDesc.includes(qTerm) ||
          rowReceipt.includes(qTerm) ||
          rowSource.includes(qTerm) ||
          String(inc).includes(qTerm) ||
          String(exp).includes(qTerm);

        const amountMatch =
          hasNumericSearch &&
          (Math.abs(inc - numericTerm) < 0.0001 ||
            Math.abs(exp - numericTerm) < 0.0001);

        if (!textMatch && !amountMatch) {
          return false;
        }
      }

      return true;
    });
  }, [entries, sourceFilter, searchQuery, typeFilter, fromDate, toDate]);

  const hasActiveFilters = Boolean(
    sourceFilter.trim() ||
      searchQuery.trim() ||
      typeFilter !== 'all' ||
      fromDate ||
      toDate
  );

  // Recalculate summary when filters are active so cards match the filtered entries
  const displaySummary = useMemo(() => {
    if (!hasActiveFilters) return summary;

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalDonations = 0;
    let donationCount = 0;

    for (const row of filteredEntries) {
      const inc = Number(row.income || 0);
      const exp = Number(row.expenses || 0);
      totalIncome += inc;
      totalExpenses += exp;
      if (
        row.receipt_number ||
        String(row.source || '').toLowerCase() === 'donation'
      ) {
        totalDonations += inc;
        if (inc > 0) donationCount += 1;
      }
    }

    return {
      total_income: totalIncome,
      total_expenses: totalExpenses,
      total_donations: totalDonations,
      donation_count: donationCount,
      current_balance: totalIncome - totalExpenses,
    };
  }, [hasActiveFilters, summary, filteredEntries]);

  // Clean up receipt/print state as soon as print preview closes (whether printed or cancelled/backed out)
  useEffect(() => {
    const clearPrintState = () => {
      setPrintMode('none');
      setReceiptToPrint(null);
    };

    window.addEventListener('afterprint', clearPrintState);
    return () => {
      window.removeEventListener('afterprint', clearPrintState);
    };
  }, []);

  const launchPrintPreview = useCallback((mode, slipData = null) => {
    if (slipData) {
      setReceiptToPrint(slipData);
    }
    setPrintMode(mode);

    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          window.print();
        } finally {
          setTimeout(() => {
            setPrintMode('none');
            setReceiptToPrint(null);
          }, 300);
        }
      }, 40);
    });
  }, []);

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    setError('');
    setNotice('');
    setReceiptToPrint(null);
    setPrintMode('none');
  };

  const handleDonationSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const rawAmount = String(donationForm.income ?? '').trim();
    const amount = Number(rawAmount);
    if (!rawAmount || !Number.isFinite(amount) || amount <= 0) {
      setError('Please enter a valid donation amount greater than 0.');
      return;
    }

    setSubmittingDonation(true);
    try {
      const nextReceiptNo = getNextReceiptNumber();
      const cleanedDesc = cleanDescription(donationForm.description);
      const cleanedDonor = donationForm.donor_name.trim();

      const payload = {
        receipt_number: nextReceiptNo,
        donor_name: cleanedDonor,
        donor_phone: donationForm.donor_phone.trim(),
        donor_email: donationForm.donor_email.trim(),
        entry_date: donationForm.entry_date || todayISO(),
        source: donationForm.source.trim() || 'donation',
        description: cleanedDesc,
        income: amount,
        expenses: 0,
      };

      const res = await client.post(LEDGER_ENDPOINTS.CREATE_DONATION, payload);
      const created = res.data?.entry || res.data?.donation || res.data || {};

      const finalReceiptNo = normalizeReceiptNumber(
        created.receipt_number || payload.receipt_number,
        nextReceiptNo
      );

      try {
        localStorage.setItem(RECEIPT_STORAGE_KEY, finalReceiptNo);
      } catch {
        // Ignore storage access errors
      }

      const receiptSlip = {
        id: created.id,
        receipt_number: finalReceiptNo,
        entry_date: created.entry_date || payload.entry_date,
        source: created.source || payload.source,
        donor_name:
          String(created.donor_name ?? cleanedDonor).trim() || 'Generous Donor',
        donor_phone: created.donor_phone ?? payload.donor_phone ?? '',
        donor_email: created.donor_email ?? payload.donor_email ?? '',
        description: cleanDescription(created.description ?? cleanedDesc),
        amount: Number(created.income ?? created.amount ?? amount),
      };

      setDonationForm({
        donor_name: '',
        donor_phone: '',
        donor_email: '',
        entry_date: todayISO(),
        source: 'donation',
        description: '',
        income: '',
      });

      setNotice(`Donation recorded (Receipt #${receiptSlip.receipt_number}).`);
      await fetchLedger();

      launchPrintPreview('receipt', receiptSlip);
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Could not record donation.'
      );
    } finally {
      setSubmittingDonation(false);
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const rawExp = String(expenseForm.expenses ?? '').trim();
    const expAmount = Number(rawExp);
    if (!rawExp || !Number.isFinite(expAmount) || expAmount <= 0) {
      setError('Please enter a valid expense amount greater than 0.');
      return;
    }

    setSubmittingExpense(true);
    try {
      await client.post(LEDGER_ENDPOINTS.CREATE_ENTRY, {
        entry_date: expenseForm.entry_date || todayISO(),
        source: expenseForm.source.trim() || 'expense',
        description: expenseForm.description.trim() || 'School expense',
        income: 0,
        expenses: expAmount,
      });

      setExpenseForm({
        entry_date: todayISO(),
        source: 'expense',
        description: '',
        expenses: '',
      });

      setNotice('Expense recorded and ledger balance updated.');
      await fetchLedger();
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Could not record expense.'
      );
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handlePrintRowReceipt = (row, fallbackIdx = 1) => {
    const receiptSlip = {
      id: row.id,
      receipt_number: normalizeReceiptNumber(row.receipt_number, fallbackIdx),
      entry_date: row.entry_date || todayISO(),
      source: row.source || 'donation',
      donor_name: String(row.donor_name || '').trim() || 'Generous Donor',
      donor_phone: row.donor_phone || '',
      donor_email: row.donor_email || '',
      description: cleanDescription(row.description),
      amount: Number(row.income || 0),
    };
    launchPrintPreview('receipt', receiptSlip);
  };

  const isPrintingReceipt = printMode === 'receipt' && Boolean(receiptToPrint);
  const isPrintingLedger = printMode === 'ledger';
  const isAnyPrinting = printMode !== 'none';

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <style>{`
        @media print {
          .no-print,
          [role="tablist"],
          nav,
          aside,
          header,
          footer {
            display: none !important;
          }
        }
      `}</style>

      {/* Page Header (hidden during print preview) */}
      {!isAnyPrinting && (
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <HandCoins className="w-6 h-6 text-brand-600" />
              Donations &amp; Financial Ledger
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Record donations, print donor receipts, record expenses, and view ledger entries.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={fetchLedger}
            loading={loading}
            icon={RefreshCw}
          >
            Refresh
          </Button>
        </div>
      )}

      {/* Single-Active Tab Bar (hidden during print preview) */}
      {!isAnyPrinting && (
        <div
          role="tablist"
          aria-label="Donations and Ledger Tabs"
          className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 no-print"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectTab(id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-900/40'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Status Alerts */}
      {error && !isAnyPrinting && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 text-sm text-red-800 dark:text-red-200 no-print">
          {error}
        </div>
      )}
      {notice && !isAnyPrinting && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-sm text-emerald-800 dark:text-emerald-200 no-print">
          {notice}
        </div>
      )}

      {/* Transient Donor Receipt for Print Preview (disappears when print dialog closes/cancels) */}
      {receiptToPrint && (
        <div className={isPrintingReceipt ? 'print-container' : 'hidden'}>
          <Card className="p-6 border-2 border-emerald-500/40 bg-white dark:bg-slate-900 space-y-5">
            <PrintHeader title="Donor Donation Receipt" />

            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Donor Receipt
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {school_name || 'Jamia Hussania Anwar-ul-Quran'}
                </h2>
                {school_address && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {school_address}
                  </p>
                )}
              </div>

              <div className="text-left sm:text-right font-mono text-xs space-y-1">
                <div>
                  <span className="text-slate-500">Receipt #: </span>
                  <strong className="text-slate-900 dark:text-white">
                    {receiptToPrint.receipt_number}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Date: </span>
                  <strong className="text-slate-900 dark:text-white">
                    {receiptToPrint.entry_date}
                  </strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-xs text-slate-500 uppercase font-semibold">
                  Received With Thanks From
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {receiptToPrint.donor_name}
                </div>
                {receiptToPrint.donor_phone && (
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Phone: {receiptToPrint.donor_phone}
                  </div>
                )}
                {receiptToPrint.donor_email && (
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Email: {receiptToPrint.donor_email}
                  </div>
                )}
              </div>

              <div className="space-y-1 sm:text-right">
                <div className="text-xs text-slate-500 uppercase font-semibold">
                  Donated Amount
                </div>
                <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">
                  {fmtAmount(receiptToPrint.amount)}
                </div>
                <div className="text-xs text-slate-500">
                  Source: {receiptToPrint.source || 'donation'}
                </div>
              </div>
            </div>

            {receiptToPrint.description && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm">
                <span className="text-xs font-semibold uppercase text-slate-500 block mb-0.5">
                  Purpose / Description
                </span>
                <span className="text-slate-800 dark:text-slate-100">
                  {receiptToPrint.description}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700">
              <p className="text-xs text-slate-500 italic">
                Thank you for your generous donation.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 1: Financial Ledger Entries */}
      <section
        role="tabpanel"
        className={
          activeTab === 'ledger' && !isPrintingReceipt
            ? `space-y-6 ${isPrintingLedger ? 'print-container' : ''}`
            : 'hidden'
        }
      >
        {/* Summary Cards: visible on screen, unmounted during ledger print so they never appear on print */}
        {!isPrintingLedger && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
            <Card className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Income
                </div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {fmtAmount(displaySummary.total_income)}
                </div>
              </div>
              <TrendingUp className="w-7 h-7 text-emerald-500/80" />
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Expenses
                </div>
                <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                  {fmtAmount(displaySummary.total_expenses)}
                </div>
              </div>
              <TrendingDown className="w-7 h-7 text-rose-500/80" />
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Donations ({displaySummary.donation_count || 0})
                </div>
                <div className="text-xl font-bold text-brand-700 dark:text-brand-300 mt-1">
                  {fmtAmount(displaySummary.total_donations)}
                </div>
              </div>
              <Receipt className="w-7 h-7 text-brand-500/80" />
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Current Balance
                </div>
                <div
                  className={`text-xl font-bold mt-1 ${
                    Number(displaySummary.current_balance) < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {fmtAmount(displaySummary.current_balance)}
                </div>
              </div>
              <Wallet className="w-7 h-7 text-slate-500" />
            </Card>
          </div>
        )}

        <Card className="p-5 space-y-4">
          <PrintHeader title="Financial Ledger Entries" />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Financial Ledger Entries
              </h2>

              {!isPrintingLedger && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Printer}
                  onClick={() => launchPrintPreview('ledger')}
                  className="no-print"
                >
                  Print
                </Button>
              )}
            </div>

            {/* Filter Bar: unmounted during ledger print so filter fields/labels never appear on print */}
            {!isPrintingLedger && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs no-print">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Donor / Income / Expense
                  </span>
                  <Input
                    name="search_query"
                    placeholder="Donor name, amount, receipt..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Source
                  </span>
                  <Input
                    name="filter_source"
                    placeholder="e.g. donation or expense"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Entry Type
                  </span>
                  <select
                    name="filter_type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs text-slate-800 dark:text-slate-100"
                  >
                    <option value="all">All (Income &amp; Expenses)</option>
                    <option value="income">Income / Donations Only</option>
                    <option value="expense">Expenses Only</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    From
                  </span>
                  <Input
                    name="from_date"
                    placeholder="From"
                    title="From"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    To
                  </span>
                  <Input
                    name="to_date"
                    placeholder="To"
                    title="To"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!hasActiveFilters}
                    onClick={() => {
                      setSourceFilter('');
                      setSearchQuery('');
                      setTypeFilter('all');
                      setFromDate('');
                      setToDate('');
                    }}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                  <th className="p-2.5 whitespace-nowrap">Date</th>
                  <th className="p-2.5 whitespace-nowrap">Source</th>
                  <th className="p-2.5 max-w-[180px] w-[180px]">
                    Donor / Description
                  </th>
                  <th className="p-2.5 whitespace-nowrap">Receipt #</th>
                  <th className="p-2.5 text-right whitespace-nowrap">Income</th>
                  <th className="p-2.5 text-right whitespace-nowrap">Expenses</th>
                  <th className="p-2.5 text-right whitespace-nowrap">Balance</th>
                  {!isPrintingLedger && (
                    <th className="p-2.5 text-center whitespace-nowrap no-print">
                      Print
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isPrintingLedger ? 7 : 8}
                      className="p-6 text-center text-slate-400"
                    >
                      {loading
                        ? 'Loading ledger entries...'
                        : 'No matching ledger entries found.'}
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((row, idx) => {
                    const isDonation =
                      Boolean(row.receipt_number) || Number(row.income) > 0;
                    const displayReceiptNo = row.receipt_number
                      ? normalizeReceiptNumber(row.receipt_number, idx + 1)
                      : '—';
                    const donorText = String(row.donor_name || '').trim();
                    const descText = cleanDescription(row.description);

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="p-2.5 font-mono text-xs whitespace-nowrap">
                          {row.entry_date || '—'}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {row.source || 'donation'}
                          </span>
                        </td>
                        <td className="p-2.5 max-w-[180px] w-[180px] break-words">
                          {isPrintingLedger ? (
                            <div className="font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                              {donorText || '—'}
                            </div>
                          ) : (
                            <>
                              <div className="font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                                {donorText || descText || '—'}
                              </div>
                              {donorText && descText && (
                                <div className="text-xs text-slate-500 leading-snug mt-0.5">
                                  {descText}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-xs whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {displayReceiptNo}
                        </td>
                        <td className="p-2.5 text-right font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                          {Number(row.income) > 0 ? fmtAmount(row.income) : '—'}
                        </td>
                        <td className="p-2.5 text-right font-semibold whitespace-nowrap text-rose-700 dark:text-rose-400">
                          {Number(row.expenses) > 0
                            ? fmtAmount(row.expenses)
                            : '—'}
                        </td>
                        <td className="p-2.5 text-right font-bold whitespace-nowrap text-slate-900 dark:text-white">
                          {fmtAmount(row.balance)}
                        </td>
                        {!isPrintingLedger && (
                          <td className="p-2.5 text-center whitespace-nowrap no-print">
                            {isDonation ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={Printer}
                                onClick={() => handlePrintRowReceipt(row, idx + 1)}
                              >
                                Print
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* TAB 2: Record Ledger Expense */}
      <section
        role="tabpanel"
        className={activeTab === 'expense' ? 'space-y-6' : 'hidden'}
      >
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-rose-600" />
              Record Ledger Expense
            </h2>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Printer}
              onClick={() => launchPrintPreview('ledger')}
              className="no-print"
            >
              Print
            </Button>
          </div>

          <form onSubmit={handleExpenseSubmit} className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                name="expenses"
                label="Expense Amount *"
                type="number"
                min="1"
                placeholder="Enter amount (e.g. 2500)"
                value={expenseForm.expenses}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, expenses: e.target.value }))
                }
              />

              <Input
                name="expense_date"
                label="Date"
                type="date"
                value={expenseForm.entry_date}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, entry_date: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                name="expense_source"
                label="Source"
                value={expenseForm.source}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, source: e.target.value }))
                }
              />

              <Input
                name="expense_description"
                label="Description"
                placeholder="Supplies, repairs, bills..."
                value={expenseForm.description}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center gap-2 no-print">
              <Button
                type="submit"
                variant="danger"
                loading={submittingExpense}
              >
                Save Expense
              </Button>
            </div>
          </form>
        </Card>
      </section>

      {/* TAB 3: Record Donation */}
      <section
        role="tabpanel"
        className={
          activeTab === 'donation' && !isPrintingReceipt
            ? 'space-y-6'
            : 'hidden'
        }
      >
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              Record Donation
            </h2>
          </div>

          <form onSubmit={handleDonationSubmit} className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                name="donor_name"
                label="Donor Name"
                placeholder="e.g. Bilal Ahmad"
                value={donationForm.donor_name}
                onChange={(e) =>
                  setDonationForm((f) => ({ ...f, donor_name: e.target.value }))
                }
              />

              <Input
                name="income"
                label="Donation Amount *"
                type="number"
                min="1"
                placeholder="Enter amount (e.g. 5000)"
                value={donationForm.income}
                onChange={(e) =>
                  setDonationForm((f) => ({ ...f, income: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                name="entry_date"
                label="Date"
                type="date"
                value={donationForm.entry_date}
                onChange={(e) =>
                  setDonationForm((f) => ({ ...f, entry_date: e.target.value }))
                }
              />

              <Input
                name="source"
                label="Source"
                value={donationForm.source}
                onChange={(e) =>
                  setDonationForm((f) => ({ ...f, source: e.target.value }))
                }
              />

              <Input
                name="donor_phone"
                label="Phone"
                placeholder="0300..."
                value={donationForm.donor_phone}
                onChange={(e) =>
                  setDonationForm((f) => ({ ...f, donor_phone: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                name="donor_email"
                label="Email"
                type="email"
                placeholder="donor@example.com"
                value={donationForm.donor_email}
                onChange={(e) =>
                  setDonationForm((f) => ({ ...f, donor_email: e.target.value }))
                }
              />

              <Input
                name="description"
                label="Purpose / Description"
                placeholder="Lab, library, scholarships..."
                value={donationForm.description}
                onChange={(e) =>
                  setDonationForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center gap-2 no-print">
              <Button
                type="submit"
                variant="primary"
                loading={submittingDonation}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Save &amp; Print Receipt
              </Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}

