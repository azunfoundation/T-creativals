<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\PayrollRun;
use App\Models\PayrollRunItem;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PayslipMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $employee,
        public readonly PayrollRunItem $runItem,
        public readonly PayrollRun $run,
        public readonly ?string $pdfContent = null
    ) {}

    public function envelope(): Envelope
    {
        $monthName = date("F", mktime(0, 0, 0, $this->run->month, 10));
        return new Envelope(subject: "Payslip for {$monthName} {$this->run->year}");
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.payslip',
            with: [
                'employee' => $this->employee,
                'runItem'  => $this->runItem,
                'run'      => $this->run,
            ]
        );
    }

    public function attachments(): array
    {
        if ($this->pdfContent) {
            return [
                \Illuminate\Mail\Mailables\Attachment::fromData(
                    fn () => $this->pdfContent,
                    "payslip_{$this->run->year}_{$this->run->month}.pdf"
                )->withMime('application/pdf'),
            ];
        }

        return [];
    }
}
