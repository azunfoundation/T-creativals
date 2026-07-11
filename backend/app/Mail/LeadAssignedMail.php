<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Lead;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LeadAssignedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Lead $lead,
        public readonly string $assigneeName
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "New Lead Assigned: {$this->lead->company_name}");
    }

    public function content(): Content
    {
        $leadUrl = config('app.frontend_url', 'http://localhost:3000') . "/crm/{$this->lead->id}";

        return new Content(
            view: 'emails.lead-assigned',
            with: [
                'lead' => $this->lead,
                'assigneeName' => $this->assigneeName,
                'leadUrl' => $leadUrl,
            ]
        );
    }
}
