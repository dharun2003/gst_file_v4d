import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { MassUploadFile, ExtractedInvoiceData, Voucher, Ledger, StockItem, CompanyDetails, SalesPurchaseVoucher, VoucherItem, ExtractedLineItem } from '../types';
import Icon from './Icon';
import { extractInvoiceDataWithRetry } from '../services/geminiService';

interface MassUploadModalProps {
    onClose: () => void;
    onComplete: (vouchers: Voucher[]) => void;
    ledgers: Ledger[];
    stockItems: StockItem[];
    companyDetails: CompanyDetails;
}

const UploadDropzone: React.FC<{ onFilesSelected: (files: FileList) => void }> = ({ onFilesSelected }) => {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent, enter: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        if (enter) setIsDragging(true);
        else setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files);
        }
    }

    return (
        <div 
            className={`w-full h-full flex flex-col items-center justify-center border-4 border-dashed rounded-lg transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-100'}`}
            onDragEnter={e => handleDrag(e, true)}
            onDragLeave={e => handleDrag(e, false)}
            onDragOver={e => handleDrag(e, true)}
            onDrop={handleDrop}
        >
            <Icon name="upload" className="w-16 h-16 text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700">Drag & drop invoices here</h3>
            <p className="text-slate-500 mt-1">Supports images (PNG, JPG) and PDF files.</p>
            <button 
                onClick={() => inputRef.current?.click()}
                className="mt-6 px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
            >
                Or click to browse
            </button>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/png, image/jpeg, application/pdf"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
};

