<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TaskAssignedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Task $task
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "New Task Assigned: {$this->task->title}");
    }

    public function content(): Content
    {
        $taskUrl = config('app.frontend_url', 'http://localhost:3000') . '/tasks';

        return new Content(
            view: 'emails.task-assigned',
            with: [
                'task'    => $this->task,
                'taskUrl' => $taskUrl,
            ]
        );
    }
}
