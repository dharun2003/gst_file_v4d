
import React, { useState, useMemo, useCallback } from 'react';
import type { Ledger, Voucher, StockItem, SalesPurchaseVoucher, LedgerGroupMaster } from '../types';

interface ReportsPageProps {
  vouchers: Voucher[];
  ledgers: Ledger[];
  stockItems: StockItem[];
  ledgerGroups: LedgerGroupMaster[];
}

type ReportType = 'DayBook' | 'LedgerReport' | 'TrialBalance' | 'StockSummary' | 'GSTReports';

const gstrForms = [
  'GSTR-1', 'GSTR-2', 'GSTR-2A', 'GSTR-2B', 'GSTR-3', 'GSTR-3A', 'GSTR-3B', 
  'GSTR-4', 'GSTR-5', 'GSTR-5A', 'GSTR-6', 'GSTR-7', 'GSTR-8', 'GSTR-9', 
  'GSTR-9A', 'GSTR-9C', 'GSTR-10', 'GSTR-10A'
];

const ReportsPage: React.FC<ReportsPageProps> = ({ vouchers, ledgers, stockItems, ledgerGroups }) => {
  const [reportType, setReportType] = useState<ReportType>('DayBook');
  
  // Filters
  const [selectedLedger, setSelectedLedger] = useState<string>('All Ledgers');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedGstrReport, setSelectedGstrReport] = useState<string>('GSTR-1');
  
  const ledgersByName = useMemo(() => {
    return ledgers.reduce((acc, ledger) => {
        acc[ledger.name] = ledger;
        return acc;
    }, {} as {[key: string]: Ledger});
  }, [ledgers]);

  const trialBalanceData = useMemo(() => {
    if (reportType !== 'TrialBalance') return null;

    const balances: { [key: string]: { debit: number; credit: number } } = {};
    
    const ensureLedger = (name: string) => {
        if (name && !balances[name]) {
            balances[name] = { debit: 0, credit: 0 };
        }
    };
    
    ledgers.forEach(l => ensureLedger(l.name));
    
    vouchers.forEach(v => {
      switch (v.type) {
        case 'Purchase':
          ensureLedger(v.party); ensureLedger('Purchases'); ensureLedger('IGST'); ensureLedger('CGST'); ensureLedger('SGST');
          balances[v.party].credit += v.total;
          balances['Purchases'].debit += v.totalTaxableAmount;
          if (v.isInterState) balances['IGST'].debit += v.totalIgst;
          else { balances['CGST'].debit += v.totalCgst; balances['SGST'].debit += v.totalSgst; }
          break;
        case 'Sales':
          ensureLedger(v.party); ensureLedger('Sales'); ensureLedger('IGST'); ensureLedger('CGST'); ensureLedger('SGST');
          balances[v.party].debit += v.total;
          balances['Sales'].credit += v.totalTaxableAmount;
           if (v.isInterState) balances['IGST'].credit += v.totalIgst;
           else { balances['CGST'].credit += v.totalCgst; balances['SGST'].credit += v.totalSgst; }
          break;
        case 'Payment':
          ensureLedger(v.party); ensureLedger(v.account);
          balances[v.party].debit += v.amount; balances[v.account].credit += v.amount;
          break;
        case 'Receipt':
          ensureLedger(v.party); ensureLedger(v.account);
          balances[v.party].credit += v.amount; balances[v.account].debit += v.amount;
          break;
        case 'Contra':
          ensureLedger(v.fromAccount); ensureLedger(v.toAccount);
          balances[v.fromAccount].credit += v.amount; balances[v.toAccount].debit += v.amount;
          break;
        case 'Journal':
          v.entries.forEach(e => {
            if(e.ledger) { ensureLedger(e.ledger); balances[e.ledger].debit += e.debit; balances[e.ledger].credit += e.credit; }
          });
          break;
      }
    });

    const result = Object.entries(balances).map(([ledger, { debit, credit }]) => {
        if (debit > credit) return { ledger, debit: debit - credit, credit: 0 };
        if (credit > debit) return { ledger, debit: 0, credit: credit - debit };
        return { ledger, debit: 0, credit: 0 };
      }).filter(item => item.debit > 0 || item.credit > 0);
      
    const totals = result.reduce((acc, curr) => ({ debit: acc.debit + curr.debit, credit: acc.credit + curr.credit }), { debit: 0, credit: 0 });
    return { result, totals };
  }, [reportType, vouchers, ledgers]);
  
  const stockSummaryData = useMemo(() => {
    if (reportType !== 'StockSummary') return null;
    
    const summary: {[key: string]: {opening: number, inward: number, outward: number}} = {};
    stockItems.forEach(i => {
      summary[i.name] = {
        opening: i.quantity || 0,
        inward: 0,
        outward: 0
      };
    });

    vouchers.forEach(v => {
        if (v.type === 'Purchase' || v.type === 'Sales') {
            (v as SalesPurchaseVoucher).items.forEach(item => {
                if (summary[item.name]) {
                    if (v.type === 'Purchase') {
                        summary[item.name].inward += item.qty;
                    } else {
                        summary[item.name].outward += item.qty;
                    }
                }
            });
        }
    });
    
    return Object.entries(summary).map(([name, data]) => ({ 
        name,
        opening: data.opening,
        inward: data.inward,
        outward: data.outward, 
        closing: data.opening + data.inward - data.outward
    }));
  }, [reportType, vouchers, stockItems]);
  
   const gstr1ReportData = useMemo(() => {
    if (reportType !== 'GSTReports') return null;
    const salesVouchers = vouchers.filter(v => v.type === 'Sales') as SalesPurchaseVoucher[];
    const b2b = salesVouchers.filter(v => ledgersByName[v.party]?.registrationType === 'Registered' && ledgersByName[v.party]?.gstin);
    const b2c = salesVouchers.filter(v => !ledgersByName[v.party] || ledgersByName[v.party].registrationType !== 'Registered' || !ledgersByName[v.party].gstin);
    return { b2b, b2c };
  }, [reportType, vouchers, ledgersByName]);

  const gstr2ReportData = useMemo(() => {
    if (reportType !== 'GSTReports') return null;
    const purchaseVouchers = vouchers.filter(v => v.type === 'Purchase') as SalesPurchaseVoucher[];
    const b2bPurchases = purchaseVouchers.filter(v => ledgersByName[v.party]?.registrationType === 'Registered' && ledgersByName[v.party]?.gstin);
    return { b2bPurchases };
  }, [reportType, vouchers, ledgersByName]);

  const gstr3bReportData = useMemo(() => {
    if (reportType !== 'GSTReports') return null;

    const salesVouchers = vouchers.filter(v => v.type === 'Sales') as SalesPurchaseVoucher[];
    const purchaseVouchers = vouchers.filter(v => v.type === 'Purchase') as SalesPurchaseVoucher[];

    const outwardSupplies = salesVouchers.reduce((acc, v) => {
        acc.taxableValue += v.totalTaxableAmount;
        acc.igst += v.totalIgst;
        acc.cgst += v.totalCgst;
        acc.sgst += v.totalSgst;
        return acc;
    }, { taxableValue: 0, igst: 0, cgst: 0, sgst: 0 });
    
    const inwardSupplies = purchaseVouchers
        .filter(v => ledgersByName[v.party]?.registrationType === 'Registered')
        .reduce((acc, v) => {
            acc.itc.igst += v.totalIgst;
            acc.itc.cgst += v.totalCgst;
            acc.itc.sgst += v.totalSgst;
            return acc;
        }, { itc: { igst: 0, cgst: 0, sgst: 0 } });
        
    const taxPayable = {
        igst: outwardSupplies.igst - inwardSupplies.itc.igst,
        cgst: outwardSupplies.cgst - inwardSupplies.itc.cgst,
        sgst: outwardSupplies.sgst - inwardSupplies.itc.sgst,
    };

    return { outwardSupplies, inwardSupplies, taxPayable };
  }, [reportType, vouchers, ledgersByName]);

  const filteredVouchers = useMemo(() => {
    if (reportType === 'DayBook') {
        let dayBookVouchers = vouchers;
        if (startDate) {
            dayBookVouchers = dayBookVouchers.filter(v => v.date >= startDate);
        }
        if (endDate) {
            dayBookVouchers = dayBookVouchers.filter(v => v.date <= endDate);
        }
        return dayBookVouchers;
    }
    return vouchers;
  }, [vouchers, reportType, startDate, endDate]);


  const getLedgerImpact = useCallback((voucher: Voucher, ledgerName: string): { debit: number; credit: number; particulars: string } => {
    let debit = 0, credit = 0, particulars = '';
    
    switch (voucher.type) {
      case 'Sales': 
        const salesVch = voucher as SalesPurchaseVoucher;
        if (salesVch.party === ledgerName) {
            debit = salesVch.total;
            particulars = 'Sales';
        } else if ('Sales' === ledgerName) {
            credit = salesVch.totalTaxableAmount;
            particulars = salesVch.party;
        } else if ('CGST' === ledgerName && !salesVch.isInterState) {
            credit = salesVch.totalCgst;
            particulars = salesVch.party;
        } else if ('SGST' === ledgerName && !salesVch.isInterState) {
            credit = salesVch.totalSgst;
            particulars = salesVch.party;
        } else if ('IGST' === ledgerName && salesVch.isInterState) {
            credit = salesVch.totalIgst;
            particulars = salesVch.party;
        }
        break;
      case 'Purchase': 
        const purchaseVch = voucher as SalesPurchaseVoucher;
        if (purchaseVch.party === ledgerName) {
            credit = purchaseVch.total;
            particulars = 'Purchases';
        } else if ('Purchases' === ledgerName) {
            debit = purchaseVch.totalTaxableAmount;
            particulars = purchaseVch.party;
        } else if ('CGST' === ledgerName && !purchaseVch.isInterState) {
            debit = purchaseVch.totalCgst;
            particulars = purchaseVch.party;
        } else if ('SGST' === ledgerName && !purchaseVch.isInterState) {
            debit = purchaseVch.totalSgst;
            particulars = purchaseVch.party;
        } else if ('IGST' === ledgerName && purchaseVch.isInterState) {
            debit = purchaseVch.totalIgst;
            particulars = purchaseVch.party;
        }
        break;
      case 'Receipt':
        if (voucher.party === ledgerName) { credit = voucher.amount; particulars = voucher.account; }
        if (voucher.account === ledgerName) { debit = voucher.amount; particulars = voucher.party; }
        break;
      case 'Payment':
        if (voucher.party === ledgerName) { debit = voucher.amount; particulars = voucher.account; }
        if (voucher.account === ledgerName) { credit = voucher.amount; particulars = voucher.party; }
        break;
      case 'Contra':
        if (voucher.toAccount === ledgerName) { debit = voucher.amount; particulars = voucher.fromAccount; }
        if (voucher.fromAccount === ledgerName) { credit = voucher.amount; particulars = voucher.toAccount; }
        break;
      case 'Journal':
        const relevantEntry = voucher.entries.find(e => e.ledger === ledgerName);
        if (relevantEntry) {
          debit = relevantEntry.debit; credit = relevantEntry.credit;
          const oppositeEntry = voucher.entries.find(e => e.ledger !== ledgerName);
          particulars = oppositeEntry ? oppositeEntry.ledger : 'Journal';
        }
        break;
    }
    return { debit, credit, particulars };
  }, []);

  const ledgerReportData = useMemo(() => {
    if (reportType !== 'LedgerReport' || !selectedLedger) return null;

    if (selectedLedger === 'All Ledgers') {
        const allVouchersSorted = vouchers
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const filteredForDate = allVouchersSorted.filter(v => {
            const isAfterStartDate = startDate ? v.date >= startDate : true;
            const isBeforeEndDate = endDate ? v.date <= endDate : true;
            return isAfterStartDate && isBeforeEndDate;
        });

        const transactions = filteredForDate.map(v => {
            let debit = 0;
            let credit = 0;

            switch (v.type) {
                case 'Sales':
                case 'Purchase':
                    debit = v.total;
                    credit = v.total;
                    break;
                case 'Payment':
                case 'Receipt':
                case 'Contra':
                    debit = v.amount;
                    credit = v.amount;
                    break;
                case 'Journal':
                    debit = v.totalDebit;
                    credit = v.totalCredit;
                    break;
            }

            return {
                id: v.id,
                date: v.date,
                particulars: v.narration || `Voucher Type: ${v.type}`,
                voucherType: v.type,
                debit,
                credit,
                balance: 0, // Not applicable for this view
            };
        });
        
        return { openingBalance: 0, transactions, closingBalance: 0, isAllLedgersView: true };
    }

    const isGroupSelected = ledgerGroups.some(g => g.name === selectedLedger);

    const ledgersToReportOn = isGroupSelected
        ? ledgers.filter(l => l.group === selectedLedger).map(l => l.name)
        : [selectedLedger];
    
    if (ledgersToReportOn.length === 0) {
        return { openingBalance: 0, transactions: [], closingBalance: 0, isAllLedgersView: false };
    }

    const allLedgerVouchers = vouchers
      .filter(v => {
        switch (v.type) {
          case 'Sales': {
            const saleVch = v as SalesPurchaseVoucher;
            const relevantTaxLedgers = ['Sales'].concat(saleVch.isInterState ? ['IGST'] : ['CGST', 'SGST']);
            return ledgersToReportOn.includes(saleVch.party) || ledgersToReportOn.some(l => relevantTaxLedgers.includes(l));
          }
          case 'Purchase': {
            const purVch = v as SalesPurchaseVoucher;
            const relevantTaxLedgers = ['Purchases'].concat(purVch.isInterState ? ['IGST'] : ['CGST', 'SGST']);
            return ledgersToReportOn.includes(purVch.party) || ledgersToReportOn.some(l => relevantTaxLedgers.includes(l));
          }
          case 'Payment': case 'Receipt': 
            return ledgersToReportOn.includes(v.party) || ledgersToReportOn.includes(v.account);
          case 'Contra': 
            return ledgersToReportOn.includes(v.fromAccount) || ledgersToReportOn.includes(v.toAccount);
          case 'Journal': 
            return v.entries.some(e => e.ledger && ledgersToReportOn.includes(e.ledger));
          default: 
            return false;
        }
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const getVoucherImpactOnGroup = (voucher: Voucher) => {
        let totalDebit = 0;
        let totalCredit = 0;
        let particulars = '';

        ledgersToReportOn.forEach(ledgerName => {
            const impact = getLedgerImpact(voucher, ledgerName);
            totalDebit += impact.debit;
            totalCredit += impact.credit;
            if (impact.particulars && !particulars) {
                particulars = impact.particulars;
            }
        });
        
        if (voucher.type === 'Journal' && (totalDebit > 0 || totalCredit > 0)) {
            const entriesOutsideGroup = voucher.entries.filter(e => e.ledger && !ledgersToReportOn.includes(e.ledger));
            if (entriesOutsideGroup.length > 0) {
                particulars = entriesOutsideGroup.map(e => e.ledger).join(', ');
            } else {
                particulars = isGroupSelected ? "Journal (Internal Transfer)" : voucher.narration || 'Journal';
            }
        }

        return { debit: totalDebit, credit: totalCredit, particulars };
    };

    const openingVouchers = startDate ? allLedgerVouchers.filter(v => v.date < startDate) : [];
    const openingBalance = openingVouchers.reduce((acc, v) => {
        const { debit, credit } = getVoucherImpactOnGroup(v);
        return acc + debit - credit;
    }, 0);

    const periodVouchers = allLedgerVouchers.filter(v => {
      const isAfterStartDate = startDate ? v.date >= startDate : true;
      const isBeforeEndDate = endDate ? v.date <= endDate : true;
      return isAfterStartDate && isBeforeEndDate;
    });

    let runningBalance = openingBalance;
    const transactionsWithBalance = periodVouchers.map(v => {
      const { debit, credit, particulars } = getVoucherImpactOnGroup(v);
      if (debit === 0 && credit === 0) return null; // Skip transactions with no impact on the group/ledger
      runningBalance += (debit - credit);
      return { id: v.id, date: v.date, particulars, voucherType: v.type, debit, credit, balance: runningBalance };
    }).filter(Boolean) as { id: string; date: string; particulars: string; voucherType: string; debit: number; credit: number; balance: number; }[];
    
    const closingBalance = runningBalance;
    
    return { openingBalance, transactions: transactionsWithBalance, closingBalance, isAllLedgersView: false };
  }, [reportType, selectedLedger, startDate, endDate, vouchers, getLedgerImpact, ledgers, ledgerGroups]);

  const getVoucherAmount = (v: Voucher) => ('total' in v ? v.total : 'amount' in v ? v.amount : 0);
  const getVoucherParty = (v: Voucher) => ('party' in v ? v.party : 'N/A');

  const renderDayBook = () => (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50"><tr><th className="table-header">Date</th><th className="table-header">Voucher Type</th><th className="table-header">Party</th><th className="table-header text-right">Amount</th></tr></thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {filteredVouchers.length > 0 ? filteredVouchers.map(v => (
          <tr key={v.id}>
            <td className="table-cell text-gray-500">{new Date(v.date).toLocaleDateString()}</td>
            <td className="table-cell font-medium">{v.type}</td>
            <td className="table-cell text-gray-500">{getVoucherParty(v)}</td>
            <td className="table-cell font-mono text-right">{getVoucherAmount(v).toFixed(2)}</td>
          </tr>
        )) : (
          <tr><td colSpan={4} className="text-center py-10 text-gray-500">
            {(startDate || endDate) ? 'No transactions found for the selected date range.' : 'No transactions found.'}
          </td></tr>
        )}
      </tbody>
    </table>
  );

  const renderLedgerReport = () => {
    if (!ledgerReportData) {
        return <div className="text-center py-10 text-gray-500">Please select a ledger or group to view the report.</div>;
    }
    const { openingBalance, transactions, closingBalance, isAllLedgersView } = ledgerReportData;
    const formatBalance = (bal: number) => `${Math.abs(bal).toFixed(2)} ${bal > 0 ? 'Dr' : bal < 0 ? 'Cr' : ''}`;

    if (isAllLedgersView) {
        return (
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="table-header">Date</th>
                        <th className="table-header">Particulars</th>
                        <th className="table-header">Vch Type</th>
                        <th className="table-header text-right">Debit</th>
                        <th className="table-header text-right">Credit</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {transactions.map(t => (
                        <tr key={t.id}>
                            <td className="table-cell text-gray-500">{new Date(t.date).toLocaleDateString()}</td>
                            <td className="table-cell">{t.particulars}</td>
                            <td className="table-cell text-gray-500">{t.voucherType}</td>
                            <td className="table-cell font-mono text-right">{t.debit > 0 ? t.debit.toFixed(2) : ''}</td>
                            <td className="table-cell font-mono text-right">{t.credit > 0 ? t.credit.toFixed(2) : ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    return (
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
                <th className="table-header">Date</th>
                <th className="table-header">Particulars</th>
                <th className="table-header">Vch Type</th>
                <th className="table-header text-right">Debit</th>
                <th className="table-header text-right">Credit</th>
                <th className="table-header text-right">Balance</th>
            </tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
                <tr className="font-semibold bg-slate-50">
                    <td className="table-cell" colSpan={5}>Opening Balance</td>
                    <td className="table-cell font-mono text-right">{formatBalance(openingBalance)}</td>
                </tr>
                {transactions.map(t => (
                    <tr key={t.id}>
                        <td className="table-cell text-gray-500">{new Date(t.date).toLocaleDateString()}</td>
                        <td className="table-cell">{t.particulars}</td><td className="table-cell text-gray-500">{t.voucherType}</td>
                        <td className="table-cell font-mono text-right">{t.debit > 0 ? t.debit.toFixed(2) : ''}</td>
                        <td className="table-cell font-mono text-right">{t.credit > 0 ? t.credit.toFixed(2) : ''}</td>
                        <td className="table-cell font-mono text-right">{formatBalance(t.balance)}</td>
                    </tr>
                ))}
            </tbody>
            <tfoot className="bg-gray-100 font-bold">
                <tr><td className="table-cell" colSpan={5}>Closing Balance</td>
                    <td className="table-cell font-mono text-right">{formatBalance(closingBalance)}</td>
                </tr>
            </tfoot>
        </table>
    );
  };

  const renderTrialBalance = () => (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50"><tr><th className="table-header">Ledger</th><th className="table-header text-right">Debit</th><th className="table-header text-right">Credit</th></tr></thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {trialBalanceData?.result.map(item => (
          <tr key={item.ledger}><td className="table-cell font-medium">{item.ledger}</td><td className="table-cell font-mono text-right">{item.debit > 0 ? item.debit.toFixed(2) : ''}</td><td className="table-cell font-mono text-right">{item.credit > 0 ? item.credit.toFixed(2) : ''}</td></tr>
        ))}
      </tbody>
      <tfoot className="bg-gray-100 font-bold">
        <tr><td className="table-cell text-right">Total</td><td className="table-cell font-mono text-right">{trialBalanceData?.totals.debit.toFixed(2)}</td><td className="table-cell font-mono text-right">{trialBalanceData?.totals.credit.toFixed(2)}</td></tr>
      </tfoot>
    </table>
  );
  
  const renderStockSummary = () => (
     <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="table-header">Item Name</th>
          <th className="table-header text-right">Opening Stock</th>
          <th className="table-header text-right">Inward</th>
          <th className="table-header text-right">Outward</th>
          <th className="table-header text-right">Closing Stock</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {stockSummaryData?.map(item => (
          <tr key={item.name}>
            <td className="table-cell font-medium">{item.name}</td>
            <td className="table-cell font-mono text-right">{item.opening}</td>
            <td className="table-cell font-mono text-right">{item.inward}</td>
            <td className="table-cell font-mono text-right">{item.outward}</td>
            <td className="table-cell font-mono text-right font-semibold">{item.closing}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  
  const renderGstr1Report = () => (
    <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">GSTR-1: Details of outward supplies of goods or services</h3>
        <div className="mb-6">
            <h4 className="font-semibold text-gray-700 mb-2">B2B Invoices (Registered Dealers)</h4>
            <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>
                <th className="table-header">GSTIN</th><th className="table-header">Party Name</th><th className="table-header text-right">Taxable Value</th><th className="table-header text-right">Total Tax</th><th className="table-header text-right">Invoice Value</th>
            </tr></thead><tbody className="bg-white divide-y divide-gray-200">
                {gstr1ReportData?.b2b.map(v => (<tr key={v.id}>
                    <td className="table-cell">{ledgersByName[v.party]?.gstin}</td><td className="table-cell font-medium">{v.party}</td>
                    <td className="table-cell text-right font-mono">{v.totalTaxableAmount.toFixed(2)}</td><td className="table-cell text-right font-mono">{(v.totalCgst + v.totalSgst + v.totalIgst).toFixed(2)}</td>
                    <td className="table-cell text-right font-mono">{v.total.toFixed(2)}</td>
                </tr>))}
            </tbody></table>
        </div>
         <div>
            <h4 className="font-semibold text-gray-700 mb-2">B2C Invoices (Unregistered Dealers)</h4>
            <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>
                <th className="table-header">Party Name</th><th className="table-header text-right">Taxable Value</th><th className="table-header text-right">Total Tax</th><th className="table-header text-right">Invoice Value</th>
            </tr></thead><tbody className="bg-white divide-y divide-gray-200">
                 {gstr1ReportData?.b2c.map(v => (<tr key={v.id}>
                    <td className="table-cell font-medium">{v.party}</td><td className="table-cell text-right font-mono">{v.totalTaxableAmount.toFixed(2)}</td>
                    <td className="table-cell text-right font-mono">{(v.totalCgst + v.totalSgst + v.totalIgst).toFixed(2)}</td><td className="table-cell text-right font-mono">{v.total.toFixed(2)}</td>
                </tr>))}
            </tbody></table>
        </div>
    </div>
  );

  const renderGstr2Report = () => (
    <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {selectedGstrReport}: Details of inward supplies of goods or services
        </h3>
        <div className="mb-6">
            <h4 className="font-semibold text-gray-700 mb-2">Inward supplies from registered persons (B2B)</h4>
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="table-header">GSTIN of Supplier</th>
                        <th className="table-header">Party Name</th>
                        <th className="table-header text-right">Taxable Value</th>
                        <th className="table-header text-right">Total Tax</th>
                        <th className="table-header text-right">Invoice Value</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {gstr2ReportData?.b2bPurchases.map(v => (
                        <tr key={v.id}>
                            <td className="table-cell">{ledgersByName[v.party]?.gstin}</td>
                            <td className="table-cell font-medium">{v.party}</td>
                            <td className="table-cell text-right font-mono">{v.totalTaxableAmount.toFixed(2)}</td>
                            <td className="table-cell text-right font-mono">{(v.totalCgst + v.totalSgst + v.totalIgst).toFixed(2)}</td>
                            <td className="table-cell text-right font-mono">{v.total.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
  
  const renderGstr3bReport = () => {
    if (!gstr3bReportData) return null;
    const { outwardSupplies, inwardSupplies, taxPayable } = gstr3bReportData;

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">GSTR-3B: Consolidated Summary of Outward and Inward Supplies</h3>
            
            <div className="mb-8">
                <h4 className="font-semibold text-gray-700 mb-2">3.1 Details of Outward Supplies and inward supplies liable to reverse charge</h4>
                <table className="min-w-full divide-y divide-gray-200 border">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="table-header">Nature of Supplies</th>
                            <th className="table-header text-right">Total Taxable Value</th>
                            <th className="table-header text-right">Integrated Tax (IGST)</th>
                            <th className="table-header text-right">Central Tax (CGST)</th>
                            <th className="table-header text-right">State/UT Tax (SGST)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        <tr>
                            <td className="table-cell font-medium">(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</td>
                            <td className="table-cell font-mono text-right">{outwardSupplies.taxableValue.toFixed(2)}</td>
                            <td className="table-cell font-mono text-right">{outwardSupplies.igst.toFixed(2)}</td>
                            <td className="table-cell font-mono text-right">{outwardSupplies.cgst.toFixed(2)}</td>
                            <td className="table-cell font-mono text-right">{outwardSupplies.sgst.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mb-8">
                <h4 className="font-semibold text-gray-700 mb-2">4. Eligible ITC</h4>
                 <table className="min-w-full divide-y divide-gray-200 border">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="table-header">Details</th>
                            <th className="table-header text-right">Integrated Tax (IGST)</th>
                            <th className="table-header text-right">Central Tax (CGST)</th>
                            <th className="table-header text-right">State/UT Tax (SGST)</th>
                        </tr>
                    </thead>
                     <tbody className="bg-white divide-y divide-gray-200">
                        <tr>
                            <td className="table-cell font-medium">(A) ITC Available (whether in full or part) > (5) All other ITC</td>
                            <td className="table-cell font-mono text-right">{inwardSupplies.itc.igst.toFixed(2)}</td>
                            <td className="table-cell font-mono text-right">{inwardSupplies.itc.cgst.toFixed(2)}</td>
                            <td className="table-cell font-mono text-right">{inwardSupplies.itc.sgst.toFixed(2)}</td>
                        </tr>
                    </tbody>
                 </table>
            </div>

            <div>
                 <h4 className="font-semibold text-gray-700 mb-2">6.1 Payment of tax</h4>
                 <table className="min-w-full divide-y divide-gray-200 border">
                     <thead className="bg-gray-50">
                        <tr>
                            <th className="table-header">Description</th>
                            <th className="table-header text-right">Tax Payable (IGST)</th>
                            <th className="table-header text-right">Tax Payable (CGST)</th>
                            <th className="table-header text-right">Tax Payable (SGST)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 font-semibold">
                        <tr>
                            <td className="table-cell">Total Tax Payable</td>
                            <td className="table-cell font-mono text-right">{Math.max(0, taxPayable.igst).toFixed(2)}</td>
                            <td className="table-cell font-mono text-right">{Math.max(0, taxPayable.cgst).toFixed(2)}</td>
                            <td className="table-cell font-mono text-right">{Math.max(0, taxPayable.sgst).toFixed(2)}</td>
                        </tr>
                    </tbody>
                 </table>
            </div>

        </div>
    );
  };

  const renderGstReports = () => {
    switch (selectedGstrReport) {
        case 'GSTR-1':
            return renderGstr1Report();
        case 'GSTR-2':
        case 'GSTR-2A':
        case 'GSTR-2B':
            return renderGstr2Report();
        case 'GSTR-3B':
            return renderGstr3bReport();
        default:
            return (
                <div className="text-center py-10 text-gray-500">
                    <h3 className="text-lg font-semibold">{selectedGstrReport}</h3>
                    <p>This report is not yet implemented.</p>
                </div>
            );
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Reports</h2>
      <style>{`.table-header { padding: 0.75rem 1.5rem; text-align: left; font-size: 0.75rem; font-weight: 500; color: #6b7280; text-transform: uppercase; } .table-cell { padding: 1rem 1.5rem; white-space: nowrap; font-size: 0.875rem; color: #1f2937; }`}</style>

      <div className="mb-6 flex flex-wrap p-1 bg-slate-200 rounded-lg max-w-5xl">
        {(['DayBook', 'LedgerReport', 'TrialBalance', 'StockSummary', 'GSTReports'] as ReportType[]).map(type => (
          <button key={type} onClick={() => setReportType(type)} className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors m-1 ${reportType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-slate-300'}`}>{
            { 'DayBook': 'Day Book', 'LedgerReport': 'Ledger', 'TrialBalance': 'Trial Balance', 'StockSummary': 'Stock Summary', 'GSTReports': 'GST Reports' }[type]
          }</button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        {reportType === 'DayBook' && (
            <div className="mb-4 flex items-end space-x-4 p-4 bg-slate-50 rounded-md border border-slate-200">
                <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"/>
                </div>
                {(startDate || endDate) && (
                    <button onClick={() => { setStartDate(''); setEndDate(''); }} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-sm">Clear</button>
                )}
            </div>
        )}
        {reportType === 'LedgerReport' && (
          <div className="mb-4 flex flex-wrap items-end gap-4 p-4 bg-slate-50 rounded-md border border-slate-200">
            <div className="flex-grow min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Ledger or Group</label>
                <select value={selectedLedger} onChange={(e) => setSelectedLedger(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                    <option value="All Ledgers">All Ledgers</option>
                    <optgroup label="Groups">
                      {ledgerGroups.filter(g => g.under !== 'Primary').map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                    </optgroup>
                    <optgroup label="Ledgers">
                      {ledgers.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </optgroup>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <button onClick={() => { setSelectedLedger('All Ledgers'); setStartDate(''); setEndDate(''); }} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-sm">Clear</button>
          </div>
        )}
        {reportType === 'GSTReports' && (
            <div className="mb-4 flex items-end space-x-4 p-4 bg-slate-50 rounded-md border border-slate-200">
                <div>
                    <label htmlFor="gstrForm" className="block text-sm font-medium text-gray-700 mb-1">Select GST Return</label>
                    <select id="gstrForm" value={selectedGstrReport} onChange={e => setSelectedGstrReport(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                        {gstrForms.map(form => <option key={form} value={form}>{form}</option>)}
                    </select>
                </div>
            </div>
        )}
        
        <div className="overflow-x-auto">
          { reportType === 'DayBook' && renderDayBook() }
          { reportType === 'LedgerReport' && renderLedgerReport() }
          { reportType === 'TrialBalance' && renderTrialBalance() }
          { reportType === 'StockSummary' && renderStockSummary() }
          { reportType === 'GSTReports' && renderGstReports() }
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;