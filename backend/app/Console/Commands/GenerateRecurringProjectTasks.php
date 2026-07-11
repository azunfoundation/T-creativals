<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * PRD "Recurring Projects": a retainer project (is_recurring) with a linked
 * task template gets that template's tasks re-created each month — e.g. a
 * monthly SEO retainer auto-creating Audit → Keyword Research → On-page →
 * Reporting. Idempotent per calendar month via tasks.task_template_id.
 */
class GenerateRecurringProjectTasks extends Command
{
    protected $signature = 'projects:generate-recurring-tasks';

    protected $description = 'Create the linked template\'s tasks for recurring projects (once per calendar month)';

    public function handle(): void
    {
        $monthStart = Carbon::now()->startOfMonth();
        $monthLabel = Carbon::now()->format('M Y');

        $projects = Project::whereNotNull('task_template_id')
            ->where('is_recurring', true)
            ->whereIn('status', ['active', 'in_progress'])
            ->with(['taskTemplate.items' => fn ($q) => $q->orderBy('sort_order')])
            ->get();

        $generated = 0;
        foreach ($projects as $project) {
            $template = $project->taskTemplate;
            if (!$template || $template->items->isEmpty()) {
                continue;
            }

            // Already generated for this month? (any task from this template
            // on this project created since the month started)
            $alreadyThisMonth = Task::where('project_id', $project->id)
                ->where('task_template_id', $template->id)
                ->where('created_at', '>=', $monthStart)
                ->exists();
            if ($alreadyThisMonth) {
                continue;
            }

            foreach ($template->items as $item) {
                Task::create([
                    'project_id' => $project->id,
                    'task_template_id' => $template->id,
                    'title' => $item->title . ' — ' . $monthLabel,
                    'description' => $item->description,
                    'estimated_hours' => $item->estimated_hours,
                    'status' => 'todo',
                    'priority' => 'medium',
                    'created_by' => $project->manager_id,
                    'due_date' => Carbon::now()->endOfMonth()->toDateString(),
                    'sort_order' => $item->sort_order,
                ]);
            }
            $generated++;
        }

        $this->info("Generated monthly tasks for {$generated} recurring project(s).");
    }
}
