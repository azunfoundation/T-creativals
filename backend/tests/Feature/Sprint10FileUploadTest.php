<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\Task;
use App\Models\TaskAttachment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class Sprint10FileUploadTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        
        $this->employee = User::factory()->create([
            'email' => 'dev_test@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false
        ]);
        $this->employee->assignRole('employee');
    }

    public function test_file_upload_validation_avatar(): void
    {
        Storage::fake('public');

        // Invalid: too large (> 2MB)
        $largeFile = UploadedFile::fake()->create('avatar.jpg', 2500, 'image/jpeg'); // 2.5MB
        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/files/upload', [
                'file' => $largeFile,
                'type' => 'avatar'
            ])
            ->assertStatus(422);

        // Invalid: incorrect mime type
        $txtFile = UploadedFile::fake()->create('avatar.txt', 100, 'text/plain');
        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/files/upload', [
                'file' => $txtFile,
                'type' => 'avatar'
            ])
            ->assertStatus(422);

        // Valid
        $validFile = UploadedFile::fake()->create('avatar.jpg', 500, 'image/jpeg'); // 500KB
        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/files/upload', [
                'file' => $validFile,
                'type' => 'avatar'
            ])
            ->assertStatus(201)
            ->assertJsonStructure([
                'message',
                'data' => ['filename', 'file_path', 'url', 'mime_type', 'file_size']
            ]);
    }

    public function test_file_upload_validation_receipt(): void
    {
        Storage::fake('public');

        // Invalid: too large (> 5MB)
        $largeFile = UploadedFile::fake()->create('receipt.pdf', 6000, 'application/pdf'); // ~6MB
        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/files/upload', [
                'file' => $largeFile,
                'type' => 'receipt'
            ])
            ->assertStatus(422);

        // Valid pdf
        $validPdf = UploadedFile::fake()->create('receipt.pdf', 1000, 'application/pdf'); // 1MB
        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/files/upload', [
                'file' => $validPdf,
                'type' => 'receipt'
            ])
            ->assertStatus(201);
    }

    public function test_task_attachments_endpoints(): void
    {
        Storage::fake('public');

        // Create a project first (required for task)
        $project = Project::create([
            'name' => 'Test Project',
            'client_id' => $this->founder->id,
            'status' => 'planning',
            'budget' => 5000,
        ]);

        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Test Task',
            'status' => 'todo',
            'priority' => 'medium',
            'created_by' => $this->founder->id,
        ]);

        // List attachments (initially empty)
        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/tasks/{$task->id}/attachments")
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');

        // Save an attachment record (file_path must reference a file that
        // actually exists on the disk — see TaskAttachmentController::store)
        Storage::disk('public')->put('uploads/attachments/specification.pdf', 'fake pdf content');
        $attachmentData = [
            'filename' => 'specification.pdf',
            'file_path' => 'uploads/attachments/specification.pdf',
            'file_size' => 1024,
            'mime_type' => 'application/pdf',
        ];

        $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/tasks/{$task->id}/attachments", $attachmentData)
            ->assertStatus(201)
            ->assertJsonPath('data.filename', 'specification.pdf');

        // Check list again
        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/tasks/{$task->id}/attachments")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        $attachmentId = TaskAttachment::first()->id;

        // Delete attachment
        $this->actingAs($this->employee, 'sanctum')
            ->deleteJson("/api/v1/tasks/{$task->id}/attachments/{$attachmentId}")
            ->assertStatus(200);

        // Verify attachment deleted
        $this->assertDatabaseMissing('task_attachments', ['id' => $attachmentId]);
    }

    public function test_project_documents_endpoints(): void
    {
        Storage::fake('public');

        // Create a project
        $project = Project::create([
            'name' => 'Test Project',
            'client_id' => $this->founder->id,
            'status' => 'planning',
            'budget' => 5000,
        ]);

        // List documents (initially empty)
        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/projects/{$project->id}/documents")
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');

        // Save a document record (file_path must reference a file that
        // actually exists on the disk — see ProjectDocumentController::store)
        Storage::disk('public')->put('uploads/documents/brief.docx', 'fake docx content');
        $documentData = [
            'filename' => 'brief.docx',
            'file_path' => 'uploads/documents/brief.docx',
            'file_size' => 2048,
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/projects/{$project->id}/documents", $documentData)
            ->assertStatus(201)
            ->assertJsonPath('data.filename', 'brief.docx');

        // Check list again
        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/projects/{$project->id}/documents")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        $documentId = ProjectDocument::first()->id;

        // Delete document
        $this->actingAs($this->employee, 'sanctum')
            ->deleteJson("/api/v1/projects/{$project->id}/documents/{$documentId}")
            ->assertStatus(200);

        // Verify document deleted
        $this->assertDatabaseMissing('project_documents', ['id' => $documentId]);
    }
}
