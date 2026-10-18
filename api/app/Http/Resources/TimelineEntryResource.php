<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A call log as one entry of a client's timeline. The query adds note_owner_id and loads user and tasks.assignee. */
class TimelineEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();

        return [
            'id' => $this->id,
            // The source note is linked only for someone who may open it (its owner or a manager).
            'voice_note_id' => $user->isManager() || (int) $this->note_owner_id === $user->id ? $this->voice_note_id : null,
            'summary' => $this->summary,
            'sentiment' => $this->sentiment->value,
            'follow_up' => ['date' => $this->follow_up_at, 'phrase' => $this->follow_up_phrase],
            'author' => ['name' => $this->user->name, 'is_you' => $this->user_id === $user->id],
            'tasks' => $this->tasks->map(fn ($task) => [
                'id' => $task->id,
                'title' => $task->title,
                'owner' => $task->owner->value,
                'due_date' => $task->due_at,
                'done' => $task->done_at !== null,
                'assignee' => ['name' => $task->assignee->name, 'is_you' => $task->assignee_id === $user->id],
            ])->all(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
