<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CallLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();

        return [
            'id' => $this->id,
            'voice_note_id' => $this->voice_note_id,
            'client' => $this->client ? ['id' => $this->client->id, 'name' => $this->client->name] : null,
            'summary' => $this->summary,
            'sentiment' => $this->sentiment->value,
            'follow_up' => ['date' => $this->follow_up_at, 'phrase' => $this->follow_up_phrase],
            'author' => ['name' => $this->user->name, 'is_you' => $this->user_id === $user->id],
            'can_edit' => $this->user_id === $user->id || $user->isManager(),
            'tasks' => TaskResource::collection($this->whenLoaded('tasks')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