const MassUploadModal: React.FC<MassUploadModalProps> = ({ onClose, onComplete, ledgers, stockItems, companyDetails }) => {
    const [files, setFiles] = useState<MassUploadFile[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        const newUrls: Record<string, string> = {};
        files.forEach(f => {
            if (f.file.type.startsWith('image/') || f.file.type === 'application/pdf') {
                newUrls[f.id] = URL.createObjectURL(f.file);
            }
        });
        setPreviewUrls(newUrls);

        // Cleanup function
        return () => {
            Object.values(newUrls).forEach(url => URL.revokeObjectURL(url));
        };
    }, [files]);
    
    const handleFileSelect = (selectedFiles: FileList) => {
        const newFiles: MassUploadFile[] = Array.from(selectedFiles)
          .filter(file => !files.some(f => f.id === `${file.name}-${file.lastModified}`))
          .map(file => ({
            id: `${file.name}-${file.lastModified}`,
            file,
            status: 'pending',
        }));
        setFiles(prev => [...prev, ...newFiles]);
    };

    const startProcessing = async () => {
        setIsProcessing(true);
        for (const file of files) {
            if (file.status === 'pending') {
                setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f));
                try {
                    const data = await extractInvoiceDataWithRetry(file.file);
                    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'success', extractedData: data } : f));
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown extraction error.';
                    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', error: message } : f));
                }
            }
        }
        setIsProcessing(false);
    };

    const calculateVoucherTotals = useCallback((extractedData: ExtractedInvoiceData, partyName: string) => {
        const partyLedger = ledgers.find(l => l.name.toLowerCase() === partyName.toLowerCase());
        const isInterState = (partyLedger?.state && companyDetails.state)
            ? partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase()
            : false;

        const itemsWithTaxes = (extractedData.lineItems || []).map(item => {
            const stockItem = stockItems.find(si => si.name.toLowerCase() === item.itemDescription.toLowerCase());
            const gstRate = stockItem?.gstRate || 0;
            const taxableAmount = item.quantity * item.rate;
            const tax = taxableAmount * (gstRate / 100);
            return {
                taxableAmount,
                cgstAmount: isInterState ? 0 : tax / 2,
                sgstAmount: isInterState ? 0 : tax / 2,
                igstAmount: isInterState ? tax : 0,
                totalAmount: taxableAmount + tax,
            };
        });
        
        const totals = itemsWithTaxes.reduce((acc, item) => ({
            totalTaxableAmount: acc.totalTaxableAmount + item.taxableAmount,
            totalCgst: acc.totalCgst + item.cgstAmount,
            totalSgst: acc.totalSgst + item.sgstAmount,
            totalIgst: acc.totalIgst + item.igstAmount,
            grandTotal: acc.grandTotal + item.totalAmount,
        }), { totalTaxableAmount: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, grandTotal: 0 });
        
        return { ...totals, isInterState };
    }, [ledgers, stockItems, companyDetails.state]);

    const handleDataChange = useCallback((fileId: string, field: keyof ExtractedInvoiceData, value: string | number) => {
        setFiles(prevFiles => prevFiles.map(f => {
            if (f.id === fileId && f.extractedData) {
                const updatedDataPartial = { ...f.extractedData, [field]: value };

                if (field === 'sellerName') {
                    const totals = calculateVoucherTotals(updatedDataPartial, value as string);
                    const updatedData = {
                        ...updatedDataPartial,
                        subtotal: totals.totalTaxableAmount,
                        cgstAmount: totals.totalCgst,
                        sgstAmount: totals.totalSgst,
                        totalAmount: totals.grandTotal,
                    };
                     return { ...f, extractedData: updatedData };
                } else {
                     return { ...f, extractedData: updatedDataPartial };
                }
            }
            return f;
        }));
    }, [calculateVoucherTotals]);

    const handleLineItemChange = useCallback((fileId: string, itemIndex: number, field: keyof ExtractedLineItem, value: string | number) => {
         setFiles(prevFiles => prevFiles.map(f => {
            if (f.id === fileId && f.extractedData) {
                const newLineItems = [...f.extractedData.lineItems];
                const updatedItem = {...newLineItems[itemIndex], [field]: value};
                newLineItems[itemIndex] = updatedItem;
                
                const tempData = { ...f.extractedData, lineItems: newLineItems };
                const totals = calculateVoucherTotals(tempData, tempData.sellerName);

                const updatedData = {
                    ...tempData,
                    subtotal: totals.totalTaxableAmount,
                    cgstAmount: totals.totalCgst,
                    sgstAmount: totals.totalSgst,
                    totalAmount: totals.grandTotal,
                };

                return { ...f, extractedData: updatedData };
            }
            return f;
        }));
    }, [calculateVoucherTotals]);
    
    const handleDeleteFile = (fileId: string) => {
        setFiles(prev => prev.filter(f => f.id !== fileId));
    };

    const handleSave = () => {
        const vouchersToCreate: Voucher[] = files
            .filter(f => f.status === 'success' && f.extractedData)
            .map(f => {
                const data = f.extractedData!;
                const partyLedger = ledgers.find(l => l.name.toLowerCase() === data.sellerName.toLowerCase());
                const isInterState = (partyLedger?.state && companyDetails.state)
                    ? partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase()
                    : false;

                const items: VoucherItem[] = (data.lineItems || []).map(item => {
                    const stockItem = stockItems.find(si => si.name.toLowerCase() === item.itemDescription.toLowerCase());
                    const gstRate = stockItem?.gstRate || 18;
                    const taxableAmount = item.quantity * item.rate;
                    const tax = taxableAmount * (gstRate / 100);
                    return {
                        name: item.itemDescription, qty: item.quantity, rate: item.rate, taxableAmount,
                        cgstAmount: isInterState ? 0 : tax / 2, sgstAmount: isInterState ? 0 : tax / 2,
                        igstAmount: isInterState ? tax : 0, totalAmount: taxableAmount + tax,
                    };
                });
                
                const { totalTaxableAmount, totalCgst, totalSgst, totalIgst, grandTotal } = items.reduce((acc, item) => ({
                    totalTaxableAmount: acc.totalTaxableAmount + item.taxableAmount, totalCgst: acc.totalCgst + item.cgstAmount,
                    totalSgst: acc.totalSgst + item.sgstAmount, totalIgst: acc.totalIgst + item.igstAmount, grandTotal: acc.grandTotal + item.totalAmount,
                }), { totalTaxableAmount: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, grandTotal: 0 });

                const voucher: SalesPurchaseVoucher = {
                    id: '', type: 'Purchase', date: new Date(data.invoiceDate).toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
                    invoiceNo: data.invoiceNumber, 
                    dueDate: data.dueDate ? new Date(data.dueDate).toISOString().split('T')[0] : undefined,
                    party: data.sellerName, isInterState, items,
                    totalTaxableAmount, totalCgst, totalSgst, totalIgst, total: grandTotal,
                    narration: `Auto-imported from ${f.file.name}`,
                };
                return voucher;
            });
        
        onComplete(vouchersToCreate);
        onClose();
    };
    
    const { completedCount, successCount, hasPendingFiles } = useMemo(() => {
        const completed = files.filter(f => f.status === 'success' || f.status === 'error').length;
        const success = files.filter(f => f.status === 'success').length;
        const pending = files.some(f => f.status === 'pending');
        return { completedCount: completed, successCount: success, hasPendingFiles: pending };
    }, [files]);
    
    const StatusPill: React.FC<{status: MassUploadFile['status']}> = ({status}) => {
        const styles = {
            pending: 'bg-slate-200 text-slate-600',
            processing: 'bg-blue-100 text-blue-600 animate-pulse',
            success: 'bg-green-100 text-green-700',
            error: 'bg-red-100 text-red-700',
        }[status];
        const icon = {
            pending: null,
            processing: <Icon name="spinner" className="w-3 h-3 animate-spin" />,
            success: <Icon name="check-circle" className="w-3 h-3" />,
            error: <Icon name="warning" className="w-3 h-3" />,
        }[status];
        return (
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full inline-flex items-center space-x-1.5 ${styles}`}>
                {icon}
                <span className="capitalize">{status}</span>
            </span>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
             <style>{`
                  .review-input { width: 100%; border: 1px solid transparent; background: #f8fafc; border-radius: 4px; padding: 4px 6px; transition: all 0.2s; color: #1e293b; }
                  .review-input:hover { border-color: #cbd5e1; }
                  .review-input:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 1px #3b82f6; }
                  .sub-table-header { padding: 0.5rem 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 600; color: #4b5563; }
             `}</style>
            <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-3">
                        <Icon name="upload" className="w-6 h-6 text-purple-600"/>
                        <span>Mass Invoice Upload</span>
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="close" className="w-6 h-6"/></button>
                </header>

                <main className="flex-1 p-2 sm:p-6 overflow-y-auto">
                    {files.length === 0 ? <UploadDropzone onFilesSelected={handleFileSelect} /> : (
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="p-3 w-8"></th>
                                    <th className="p-3 text-left font-semibold text-slate-600">File</th>
                                    <th className="p-3 text-left font-semibold text-slate-600 w-32">Status</th>
                                    <th className="p-3 text-left font-semibold text-slate-600">Seller Name</th>
                                    <th className="p-3 text-left font-semibold text-slate-600 w-40">Invoice No.</th>
                                    <th className="p-3 text-left font-semibold text-slate-600 w-36">Invoice Date</th>
                                    <th className="p-3 text-left font-semibold text-slate-600 w-36">Due Date</th>
                                    <th className="p-3 text-right font-semibold text-slate-600 w-36">Amount</th>
                                    <th className="p-3 w-12"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {files.map(file => (
                                    <React.Fragment key={file.id}>
                                    <tr className="border-b border-slate-200 bg-white">
                                        <td className="p-2 text-center">
                                            {file.status === 'success' && (
                                                <button onClick={() => setExpandedFileId(expandedFileId === file.id ? null : file.id)} className="text-slate-400 hover:text-blue-600">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${expandedFileId === file.id ? 'rotate-90' : ''}`}><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                                                </button>
                                            )}
                                        </td>
                                        <td className="p-2 font-medium text-slate-700 truncate" title={file.file.name}>{file.file.name}</td>
                                        <td className="p-2"><StatusPill status={file.status} /></td>
                                        <td className="p-1">
                                            {file.status === 'success' && <input type="text" value={file.extractedData?.sellerName || ''} onChange={e => handleDataChange(file.id, 'sellerName', e.target.value)} className="review-input" />}
                                        </td>
                                        <td className="p-1">
                                            {file.status === 'success' && <input type="text" value={file.extractedData?.invoiceNumber || ''} onChange={e => handleDataChange(file.id, 'invoiceNumber', e.target.value)} className="review-input" />}
                                        </td>
                                        <td className="p-1">
                                            {file.status === 'success' && <input type="date" value={new Date(file.extractedData?.invoiceDate || Date.now()).toISOString().split('T')[0]} onChange={e => handleDataChange(file.id, 'invoiceDate', e.target.value)} className="review-input" />}
                                        </td>
                                         <td className="p-1">
                                            {file.status === 'success' && <input type="date" value={file.extractedData?.dueDate ? new Date(file.extractedData.dueDate).toISOString().split('T')[0] : ''} onChange={e => handleDataChange(file.id, 'dueDate', e.target.value)} className="review-input" />}
                                        </td>
                                        <td className="p-1 text-right">
                                            {file.status === 'success' && <input type="number" value={file.extractedData?.totalAmount.toFixed(2) || 0} readOnly className="review-input text-right font-mono bg-slate-100" />}
                                        </td>
                                        <td className="p-2 text-center">
                                            <button onClick={() => handleDeleteFile(file.id)} className="text-slate-400 hover:text-red-500" title="Remove file"><Icon name="trash" className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                    {expandedFileId === file.id && file.extractedData && (() => {
                                        const totals = calculateVoucherTotals(file.extractedData, file.extractedData.sellerName);
                                        return (
                                        <tr className="bg-slate-100/50">
                                            <td colSpan={9} className="p-4">
                                                <div className="flex flex-col md:flex-row gap-6">
                                                    <div className="md:w-1/3 flex-shrink-0">
                                                        <h4 className="text-sm font-semibold text-slate-800 mb-2">Document Preview</h4>
                                                        <div className="border rounded-md p-2 bg-white h-96 overflow-auto shadow-sm">
                                                            {previewUrls[file.id] ? (
                                                                file.file.type.startsWith('image/') ? (
                                                                    <img src={previewUrls[file.id]} alt="Invoice preview" className="w-full h-auto" />
                                                                ) : file.file.type === 'application/pdf' ? (
                                                                    <iframe src={previewUrls[file.id]} className="w-full h-full" title="PDF preview" />
                                                                ) : (
                                                                    <div className="flex items-center justify-center h-full text-slate-500">
                                                                        <p>Preview not available for this file type.</p>
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <div className="flex items-center justify-center h-full text-slate-500">
                                                                    <p>Preview not available for this file type.</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="md:w-2/3">
                                                         <h4 className="text-sm font-semibold text-slate-800 mb-2">Extracted Data</h4>
                                                         <div className="bg-white rounded shadow-sm">
                                                             <table className="min-w-full">
                                                               <thead>
                                                                 <tr>
                                                                   <th className="sub-table-header">Description</th>
                                                                   <th className="sub-table-header w-32">HSN Code</th>
                                                                   <th className="sub-table-header w-24 text-right">Qty</th>
                                                                   <th className="sub-table-header w-32 text-right">Rate</th>
                                                                   <th className="sub-table-header w-32 text-right">Amount</th>
                                                                 </tr>
                                                               </thead>
                                                               <tbody>
                                                                 {file.extractedData.lineItems.map((item, index) => (
                                                                   <tr key={index} className="border-t border-slate-200">
                                                                     <td className="p-1"><input type="text" value={item.itemDescription} onChange={e => handleLineItemChange(file.id, index, 'itemDescription', e.target.value)} className="review-input" /></td>
                                                                     <td className="p-1"><input type="text" value={item.hsnCode} onChange={e => handleLineItemChange(file.id, index, 'hsnCode', e.target.value)} className="review-input" /></td>
                                                                     <td className="p-1"><input type="number" value={item.quantity} onChange={e => handleLineItemChange(file.id, index, 'quantity', parseFloat(e.target.value) || 0)} className="review-input text-right" /></td>
                                                                     <td className="p-1"><input type="number" value={item.rate} onChange={e => handleLineItemChange(file.id, index, 'rate', parseFloat(e.target.value) || 0)} className="review-input text-right" /></td>
                                                                     <td className="p-1 font-mono text-right pr-2 text-slate-600">{(item.quantity * item.rate).toFixed(2)}</td>
                                                                   </tr>
                                                                 ))}
                                                               </tbody>
                                                             </table>
                                                         </div>
                                                         <div className="mt-4 flex justify-end">
                                                            <div className="w-full max-w-xs space-y-1 text-sm p-4 bg-slate-200/50 rounded-md">
                                                               <div className="flex justify-between">
                                                                 <span className="text-slate-600">Subtotal</span>
                                                                 <span className="font-mono font-semibold text-slate-800">{totals.totalTaxableAmount.toFixed(2)}</span>
                                                               </div>
                                                               {totals.isInterState ? (
                                                                 <div className="flex justify-between">
                                                                   <span className="text-slate-600">IGST</span>
                                                                   <span className="font-mono text-slate-800">{totals.totalIgst.toFixed(2)}</span>
                                                                 </div>
                                                               ) : (
                                                                 <>
                                                                   <div className="flex justify-between">
                                                                     <span className="text-slate-600">CGST</span>
                                                                     <span className="font-mono text-slate-800">{totals.totalCgst.toFixed(2)}</span>
                                                                   </div>
                                                                   <div className="flex justify-between">
                                                                     <span className="text-slate-600">SGST</span>
                                                                     <span className="font-mono text-slate-800">{totals.totalSgst.toFixed(2)}</span>
                                                                   </div>
                                                                 </>
                                                               )}
                                                               <div className="flex justify-between font-bold pt-2 border-t border-slate-300 mt-2">
                                                                 <span className="text-slate-800">Grand Total</span>
                                                                 <span className="font-mono text-slate-800">{totals.grandTotal.toFixed(2)}</span>
                                                               </div>
                                                            </div>
                                                         </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                        )
                                    })()}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </main>

                {files.length > 0 && (
                    <footer className="p-4 border-t border-slate-200 flex justify-between items-center flex-shrink-0">
                        <p className="text-sm text-gray-500">
                            <strong>{files.length}</strong> files selected. <strong>{completedCount}</strong> processed. <strong>{successCount}</strong> ready to import.
                        </p>
                        <div className="flex items-center space-x-2">
                            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-slate-200">Cancel</button>
                            {isProcessing ? (
                                 <button disabled className="px-4 py-2 text-sm font-medium text-white bg-blue-400 rounded-md flex items-center cursor-not-allowed"><Icon name="spinner" className="animate-spin w-4 h-4 mr-2"/>Processing...</button>
                            ) : (
                                !hasPendingFiles ? (
                                   <button onClick={handleSave} disabled={successCount === 0} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md flex items-center hover:bg-green-700 disabled:bg-gray-400"><Icon name="check-circle" className="w-5 h-5 mr-2" /> Save {successCount} Vouchers</button>
                                ) : (
                                   <button onClick={startProcessing} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md flex items-center hover:bg-blue-700"><Icon name="wand-sparkles" className="w-5 h-5 mr-2" /> Start Processing</button>
                                )
                            )}
                        </div>
                    </footer>
                )}
            </div>
        </div>
    );
};

export default MassUploadModal;