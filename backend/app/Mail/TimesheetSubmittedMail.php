<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Timesheet;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TimesheetSubmittedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Timesheet $timesheet
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Timesheet Submission: {$this->timesheet->user->name}");
    }

    public function content(): Content
    {
        $approvalUrl = config('app.frontend_url', 'http://localhost:3000') . '/timesheets';

        return new Content(
            view: 'emails.timesheet-submitted',
            with: [
                'timesheet'   => $this->timesheet,
                'approvalUrl' => $approvalUrl,
            ]
        );
    }
}
