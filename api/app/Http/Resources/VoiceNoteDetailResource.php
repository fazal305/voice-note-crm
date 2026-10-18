<?php

namespace App\Http\Resources;

use App\Enums\VoiceNoteStatus;
use App\Models\Client;
use App\Models\VoiceNote;
use Illuminate\Http\Request;

/** A single note with its transcript and parsed data. The list endpoint leaves these out. */
class VoiceNoteDetailResource extends VoiceNoteResource
{
    public function toArray(Request $request): array
    {
        $suggested = $this->suggestedClient && $this->suggestedClient->org_id === $this->org_id ? $this->suggestedClient : null;

        // Candidates are re-read so a renamed or deleted client shows as it is now; ids are never trusted across orgs.
        $candidateIds = array_column($this->match_candidates ?? [], 'id');
        $candidates = $candidateIds === [] ? [] : Client::where('org_id', $this->org_id)->whereIn('id', $candidateIds)->orderBy('name')->get(['id', 'name'])
            ->map(fn (Client $c) => ['id' => $c->id, 'name' => $c->name])->all();

        return array_merge(parent::toArray($request), [
            'transcript' => $this->transcript,
            'ai_payload' => $this->ai_payload,
            'suggested_client' => $suggested ? ['id' => $suggested->id, 'name' => $suggested->name] : null,
            'match_candidates' => $candidates,
            'processing_started_at' => $this->processing_started_at?->toIso8601String(),
            'processed_at' => $this->processed_at?->toIso8601String(),
            // A note still 'uploaded' can be retried only once it is stuck; until then its job may yet run.
            'can_retry' => $this->attempts < VoiceNote::MAX_ATTEMPTS && ($this->status !== VoiceNoteStatus::Uploaded || $this->isStuck()),
            'call_log' => $this->callLog ? new CallLogResource($this->callLog) : null,
        ]);
    }
}
