<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Quote;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class QuoteMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Quote $quote,
        public readonly ?string $pdfContent = null
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "New Quotation from Creativals Studio: {$this->quote->quote_number}");
    }

    public function content(): Content
    {
        $proposalUrl = config('app.frontend_url', 'http://localhost:3000') . '/portal/login';

        return new Content(
            view: 'emails.quote',
            with: [
                'quote'       => $this->quote,
                'proposalUrl' => $proposalUrl,
            ]
        );
    }

    public function attachments(): array
    {
        if ($this->pdfContent) {
            return [
                \Illuminate\Mail\Mailables\Attachment::fromData(fn () => $this->pdfContent, "quote-{$this->quote->quote_number}.pdf")
                    ->withMime('application/pdf'),
            ];
        }
        return [];
    }
}
