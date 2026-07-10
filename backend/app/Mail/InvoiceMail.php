<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Invoice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class InvoiceMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Invoice $invoice,
        public readonly ?string $pdfContent = null
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "New Invoice from Creativals Studio: {$this->invoice->invoice_number}");
    }

    public function content(): Content
    {
        $portalUrl = config('app.frontend_url', 'http://localhost:3000') . '/portal/login';

        return new Content(
            view: 'emails.invoice',
            with: [
                'invoice'   => $this->invoice,
                'portalUrl' => $portalUrl,
            ]
        );
    }

    public function attachments(): array
    {
        if ($this->pdfContent) {
            return [
                \Illuminate\Mail\Mailables\Attachment::fromData(fn () => $this->pdfContent, "invoice-{$this->invoice->invoice_number}.pdf")
                    ->withMime('application/pdf'),
            ];
        }
        return [];
    }
}
