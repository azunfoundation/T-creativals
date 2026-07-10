<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Quote;
use Barryvdh\DomPDF\Facade\Pdf;

class PdfService
{
    /**
     * Generate PDF for an Invoice.
     *
     * @param Invoice $invoice
     * @return \Barryvdh\DomPDF\PDF
     */
    public function generateInvoicePdf(Invoice $invoice)
    {
        $invoice->load(['items', 'client', 'currency']);
        return Pdf::loadView('pdf.invoice', compact('invoice'));
    }

    /**
     * Generate PDF for a Quote.
     *
     * @param Quote $quote
     * @return \Barryvdh\DomPDF\PDF
     */
    public function generateQuotePdf(Quote $quote)
    {
        $quote->load(['items', 'client', 'currency']);
        return Pdf::loadView('pdf.quote', compact('quote'));
    }

    /**
     * Generate PDF voucher for an Expense.
     *
     * @param \App\Models\Expense $expense
     * @return \Barryvdh\DomPDF\PDF
     */
    public function generateExpensePdf(\App\Models\Expense $expense)
    {
        $expense->load(['category', 'project', 'vendor', 'submitter', 'approver', 'currency', 'attachments']);
        return Pdf::loadView('pdf.expense', compact('expense'));
    }

    /**
     * Generate PDF for a Payslip.
     *
     * @param \App\Models\PayrollRunItem $item
     * @return \Barryvdh\DomPDF\PDF
     */
    public function generatePayslip(\App\Models\PayrollRunItem $item)
    {
        $item->load(['user', 'payrollRun.currency']);
        return Pdf::loadView('pdf.payslip', compact('item'));
    }
}
