<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $token
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Reset Your Creativals OS Password');
    }

    public function content(): Content
    {
        $resetUrl = config('app.frontend_url', 'http://localhost:3000')
            . '/reset-password?token=' . $this->token
            . '&email=' . urlencode($this->user->email);

        return new Content(
            view: 'emails.password-reset',
            with: [
                'user'     => $this->user,
                'resetUrl' => $resetUrl,
            ]
        );
    }
}
