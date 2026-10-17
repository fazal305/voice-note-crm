<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VoiceNoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status->value,
            'source' => $this->source->value,
            'mime' => $this->mime,
            'size_bytes' => $this->size_bytes,
            'duration_seconds' => $this->duration_seconds,
            'original_name' => $this->original_name,
            'error' => $this->error,
            'client' => $this->client ? ['id' => $this->client->id, 'name' => $this->client->name] : null,
            'owner' => ['name' => $this->user->name, 'is_you' => $this->user_id === $request->user()->id],
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
