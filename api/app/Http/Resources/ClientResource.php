<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClientResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'company' => $this->company,
            'email' => $this->email,
            'phone' => $this->phone,
            'notes' => $this->notes,
            'updated_at' => $this->updated_at?->toIso8601String(),
            // Only on the list, which adds it from the call logs the viewer may read.
            'last_contact_at' => $this->whenHas('last_contact_at', fn ($at) => $at?->toIso8601String()),
        ];
    }
}
