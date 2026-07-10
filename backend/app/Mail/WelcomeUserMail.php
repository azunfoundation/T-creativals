<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeUserMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $rawPassword
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Welcome to Creativals OS - Your Credentials');
    }

    public function content(): Content
    {
        $loginUrl = config('app.frontend_url', 'http://localhost:3000') . '/login';

        return new Content(
            view: 'emails.welcome-user',
            with: [
                'user'        => $this->user,
                'rawPassword' => $this->rawPassword,
                'loginUrl'    => $loginUrl,
            ]
        );
    }
}
