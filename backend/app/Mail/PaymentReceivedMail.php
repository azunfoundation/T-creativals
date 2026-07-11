<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PaymentReceivedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Payment $payment,
        public readonly Invoice $invoice
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Payment Received on {$this->invoice->invoice_number}");
    }

    public function content(): Content
    {
        $invoiceUrl = config('app.frontend_url', 'http://localhost:3000') . "/invoices/{$this->invoice->id}";

        return new Content(
            view: 'emails.payment-received',
            with: [
                'payment' => $this->payment,
                'invoice' => $this->invoice,
                'invoiceUrl' => $invoiceUrl,
            ]
        );
    }
}
