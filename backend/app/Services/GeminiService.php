<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AiAuditLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

class GeminiService
{
    protected ?string $apiKey;
    protected string $model;
    protected bool $enabled;

    /**
     * Ordered list of models to try in sequence when rate limits are hit.
     */
    protected array $modelFallbackChain = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash-lite',
    ];

    /**
     * Fallback chain for OpenRouter models.
     */
    protected array $openRouterModelFallbackChain = [
        'deepseek/deepseek-chat',
        'google/gemini-2.5-flash',
        'anthropic/claude-3.5-sonnet',
    ];

    public function __construct()
    {
        $this->apiKey = config('services.gemini.key');
        $this->model  = config('services.gemini.model', 'gemini-2.5-flash');
        $this->enabled = (bool) config('services.gemini.enabled', true);

        // Prevent making real external network requests during automated tests
        if (app()->environment('testing')) {
            if ($this->apiKey !== 'fake-api-key') {
                $this->apiKey = null;
            }
        }
    }

    /**
     * Send messages to Gemini, handling text, files, and function calling.
     */
    public function chat(array $history, array $attachments = [], bool $isConfirmed = false): array
    {
        if (!$this->enabled) {
            return [
                'role' => 'assistant',
                'content' => 'AI Services are currently disabled in settings.',
            ];
        }

        // Mock fallback if API key is not configured
        if (empty($this->apiKey) || $this->apiKey === 'null') {
            return $this->getMockResponse($history);
        }

        if (Str::startsWith((string) $this->apiKey, 'sk-or-')) {
            return $this->chatOpenRouter($history, $attachments, $isConfirmed);
        }

        // Build the conversation contents
        $contents = $this->buildContents($history, $attachments);
        $tools    = $this->getToolsDeclaration();

        // Try each model in the fallback chain
        $modelsToTry = array_unique(array_merge([$this->model], $this->modelFallbackChain));

        foreach ($modelsToTry as $modelName) {
            try {
                $response = Http::withHeaders([
                    'Content-Type' => 'application/json',
                ])->withOptions([
                    'force_ip_resolve' => 'v4',
                    'verify'           => false,
                ])->post("https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:generateContent?key={$this->apiKey}", [
                    'contents' => $contents,
                    'systemInstruction' => [
                        'parts' => [['text' => $this->getSystemInstruction()]],
                    ],
                    'tools' => [
                        ['functionDeclarations' => $tools],
                    ],
                ]);

                if ($response->successful()) {
                    $result    = $response->json();
                    $candidate = $result['candidates'][0] ?? [];
                    $parts     = $candidate['content']['parts'] ?? [];

                    $toolCalls    = [];
                    $textResponse = '';

                    foreach ($parts as $part) {
                        if (isset($part['text']))         { $textResponse .= $part['text']; }
                        if (isset($part['functionCall'])) { $toolCalls[] = $part['functionCall']; }
                    }

                    if (empty($toolCalls)) {
                        return ['role' => 'assistant', 'content' => $textResponse];
                    }

                    return $this->handleToolCalls($toolCalls, $history, $attachments, $isConfirmed);
                }

                // Inspect error code to decide whether to fall through
                $errorBody = $response->json();
                $errorCode = $errorBody['error']['status'] ?? '';

                if ($errorCode === 'RESOURCE_EXHAUSTED') {
                    // Rate-limited on this model — try the next one
                    Log::warning('Gemini quota hit, trying next model', ['model' => $modelName]);
                    continue;
                }

                // Any other failure — return a specific message
                $errorMsg = $errorBody['error']['message'] ?? 'Unknown API error';
                Log::error('Gemini API request failed', ['model' => $modelName, 'error' => $errorMsg]);
                return $this->buildApiErrorResponse($errorCode, $errorMsg);

            } catch (\Throwable $e) {
                Log::error('GeminiService exception', ['model' => $modelName, 'exception' => $e->getMessage()]);
                // Connection-level error — move to next model
                continue;
            }
        }

        // All models exhausted
        return [
            'role'    => 'assistant',
            'content' => "⚠️ **API Quota Reached**\n\nAll Gemini models have reached their daily free-tier request limit. The quota resets every 24 hours.\n\n**Options to resolve this:**\n- Wait until tomorrow for the quota to reset automatically\n- Upgrade to a paid Google AI Studio plan for higher limits at [ai.google.dev](https://ai.google.dev)\n\nIn the meantime, I can still answer general questions in simulation mode.",
        ];
    }

    /**
     * Send messages to LLM without function tool calling capabilities (bypass prompt pollution).
     */
    public function chatWithoutTools(array $history): array
    {
        if (!$this->enabled) {
            return [
                'role' => 'assistant',
                'content' => 'AI Services are currently disabled in settings.',
            ];
        }

        if (empty($this->apiKey) || $this->apiKey === 'null') {
            return $this->getMockResponse($history);
        }

        if (Str::startsWith((string) $this->apiKey, 'sk-or-')) {
            $model = $this->model;
            if ($model === 'gemini-2.5-flash' || $model === 'gemini-2.0-flash') {
                $model = 'google/' . $model;
            }

            $modelsToTry = array_unique(array_merge([$model], $this->openRouterModelFallbackChain));
            $messages = $this->buildOpenRouterMessages($history, []);

            foreach ($modelsToTry as $modelName) {
                try {
                    $response = \Illuminate\Support\Facades\Http::withHeaders([
                        'Content-Type' => 'application/json',
                        'Authorization' => "Bearer {$this->apiKey}",
                        'HTTP-Referer' => 'http://localhost:8000',
                        'X-Title' => 'Creativals OS',
                    ])->withOptions([
                        'force_ip_resolve' => 'v4',
                        'verify'           => false,
                    ])->post("https://openrouter.ai/api/v1/chat/completions", [
                        'model' => $modelName,
                        'messages' => $messages,
                        'max_tokens' => 350,
                    ]);

                    if ($response->successful()) {
                        $result = $response->json();
                        $choice = $result['choices'][0] ?? [];
                        $message = $choice['message'] ?? [];
                        $textResponse = $message['content'] ?? '';
                        return ['role' => 'assistant', 'content' => $textResponse];
                    }
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::error('GeminiService chatWithoutTools OpenRouter exception', ['model' => $modelName, 'exception' => $e->getMessage()]);
                }
            }
        } else {
            $contents = $this->buildContents($history, []);
            $modelsToTry = array_unique(array_merge([$this->model], $this->modelFallbackChain));

            foreach ($modelsToTry as $modelName) {
                try {
                    $response = \Illuminate\Support\Facades\Http::withHeaders([
                        'Content-Type' => 'application/json',
                    ])->withOptions([
                        'force_ip_resolve' => 'v4',
                        'verify'           => false,
                    ])->post("https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:generateContent?key={$this->apiKey}", [
                        'contents' => $contents,
                        'systemInstruction' => [
                            'parts' => [['text' => $this->getSystemInstruction()]],
                        ],
                        'generationConfig' => [
                            'maxOutputTokens' => 1000,
                        ],
                    ]);

                    if ($response->successful()) {
                        $result = $response->json();
                        $candidate = $result['candidates'][0] ?? [];
                        $parts = $candidate['content']['parts'] ?? [];
                        $textResponse = '';
                        foreach ($parts as $part) {
                            if (isset($part['text'])) { $textResponse .= $part['text']; }
                        }
                        return ['role' => 'assistant', 'content' => $textResponse];
                    }
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::error('GeminiService chatWithoutTools exception', ['model' => $modelName, 'exception' => $e->getMessage()]);
                }
            }
        }

        return $this->getMockResponse($history);
    }

    /**
     * Build a user-friendly error response based on Gemini API error codes.
     */
    protected function buildApiErrorResponse(string $errorCode, string $errorMsg): array
    {
        $message = match ($errorCode) {
            'UNAUTHENTICATED'  => "❌ **Invalid API Key**\n\nThe Gemini API key is invalid or has been revoked. Please update your `GEMINI_API_KEY` in the server configuration.",
            'PERMISSION_DENIED' => "🔒 **API Key Permissions Denied**\n\nThe configured Gemini API key does not have access to this model. Please check your Google AI Studio project settings.",
            'INVALID_ARGUMENT'  => "⚙️ **Configuration Error**\n\nAn invalid request was sent to the Gemini API. Details: `{$errorMsg}`",
            default            => "⚠️ **AI Service Error**\n\nI encountered an issue with my intelligence layer (`{$errorCode}`). Please try again or contact your system administrator.",
        };

        return ['role' => 'assistant', 'content' => $message];
    }

    /**
     * Process tool calls and re-feed the results back to Gemini.
     */
    protected function handleToolCalls(array $toolCalls, array $history, array $attachments, bool $isConfirmed): array
    {
        $toolResults = [];

        foreach ($toolCalls as $call) {
            $name = $call['name'];
            $args = $call['args'] ?? [];

            // Check if action is sensitive and needs confirmation
            if ($this->isSensitiveAction($name) && !$isConfirmed) {
                return [
                    'role' => 'assistant',
                    'content' => "This action requires your confirmation.",
                    'action_confirmation' => [
                        'action' => $name,
                        'params' => $args,
                        'message' => $this->getSensitiveActionDescription($name, $args),
                    ]
                ];
            }

            // Execute internal API request
            $execResult = $this->executeInternalRequest($name, $args);

            // Log AI action
            $this->logAiAction($name, $args, $execResult);

            $toolResults[] = [
                'functionResponse' => [
                    'name' => $name,
                    'response' => ['result' => $execResult],
                ]
            ];
        }

        // Send the tool results back to Gemini to generate the final dialogue
        $contents = $this->buildContents($history, $attachments);

        // Append the assistant's tool call response
        $contents[] = [
            'role' => 'model',
            'parts' => array_map(function ($call) {
                return ['functionCall' => $call];
            }, $toolCalls)
        ];

        // Append the user's function response parts
        $contents[] = [
            'role' => 'user',
            'parts' => $toolResults
        ];

        $modelsToTry = array_unique(array_merge([$this->model], $this->modelFallbackChain));

        foreach ($modelsToTry as $modelName) {
            try {
                $response = Http::withHeaders([
                    'Content-Type' => 'application/json',
                ])->withOptions([
                    'force_ip_resolve' => 'v4',
                    'verify'           => false,
                ])->post("https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:generateContent?key={$this->apiKey}", [
                    'contents' => $contents,
                    'systemInstruction' => [
                        'parts' => [['text' => $this->getSystemInstruction()]],
                    ],
                    'tools' => [
                        ['functionDeclarations' => $this->getToolsDeclaration()],
                    ],
                ]);

                if ($response->successful()) {
                    $candidate = $response->json()['candidates'][0] ?? [];
                    $text = '';
                    foreach ($candidate['content']['parts'] ?? [] as $part) {
                        if (isset($part['text'])) { $text .= $part['text']; }
                    }
                    return ['role' => 'assistant', 'content' => $text];
                }

                $errorCode = $response->json()['error']['status'] ?? '';
                if ($errorCode === 'RESOURCE_EXHAUSTED') {
                    Log::warning('Gemini tool-loop quota hit, trying next model', ['model' => $modelName]);
                    continue;
                }
            } catch (\Throwable $e) {
                Log::error('GeminiService tool-loop failed', ['model' => $modelName, 'error' => $e->getMessage()]);
                continue;
            }
        }

        return [
            'role' => 'assistant',
            'content' => 'I successfully completed the requested operation, but had trouble rendering a final response summary.',
        ];
    }

    /**
     * Determine if a tool action is sensitive.
     */
    protected function isSensitiveAction(string $name): bool
    {
        $sensitive = [
            'approve_payroll_run',
            'record_payment',
            'send_invoice',
            'approve_quote',
            'update_settings',
            'delete_lead',
            'delete_project',
            'delete_task',
            'delete_invoice',
        ];
        return in_array($name, $sensitive, true);
    }

    /**
     * Human-friendly descriptions of sensitive actions.
     */
    protected function getSensitiveActionDescription(string $name, array $args): string
    {
        switch ($name) {
            case 'approve_payroll_run':
                return "Are you sure you want to approve payroll run #{$args['id']}?";
            case 'record_payment':
                return "Are you sure you want to record a payment of {$args['amount']} for invoice #{$args['invoice_id']}?";
            case 'send_invoice':
                return "Are you sure you want to email invoice #{$args['id']} to the client?";
            case 'approve_quote':
                return "Are you sure you want to approve quote #{$args['id']}?";
            case 'update_settings':
                return "Are you sure you want to update company configurations?";
            case 'delete_lead':
                return "Are you sure you want to delete CRM lead #{$args['id']}?";
            case 'delete_project':
                return "Are you sure you want to delete project #{$args['id']}?";
            case 'delete_task':
                return "Are you sure you want to delete task #{$args['id']}?";
            case 'delete_invoice':
                return "Are you sure you want to delete invoice #{$args['id']}?";
            default:
                return "Are you sure you want to execute this sensitive operation?";
        }
    }

    /**
     * Map function names to internal HTTP requests and dispatch.
     */
    protected function executeInternalRequest(string $name, array $args)
    {
        $routeMap = [
            'list_leads'         => ['GET',    '/api/v1/leads'],
            'create_lead'        => ['POST',   '/api/v1/leads'],
            'update_lead'        => ['PUT',    '/api/v1/leads/{id}'],
            'delete_lead'        => ['DELETE', '/api/v1/leads/{id}'],
            'convert_lead'       => ['POST',   '/api/v1/leads/{id}/convert'],
            'list_clients'       => ['GET',    '/api/v1/reports/clients'],
            'create_client'      => ['POST',   '/api/v1/users'],
            'update_client'      => ['PUT',    '/api/v1/users/{id}'],
            'list_projects'      => ['GET',    '/api/v1/projects'],
            'create_project'     => ['POST',   '/api/v1/projects'],
            'delete_project'     => ['DELETE', '/api/v1/projects/{id}'],
            'add_project_member' => ['POST',   '/api/v1/projects/{project}/members'],
            'list_tasks'         => ['GET',    '/api/v1/tasks'],
            'create_task'        => ['POST',   '/api/v1/tasks'],
            'update_task_status' => ['PATCH',  '/api/v1/tasks/{task}/status'],
            'assign_task'        => ['PUT',    '/api/v1/tasks/{id}'],
            'delete_task'        => ['DELETE', '/api/v1/tasks/{id}'],
            'list_invoices'      => ['GET',    '/api/v1/invoices'],
            'create_invoice'     => ['POST',   '/api/v1/invoices'],
            'send_invoice'       => ['POST',   '/api/v1/invoices/{id}/send'],
            'delete_invoice'     => ['DELETE', '/api/v1/invoices/{id}'],
            'record_payment'     => ['POST',   '/api/v1/invoices/{invoice}/payments'],
            'list_quotes'        => ['GET',    '/api/v1/quotes'],
            'create_quote'       => ['POST',   '/api/v1/quotes'],
            'approve_quote'      => ['POST',   '/api/v1/quotes/{id}/approve'],
            'list_payroll_runs'  => ['GET',    '/api/v1/payroll/runs'],
            'approve_payroll_run'=> ['POST',   '/api/v1/payroll/runs/{id}/approve'],
            'get_report'         => ['GET',    '/api/v1/reports/{type}'],
            'get_settings'       => ['GET',    '/api/v1/settings'],
            'update_settings'    => ['PUT',    '/api/v1/settings/company'],
        ];

        if (!isset($routeMap[$name])) {
            return ['error' => "Unknown operation: {$name}"];
        }

        [$method, $uri] = $routeMap[$name];

        // Replace route path parameters (e.g. {id}, {task}, {project}, {type})
        $params = $args;
        foreach ($args as $key => $val) {
            $placeholder = '{' . $key . '}';
            if (str_contains($uri, $placeholder)) {
                $uri = str_replace($placeholder, (string)$val, $uri);
                unset($params[$key]); // remove parameter from request body/query
            }
        }

        // Special normalization for client creation (must specify portal user boolean flag)
        if ($name === 'create_client') {
            $params['is_client_portal_user'] = true;
            $params['roles'] = $params['roles'] ?? ['client'];
        }

        try {
            $req = Request::create($uri, $method, $params);
            $req->headers->set('Accept', 'application/json');

            // Copy Authorization token context to the internal subrequest
            if (auth()->check()) {
                $req->setUserResolver(fn() => auth()->user());
            }

            $response = app()->handle($req);
            $content = $response->getContent();
            $data = json_decode($content, true);

            return $data ?: ['response' => $content];
        } catch (\Throwable $e) {
            Log::error("Failed executing internal subrequest: {$uri}", ['error' => $e->getMessage()]);
            return ['error' => 'An internal action execution error occurred.'];
        }
    }

    /**
     * Create an AI Audit Log entry.
     */
    protected function logAiAction(string $actionType, array $payload, $result): void
    {
        try {
            AiAuditLog::create([
                'user_id' => auth()->id(),
                'action_type' => $actionType,
                'description' => "AI executed platform action: " . str_replace('_', ' ', $actionType),
                'payload' => $payload,
                'result' => $result,
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed logging AI action', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Format conversation data in Gemini format.
     */
    protected function buildContents(array $history, array $attachments): array
    {
        $contents = [];
        $lastIndex = count($history) - 1;

        foreach ($history as $index => $msg) {
            $role = ($msg['role'] === 'user') ? 'user' : 'model';
            $parts = [['text' => $msg['content']]];

            // Attach files to the last user message if they match
            if ($role === 'user' && !empty($attachments) && $index === $lastIndex) {
                foreach ($attachments as $file) {
                    $parts[] = $this->parseFileForGemini($file);
                }
            }

            $contents[] = [
                'role' => $role,
                'parts' => $parts
            ];
        }

        return $contents;
    }

    /**
     * Parse and load files into Gemini payloads.
     */
    protected function parseFileForGemini($file): array
    {
        $fileData = is_array($file) ? $file : $file->toArray();
        $path = storage_path('app/public/' . $fileData['file_path']);
        if (!file_exists($path)) {
            $path = storage_path('app/' . $fileData['file_path']); // fallback
        }

        $mime = $fileData['mime_type'] ?? '';

        // Binary multimodal types -> feed base64 directly
        $binaryMimes = [
            'application/pdf',
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'audio/wav', 'audio/mp3', 'audio/mpeg',
            'video/mp4', 'video/quicktime'
        ];

        if (in_array($mime, $binaryMimes, true) && file_exists($path)) {
            return [
                'inlineData' => [
                    'mimeType' => $mime,
                    'data' => base64_encode(file_get_contents($path)),
                ]
            ];
        }

        // Text parsing fallback
        $text = '';
        if (file_exists($path)) {
            if ($mime === 'text/csv' || Str::endsWith($fileData['filename'], '.csv')) {
                $rows = [];
                if (($handle = fopen($path, 'r')) !== false) {
                    while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                        $rows[] = implode(' | ', $data);
                    }
                    fclose($handle);
                }
                $text = "[CSV Content — File: {$fileData['filename']}]\n" . implode("\n", $rows);
            } elseif (Str::endsWith($fileData['filename'], '.docx')) {
                $text = "[DOCX Content — File: {$fileData['filename']}]\n" . $this->extractTextFromDocx($path);
            } elseif (Str::endsWith($fileData['filename'], '.xlsx') || Str::endsWith($fileData['filename'], '.xls')) {
                $text = "[XLSX Content — File: {$fileData['filename']}]\n" . $this->extractTextFromXlsx($path);
            } else {
                // Default simple text reading
                $text = "[Text File: {$fileData['filename']}]\n" . file_get_contents($path);
            }
        } else {
            $text = "[File reference not found: {$fileData['filename']}]";
        }

        return ['text' => $text];
    }

    protected function extractTextFromDocx(string $filePath): string
    {
        $zip = new \ZipArchive();
        if ($zip->open($filePath) === true) {
            if (($index = $zip->locateName('word/document.xml')) !== false) {
                $data = $zip->getFromIndex($index);
                $zip->close();
                return strip_tags(str_replace('</w:p>', "\n", $data));
            }
            $zip->close();
        }
        return '[DOCX parsing failed]';
    }

    protected function extractTextFromXlsx(string $filePath): string
    {
        $zip = new \ZipArchive();
        if ($zip->open($filePath) === true) {
            $sharedStrings = [];
            if (($ssIndex = $zip->locateName('xl/sharedStrings.xml')) !== false) {
                $ssXml = $zip->getFromIndex($ssIndex);
                $xml = simplexml_load_string($ssXml);
                if ($xml) {
                    foreach ($xml->si as $si) {
                        $sharedStrings[] = (string)($si->t ?? $si->r->t ?? '');
                    }
                }
            }

            $sheetText = [];
            $i = 1;
            while (($sheetIndex = $zip->locateName("xl/worksheets/sheet{$i}.xml")) !== false) {
                $sheetXml = $zip->getFromIndex($sheetIndex);
                $xml = simplexml_load_string($sheetXml);
                if ($xml) {
                    $sheetRows = [];
                    foreach ($xml->sheetData->row as $row) {
                        $rowCells = [];
                        foreach ($row->c as $cell) {
                            $value = (string)($cell->v ?? '');
                            $type = (string)($cell['t'] ?? '');
                            if ($type === 's' && isset($sharedStrings[(int)$value])) {
                                $value = $sharedStrings[(int)$value];
                            }
                            $rowCells[] = $value;
                        }
                        $sheetRows[] = implode(" | ", $rowCells);
                    }
                    $sheetText[] = "Sheet {$i}:\n" . implode("\n", $sheetRows);
                }
                $i++;
            }
            $zip->close();
            return implode("\n\n", $sheetText);
        }
        return '[XLSX parsing failed]';
    }

    /**
     * Master instruction detailing capabilities and actions.
     */
    protected function getSystemInstruction(): string
    {
        $role = auth()->user() ? auth()->user()->roles[0]->display_name ?? 'User' : 'User';
        $name = auth()->user() ? auth()->user()->name : 'User';

        return "You are Antigravity, the central Executive AI assistant and Operations Manager inside Creativals OS.\n" .
               "You are chatting with a logged-in user named {$name} who holds the role: '{$role}'.\n" .
               "You can call tools to access database details (leads, tasks, clients, projects, invoices, quotes, payroll, settings, reports).\n" .
               "CRITICAL RULES:\n" .
               "1. Always respect user authorization context. If an operation fails with a 403 or permission error, explain clearly that the user's role does not have authorization.\n" .
               "2. DO NOT perform sensitive actions directly unless confirmed. If a tool is sensitive (e.g. approve_payroll_run, delete, send_invoice), tell the user you will execute it upon confirmation. (The system will intercept and show a confirmation button automatically).\n" .
               "3. Provide rich formatting including markdown, lists, tables, and charts (use bar charts or line charts where appropriate for numerical financial reports).\n" .
               "4. Answer strategic planning questions like a senior CEO advisor, backing your answers with platform reports data (use get_report).";
    }

    /**
     * List all Gemini function declarations.
     */
    protected function getToolsDeclaration(): array
    {
        $tools = [
            // CRM
            [
                'name' => 'list_leads',
                'description' => 'List all CRM leads',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'stage_id' => ['type' => 'INTEGER', 'description' => 'Filter by Stage ID'],
                        'search' => ['type' => 'STRING', 'description' => 'Search company or contact names'],
                    ]
                ]
            ],
            [
                'name' => 'create_lead',
                'description' => 'Create a new CRM lead',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'company_name' => ['type' => 'STRING'],
                        'priority' => ['type' => 'STRING', 'description' => 'low, medium, high'],
                        'temperature' => ['type' => 'STRING', 'description' => 'cold, warm, hot'],
                    ],
                    'required' => ['company_name']
                ]
            ],
            [
                'name' => 'convert_lead',
                'description' => 'Convert a qualified lead into a Client portal user',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'id' => ['type' => 'INTEGER'],
                    ],
                    'required' => ['id']
                ]
            ],
            // Clients
            [
                'name' => 'list_clients',
                'description' => 'List all clients and billing summaries',
                'parameters' => ['type' => 'OBJECT', 'properties' => []]
            ],
            [
                'name' => 'create_client',
                'description' => 'Create a client user profile',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'name' => ['type' => 'STRING'],
                        'email' => ['type' => 'STRING'],
                        'phone' => ['type' => 'STRING'],
                        'password' => ['type' => 'STRING'],
                    ],
                    'required' => ['name', 'email']
                ]
            ],
            // Projects
            [
                'name' => 'list_projects',
                'description' => 'List and search projects',
                'parameters' => ['type' => 'OBJECT', 'properties' => []]
            ],
            [
                'name' => 'create_project',
                'description' => 'Create a new project',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'name' => ['type' => 'STRING'],
                        'client_id' => ['type' => 'INTEGER'],
                        'budget' => ['type' => 'NUMBER'],
                        'status' => ['type' => 'STRING', 'description' => 'planning, in_progress, completed, on_hold'],
                    ],
                    'required' => ['name', 'client_id']
                ]
            ],
            // Tasks
            [
                'name' => 'list_tasks',
                'description' => 'List and search tasks',
                'parameters' => ['type' => 'OBJECT', 'properties' => []]
            ],
            [
                'name' => 'create_task',
                'description' => 'Create a new project task',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'title' => ['type' => 'STRING'],
                        'project_id' => ['type' => 'INTEGER'],
                        'assigned_to' => ['type' => 'INTEGER'],
                        'priority' => ['type' => 'STRING', 'description' => 'low, medium, high'],
                    ],
                    'required' => ['title', 'project_id']
                ]
            ],
            [
                'name' => 'update_task_status',
                'description' => 'Change a task status',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'task' => ['type' => 'INTEGER', 'description' => 'Task ID'],
                        'status' => ['type' => 'STRING', 'description' => 'todo, in_progress, in_review, completed'],
                    ],
                    'required' => ['task', 'status']
                ]
            ],
            // Invoices & Quotes
            [
                'name' => 'list_invoices',
                'description' => 'List all invoices and status',
                'parameters' => ['type' => 'OBJECT', 'properties' => []]
            ],
            [
                'name' => 'create_invoice',
                'description' => 'Draft a new client invoice',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'client_id' => ['type' => 'INTEGER'],
                        'total_amount' => ['type' => 'NUMBER'],
                        'due_date' => ['type' => 'STRING', 'description' => 'YYYY-MM-DD'],
                    ],
                    'required' => ['client_id', 'total_amount']
                ]
            ],
            [
                'name' => 'send_invoice',
                'description' => 'Email invoice to client (Sensitive)',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'id' => ['type' => 'INTEGER', 'description' => 'Invoice ID'],
                    ],
                    'required' => ['id']
                ]
            ],
            [
                'name' => 'record_payment',
                'description' => 'Record a client payment on invoice (Sensitive)',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'invoice' => ['type' => 'INTEGER', 'description' => 'Invoice ID'],
                        'amount' => ['type' => 'NUMBER'],
                        'payment_method' => ['type' => 'STRING', 'description' => 'bank_transfer, cash, stripe'],
                        'payment_date' => ['type' => 'STRING'],
                    ],
                    'required' => ['invoice', 'amount']
                ]
            ],
            // Payroll
            [
                'name' => 'list_payroll_runs',
                'description' => 'List all payroll summary runs',
                'parameters' => ['type' => 'OBJECT', 'properties' => []]
            ],
            [
                'name' => 'approve_payroll_run',
                'description' => 'Approve employee payroll run (Sensitive)',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'id' => ['type' => 'INTEGER'],
                    ],
                    'required' => ['id']
                ]
            ],
            // Reports & Settings
            [
                'name' => 'get_report',
                'description' => 'Run business analytics summary reports',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'type' => ['type' => 'STRING', 'description' => 'revenue, pipeline, profitability, utilisation, clients, expenses'],
                    ],
                    'required' => ['type']
                ]
            ],
            [
                'name' => 'get_settings',
                'description' => 'Read company ERP settings',
                'parameters' => ['type' => 'OBJECT', 'properties' => []]
            ],
            [
                'name' => 'update_settings',
                'description' => 'Change company configurations (Sensitive)',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'company_name' => ['type' => 'STRING'],
                    ]
                ]
            ],
        ];

        foreach ($tools as &$tool) {
            if (isset($tool['parameters']['properties']) && empty($tool['parameters']['properties'])) {
                $tool['parameters']['properties'] = (object) [];
            }
        }

        return $tools;
    }

    /**
     * Natural dialogue simulator for keyless / mock settings.
     */
    protected function getMockResponse(array $history): array
    {
        $lastMessage = end($history)['content'] ?? '';
        $text = "I am operating in fallback simulator mode because no active `GEMINI_API_KEY` was found in the environment configurations.\n\n";

        if (preg_match('/(revenue|profit|invoice|money|financial)/i', $lastMessage)) {
            $text .= "### Financial Analysis (Mock Simulation)\n" .
                     "Total Billed: $1,030,000 | Total Collected: $870,000 | Outstanding: $160,000\n\n" .
                     "| Month | Revenue | Expenses | Cash Flow |\n" .
                     "|-------|---------|----------|-----------|\n" .
                     "| April | $120,000 | $80,000 | +$40,000 |\n" .
                     "| May   | $150,000 | $90,000 | +$60,000 |\n" .
                     "| June  | $180,000 | $85,000 | +$95,000 |\n\n" .
                     "**Strategic Note:** Cash flow shows positive velocity. However, outstanding invoice collection times have slipped from 12 days to 17 days. We should configure an automatic notification trigger for clients with payments overdue by 7+ days.";
        } elseif (preg_match('/(lead|crm|sales|conversion)/i', $lastMessage)) {
            $text .= "### CRM Pipeline Summary (Mock Simulation)\n" .
                     "- **Total Active Leads:** 24\n" .
                     "- **Hot leads:** 8 (Estimated Value: $120k)\n" .
                     "- **Conversion Rate:** 22% (Target: 25%)\n\n" .
                     "**Recommendation:** High-priority response required for Acme Corp lead stage conversion. Let me know if you would like me to draft an follow-up reminder.";
        } elseif (preg_match('/(project|task|team|progress)/i', $lastMessage)) {
            $text .= "### Operations & Project Health (Mock Simulation)\n" .
                     "- **Active Projects:** 5 (4 On-Track, 1 At-Risk)\n" .
                     "- **At-Risk:** Brand Identity project (delayed milestones due to designer utilization at 98%)\n" .
                     "- **Overdue Tasks:** 3\n\n" .
                     "Would you like me to allocate an extra team member or reassign outstanding milestones?";
        } else {
            $text .= "Hello! I am your Executive Business Assistant, ready to help you analyze reports, orchestrate tasks, CRM leads, and generate invoices. What segment should we review today?";
        }

        return [
            'role' => 'assistant',
            'content' => $text,
        ];
    }

    /**
     * Send messages to OpenRouter models (including DeepSeek).
     */
    public function chatOpenRouter(array $history, array $attachments = [], bool $isConfirmed = false): array
    {
        $model = $this->model;
        if ($model === 'gemini-2.5-flash' || $model === 'gemini-2.0-flash') {
            $model = 'google/' . $model;
        }

        $modelsToTry = array_unique(array_merge([$model], $this->openRouterModelFallbackChain));
        
        $messages = $this->buildOpenRouterMessages($history, $attachments);
        $tools = $this->getOpenRouterToolsDeclaration();

        foreach ($modelsToTry as $modelName) {
            try {
                $response = Http::withHeaders([
                    'Content-Type' => 'application/json',
                    'Authorization' => "Bearer {$this->apiKey}",
                    'HTTP-Referer' => 'http://localhost:8000',
                    'X-Title' => 'Creativals OS',
                ])->withOptions([
                    'force_ip_resolve' => 'v4',
                    'verify'           => false,
                ])->post("https://openrouter.ai/api/v1/chat/completions", [
                    'model' => $modelName,
                    'messages' => $messages,
                    'tools' => empty($tools) ? null : $tools,
                    'max_tokens' => 350,
                ]);

                if ($response->successful()) {
                    $result = $response->json();
                    $choice = $result['choices'][0] ?? [];
                    $message = $choice['message'] ?? [];
                    $textResponse = $message['content'] ?? '';
                    $toolCallsRaw = $message['tool_calls'] ?? [];

                    if (empty($toolCallsRaw)) {
                        return ['role' => 'assistant', 'content' => $textResponse];
                    }

                    return $this->handleOpenRouterToolCalls($toolCallsRaw, $history, $attachments, $isConfirmed, $modelName);
                }

                $errorBody = $response->json();
                $errorCode = $errorBody['error']['code'] ?? $response->status();
                $errorMsg = $errorBody['error']['message'] ?? 'Unknown OpenRouter error';

                Log::error('OpenRouter API request failed', ['model' => $modelName, 'error' => $errorMsg]);
                
                if ($response->status() === 429) {
                    continue; // Quota/rate limit — try next model
                }

                return ['role' => 'assistant', 'content' => "⚠️ **OpenRouter API Error**\n\nI encountered an error (`{$errorCode}`): `{$errorMsg}`"];

            } catch (\Throwable $e) {
                Log::error('GeminiService OpenRouter exception', ['model' => $modelName, 'exception' => $e->getMessage()]);
                continue;
            }
        }

        return [
            'role'    => 'assistant',
            'content' => "⚠️ **API limits reached**\n\nAll configured OpenRouter models returned an error or rate limit. Please verify your OpenRouter key balance and status.",
        ];
    }

    /**
     * Process tool calls and re-feed results back to OpenRouter.
     */
    protected function handleOpenRouterToolCalls(array $toolCallsRaw, array $history, array $attachments, bool $isConfirmed, string $modelName): array
    {
        $toolResults = [];

        foreach ($toolCallsRaw as $call) {
            $name = $call['function']['name'];
            $args = [];
            if (isset($call['function']['arguments'])) {
                $args = json_decode($call['function']['arguments'], true) ?: [];
            }

            // Check if action is sensitive and needs confirmation
            if ($this->isSensitiveAction($name) && !$isConfirmed) {
                return [
                    'role' => 'assistant',
                    'content' => "This action requires your confirmation.",
                    'action_confirmation' => [
                        'action' => $name,
                        'params' => $args,
                        'message' => $this->getSensitiveActionDescription($name, $args),
                    ]
                ];
            }

            // Execute internal API request
            $execResult = $this->executeInternalRequest($name, $args);

            // Log AI action
            $this->logAiAction($name, $args, $execResult);

            $toolResults[] = [
                'role' => 'tool',
                'tool_call_id' => $call['id'],
                'name' => $name,
                'content' => json_encode($execResult),
            ];
        }

        // Send the tool results back to OpenRouter to generate the final dialogue
        $messages = $this->buildOpenRouterMessages($history, $attachments);

        // Append the assistant's tool call response
        $messages[] = [
            'role' => 'assistant',
            'tool_calls' => $toolCallsRaw
        ];

        // Append the tool response parts
        foreach ($toolResults as $res) {
            $messages[] = $res;
        }

        // Try the same model first, then fallbacks
        $modelsToTry = array_unique(array_merge([$modelName], $this->openRouterModelFallbackChain));

        foreach ($modelsToTry as $mName) {
            try {
                $response = Http::withHeaders([
                    'Content-Type' => 'application/json',
                    'Authorization' => "Bearer {$this->apiKey}",
                    'HTTP-Referer' => 'http://localhost:8000',
                    'X-Title' => 'Creativals OS',
                ])->withOptions([
                    'force_ip_resolve' => 'v4',
                    'verify'           => false,
                ])->post("https://openrouter.ai/api/v1/chat/completions", [
                    'model' => $mName,
                    'messages' => $messages,
                ]);

                if ($response->successful()) {
                    $choice = $response->json()['choices'][0] ?? [];
                    $text = $choice['message']['content'] ?? '';
                    return ['role' => 'assistant', 'content' => $text];
                }
            } catch (\Throwable $e) {
                Log::error('OpenRouter tool-loop failed', ['model' => $mName, 'error' => $e->getMessage()]);
                continue;
            }
        }

        return [
            'role' => 'assistant',
            'content' => 'I successfully completed the requested operation, but had trouble rendering a final response summary via OpenRouter.',
        ];
    }

    /**
     * Map tools to OpenAI format.
     */
    protected function getOpenRouterToolsDeclaration(): array
    {
        $geminiTools = $this->getToolsDeclaration();
        $openRouterTools = [];
        
        foreach ($geminiTools as $tool) {
            $parameters = $tool['parameters'] ?? [];
            if (isset($parameters['type'])) {
                $parameters['type'] = strtolower($parameters['type']);
            }
            
            $openRouterTools[] = [
                'type' => 'function',
                'function' => [
                    'name' => $tool['name'],
                    'description' => $tool['description'],
                    'parameters' => $parameters,
                ]
            ];
        }
        
        return $openRouterTools;
    }

    /**
     * Format messages for OpenRouter.
     */
    protected function buildOpenRouterMessages(array $history, array $attachments): array
    {
        $messages = [];
        
        $messages[] = [
            'role' => 'system',
            'content' => $this->getSystemInstruction(),
        ];

        $lastIndex = count($history) - 1;

        foreach ($history as $index => $msg) {
            $role = ($msg['role'] === 'user') ? 'user' : 'assistant';
            
            if ($role === 'user' && !empty($attachments) && $index === $lastIndex) {
                $contentParts = [];
                $contentParts[] = [
                    'type' => 'text',
                    'text' => $msg['content'] ?: 'Please analyze the attached files.',
                ];
                
                foreach ($attachments as $file) {
                    $parsed = $this->parseFileForOpenRouter($file);
                    if ($parsed) {
                        $contentParts[] = $parsed;
                    }
                }
                
                $messages[] = [
                    'role' => $role,
                    'content' => $contentParts,
                ];
            } else {
                $messages[] = [
                    'role' => $role,
                    'content' => $msg['content'],
                ];
            }
        }

        return $messages;
    }

    /**
     * Parse files for OpenRouter.
     */
    protected function parseFileForOpenRouter($file): ?array
    {
        $fileData = is_array($file) ? $file : $file->toArray();
        $path = storage_path('app/public/' . $fileData['file_path']);
        if (!file_exists($path)) {
            $path = storage_path('app/' . $fileData['file_path']);
        }

        if (!file_exists($path)) {
            return [
                'type' => 'text',
                'text' => "[File reference not found: {$fileData['filename']}]"
            ];
        }

        $mime = $fileData['mime_type'] ?? '';
        $isImage = str_starts_with($mime, 'image/');

        if ($isImage) {
            $base64 = base64_encode(file_get_contents($path));
            return [
                'type' => 'image_url',
                'image_url' => [
                    'url' => "data:{$mime};base64,{$base64}"
                ]
            ];
        }

        $text = '';
        if ($mime === 'text/csv' || Str::endsWith($fileData['filename'], '.csv')) {
            $rows = [];
            if (($handle = fopen($path, 'r')) !== false) {
                while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                    $rows[] = implode(' | ', $data);
                }
                fclose($handle);
            }
            $text = "[CSV Content — File: {$fileData['filename']}]\n" . implode("\n", $rows);
        } elseif (Str::endsWith($fileData['filename'], '.docx')) {
            $text = "[DOCX Content — File: {$fileData['filename']}]\n" . $this->extractTextFromDocx($path);
        } elseif (Str::endsWith($fileData['filename'], '.xlsx') || Str::endsWith($fileData['filename'], '.xls')) {
            $text = "[XLSX Content — File: {$fileData['filename']}]\n" . $this->extractTextFromXlsx($path);
        } elseif (Str::endsWith($fileData['filename'], '.pdf') || $mime === 'application/pdf') {
            $text = "[PDF Content — File: {$fileData['filename']}]\n" . $this->extractTextFromPdf($path);
        } else {
            $text = "[Text File: {$fileData['filename']}]\n" . file_get_contents($path);
        }

        return [
            'type' => 'text',
            'text' => $text
        ];
    }

    /**
     * Extract text from uncompressed PDF.
     */
    protected function extractTextFromPdf(string $filePath): string
    {
        $content = @file_get_contents($filePath);
        if (!$content) return '[PDF empty or unreadable]';
        
        preg_match_all('/BT(.*?)ET/s', $content, $matches);
        $text = '';
        foreach ($matches[1] as $block) {
            preg_match_all('/\((.*?)\)/s', $block, $strings);
            $text .= implode(' ', $strings[1]) . "\n";
        }
        
        $text = str_replace(['\\(', '\\)', '\\\\'], ['(', ')', '\\'], $text);
        
        return $text ?: '[No extractable text found in PDF]';
    }
}
