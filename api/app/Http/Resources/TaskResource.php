<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'owner' => $this->owner->value,
            'due_date' => $this->due_at,
            'done' => $this->done_at !== null,
            'done_at' => $this->done_at?->toIso8601String(),
            'client' => $this->client ? ['id' => $this->client->id, 'name' => $this->client->name] : null,
            'voice_note_id' => $this->callLog?->voice_note_id,
            'assignee' => ['id' => $this->assignee_id, 'name' => $this->assignee->name, 'is_you' => $this->assignee_id === $request->user()->id],
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
