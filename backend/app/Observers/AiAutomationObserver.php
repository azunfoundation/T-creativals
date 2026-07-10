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
        $event = $this->getEventName($model, $actionType);
        if (!$event) {
            return;
        }

        // Fetch active automations for this event
        $automations = AiAutomation::where('trigger_event', $event)
            ->where('is_active', true)
            ->get();

        foreach ($automations as $auto) {
            try {
                if ($this->checkConditions($model, $auto->conditions)) {
                    $this->executeActions($auto->actions, $model, $auto->user_id);
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
                Task::create([
                    'project_id' => $params['project_id'] ?? 1,
                    'title' => $this->parsePlaceholders($params['title'] ?? 'Follow-up Task', $triggerModel),
                    'assigned_to' => $params['assigned_to'] ?? $creatorId,
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
