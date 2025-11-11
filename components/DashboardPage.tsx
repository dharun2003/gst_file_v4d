import React, { useMemo } from 'react';
import type { Voucher, Ledger, SalesPurchaseVoucher } from '../types';
import Icon from './Icon';

interface DashboardPageProps {
  companyName: string;
  vouchers: Voucher[];
  ledgers: Ledger[];
}

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactElement; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center space-x-4">
        <div className={`w-12 h-12 flex items-center justify-center rounded-full ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
    </div>
);

const DashboardPage: React.FC<DashboardPageProps> = ({ companyName, vouchers, ledgers }) => {
    
    const { totalSales, totalPurchases, totalReceivables, totalPayables } = useMemo(() => {
        let totalSales = 0;
        let totalPurchases = 0;
        const accountBalances: { [key: string]: number } = {};

        ledgers.forEach(l => accountBalances[l.name] = 0);

        vouchers.forEach(v => {
            switch(v.type) {
                case 'Sales':
                    totalSales += v.total;
                    accountBalances[v.party] = (accountBalances[v.party] || 0) + v.total;
                    break;
                case 'Purchase':
                    totalPurchases += v.total;
                    accountBalances[v.party] = (accountBalances[v.party] || 0) - v.total;
                    break;
                case 'Receipt':
                    accountBalances[v.party] = (accountBalances[v.party] || 0) - v.amount;
                    break;
                case 'Payment':
                    accountBalances[v.party] = (accountBalances[v.party] || 0) + v.amount;
                    break;
            }
        });

        const sundryDebtorLedgers = ledgers.filter(l => l.group === 'Sundry Debtors').map(l => l.name);
        const sundryCreditorLedgers = ledgers.filter(l => l.group === 'Sundry Creditors').map(l => l.name);

        const totalReceivables = sundryDebtorLedgers.reduce((acc, l) => acc + (accountBalances[l] > 0 ? accountBalances[l] : 0), 0);
        const totalPayables = sundryCreditorLedgers.reduce((acc, l) => acc + (accountBalances[l] < 0 ? -accountBalances[l] : 0), 0);

        return { totalSales, totalPurchases, totalReceivables, totalPayables };
    }, [vouchers, ledgers]);

    const chartData = useMemo(() => {
        const monthlyData: { [key: string]: { sales: number; purchases: number } } = {};
        const salesAndPurchases = vouchers.filter(v => v.type === 'Sales' || v.type === 'Purchase') as SalesPurchaseVoucher[];

        salesAndPurchases.forEach(v => {
            const month = new Date(v.date).toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!monthlyData[month]) {
                monthlyData[month] = { sales: 0, purchases: 0 };
            }
            if (v.type === 'Sales') monthlyData[month].sales += v.total;
            else monthlyData[month].purchases += v.total;
        });
        
        // Sort data chronologically
        const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
            const dateA = new Date(`1 ${a.replace(' ', ' 20')}`);
            const dateB = new Date(`1 ${b.replace(' ', ' 20')}`);
            return dateA.getTime() - dateB.getTime();
        }).slice(-6); // Last 6 months

        const data = sortedMonths.map(month => ({
            month,
            ...monthlyData[month]
        }));
        
        const maxVal = Math.max(...data.map(d => d.sales), ...data.map(d => d.purchases));

        return { data, maxVal: maxVal === 0 ? 1000 : maxVal };

    }, [vouchers]);

    const renderLineChart = () => {
        const data = chartData.data;
        const maxVal = chartData.maxVal;

        if (data.length < 2) {
            return <div className="h-72 flex items-center justify-center text-gray-500">Not enough data to display a chart.</div>;
        }

        const SVG_WIDTH = 800;
        const SVG_HEIGHT = 250;
        const PADDING = { top: 20, right: 20, bottom: 30, left: 60 };
        const CHART_WIDTH = SVG_WIDTH - PADDING.left - PADDING.right;
        const CHART_HEIGHT = SVG_HEIGHT - PADDING.top - PADDING.bottom;

        const getCoords = (value: number, index: number) => {
            const x = PADDING.left + (index / (data.length - 1)) * CHART_WIDTH;
            const y = PADDING.top + CHART_HEIGHT - (value / maxVal) * CHART_HEIGHT;
            return { x, y };
        };

        const salesPath = data.map((d, i) => {
            const { x, y } = getCoords(d.sales, i);
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(' ');
        
        const purchasesPath = data.map((d, i) => {
            const { x, y } = getCoords(d.purchases, i);
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(' ');

        const yAxisTicks = 5;
        const yLabels = Array.from({ length: yAxisTicks + 1 }).map((_, i) => {
            const value = (maxVal / yAxisTicks) * i;
            const y = PADDING.top + CHART_HEIGHT - (i / yAxisTicks) * CHART_HEIGHT;
            return { value, y };
        });

        return (
            <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full h-72">
                <g className="text-xs text-gray-400">
                    {yLabels.map(({ value, y }) => (
                        <g key={y}>
                            <text x={0} y={y + 4} textAnchor="start" className="fill-current">
                                {`₹${(value / 1000).toFixed(0)}k`}
                            </text>
                            <line x1={PADDING.left} y1={y} x2={PADDING.left + CHART_WIDTH} y2={y} className="stroke-current opacity-50" strokeDasharray="2,4" />
                        </g>
                    ))}
                </g>

                <g className="text-xs text-gray-500">
                    {data.map(({ month }, i) => {
                        const { x } = getCoords(0, i);
                        return <text key={month} x={x} y={SVG_HEIGHT - PADDING.bottom + 15} textAnchor="middle" className="fill-current">{month}</text>;
                    })}
                </g>

                <path d={purchasesPath} fill="none" className="stroke-red-500" strokeWidth="2" />
                <path d={salesPath} fill="none" className="stroke-blue-500" strokeWidth="2" />
                
                <g>
                    {data.map((d, i) => {
                        const { x, y } = getCoords(d.purchases, i);
                        return <circle key={`p-${i}`} cx={x} cy={y} r="4" className="fill-red-500 stroke-white" strokeWidth="2"><title>Purchases: ₹{d.purchases.toFixed(2)}</title></circle>;
                    })}
                </g>
                <g>
                    {data.map((d, i) => {
                        const { x, y } = getCoords(d.sales, i);
                        return <circle key={`s-${i}`} cx={x} cy={y} r="4" className="fill-blue-500 stroke-white" strokeWidth="2"><title>Sales: ₹{d.sales.toFixed(2)}</title></circle>;
                    })}
                </g>
            </svg>
        );
    };
    
    const recentVouchers = vouchers.slice(0, 5);

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Sales" value={`₹${(totalSales / 1000).toFixed(1)}k`} icon={<Icon name="arrow-up-right" className="w-6 h-6 text-green-600" />} color="bg-green-100" />
                <StatCard title="Total Purchases" value={`₹${(totalPurchases / 1000).toFixed(1)}k`} icon={<Icon name="arrow-down-left" className="w-6 h-6 text-red-600" />} color="bg-red-100" />
                <StatCard title="Receivables" value={`₹${(totalReceivables / 1000).toFixed(1)}k`} icon={<Icon name="users" className="w-6 h-6 text-blue-600" />} color="bg-blue-100" />
                <StatCard title="Payables" value={`₹${(totalPayables / 1000).toFixed(1)}k`} icon={<Icon name="wallet" className="w-6 h-6 text-orange-600" />} color="bg-orange-100" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Activity</h3>
                    {renderLineChart()}
                     <div className="flex justify-center items-center space-x-4 mt-4 text-sm">
                        <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div><span>Sales</span></div>
                        <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-red-500 rounded-sm"></div><span>Purchases</span></div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                     <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Transactions</h3>
                     <ul className="space-y-3">
                        {recentVouchers.map(v => (
                            <li key={v.id} className="flex justify-between items-center text-sm">
                                <div>
                                    <p className="font-medium text-gray-700">{v.type}</p>
                                    <p className="text-xs text-gray-500">{'party' in v ? v.party : 'narration' in v && v.narration ? v.narration.substring(0, 20) + '...' : v.type}</p>
                                </div>
                                <span className="font-mono font-semibold text-gray-800">₹{('total' in v ? v.total : 'amount' in v ? v.amount : 0).toFixed(2)}</span>
                            </li>
                        ))}
                     </ul>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;