<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Invoice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class InvoiceOverdueMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Invoice $invoice
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Invoice Overdue: {$this->invoice->invoice_number}");
    }

    public function content(): Content
    {
        $invoiceUrl = config('app.frontend_url', 'http://localhost:3000') . "/invoices/{$this->invoice->id}";

        return new Content(
            view: 'emails.invoice-overdue',
            with: [
                'invoice' => $this->invoice,
                'invoiceUrl' => $invoiceUrl,
            ]
        );
    }
}
