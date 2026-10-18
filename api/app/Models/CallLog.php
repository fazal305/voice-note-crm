<?php

namespace App\Models;

use App\Enums\Sentiment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// Nothing is mass assignable: every column is set by the app from validated input or the signed-in user.
// The summary is encrypted at rest (NFR-5.3). follow_up_at is a plain Y-m-d string: a calendar day, not a moment.
class CallLog extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'summary' => 'encrypted',
            'sentiment' => Sentiment::class,
        ];
    }

    public function voiceNote(): BelongsTo
    {
        return $this->belongsTo(VoiceNote::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class)->orderBy('id');
    }
}
