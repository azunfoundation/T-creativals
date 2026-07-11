<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AiAutomation;
use App\Models\Task;
use App\Models\Lead;
use App\Models\Invoice;
use App\Models\Project;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

class AiAutomationObserver
{
    /**
     * Re-entrancy guard: an automation's create_task action fires
     * task.created, which would re-evaluate automations — a rule triggering
     * on task.created that also creates a task would loop forever. Records
     * created BY an automation therefore never trigger further automations.
     */
    protected static bool $executing = false;

    /**
     * Handle the model "updated" event.
     */
    public function updated(Model $model): void
    {
        $this->evaluateAutomations($model, 'updated');
    }

    /**
     * Handle the model "created" event.
     */
    public function created(Model $model): void
    {
        $this->evaluateAutomations($model, 'created');
    }

    /**
     * Evaluate active rules matching the trigger event.
     */
    protected function evaluateAutomations(Model $model, string $actionType): void
    {
        if (self::$executing) {
            return;
        }

        $event = $this->getEventName($model, $actionType);
        if (!$event) {
            return;
        }

        // Fetch active automations for this event
        $automations = AiAutomation::where('trigger_event', $event)
            ->where('is_active', true)
            ->get();

        self::$executing = true;
        try {
            $this->runAutomations($automations, $model, $event);
        } finally {
            self::$executing = false;
        }
    }

    /** @param \Illuminate\Support\Collection<int, AiAutomation> $automations */
    protected function runAutomations($automations, Model $model, string $event): void
    {
        foreach ($automations as $auto) {
            try {
                if ($this->checkConditions($model, $auto->conditions)) {
                    $this->executeActions($auto->actions, $model, $auto->user_id);

                    // Honest activity trail: without this, a user could never
                    // tell whether a rule ever actually fired.
                    $auto->forceFill([
                        'last_triggered_at' => now(),
                        'trigger_count' => ($auto->trigger_count ?? 0) + 1,
                    ])->saveQuietly();

                    \App\Models\AiAuditLog::create([
                        'user_id' => $auto->user_id,
                        'action_type' => 'automation_executed',
                        'description' => "Automation rule '{$auto->name}' fired on {$event}.",
                        'payload' => ['automation_id' => $auto->id, 'trigger_event' => $event],
                        'result' => ['status' => 'executed'],
                    ]);
                }
            } catch (\Throwable $e) {
                Log::error("Failed executing AI automation: {$auto->name}", ['error' => $e->getMessage()]);
            }
        }
    }

    /**
     * Map classes to friendly names.
     */
    protected function getEventName(Model $model, string $actionType): ?string
    {
        $class = get_class($model);
        $nameMap = [
            Lead::class => 'lead',
            Invoice::class => 'invoice',
            Project::class => 'project',
            Task::class => 'task',
        ];

        if (!isset($nameMap[$class])) {
            return null;
        }

        return "{$nameMap[$class]}.{$actionType}";
    }

    /**
     * Check if the trigger model attributes satisfy all conditions.
     */
    protected function checkConditions(Model $model, ?array $conditions): bool
    {
        if (empty($conditions)) {
            return true;
        }

        foreach ($conditions as $cond) {
            $field = $cond['field'] ?? null;
            $operator = $cond['operator'] ?? '=';
            $expected = $cond['value'] ?? null;

            if (!$field) {
                continue;
            }

            $actual = $model->getAttribute($field);

            switch ($operator) {
                case '=':
                case '==':
                    if ($actual != $expected) {
                        return false;
                    }
                    break;
                case '!=':
                    if ($actual == $expected) {
                        return false;
                    }
                    break;
                case '>':
                    if ($actual <= $expected) {
                        return false;
                    }
                    break;
                case '<':
                    if ($actual >= $expected) {
                        return false;
                    }
                    break;
                case 'contains':
                    if (!str_contains((string)$actual, (string)$expected)) {
                        return false;
                    }
                    break;
            }
        }

        return true;
    }

    /**
     * Run actions defined in the rule block.
     */
    protected function executeActions(array $actions, Model $triggerModel, int $creatorId): void
    {
        foreach ($actions as $action) {
            $type = $action['type'] ?? '';
            $params = $action['params'] ?? [];

            if ($type === 'create_task') {
                // A task must land in a real project — silently defaulting to
                // project id 1 created tasks in whatever project happened to
                // have that id. Skip (and log) instead of guessing.
                $projectId = $params['project_id'] ?? null;
                if (!$projectId || !Project::whereKey($projectId)->exists()) {
                    Log::warning('AI automation create_task skipped: no valid project_id configured', [
                        'params' => $params,
                    ]);
                    continue;
                }
                Task::create([
                    'project_id' => $projectId,
                    'title' => $this->parsePlaceholders($params['title'] ?? 'Follow-up Task', $triggerModel),
                    'assigned_to' => $params['assigned_to'] ?? $creatorId,
                    'created_by' => $creatorId,
                    'priority' => $params['priority'] ?? 'medium',
                    'status' => 'todo',
                ]);
            } elseif ($type === 'send_alert') {
                \App\Models\Alert::create([
                    'user_id' => $params['user_id'] ?? $creatorId,
                    'triggered_by' => $creatorId,
                    'type' => 'info',
                    'title' => $this->parsePlaceholders($params['title'] ?? 'Automation Triggered', $triggerModel),
                    'body' => $this->parsePlaceholders($params['body'] ?? 'AI Automation rule completed.', $triggerModel),
                    'is_read' => false,
                ]);
            }
        }
    }

    /**
     * Replace {attribute} bracket expressions with values from the trigger model.
     */
    protected function parsePlaceholders(string $text, Model $model): string
    {
        preg_match_all('/\{([a-zA-Z_0-9]+)\}/', $text, $matches);
        if (empty($matches[0])) {
            return $text;
        }

        foreach ($matches[1] as $idx => $field) {
            $val = $model->getAttribute($field) ?: '';
            $text = str_replace($matches[0][$idx], (string)$val, $text);
        }

        return $text;
    }
}
