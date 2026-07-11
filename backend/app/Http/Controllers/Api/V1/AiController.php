<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Models\AiAttachment;
use App\Models\AiAuditLog;
use App\Services\GeminiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class AiController extends Controller
{
    protected GeminiService $gemini;

    public function __construct(GeminiService $gemini)
    {
        $this->gemini = $gemini;
    }

    /**
     * List user conversations.
     * GET /api/v1/ai/conversations
     */
    public function listConversations(Request $request): JsonResponse
    {
        $query = AiConversation::where('user_id', $request->user()->id);

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where('title', 'like', "%{$search}%");
        }

        // Paginated (previously unbounded — flagged in the Production
        // Readiness audit). Pinned first, then most recently active.
        $conversations = $query->with(['messages' => fn ($q) => $q->latest()->limit(1)])
            ->orderBy('is_pinned', 'desc')
            ->orderBy('updated_at', 'desc')
            ->paginate(min((int) $request->input('per_page', 50), 100));

        return response()->json($conversations);
    }

    /**
     * Honest AI availability for the frontend: `configured` is true only
     * when a real model can actually be called — otherwise the chat runs in
     * simulation mode and every AI entry point should say so.
     * GET /api/v1/ai/status
     */
    public function status(): JsonResponse
    {
        return response()->json([
            'enabled' => (bool) config('services.gemini.enabled', true),
            'configured' => $this->gemini->isConfigured(),
            'model' => config('services.gemini.model', 'gemini-2.5-flash'),
        ]);
    }

    /**
     * Create a new conversation.
     * POST /api/v1/ai/conversations
     */
    public function createConversation(Request $request): JsonResponse
    {
        $request->validate([
            'title' => ['required', 'string', 'max:255'],
        ]);

        $conversation = AiConversation::create([
            'user_id' => $request->user()->id,
            'title' => $request->string('title')->toString(),
        ]);

        return response()->json($conversation, 201);
    }

    /**
     * Get conversation and its messages.
     * GET /api/v1/ai/conversations/{id}
     */
    public function getConversation(Request $request, int $id): JsonResponse
    {
        $conversation = AiConversation::where('user_id', $request->user()->id)
            ->with(['messages.attachments'])
            ->findOrFail($id);

        return response()->json($conversation);
    }

    /**
     * Delete a conversation.
     * DELETE /api/v1/ai/conversations/{id}
     */
    public function deleteConversation(Request $request, int $id): JsonResponse
    {
        $conversation = AiConversation::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $conversation->delete();

        return response()->json([
            'message' => 'Conversation deleted successfully.',
        ]);
    }

    /**
     * Toggle Pin.
     * PUT /api/v1/ai/conversations/{id}/pin
     */
    public function togglePin(Request $request, int $id): JsonResponse
    {
        $conversation = AiConversation::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $conversation->update([
            'is_pinned' => !$conversation->is_pinned,
        ]);

        return response()->json($conversation);
    }

    /**
     * Toggle Save.
     * PUT /api/v1/ai/conversations/{id}/save
     */
    public function toggleSave(Request $request, int $id): JsonResponse
    {
        $conversation = AiConversation::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $conversation->update([
            'is_saved' => !$conversation->is_saved,
        ]);

        return response()->json($conversation);
    }

    /**
     * React to a message.
     * POST /api/v1/ai/messages/{id}/react
     */
    public function reactToMessage(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reaction' => ['required', 'string', 'max:50'],
        ]);

        $message = AiMessage::whereHas('conversation', function ($query) use ($request) {
            $query->where('user_id', $request->user()->id);
        })->findOrFail($id);

        $reactions = $message->reactions ?: [];
        $reaction = $request->input('reaction');

        // Toggle reaction
        if (in_array($reaction, $reactions, true)) {
            $reactions = array_filter($reactions, fn($r) => $r !== $reaction);
        } else {
            $reactions[] = $reaction;
        }

        $message->update([
            'reactions' => array_values($reactions),
        ]);

        return response()->json($message);
    }

    /**
     * Handle dialogue input and return assistant response.
     * POST /api/v1/ai/chat
     */
    public function chat(Request $request): JsonResponse
    {
        $request->validate([
            'content' => ['required_without:confirmed_action', 'nullable', 'string'],
            'conversation_id' => ['nullable', 'integer', 'exists:ai_conversations,id'],
            'attachments' => ['nullable', 'array'],
            'attachments.*.filename' => ['required_with:attachments', 'string'],
            'attachments.*.file_path' => ['required_with:attachments', 'string'],
            'attachments.*.mime_type' => ['required_with:attachments', 'string'],
            'attachments.*.file_size' => ['required_with:attachments', 'integer'],
            'confirmed_action' => ['nullable', 'string'],
            'confirmed_params' => ['nullable', 'array'],
        ]);

        if (! config('services.gemini.key')) {
            return response()->json([
                'message' => 'The AI assistant is not configured yet. Add GEMINI_API_KEY to the backend .env file to enable it.',
            ], 503);
        }

        $user = $request->user();
        $conversationId = $request->input('conversation_id');
        $content = $request->input('content', '');

        DB::beginTransaction();
        try {
            // Retrieve or create conversation
            if (empty($conversationId)) {
                $title = !empty($content) ? Str::limit($content, 40) : 'New Conversation';
                $conversation = AiConversation::create([
                    'user_id' => $user->id,
                    'title' => $title,
                ]);
                $conversationId = $conversation->id;
            } else {
                $conversation = AiConversation::where('user_id', $user->id)->findOrFail($conversationId);
                // Update timestamp
                $conversation->touch();
            }

            $attachmentsData = $request->input('attachments', []);
            $aiAttachments = [];

            // Handle direct sensitive action execution (if confirmation posted)
            if ($request->filled('confirmed_action')) {
                $action = $request->string('confirmed_action')->toString();
                $params = $request->input('confirmed_params', []);

                // Save user confirmation action as message
                $userMsg = AiMessage::create([
                    'conversation_id' => $conversationId,
                    'role' => 'user',
                    'content' => "[Confirmed sensitive action: " . str_replace('_', ' ', $action) . "]",
                ]);

                DB::commit();

                // Direct execution
                $aiResponse = $this->gemini->chat(
                    $this->getFormattedHistory($conversationId),
                    [],
                    true // confirmed
                );

                // Save model final response
                AiMessage::create([
                    'conversation_id' => $conversationId,
                    'role' => 'assistant',
                    'content' => $aiResponse['content'],
                ]);

                return response()->json([
                    'conversation_id' => $conversationId,
                    'message' => $aiResponse,
                ]);
            }

            // Standard dialogue path
            $userMsg = AiMessage::create([
                'conversation_id' => $conversationId,
                'role' => 'user',
                'content' => $content,
            ]);

            // Save attachments
            foreach ($attachmentsData as $att) {
                $aiAttachments[] = AiAttachment::create([
                    'message_id' => $userMsg->id,
                    'filename' => $att['filename'],
                    'file_path' => $att['file_path'],
                    'mime_type' => $att['mime_type'],
                    'file_size' => $att['file_size'],
                ]);
            }

            DB::commit();

            // Run chat completion with history and new message
            $history = $this->getFormattedHistory($conversationId);
            $aiResponse = $this->gemini->chat($history, $aiAttachments, false);

            // If action confirmation required
            if (isset($aiResponse['action_confirmation'])) {
                return response()->json([
                    'conversation_id' => $conversationId,
                    'action_confirmation' => $aiResponse['action_confirmation'],
                    'message' => [
                        'role' => 'assistant',
                        'content' => $aiResponse['content'],
                    ]
                ]);
            }

            // Save assistant final response
            AiMessage::create([
                'conversation_id' => $conversationId,
                'role' => 'assistant',
                'content' => $aiResponse['content'],
            ]);

            return response()->json([
                'conversation_id' => $conversationId,
                'message' => $aiResponse,
            ]);

        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('AiController Chat Error', ['error' => $e->getMessage()]);
            return response()->json([
                'error' => 'An error occurred while generating dialogue.',
            ], 500);
        }
    }

    /**
     * Processes fast real-time Voice agent dialogue requests.
     * POST /api/v1/ai/voice/talk
     */
    public function voiceTalk(Request $request): JsonResponse
    {
        $request->validate([
            'content' => ['required', 'string'],
            'conversation_id' => ['nullable', 'integer'],
        ]);

        if (! config('services.gemini.key')) {
            return response()->json([
                'message' => 'The AI assistant is not configured yet. Add GEMINI_API_KEY to the backend .env file to enable it.',
            ], 503);
        }

        $user = $request->user();
        $conversationId = $request->input('conversation_id');
        $content = $request->string('content')->toString();

        if (empty($conversationId)) {
            $conversation = AiConversation::create([
                'user_id' => $user->id,
                'title' => 'Voice Call Session',
            ]);
            $conversationId = $conversation->id;
        }

        // Save User Message
        AiMessage::create([
            'conversation_id' => $conversationId,
            'role' => 'user',
            'content' => $content,
        ]);

        $history = $this->getFormattedHistory($conversationId);
        $aiResponse = $this->gemini->chat($history, [], false);

        // Save Assistant Message
        AiMessage::create([
            'conversation_id' => $conversationId,
            'role' => 'assistant',
            'content' => $aiResponse['content'],
        ]);

        return response()->json([
            'conversation_id' => $conversationId,
            'response_text' => $aiResponse['content'],
        ]);
    }

    /**
     * Retrieve formatted dialogue history for the Gemini API context.
     */
    protected function getFormattedHistory(int $conversationId): array
    {
        $messages = AiMessage::where('conversation_id', $conversationId)
            ->orderBy('created_at', 'asc')
            ->get();

        $history = [];
        foreach ($messages as $msg) {
            $history[] = [
                'role' => $msg->role,
                'content' => $msg->content,
            ];
        }

        return $history;
    }
}
