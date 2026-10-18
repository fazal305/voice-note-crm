<?php

namespace App\Models;

use App\Enums\VoiceNoteSource;
use App\Enums\VoiceNoteStatus;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// Nothing is mass assignable: every column is set by the app from validated input or the signed-in user.
// storage_key is never sent to the client. The transcript and everything derived from it are encrypted at rest.
#[Hidden(['storage_key'])]
class VoiceNote extends Model
{
    /** Processing runs allowed per note (the first run plus retries and manual transcripts). */
    public const MAX_ATTEMPTS = 5;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'status' => VoiceNoteStatus::class,
            'source' => VoiceNoteSource::class,
            'size_bytes' => 'integer',
            'duration_seconds' => 'integer',
            'transcript' => 'encrypted',
            'ai_payload' => 'encrypted:array',
            'match_candidates' => 'encrypted:array',
            'processing_started_at' => 'datetime',
            'processed_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'org_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function suggestedClient(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'suggested_client_id');
    }
}
